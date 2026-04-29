package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type FileMetadata struct {
	Title   string `json:"title"`
	Artist  string `json:"artist"`
	Album   string `json:"album"`
	Year    string `json:"year"`
	Genre   string `json:"genre"`
	Track   string `json:"track"`
	Comment string `json:"comment"`
}

type ProbeResult struct {
	Path     string       `json:"path"`
	Name     string       `json:"name"`
	Size     int64        `json:"size"`
	Duration float64      `json:"duration"`
	Format   string       `json:"format"`
	Codec    string       `json:"codec"`
	Bitrate  int64        `json:"bitrate"`
	Metadata FileMetadata `json:"metadata"`
	Error    string       `json:"error,omitempty"`
}

type ConvertFile struct {
	ID       int          `json:"id"`
	Path     string       `json:"path"`
	Name     string       `json:"name"`
	Duration float64      `json:"duration"`
	Metadata FileMetadata `json:"metadata"`
}

type ConvertRequest struct {
	Files        []ConvertFile `json:"files"`
	Format       string        `json:"format"`
	Bitrate      int           `json:"bitrate"`
	Dest         string        `json:"dest"`
	CustomPath   string        `json:"customPath"`
	Subfolder    string        `json:"subfolder"`
	Template     string        `json:"template"`
	PreserveMeta bool          `json:"preserveMeta"`
}

type ConversionEvent struct {
	ID         int    `json:"id,omitempty"`
	Progress   int    `json:"progress,omitempty"`
	OutputPath string `json:"outputPath,omitempty"`
	Error      string `json:"error,omitempty"`
}

var supportedFormats = map[string]string{
	"MP3":  "mp3",
	"AAC":  "m4a",
	"FLAC": "flac",
	"WAV":  "wav",
	"OGG":  "ogg",
	"OPUS": "opus",
	"AIFF": "aiff",
	"WMA":  "wma",
}

func (a *App) ProbeFiles(paths []string) []ProbeResult {
	results := make([]ProbeResult, 0, len(paths))
	for _, path := range dedupePaths(paths) {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		results = append(results, probeFile(ctx, path))
		cancel()
	}
	return results
}

func (a *App) ConvertFiles(req ConvertRequest) error {
	if len(req.Files) == 0 {
		return fmt.Errorf("no files selected")
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.setCancel(cancel)
	defer a.clearCancel()

	for _, file := range req.Files {
		select {
		case <-ctx.Done():
			runtime.EventsEmit(a.ctx, "conversion:cancelled", ConversionEvent{ID: file.ID})
			return nil
		default:
		}

		output, err := outputPath(file, req)
		if err != nil {
			runtime.EventsEmit(a.ctx, "conversion:failed", ConversionEvent{ID: file.ID, Error: err.Error()})
			return err
		}
		if err := os.MkdirAll(filepath.Dir(output), 0755); err != nil {
			runtime.EventsEmit(a.ctx, "conversion:failed", ConversionEvent{ID: file.ID, Error: err.Error()})
			return err
		}

		if err := runFFmpeg(ctx, file, req, output, func(progress int) {
			runtime.EventsEmit(a.ctx, "conversion:progress", ConversionEvent{ID: file.ID, Progress: progress, OutputPath: output})
		}); err != nil {
			if errors.Is(ctx.Err(), context.Canceled) {
				runtime.EventsEmit(a.ctx, "conversion:cancelled", ConversionEvent{ID: file.ID})
				return nil
			}
			runtime.EventsEmit(a.ctx, "conversion:failed", ConversionEvent{ID: file.ID, Error: err.Error()})
			return err
		}
		runtime.EventsEmit(a.ctx, "conversion:completed", ConversionEvent{ID: file.ID, Progress: 100, OutputPath: output})
	}
	return nil
}

func (a *App) CancelConversion() {
	a.setCancel(nil)
}

var cancelMu sync.Mutex

func (a *App) setCancel(cancel context.CancelFunc) {
	cancelMu.Lock()
	defer cancelMu.Unlock()
	if cancel == nil {
		if a.convCancel != nil {
			a.convCancel()
		}
		return
	}
	if a.convCancel != nil {
		a.convCancel()
	}
	a.convCancel = cancel
}

func (a *App) clearCancel() {
	cancelMu.Lock()
	defer cancelMu.Unlock()
	a.convCancel = nil
}

func probeFile(ctx context.Context, path string) ProbeResult {
	result := ProbeResult{Path: path, Name: filepath.Base(path)}
	stat, err := os.Stat(path)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	if !stat.Mode().IsRegular() {
		result.Error = "selected path is not a file"
		return result
	}
	result.Size = stat.Size()

	out, err := hiddenCommand(ctx, ffprobePath(), "-v", "error", "-show_format", "-show_streams", "-of", "json", path).CombinedOutput()
	if err != nil {
		result.Error = commandError("ffprobe failed", err, out)
		return result
	}

	var probe ffprobeOutput
	if err := json.Unmarshal(out, &probe); err != nil {
		result.Error = err.Error()
		return result
	}
	result.Duration = parseFloat(probe.Format.Duration)
	result.Format = strings.ToUpper(firstFormat(probe.Format.FormatName))
	result.Bitrate = int64(parseFloat(probe.Format.BitRate))
	result.Metadata = metadataFromTags(probe.Format.Tags)
	for _, stream := range probe.Streams {
		if stream.CodecType == "audio" {
			result.Codec = strings.ToUpper(stream.CodecName)
			break
		}
	}
	return result
}

type ffprobeOutput struct {
	Streams []struct {
		CodecName string `json:"codec_name"`
		CodecType string `json:"codec_type"`
	} `json:"streams"`
	Format struct {
		FormatName string            `json:"format_name"`
		Duration   string            `json:"duration"`
		BitRate    string            `json:"bit_rate"`
		Tags       map[string]string `json:"tags"`
	} `json:"format"`
}

func runFFmpeg(ctx context.Context, file ConvertFile, req ConvertRequest, output string, progress func(int)) error {
	args := []string{"-y", "-hide_banner", "-i", file.Path}
	if req.PreserveMeta {
		args = append(args, "-map_metadata", "0")
	}
	args = append(args, metadataArgs(file.Metadata)...)
	args = append(args, codecArgs(req.Format, req.Bitrate)...)
	args = append(args, output)

	cmd := hiddenCommand(ctx, ffmpegPath(), args...)
	stderr, _ := cmd.StderrPipe()
	cmd.Stdout = bytes.NewBuffer(nil)
	if err := cmd.Start(); err != nil {
		return err
	}
	var stderrBuf bytes.Buffer
	done := make(chan struct{})
	go func() {
		defer close(done)
		scanner := bufio.NewScanner(stderr)
		last := -1
		for scanner.Scan() {
			line := scanner.Text()
			stderrBuf.WriteString(line)
			stderrBuf.WriteByte('\n')
			seconds, ok := parseFFmpegTime(line)
			if !ok || file.Duration <= 0 {
				continue
			}
			value := int((seconds / file.Duration) * 100)
			if value > 100 {
				value = 100
			}
			if value != last {
				last = value
				progress(value)
			}
		}
	}()
	err := cmd.Wait()
	<-done
	if err != nil {
		return fmt.Errorf("ffmpeg failed: %s", strings.TrimSpace(stderrBuf.String()))
	}
	return nil
}

func codecArgs(format string, bitrate int) []string {
	switch strings.ToUpper(format) {
	case "MP3":
		return []string{"-codec:a", "libmp3lame", "-b:a", fmt.Sprintf("%dk", bitrate)}
	case "AAC":
		return []string{"-codec:a", "aac", "-b:a", fmt.Sprintf("%dk", bitrate)}
	case "FLAC":
		return []string{"-codec:a", "flac"}
	case "WAV":
		return []string{"-codec:a", "pcm_s16le"}
	case "OGG":
		return []string{"-codec:a", "libvorbis", "-b:a", fmt.Sprintf("%dk", bitrate)}
	case "OPUS":
		return []string{"-codec:a", "libopus", "-b:a", fmt.Sprintf("%dk", bitrate)}
	case "AIFF":
		return []string{"-codec:a", "pcm_s16be"}
	case "WMA":
		return []string{"-codec:a", "wmav2", "-b:a", fmt.Sprintf("%dk", bitrate)}
	default:
		return nil
	}
}

func metadataArgs(meta FileMetadata) []string {
	values := map[string]string{
		"title":   meta.Title,
		"artist":  meta.Artist,
		"album":   meta.Album,
		"date":    meta.Year,
		"genre":   meta.Genre,
		"track":   meta.Track,
		"comment": meta.Comment,
	}
	args := []string{}
	for key, value := range values {
		if strings.TrimSpace(value) != "" {
			args = append(args, "-metadata", key+"="+value)
		}
	}
	return args
}

func outputPath(file ConvertFile, req ConvertRequest) (string, error) {
	ext, ok := supportedFormats[strings.ToUpper(req.Format)]
	if !ok {
		return "", fmt.Errorf("unsupported format: %s", req.Format)
	}
	dir := filepath.Dir(file.Path)
	switch req.Dest {
	case "same", "":
	case "subfolder":
		name := sanitizePathPart(req.Subfolder)
		if name == "" {
			name = "converted"
		}
		dir = filepath.Join(dir, name)
	case "custom":
		if strings.TrimSpace(req.CustomPath) == "" {
			return "", fmt.Errorf("choose a custom output folder first")
		}
		dir = req.CustomPath
	default:
		return "", fmt.Errorf("unsupported destination: %s", req.Dest)
	}
	base := sanitizePathPart(expandTemplate(req.Template, file, req))
	if base == "" {
		base = sanitizePathPart(trimExt(file.Name))
	}
	return uniquePath(filepath.Join(dir, base+"."+ext)), nil
}

func expandTemplate(template string, file ConvertFile, req ConvertRequest) string {
	if template == "" {
		template = "{name}"
	}
	replacer := strings.NewReplacer(
		"{name}", trimExt(file.Name),
		"{format}", strings.ToLower(req.Format),
		"{bitrate}", strconv.Itoa(req.Bitrate),
		"{artist}", fallback(file.Metadata.Artist, "unknown"),
		"{album}", fallback(file.Metadata.Album, "unknown"),
		"{track}", fallback(file.Metadata.Track, "00"),
		"{year}", file.Metadata.Year,
	)
	return strings.TrimSpace(replacer.Replace(template))
}

func uniquePath(path string) string {
	if _, err := os.Stat(path); err != nil {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 1; ; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}
}

func sanitizePathPart(value string) string {
	value = strings.TrimSpace(value)
	replacer := strings.NewReplacer("<", "-", ">", "-", ":", "-", "\"", "-", "/", "-", "\\", "-", "|", "-", "?", "", "*", "")
	value = replacer.Replace(value)
	value = regexp.MustCompile(`\s+`).ReplaceAllString(value, " ")
	return strings.Trim(value, ". ")
}

var timeRE = regexp.MustCompile(`time=(\d+):(\d+):(\d+(?:\.\d+)?)`)

func parseFFmpegTime(line string) (float64, bool) {
	match := timeRE.FindStringSubmatch(line)
	if len(match) != 4 {
		return 0, false
	}
	h, _ := strconv.ParseFloat(match[1], 64)
	m, _ := strconv.ParseFloat(match[2], 64)
	s, _ := strconv.ParseFloat(match[3], 64)
	return h*3600 + m*60 + s, true
}

func metadataFromTags(tags map[string]string) FileMetadata {
	find := func(names ...string) string {
		for _, name := range names {
			for key, value := range tags {
				if strings.EqualFold(key, name) {
					return value
				}
			}
		}
		return ""
	}
	return FileMetadata{
		Title:   find("title"),
		Artist:  find("artist", "album_artist"),
		Album:   find("album"),
		Year:    find("date", "year"),
		Genre:   find("genre"),
		Track:   find("track", "tracknumber"),
		Comment: find("comment", "description"),
	}
}

func ffmpegPath() string {
	return bundledToolPath("ffmpeg")
}

func ffprobePath() string {
	return bundledToolPath("ffprobe")
}

func bundledToolPath(name string) string {
	filename := name
	platformDir := ""
	if goruntime.GOOS == "windows" {
		filename = name + ".exe"
		platformDir = "win_x64"
	}

	candidates := []string{}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		candidates = appendToolCandidates(candidates, dir, platformDir, filename)
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = appendToolCandidates(candidates, cwd, platformDir, filename)
		candidates = appendToolCandidates(candidates, filepath.Join(cwd, ".."), platformDir, filename)
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return filename
}

func appendToolCandidates(candidates []string, root string, platformDir string, filename string) []string {
	toolRoot := filepath.Join(root, "third_party", "ffmpeg")
	if platformDir != "" {
		candidates = append(candidates, filepath.Join(toolRoot, platformDir, filename))
	}
	return append(candidates, filepath.Join(toolRoot, filename))
}

func dedupePaths(paths []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, path := range paths {
		key := strings.ToLower(filepath.Clean(path))
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, path)
	}
	return out
}

func firstFormat(format string) string {
	if idx := strings.Index(format, ","); idx >= 0 {
		return format[:idx]
	}
	return format
}

func parseFloat(value string) float64 {
	parsed, _ := strconv.ParseFloat(value, 64)
	return parsed
}

func commandError(prefix string, err error, output []byte) string {
	detail := strings.TrimSpace(string(output))
	if detail == "" {
		return prefix + ": " + err.Error()
	}
	if len(detail) > 500 {
		detail = detail[:500] + "..."
	}
	return prefix + ": " + detail
}

func trimExt(name string) string {
	return strings.TrimSuffix(name, filepath.Ext(name))
}

func fallback(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
