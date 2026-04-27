package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type sender interface {
	SendJSON(any) error
}

type Backend struct {
	token       string
	client      sender
	ffmpegPath  string
	ffprobePath string
	mu          sync.Mutex
	cancel      context.CancelFunc
}

type Metadata struct {
	Title   string `json:"title"`
	Artist  string `json:"artist"`
	Album   string `json:"album"`
	Year    string `json:"year"`
	Genre   string `json:"genre"`
	Track   string `json:"track"`
	Comment string `json:"comment"`
}

type ConvertFile struct {
	ID       int      `json:"id"`
	Path     string   `json:"path"`
	Name     string   `json:"name"`
	Duration float64  `json:"duration"`
	Metadata Metadata `json:"metadata"`
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

type ProbeRequest struct {
	ID   int    `json:"id"`
	Path string `json:"path"`
	Name string `json:"name"`
}

type HealthResult struct {
	OK      bool   `json:"ok"`
	FFmpeg  string `json:"ffmpeg"`
	FFprobe string `json:"ffprobe"`
	Error   string `json:"error,omitempty"`
}

type ProbeResult struct {
	ID        int      `json:"id"`
	Name      string   `json:"name"`
	Path      string   `json:"path"`
	Size      int64    `json:"size"`
	Duration  float64  `json:"duration"`
	Format    string   `json:"format"`
	Codec     string   `json:"codec"`
	Bitrate   int64    `json:"bitrate"`
	Metadata  Metadata `json:"metadata"`
	Error     string   `json:"error,omitempty"`
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

func NewBackend(token string, client sender) *Backend {
	root := executableRoot()
	ffmpeg := filepath.Join(root, "vendor", "ffmpeg", "win_x64", "ffmpeg.exe")
	ffprobe := filepath.Join(root, "vendor", "ffmpeg", "win_x64", "ffprobe.exe")
	return &Backend{token: token, client: client, ffmpegPath: ffmpeg, ffprobePath: ffprobe}
}

func executableRoot() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	dir := filepath.Dir(exe)
	if filepath.Base(filepath.Dir(dir)) == "bin" {
		return filepath.Dir(filepath.Dir(dir))
	}
	return dir
}

func (b *Backend) Handle(ctx context.Context, event string, data json.RawMessage) {
	switch event {
	case "backend.health":
		b.Broadcast("backend.ready", b.Health())
	case "media.probe":
		var req ProbeRequest
		if err := json.Unmarshal(data, &req); err != nil {
			b.Broadcast("media.probed", ProbeResult{Error: err.Error()})
			return
		}
		probeCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		b.Broadcast("media.probed", b.Probe(probeCtx, req))
	case "conversion.start":
		var req ConvertRequest
		if err := json.Unmarshal(data, &req); err != nil {
			b.Broadcast("conversion.failed", map[string]any{"error": err.Error()})
			return
		}
		go b.Convert(req)
	case "conversion.cancel":
		b.Cancel()
	default:
		log.Printf("unknown event: %s", event)
	}
}

func (b *Backend) Broadcast(event string, data any) {
	msg := map[string]any{
		"id":          uuidV4(),
		"method":      "app.broadcast",
		"accessToken": b.token,
		"data": map[string]any{
			"event": event,
			"data":  data,
		},
	}
	if err := b.client.SendJSON(msg); err != nil {
		log.Printf("broadcast %s failed: %v", event, err)
	}
}

func (b *Backend) Health() HealthResult {
	missing := []string{}
	if _, err := os.Stat(b.ffmpegPath); err != nil {
		missing = append(missing, "ffmpeg.exe")
	}
	if _, err := os.Stat(b.ffprobePath); err != nil {
		missing = append(missing, "ffprobe.exe")
	}
	if len(missing) > 0 {
		return HealthResult{OK: false, FFmpeg: b.ffmpegPath, FFprobe: b.ffprobePath, Error: "missing bundled " + strings.Join(missing, ", ")}
	}
	return HealthResult{OK: true, FFmpeg: b.ffmpegPath, FFprobe: b.ffprobePath}
}

func (b *Backend) Probe(ctx context.Context, req ProbeRequest) ProbeResult {
	result := ProbeResult{ID: req.ID, Name: req.Name, Path: req.Path}
	if req.Path == "" {
		result.Error = "missing file path"
		return result
	}
	stat, err := os.Stat(req.Path)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	result.Size = stat.Size()

	out, err := exec.CommandContext(ctx, b.ffprobePath, "-v", "error", "-show_format", "-show_streams", "-of", "json", req.Path).CombinedOutput()
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

func (b *Backend) Convert(req ConvertRequest) {
	ctx, cancel := context.WithCancel(context.Background())
	if !b.setCancel(cancel) {
		b.Broadcast("conversion.failed", map[string]any{"error": "conversion already running"})
		return
	}
	defer b.clearCancel()

	if err := validateRequest(req); err != nil {
		b.Broadcast("conversion.failed", map[string]any{"error": err.Error()})
		return
	}
	if health := b.Health(); !health.OK {
		b.Broadcast("conversion.failed", map[string]any{"error": health.Error})
		return
	}

	for _, file := range req.Files {
		select {
		case <-ctx.Done():
			b.Broadcast("conversion.cancelled", map[string]any{"id": file.ID})
			return
		default:
		}

		output, err := outputPath(file, req)
		if err != nil {
			b.Broadcast("conversion.failed", map[string]any{"id": file.ID, "error": err.Error()})
			return
		}
		if err := os.MkdirAll(filepath.Dir(output), 0755); err != nil {
			b.Broadcast("conversion.failed", map[string]any{"id": file.ID, "error": err.Error()})
			return
		}

		args := ffmpegArgs(file, req, output)
		cmd := exec.CommandContext(ctx, b.ffmpegPath, args...)
		stderr, _ := cmd.StderrPipe()
		cmd.Stdout = bytes.NewBuffer(nil)

		if err := cmd.Start(); err != nil {
			b.Broadcast("conversion.failed", map[string]any{"id": file.ID, "error": err.Error()})
			return
		}

		go scanProgress(stderr, file.Duration, func(progress int) {
			b.Broadcast("conversion.progress", map[string]any{"id": file.ID, "progress": progress, "outputPath": output})
		})

		err = cmd.Wait()
		if errors.Is(ctx.Err(), context.Canceled) {
			b.Broadcast("conversion.cancelled", map[string]any{"id": file.ID})
			return
		}
		if err != nil {
			b.Broadcast("conversion.failed", map[string]any{"id": file.ID, "error": err.Error()})
			return
		}
		b.Broadcast("conversion.completed", map[string]any{"id": file.ID, "outputPath": output})
	}
}

func (b *Backend) setCancel(cancel context.CancelFunc) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.cancel != nil {
		cancel()
		return false
	}
	b.cancel = cancel
	return true
}

func (b *Backend) clearCancel() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.cancel = nil
}

func (b *Backend) Cancel() {
	b.mu.Lock()
	cancel := b.cancel
	b.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func validateRequest(req ConvertRequest) error {
	if len(req.Files) == 0 {
		return fmt.Errorf("no files selected")
	}
	if _, ok := supportedFormats[strings.ToUpper(req.Format)]; !ok {
		return fmt.Errorf("unsupported format: %s", req.Format)
	}
	for _, file := range req.Files {
		if file.Path == "" {
			return fmt.Errorf("%s has no filesystem path", file.Name)
		}
		if _, err := os.Stat(file.Path); err != nil {
			return fmt.Errorf("%s: %w", file.Name, err)
		}
	}
	if req.Dest == "custom" && strings.TrimSpace(req.CustomPath) == "" {
		return fmt.Errorf("custom output folder is required")
	}
	return nil
}

func ffmpegArgs(file ConvertFile, req ConvertRequest, output string) []string {
	args := []string{"-y", "-hide_banner", "-i", file.Path}
	if req.PreserveMeta {
		args = append(args, "-map_metadata", "0")
	}
	args = append(args, metadataArgs(file.Metadata)...)

	switch strings.ToUpper(req.Format) {
	case "MP3":
		args = append(args, "-codec:a", "libmp3lame", "-b:a", fmt.Sprintf("%dk", req.Bitrate))
	case "AAC":
		args = append(args, "-codec:a", "aac", "-b:a", fmt.Sprintf("%dk", req.Bitrate))
	case "FLAC":
		args = append(args, "-codec:a", "flac")
	case "WAV":
		args = append(args, "-codec:a", "pcm_s16le")
	case "OGG":
		args = append(args, "-codec:a", "libvorbis", "-b:a", fmt.Sprintf("%dk", req.Bitrate))
	case "OPUS":
		args = append(args, "-codec:a", "libopus", "-b:a", fmt.Sprintf("%dk", req.Bitrate))
	case "AIFF":
		args = append(args, "-codec:a", "pcm_s16be")
	case "WMA":
		args = append(args, "-codec:a", "wmav2", "-b:a", fmt.Sprintf("%dk", req.Bitrate))
	}
	return append(args, output)
}

func metadataArgs(meta Metadata) []string {
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
		dir = expandHome(req.CustomPath)
	default:
		return "", fmt.Errorf("unsupported destination: %s", req.Dest)
	}

	base := expandTemplate(req.Template, file, req)
	if base == "" {
		base = trimExt(file.Name)
	}
	base = sanitizePathPart(base)
	if base == "" {
		base = "converted"
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

func scanProgress(stderr ioReader, duration float64, emit func(int)) {
	scanner := bufio.NewScanner(stderr)
	last := -1
	for scanner.Scan() {
		line := scanner.Text()
		seconds, ok := parseFFmpegTime(line)
		if !ok || duration <= 0 {
			continue
		}
		progress := int((seconds / duration) * 100)
		if progress > 100 {
			progress = 100
		}
		if progress != last {
			last = progress
			emit(progress)
		}
	}
}

type ioReader interface {
	Read([]byte) (int, error)
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

func metadataFromTags(tags map[string]string) Metadata {
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
	return Metadata{
		Title:   find("title"),
		Artist:  find("artist", "album_artist"),
		Album:   find("album"),
		Year:    find("date", "year"),
		Genre:   find("genre"),
		Track:   find("track", "tracknumber"),
		Comment: find("comment", "description"),
	}
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

func expandHome(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") || strings.HasPrefix(path, `~\`) {
		home, err := os.UserHomeDir()
		if err == nil {
			if len(path) == 1 {
				return home
			}
			return filepath.Join(home, path[2:])
		}
	}
	return path
}
