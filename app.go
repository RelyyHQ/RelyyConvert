package main

import (
	"context"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
	convCancel context.CancelFunc
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	runtime.OnFileDrop(ctx, func(_ int, _ int, paths []string) {
		runtime.EventsEmit(ctx, "files:dropped", paths)
	})
}

func (a *App) shutdown(_ context.Context) {
	a.CancelConversion()
}

func (a *App) BrowseAudioFiles() ([]string, error) {
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select audio files",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Audio Files (*.mp3;*.wav;*.flac;*.aac;*.m4a;*.ogg;*.opus;*.aiff;*.wma)",
				Pattern:     "*.mp3;*.wav;*.flac;*.aac;*.m4a;*.ogg;*.opus;*.aiff;*.wma",
			},
		},
	})
}

func (a *App) ChooseOutputFolder(defaultPath string) (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Choose output folder",
		DefaultDirectory: defaultPath,
		CanCreateDirectories: true,
	})
}

func (a *App) GetDownloadsPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Downloads")
}
