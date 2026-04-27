import type { CSSProperties, DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import AppWindowChrome from "./components/AppWindowChrome";
import ConversionFooter from "./components/converter/ConversionFooter";
import ConverterSidebar from "./components/converter/ConverterSidebar";
import EmptyDropzone from "./components/converter/EmptyDropzone";
import FileTableArea from "./components/converter/FileTableArea";
import MetadataPanel from "./components/converter/MetadataPanel";
import { BITRATES, EXT_MAP, LOSSLESS } from "./components/converter/model";
import type { AudioFile, DestType, FileMetadata, Format } from "./components/converter/model";

let fileCounter = 0;

type ProbeResult = {
  path: string;
  name: string;
  size: number;
  duration: number;
  format: string;
  codec: string;
  bitrate: number;
  error?: string;
  metadata: FileMetadata;
};

type ConversionEvent = {
  id?: number;
  progress?: number;
  outputPath?: string;
  error?: string;
};

type ConvertRequest = {
  files: Array<{
    id: number;
    path: string;
    name: string;
    duration: number;
    metadata: FileMetadata;
  }>;
  format: Format;
  bitrate: number;
  dest: DestType;
  customPath: string;
  subfolder: string;
  template: string;
  preserveMeta: boolean;
};

type WailsApp = NonNullable<NonNullable<Window["go"]>["main"]>["App"];

const emptyMetadata = (): FileMetadata => ({ title: "", artist: "", album: "", year: "", genre: "", track: "", comment: "" });

const fmtSize = (bytes: number) =>
  bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)}MB` : bytes > 1_000 ? `${Math.round(bytes / 1_000)}KB` : `${bytes}B`;

const fmtDur = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const pathName = (path: string) => path.replaceAll("\\", "/").split("/").pop() || path;

function resultToAudioFile(result: ProbeResult): AudioFile {
  const name = result.name || pathName(result.path);
  const metadata = { ...emptyMetadata(), ...result.metadata };
  if (!metadata.title) metadata.title = name.replace(/\.[^.]+$/, "");
  return {
    id: ++fileCounter,
    name,
    path: result.path,
    size: result.size || 0,
    srcFmt: result.codec || result.format || (name.split(".").pop() || "audio").toUpperCase(),
    dur: result.duration || 0,
    status: result.error ? "error" : "ready",
    progress: 0,
    error: result.error,
    metadata,
  };
}

async function callApp<K extends keyof WailsApp>(
  method: K,
  ...args: Parameters<WailsApp[K]>
): Promise<Awaited<ReturnType<WailsApp[K]>>> {
  const app = window.go?.main?.App as WailsApp | undefined;
  if (!app) throw new Error("Wails runtime is not available. Start the app with npm run wails:dev.");
  const callable = app[method] as (...args: Parameters<WailsApp[K]>) => ReturnType<WailsApp[K]>;
  return callable(...args) as Promise<Awaited<ReturnType<WailsApp[K]>>>;
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [format, setFormat] = useState<Format>("MP3");
  const [bitrate, setBitrate] = useState(192);
  const [dest, setDest] = useState<DestType>("same");
  const [customPath, setCustomPath] = useState("");
  const [subfolder, setSubfolder] = useState("converted");
  const [template, setTemplate] = useState("{name}");
  const [preserveMeta, setPreserveMeta] = useState(true);
  const [metaFileId, setMetaFileId] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertDone, setConvertDone] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [runtimeStatus, setRuntimeStatus] = useState(() => (window.go?.main?.App ? "Backend ready" : "Browser preview"));
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const importedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void callApp("GetDownloadsPath").then((downloadsPath) => {
      if (downloadsPath) setCustomPath((current) => current || `${downloadsPath}\\converted`);
    }).catch(() => undefined);
  }, []);

  const addPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = paths.filter((path, index) => {
      const normalized = path.trim();
      if (!normalized || paths.indexOf(path) !== index || importedPathsRef.current.has(normalized)) return false;
      importedPathsRef.current.add(normalized);
      return true;
    });
    if (!uniquePaths.length) return;
    setFileNotice(null);
    setRuntimeStatus("Probing");
    try {
      const results = await callApp("ProbeFiles", uniquePaths);
      setFiles((prev) => [...prev, ...results.map(resultToAudioFile)]);
      setConvertDone(false);
      setRuntimeStatus("Backend ready");
    } catch (error) {
      uniquePaths.forEach((path) => importedPathsRef.current.delete(path));
      setRuntimeStatus("Probe failed");
      setFileNotice(error instanceof Error ? error.message : "Could not probe selected files.");
    }
  }, []);

  useEffect(() => {
    window.runtime?.OnFileDrop?.((_x: number, _y: number, paths: string[]) => {
      void addPaths(paths);
    }, true);

    const offDrop = window.runtime?.EventsOn?.("files:dropped", (paths: string[]) => {
      void addPaths(paths);
    });
    const offProgress = window.runtime?.EventsOn?.("conversion:progress", (event: ConversionEvent) => {
      if (!event.id) return;
      setFiles((prev) =>
        prev.map((file) =>
          file.id === event.id ? { ...file, status: "converting", progress: event.progress ?? file.progress, outputPath: event.outputPath } : file,
        ),
      );
    });
    const offCompleted = window.runtime?.EventsOn?.("conversion:completed", (event: ConversionEvent) => {
      if (!event.id) return;
      setFiles((prev) =>
        prev.map((file) => (file.id === event.id ? { ...file, status: "done", progress: 100, outputPath: event.outputPath } : file)),
      );
    });
    const offFailed = window.runtime?.EventsOn?.("conversion:failed", (event: ConversionEvent) => {
      setConverting(false);
      setConvertDone(false);
      setFiles((prev) =>
        prev.map((file) =>
          !event.id || file.id === event.id ? { ...file, status: file.status === "converting" ? "error" : file.status, progress: 0, error: event.error || "Conversion failed" } : file,
        ),
      );
    });
    const offCancelled = window.runtime?.EventsOn?.("conversion:cancelled", (event: ConversionEvent) => {
      setConverting(false);
      setConvertDone(false);
      setFiles((prev) =>
        prev.map((file) =>
          !event.id || file.id === event.id ? { ...file, status: "ready", progress: 0, error: undefined } : file,
        ),
      );
    });

    return () => {
      offDrop?.();
      offProgress?.();
      offCompleted?.();
      offFailed?.();
      offCancelled?.();
      window.runtime?.OnFileDropOff?.();
    };
  }, [addPaths]);

  useEffect(() => {
    if (converting && files.length > 0 && files.every((file) => file.status === "done" || file.status === "error")) {
      window.queueMicrotask(() => {
        setConverting(false);
        setConvertDone(files.some((file) => file.status === "done"));
      });
    }
  }, [converting, files]);

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

  const browseFiles = useCallback(() => {
    void callApp("BrowseAudioFiles")
      .then(addPaths)
      .catch((error) => setFileNotice(error instanceof Error ? error.message : "Could not open the file picker."));
  }, [addPaths]);

  const chooseCustomPath = useCallback(() => {
    void callApp("ChooseOutputFolder", customPath)
      .then((path) => {
        if (!path) return;
        setCustomPath(path);
        setDest("custom");
        setFileNotice(null);
      })
      .catch((error) => setFileNotice(error instanceof Error ? error.message : "Could not open the folder picker."));
  }, [customPath]);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
  }, []);

  const onDropzoneDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const onDropzoneDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const addDemoFiles = () => {
    const demos = [
      resultToAudioFile({ path: "", name: "Summer Vibes.mp3", size: 4_821_000, duration: 241, format: "MP3", codec: "MP3", bitrate: 192000, metadata: { title: "Summer Vibes", artist: "DJ Coral", album: "Summer 2024", year: "2024", genre: "Electronic", track: "01", comment: "" }, error: "Demo files do not have real filesystem paths." }),
      resultToAudioFile({ path: "", name: "Intro Track.wav", size: 28_430_000, duration: 84, format: "WAV", codec: "WAV", bitrate: 0, metadata: { title: "Intro Track", artist: "Relyy Studio", album: "Intros", year: "2023", genre: "Ambient", track: "", comment: "Full quality master" }, error: "Demo files do not have real filesystem paths." }),
    ];
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
  const removeFile = (id: number) => setFiles((prev) => {
    const removed = prev.find((file) => file.id === id);
    if (removed?.path) importedPathsRef.current.delete(removed.path);
    return prev.filter((file) => file.id !== id);
  });
  const clearAll = () => {
    importedPathsRef.current.clear();
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
    const request: ConvertRequest = {
      files: targets.map((file) => ({ id: file.id, path: file.path, name: file.name, duration: file.dur, metadata: file.metadata })),
      format,
      bitrate,
      dest,
      customPath,
      subfolder,
      template,
      preserveMeta,
    };

    setConverting(true);
    setConvertDone(false);
    setFiles((prev) =>
      prev.map((file) => (targets.some((target) => target.id === file.id) ? { ...file, status: "converting", progress: 0, error: undefined } : file)),
    );

    void callApp("ConvertFiles", request).then(() => {
      setConverting(false);
      setConvertDone(true);
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "Conversion failed.";
      setConverting(false);
      setConvertDone(false);
      setFiles((prev) =>
        prev.map((file) => (file.status === "converting" ? { ...file, status: "error", progress: 0, error: message } : file)),
      );
    });
  };

  const cancelConvert = () => {
    void callApp("CancelConversion").catch(() => undefined);
    setConverting(false);
    setFiles((prev) => prev.map((file) => (file.status === "converting" ? { ...file, status: "ready", progress: 0 } : file)));
  };

  return (
    <div className={`converter-bg ${dark ? "dark-mode" : "light-mode"}`}>
      <section className="converter-window">
        <AppWindowChrome
          appName="RelyyConvert"
          subtitle={runtimeStatus}
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
            onChooseCustomPath={chooseCustomPath}
            onSubfolderChange={setSubfolder}
            onTemplateChange={setTemplate}
            onAppendTemplateTag={(tag) => setTemplate((prev) => prev + tag)}
            onTogglePreserveMeta={() => setPreserveMeta((value) => !value)}
          />

          <main className="converter-main" style={{ "--wails-drop-target": "drop" } as CSSProperties}>
            {fileNotice ? (
              <div className="file-notice" role="status">
                {fileNotice}
              </div>
            ) : null}
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
    </div>
  );
}
