package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOutputPathPreservesOriginalDirectoryForSameDestination(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "Arizona (MASTER v1c)[STREAMING].mp3")
	if err := os.WriteFile(source, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	got, err := outputPath(ConvertFile{
		Path: source,
		Name: filepath.Base(source),
		Metadata: FileMetadata{Title: "Arizona (MASTER v1c)[STREAMING]"},
	}, ConvertRequest{Format: "MP3", Bitrate: 320, Dest: "same", Template: "{name}"})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(dir, "Arizona (MASTER v1c)[STREAMING] (1).mp3")
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestOutputPathCustomFolderAndCollision(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "Track.wav")
	custom := filepath.Join(dir, "out")
	if err := os.WriteFile(source, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(custom, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(custom, "Artist - Track.flac"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	got, err := outputPath(ConvertFile{
		Path: source,
		Name: filepath.Base(source),
		Metadata: FileMetadata{Artist: "Artist"},
	}, ConvertRequest{Format: "FLAC", Bitrate: 320, Dest: "custom", CustomPath: custom, Template: "{artist} - {name}"})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(custom, "Artist - Track (1).flac")
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestSanitizePathPart(t *testing.T) {
	got := sanitizePathPart(`bad:/\name?* "ok"`)
	want := "bad---name -ok-"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
