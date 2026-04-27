import { X } from "lucide-react";
import { METADATA_FIELDS } from "./model";
import type { AudioFile, FileMetadata } from "./model";

type MetadataPanelProps = {
  metaFile: AudioFile;
  preserveMeta: boolean;
  onClose: () => void;
  onUpdateMeta: (field: keyof FileMetadata, value: string) => void;
};

export default function MetadataPanel({ metaFile, preserveMeta, onClose, onUpdateMeta }: MetadataPanelProps) {
  return (
    <aside className="meta-panel">
      <header className="meta-header">
        <strong>Metadata - {metaFile.name.replace(/\.[^.]+$/, "").slice(0, 22)}</strong>
        <button className="icon-btn" type="button" onClick={onClose}>
          <X className="h-3 w-3" />
        </button>
      </header>
      <div className="meta-body">
        {METADATA_FIELDS.map(([key, label]) => (
          <label className="meta-field" key={key}>
            <span>{label}</span>
            {key === "comment" ? (
              <textarea
                className="text-input textarea"
                value={metaFile.metadata[key]}
                onChange={(event) => onUpdateMeta(key, event.target.value)}
              />
            ) : (
              <input
                className="text-input"
                value={metaFile.metadata[key]}
                onChange={(event) => onUpdateMeta(key, event.target.value)}
              />
            )}
          </label>
        ))}
        <p className="meta-note">Metadata will be {preserveMeta ? "embedded" : "stripped"} on conversion.</p>
        <button className="btn-primary meta-save" type="button" onClick={onClose}>
          Save
        </button>
      </div>
    </aside>
  );
}
