import type { CSSProperties } from "react";
import { FolderOpen } from "lucide-react";
import { BITRATES, DEST_OPTIONS, FORMATS, LOSSLESS, TEMPLATE_TAGS } from "./model";
import type { AudioFile, DestType, Format } from "./model";

type ConverterSidebarProps = {
  files: AudioFile[];
  format: Format;
  bitrate: number;
  bitrateIdx: number;
  bitratePct: number;
  dest: DestType;
  customPath: string;
  subfolder: string;
  template: string;
  preserveMeta: boolean;
  previewName: (file: AudioFile) => string;
  onFormatChange: (format: Format) => void;
  onBitrateChange: (bitrate: number) => void;
  onDestChange: (dest: DestType) => void;
  onCustomPathChange: (value: string) => void;
  onChooseCustomPath: () => void;
  onSubfolderChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  onAppendTemplateTag: (tag: string) => void;
  onTogglePreserveMeta: () => void;
};

export default function ConverterSidebar({
  files,
  format,
  bitrate,
  bitrateIdx,
  bitratePct,
  dest,
  customPath,
  subfolder,
  template,
  preserveMeta,
  previewName,
  onFormatChange,
  onBitrateChange,
  onDestChange,
  onCustomPathChange,
  onChooseCustomPath,
  onSubfolderChange,
  onTemplateChange,
  onAppendTemplateTag,
  onTogglePreserveMeta,
}: ConverterSidebarProps) {
  const firstFile = files[0];

  return (
    <aside className="converter-sidebar">
      <div className="sidebar-section first">
        <div className="sidebar-label">Output Format</div>
        <div className="format-grid">
          {FORMATS.map((item) => (
            <button
              key={item}
              className={`fmt-btn${format === item ? " active" : ""}`}
              type="button"
              onClick={() => onFormatChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-divider" />
      <div className="sidebar-section">
        {!LOSSLESS.has(format) ? (
          <>
            <div className="sidebar-label">Bitrate</div>
            <div className="bitrate-display">
              <div>
                <span className="bitrate-val">{bitrate}</span>
                <span className="bitrate-unit"> kbps</span>
              </div>
              <span className="bitrate-quality">{bitrate >= 256 ? "HQ" : bitrate >= 128 ? "Good" : "Low"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={BITRATES.length - 1}
              value={bitrateIdx}
              onChange={(event) => onBitrateChange(BITRATES[Number(event.target.value)])}
              style={{ "--pct": `${bitratePct}%` } as CSSProperties}
            />
            <div className="range-labels">
              <span>64</span>
              <span>320 kbps</span>
            </div>
          </>
        ) : (
          <p className="lossless-note">
            <strong>Lossless format</strong>
            <br />
            Bitrate controls are not applicable.
          </p>
        )}
      </div>

      <div className="sidebar-divider" />
      <div className="sidebar-section">
        <div className="sidebar-label">Destination</div>
        {DEST_OPTIONS.map((item) => (
          <button
            key={item.id}
            className={`dest-option${dest === item.id ? " active" : ""}`}
            type="button"
            onClick={() => onDestChange(item.id)}
          >
            <span className={`radio-dot${dest === item.id ? " checked" : ""}`} />
            <span className="dest-label">{item.label}</span>
          </button>
        ))}
        {dest === "subfolder" ? (
          <input
            className="text-input mt-2"
            value={subfolder}
            onChange={(event) => onSubfolderChange(event.target.value)}
          />
        ) : null}
        {dest === "custom" ? (
          <div className="path-picker mt-2">
            <input
              className="text-input"
              value={customPath}
              placeholder="Choose an output folder"
              onChange={(event) => onCustomPathChange(event.target.value)}
            />
            <button className="icon-btn" type="button" title="Choose output folder" onClick={onChooseCustomPath}>
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="sidebar-divider" />
      <div className="sidebar-section">
        <div className="sidebar-label">File Naming</div>
        <input className="text-input mono" value={template} onChange={(event) => onTemplateChange(event.target.value)} />
        <div className="template-tags">
          {TEMPLATE_TAGS.map((tag) => (
            <button key={tag} className="tag" type="button" onClick={() => onAppendTemplateTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
        {firstFile ? (
          <p className="preview-name">
            Preview: <span>{previewName(firstFile)}</span>
          </p>
        ) : null}
      </div>

      <div className="sidebar-divider" />
      <div className="sidebar-section pb">
        <div className="sidebar-label">Metadata</div>
        <div className="toggle-row">
          <span>Preserve on convert</span>
          <button className={`toggle ${preserveMeta ? "on" : "off"}`} type="button" onClick={onTogglePreserveMeta}>
            <span className="toggle-thumb" />
          </button>
        </div>
      </div>
    </aside>
  );
}
