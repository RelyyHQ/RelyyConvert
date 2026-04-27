import type { DragEvent } from "react";
import { Music2, Plus, Tag, Trash2, X } from "lucide-react";
import Badge from "./Badge";
import type { AudioFile, Format } from "./model";

type FileTableAreaProps = {
  files: AudioFile[];
  selected: Set<number>;
  format: Format;
  totalSize: number;
  previewName: (file: AudioFile) => string;
  fmtSize: (bytes: number) => string;
  fmtDur: (seconds: number) => string;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onToggleAll: () => void;
  onToggleSelect: (id: number) => void;
  onAddFiles: () => void;
  onClearAll: () => void;
  onRemoveFile: (id: number) => void;
  onToggleMetadataPanel: (id: number) => void;
};

export default function FileTableArea({
  files,
  selected,
  format,
  totalSize,
  previewName,
  fmtSize,
  fmtDur,
  onDrop,
  onToggleAll,
  onToggleSelect,
  onAddFiles,
  onClearAll,
  onRemoveFile,
  onToggleMetadataPanel,
}: FileTableAreaProps) {
  return (
    <div className="file-area" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <div className="table-toolbar">
        <span>
          {files.length} file{files.length === 1 ? "" : "s"} - {fmtSize(totalSize)}
        </span>
        <div className="toolbar-spacer" />
        <button className="icon-btn" type="button" title="Add files" onClick={onAddFiles}>
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button className="icon-btn" type="button" title="Clear all" onClick={onClearAll}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="table-wrap">
        <table className="file-table">
          <thead>
            <tr>
              <th className="checkbox-col">
                <input type="checkbox" checked={selected.size === files.length && files.length > 0} onChange={onToggleAll} />
              </th>
              <th>File</th>
              <th>From</th>
              <th>To</th>
              <th>Duration</th>
              <th>Size</th>
              <th>Output name</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className={selected.has(file.id) ? "selected" : ""} onClick={() => onToggleSelect(file.id)}>
                <td onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(file.id)} onChange={() => onToggleSelect(file.id)} />
                </td>
                <td>
                  <div className="file-name-cell">
                    <span className="file-icon">
                      <Music2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="file-copy">
                      <strong title={file.name}>{file.name.replace(/\.[^.]+$/, "")}</strong>
                      <small>.{file.name.split(".").pop()}</small>
                    </span>
                  </div>
                </td>
                <td className="muted-cell">{file.srcFmt}</td>
                <td>
                  <span className="format-pill">{format}</span>
                </td>
                <td className="muted-cell tabular">{fmtDur(file.dur)}</td>
                <td className="muted-cell tabular">{fmtSize(file.size)}</td>
                <td className="output-cell" title={previewName(file)}>
                  {previewName(file)}
                </td>
                <td>
                  {file.status === "converting" ? (
                    <div className="status-stack">
                      <Badge status={file.status} progress={file.progress} />
                      <span className="inline-progress">
                        <span style={{ width: `${file.progress}%` }} />
                      </span>
                    </div>
                  ) : (
                    <span title={file.error || file.outputPath || undefined}>
                      <Badge status={file.status} />
                    </span>
                  )}
                </td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div className="row-actions">
                    <button
                      className="icon-btn"
                      type="button"
                      title="Edit metadata"
                      onClick={() => onToggleMetadataPanel(file.id)}
                    >
                      <Tag className="h-3 w-3" />
                    </button>
                    <button className="icon-btn" type="button" title="Remove" onClick={() => onRemoveFile(file.id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
