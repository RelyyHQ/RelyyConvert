import type { DragEvent } from "react";
import { Upload } from "lucide-react";

type EmptyDropzoneProps = {
  dragOver: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBrowseFiles: () => void;
  onLoadDemo: () => void;
};

export default function EmptyDropzone({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowseFiles,
  onLoadDemo,
}: EmptyDropzoneProps) {
  return (
    <div
      className={`dropzone wails-file-drop-target${dragOver ? " drag-over" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Upload className="dropzone-icon" />
      <div className="dropzone-title">Drop audio files here</div>
      <div className="dropzone-sub">MP3, AAC, FLAC, WAV, OGG, OPUS, AIFF, WMA and more</div>
      <div className="dropzone-actions">
        <button className="dropzone-btn" type="button" onClick={onBrowseFiles}>
          Browse Files
        </button>
        <button className="dropzone-btn muted" type="button" onClick={onLoadDemo}>
          Load Demo
        </button>
      </div>
    </div>
  );
}
