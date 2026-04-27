import type { DragEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import AppWindowChrome from "./components/AppWindowChrome";
import ConversionFooter from "./components/converter/ConversionFooter";
import ConverterSidebar from "./components/converter/ConverterSidebar";
import EmptyDropzone from "./components/converter/EmptyDropzone";
import FileTableArea from "./components/converter/FileTableArea";
import MetadataPanel from "./components/converter/MetadataPanel";
import { BITRATES, EXT_MAP, LOSSLESS } from "./components/converter/model";
import type { AudioFile, DestType, FileMetadata, Format } from "./components/converter/model";

const BACKEND_ID = "com.relyyconvert.backend";

let fileCounter = 0;

type FileWithPath = File & { path?: string; fullPath?: string };

type BackendHealth = {
  ok: boolean;
  error?: string;
};

type ProbeResult = {
  id: number;
  name?: string;
  path?: string;
  size?: number;
  duration?: number;
  format?: string;
  codec?: string;
  bitrate?: number;
  error?: string;
  metadata?: Partial<FileMetadata>;
};

type ConversionEvent = {
  id?: number;
  progress?: number;
  outputPath?: string;
  error?: string;
};

const emptyMetadata = (): FileMetadata => ({ title: "", artist: "", album: "", year: "", genre: "", track: "", comment: "" });

const fmtSize = (bytes: number) =>
  bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)}MB` : bytes > 1_000 ? `${Math.round(bytes / 1_000)}KB` : `${bytes}B`;

const fmtDur = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const getFilePath = (file: FileWithPath) => file.path || file.fullPath || file.webkitRelativePath || file.name;

const hasBackend = () => Boolean(window.Neutralino?.extensions && window.Neutralino?.events);

function browserFileToAudio(file: FileWithPath): AudioFile {
  const name = file.name;
  const ext = name.split(".").pop() || "audio";
  const title = name.replace(/\.[^.]+$/, "");
  return {
    id: ++fileCounter,
    name,
    path: getFilePath(file),
    size: file.size,
    srcFmt: ext.toUpperCase(),
    dur: 0,
    status: "probing",
    progress: 0,
    metadata: { ...emptyMetadata(), title },
  };
}

function pathToAudio(path: string, size = 0): AudioFile {
  const normalized = path.replaceAll("\\", "/");
  const name = normalized.split("/").pop() || path;
  const ext = name.split(".").pop() || "audio";
  const title = name.replace(/\.[^.]+$/, "");
  return {
    id: ++fileCounter,
    name,
    path,
    size,
    srcFmt: ext.toUpperCase(),
    dur: 0,
    status: "probing",
    progress: 0,
    metadata: { ...emptyMetadata(), title },
  };
}

function demoFile(name: string, ext: string, size: number, duration: number): AudioFile {
  const title = name.replace(/\.[^.]+$/, "");
  return {
    id: ++fileCounter,
    name,
    path: "",
    size,
    srcFmt: ext.toUpperCase(),
    dur: duration,
    status: "error",
    progress: 0,
    error: "Demo files do not have real filesystem paths.",
    metadata: { ...emptyMetadata(), title },
  };
}

function detailData<T>(event: CustomEvent<unknown>): T | null {
  const detail = event.detail as { data?: T } | T | undefined;
  if (!detail) return null;
  if (typeof detail === "object" && "data" in detail) return (detail as { data: T }).data;
  return detail as T;
}

async function dispatchBackend(event: string, data?: unknown) {
  if (!window.Neutralino?.extensions) {
    throw new Error("Neutralino extension API is not available.");
  }
  return window.Neutralino.extensions.dispatch(BACKEND_ID, event, data);
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [format, setFormat] = useState<Format>("MP3");
  const [bitrate, setBitrate] = useState(192);
  const [dest, setDest] = useState<DestType>("same");
  const [customPath, setCustomPath] = useState("~/Downloads/converted");
  const [subfolder, setSubfolder] = useState("converted");
  const [template, setTemplate] = useState("{name}");
  const [preserveMeta, setPreserveMeta] = useState(true);
  const [metaFileId, setMetaFileId] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [backendStatus, setBackendStatus] = useState(() => (hasBackend() ? "Starting" : "Browser preview"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hasBackend()) {
      return;
    }

    let active = true;
    const listen = async () => {
      await window.Neutralino?.events?.on("backend.ready", (event) => {
        const health = detailData<BackendHealth>(event);
        if (!active || !health) return;
        setBackendStatus(health.ok ? "Backend ready" : health.error || "FFmpeg missing");
      });

      await window.Neutralino?.events?.on("media.probed", (event) => {
        const result = detailData<ProbeResult>(event);
        if (!active || !result) return;
        setFiles((prev) =>
          prev.map((file) =>
            file.id === result.id
              ? {
                  ...file,
                  name: result.name || file.name,
                  path: result.path || file.path,
                  size: result.size ?? file.size,
                  dur: result.duration ?? file.dur,
                  srcFmt: result.codec || result.format || file.srcFmt,
                  status: result.error ? "error" : "ready",
                  error: result.error,
                  metadata: { ...file.metadata, ...result.metadata },
                }
              : file,
          ),
        );
      });

      await window.Neutralino?.events?.on("conversion.progress", (event) => {
        const result = detailData<ConversionEvent>(event);
        if (!active || !result?.id) return;
        setFiles((prev) =>
          prev.map((file) =>
            file.id === result.id
              ? { ...file, status: "converting", progress: result.progress ?? file.progress, outputPath: result.outputPath }
              : file,
          ),
        );
      });

      await window.Neutralino?.events?.on("conversion.completed", (event) => {
        const result = detailData<ConversionEvent>(event);
        if (!active || !result?.id) return;
        setFiles((prev) =>
          {
            const next = prev.map((file) => (file.id === result.id ? { ...file, status: "done" as const, progress: 100, outputPath: result.outputPath } : file));
            if (next.length > 0 && next.every((file) => file.status === "done" || file.status === "error")) {
              window.queueMicrotask(() => {
                setConverting(false);
                setConvertDone(next.some((file) => file.status === "done"));
              });
            }
            return next;
          },
        );
      });

      await window.Neutralino?.events?.on("conversion.failed", (event) => {
        const result = detailData<ConversionEvent>(event);
        if (!active) return;
        setConverting(false);
        setConvertDone(false);
        setFiles((prev) =>
          prev.map((file) =>
            !result?.id || file.id === result.id
              ? { ...file, status: file.status === "converting" ? "error" : file.status, progress: 0, error: result?.error || "Conversion failed" }
              : file,
          ),
        );
      });

      await window.Neutralino?.events?.on("conversion.cancelled", (event) => {
        const result = detailData<ConversionEvent>(event);
        if (!active) return;
        setConverting(false);
        setConvertDone(false);
        setFiles((prev) =>
          prev.map((file) =>
            !result?.id || file.id === result.id ? { ...file, status: "ready", progress: 0, error: undefined } : file,
          ),
        );
      });

      await dispatchBackend("backend.health").catch((error) => setBackendStatus(error instanceof Error ? error.message : "Backend unavailable"));
    };

    void listen();
    return () => {
      active = false;
    };
  }, []);

  const bitrateIdx = BITRATES.indexOf(bitrate);
  const bitratePct = (bitrateIdx / (BITRATES.length - 1)) * 100;
  const metaFile = files.find((file) => file.id === metaFileId);
  const totalSize = files.reduce((total, file) => total + file.size, 0);
  const readyCount = files.filter((file) => file.status === "ready").length;
  const doneCount = files.filter((file) => file.status === "done").length;
  const currentTimeLabel = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const currentDateLabel = now.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

  const previewName = (file: AudioFile) => `${template
    .replace("{name}", file.name.replace(/\.[^.]+$/, ""))
    .replace("{format}", format.toLowerCase())
    .replace("{bitrate}", String(bitrate))
    .replace("{artist}", file.metadata.artist || "unknown")
    .replace("{album}", file.metadata.album || "unknown")
    .replace("{track}", file.metadata.track || "00")
    .replace("{year}", file.metadata.year || "")}.${EXT_MAP[format]}`;

  const probeFiles = useCallback((nextFiles: AudioFile[]) => {
    if (!hasBackend()) {
      setFiles((prev) =>
        prev.map((file) =>
          nextFiles.some((nextFile) => nextFile.id === file.id)
            ? { ...file, status: "error", error: "Run with Neutralino to use the Go conversion backend." }
            : file,
        ),
      );
      return;
    }
    nextFiles.forEach((file) => {
      void dispatchBackend("media.probe", { id: file.id, path: file.path, name: file.name });
    });
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const nextFiles = Array.from(fileList).map((file) => browserFileToAudio(file as FileWithPath));
    if (!nextFiles.length) return;
    setFiles((prev) => [...prev, ...nextFiles]);
    setConvertDone(false);
    probeFiles(nextFiles);
  }, [probeFiles]);

  const addPaths = useCallback(async (paths: string[]) => {
    const nextFiles = await Promise.all(paths.map(async (path) => {
      const stats = await window.Neutralino?.filesystem?.getStats(path).catch(() => undefined);
      return pathToAudio(path, stats?.size ?? 0);
    }));
    if (!nextFiles.length) return;
    setFiles((prev) => [...prev, ...nextFiles]);
    setConvertDone(false);
    probeFiles(nextFiles);
  }, [probeFiles]);

  const browseFiles = useCallback(() => {
    if (window.Neutralino?.os?.showOpenDialog) {
      void window.Neutralino.os.showOpenDialog("Select audio files", {
        multiSelections: true,
        filters: [
          { name: "Audio", extensions: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "aiff", "wma"] },
        ],
      }).then(addPaths);
      return;
    }
    document.getElementById("audio-file-input")?.click();
  }, [addPaths]);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    addFiles(event.dataTransfer.files);
  }, [addFiles]);

  const onDropzoneDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const onDropzoneDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const addDemoFiles = () => {
    const demos = [
      demoFile("Summer Vibes.mp3", "mp3", 4_821_000, 241),
      demoFile("Intro Track.wav", "wav", 28_430_000, 84),
      demoFile("Night Drive.flac", "flac", 32_100_000, 312),
      demoFile("Podcast EP42.m4a", "m4a", 18_720_000, 1180),
      demoFile("Ambient Loop.ogg", "ogg", 7_230_000, 168),
    ];
    demos[0].metadata = { title: "Summer Vibes", artist: "DJ Coral", album: "Summer 2024", year: "2024", genre: "Electronic", track: "01", comment: "" };
    demos[1].metadata = { title: "Intro Track", artist: "Relyy Studio", album: "Intros", year: "2023", genre: "Ambient", track: "", comment: "Full quality master" };
    setFiles(demos);
    setConvertDone(false);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => setSelected(selected.size === files.length ? new Set() : new Set(files.map((file) => file.id)));
  const removeFile = (id: number) => setFiles((prev) => prev.filter((file) => file.id !== id));
  const clearAll = () => {
    setFiles([]);
    setSelected(new Set());
    setMetaFileId(null);
    setConvertDone(false);
  };

  const updateMeta = (field: keyof FileMetadata, value: string) => {
    setFiles((prev) =>
      prev.map((file) =>
        file.id === metaFileId ? { ...file, metadata: { ...file.metadata, [field]: value } } : file,
      ),
    );
  };

  const startConvert = () => {
    if (!readyCount || converting) return;
    const targets = files.filter((file) => file.status === "ready");
    setConverting(true);
    setConvertDone(false);
    setFiles((prev) =>
      prev.map((file) => (targets.some((target) => target.id === file.id) ? { ...file, status: "converting", progress: 0, error: undefined } : file)),
    );

    void dispatchBackend("conversion.start", {
      files: targets.map((file) => ({
        id: file.id,
        path: file.path,
        name: file.name,
        duration: file.dur,
        metadata: file.metadata,
      })),
      format,
      bitrate,
      dest,
      customPath,
      subfolder,
      template,
      preserveMeta,
    }).catch((error) => {
      setConverting(false);
      setFiles((prev) =>
        prev.map((file) =>
          targets.some((target) => target.id === file.id)
            ? { ...file, status: "error", progress: 0, error: error instanceof Error ? error.message : "Backend unavailable" }
            : file,
        ),
      );
    });
  };

  const cancelConvert = () => {
    void dispatchBackend("conversion.cancel").catch(() => undefined);
    setConverting(false);
    setFiles((prev) => prev.map((file) => (file.status === "converting" ? { ...file, status: "ready", progress: 0 } : file)));
  };

  return (
    <div className={`converter-bg ${dark ? "dark-mode" : "light-mode"}`}>
      <section className="converter-window">
        <AppWindowChrome
          appName="RelyyConvert"
          subtitle={backendStatus}
          darkMode={dark}
          currentTimeLabel={currentTimeLabel}
          currentDateLabel={currentDateLabel}
          statusLabel={converting ? "Converting" : files.length > 0 ? "Ready" : "Idle"}
          onToggleDarkMode={() => setDark((value) => !value)}
        />

        <div className="converter-body">
          <ConverterSidebar
            files={files}
            format={format}
            bitrate={bitrate}
            bitrateIdx={bitrateIdx}
            bitratePct={bitratePct}
            dest={dest}
            customPath={customPath}
            subfolder={subfolder}
            template={template}
            preserveMeta={preserveMeta}
            previewName={previewName}
            onFormatChange={setFormat}
            onBitrateChange={setBitrate}
            onDestChange={setDest}
            onCustomPathChange={setCustomPath}
            onSubfolderChange={setSubfolder}
            onTemplateChange={setTemplate}
            onAppendTemplateTag={(tag) => setTemplate((prev) => prev + tag)}
            onTogglePreserveMeta={() => setPreserveMeta((value) => !value)}
          />

          <main className="converter-main">
            {files.length === 0 ? (
              <EmptyDropzone
                dragOver={dragOver}
                onDragOver={onDropzoneDragOver}
                onDragLeave={onDropzoneDragLeave}
                onDrop={onDrop}
                onBrowseFiles={browseFiles}
                onLoadDemo={addDemoFiles}
              />
            ) : (
              <FileTableArea
                files={files}
                selected={selected}
                format={format}
                totalSize={totalSize}
                previewName={previewName}
                fmtSize={fmtSize}
                fmtDur={fmtDur}
                onDrop={onDrop}
                onToggleAll={toggleAll}
                onToggleSelect={toggleSelect}
                onAddFiles={browseFiles}
                onClearAll={clearAll}
                onRemoveFile={removeFile}
                onToggleMetadataPanel={(id) => setMetaFileId(id === metaFileId ? null : id)}
              />
            )}

            {files.length > 0 ? (
              <ConversionFooter
                convertDone={convertDone}
                doneCount={doneCount}
                readyCount={readyCount}
                format={format}
                bitrate={bitrate}
                isLossless={LOSSLESS.has(format)}
                dest={dest}
                subfolder={subfolder}
                customPath={customPath}
                converting={converting}
                filesLength={files.length}
                onClear={clearAll}
                onCancel={cancelConvert}
                onStartConvert={startConvert}
              />
            ) : null}
          </main>

          {metaFile ? (
            <MetadataPanel
              metaFile={metaFile}
              preserveMeta={preserveMeta}
              onClose={() => setMetaFileId(null)}
              onUpdateMeta={updateMeta}
            />
          ) : null}
        </div>
      </section>

      <input
        id="audio-file-input"
        type="file"
        multiple
        accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.opus,.aiff,.wma"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
