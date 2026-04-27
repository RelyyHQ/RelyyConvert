package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExpandTemplate(t *testing.T) {
	file := ConvertFile{Name: "Track One.wav", Metadata: Metadata{Artist: "Artist", Album: "Album", Track: "03", Year: "2026"}}
	req := ConvertRequest{Format: "MP3", Bitrate: 192, Template: "{artist} - {track} - {name} - {format} - {bitrate} - {album} - {year}"}
	got := expandTemplate(req.Template, file, req)
	want := "Artist - 03 - Track One - mp3 - 192 - Album - 2026"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestOutputPathSubfolderAndCollision(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "song.wav")
	if err := os.WriteFile(input, []byte("input"), 0644); err != nil {
		t.Fatal(err)
	}
	outDir := filepath.Join(dir, "converted")
	if err := os.Mkdir(outDir, 0755); err != nil {
		t.Fatal(err)
	}
	existing := filepath.Join(outDir, "song.mp3")
	if err := os.WriteFile(existing, []byte("existing"), 0644); err != nil {
		t.Fatal(err)
	}

	got, err := outputPath(ConvertFile{Path: input, Name: "song.wav"}, ConvertRequest{Format: "MP3", Dest: "subfolder", Subfolder: "converted", Template: "{name}", Bitrate: 192})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(outDir, "song (1).mp3")
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestSanitizePathPart(t *testing.T) {
	got := sanitizePathPart(` bad:/\name?* .`)
	want := "bad---name"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestParseFFmpegTime(t *testing.T) {
	got, ok := parseFFmpegTime("size=128kB time=00:01:02.50 bitrate=128.0kbits/s")
	if !ok {
		t.Fatal("expected time match")
	}
	if got != 62.5 {
		t.Fatalf("got %v, want 62.5", got)
	}
}

func TestValidateRequest(t *testing.T) {
	err := validateRequest(ConvertRequest{Format: "BAD", Files: []ConvertFile{{Path: "missing.mp3", Name: "missing.mp3"}}})
	if err == nil {
		t.Fatal("expected unsupported format error")
	}
}
