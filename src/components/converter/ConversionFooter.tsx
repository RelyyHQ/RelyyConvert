import { Check } from "lucide-react";
import type { DestType, Format } from "./model";

type ConversionFooterProps = {
  convertDone: boolean;
  doneCount: number;
  readyCount: number;
  format: Format;
  bitrate: number;
  isLossless: boolean;
  dest: DestType;
  subfolder: string;
  customPath: string;
  converting: boolean;
  filesLength: number;
  onClear: () => void;
  onCancel: () => void;
  onStartConvert: () => void;
};

export default function ConversionFooter({
  convertDone,
  doneCount,
  readyCount,
  format,
  bitrate,
  isLossless,
  dest,
  subfolder,
  customPath,
  converting,
  filesLength,
  onClear,
  onCancel,
  onStartConvert,
}: ConversionFooterProps) {
  return (
    <footer className="bottom-bar">
      {convertDone ? (
        <div className="done-message">
          <Check className="h-4 w-4" /> {doneCount} file{doneCount === 1 ? "" : "s"} converted successfully
        </div>
      ) : (
        <div className="bottom-info">
          {readyCount} file{readyCount === 1 ? "" : "s"} ready - {format}
          {isLossless ? " - Lossless" : ` - ${bitrate} kbps`} -
          {dest === "same" ? " Same folder" : dest === "subfolder" ? ` /${subfolder}/` : ` ${customPath}`}
        </div>
      )}
      <button className="btn-secondary" type="button" onClick={onClear}>
        Clear
      </button>
      {converting ? (
        <button className="btn-secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        <button className="btn-primary" type="button" disabled={!readyCount && !convertDone} onClick={onStartConvert}>
          Convert {readyCount || filesLength} File{(readyCount || filesLength) === 1 ? "" : "s"}
        </button>
      )}
    </footer>
  );
}
