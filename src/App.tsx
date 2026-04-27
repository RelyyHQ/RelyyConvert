import type { DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { events as nlEvents, extensions as nlExtensions, filesystem as nlFilesystem, init as nlInit, os as nlOs } from "@neutralinojs/lib";
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

type FFprobeOutput = {
  streams?: Array<{ codec_name?: string; codec_type?: string }>;
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
};

const emptyMetadata = (): FileMetadata => ({ title: "", artist: "", album: "", year: "", genre: "", track: "", comment: "" });

const fmtSize = (bytes: number) =>
  bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)}MB` : bytes > 1_000 ? `${Math.round(bytes / 1_000)}KB` : `${bytes}B`;

const fmtDur = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const getFilePath = (file: FileWithPath) => file.path || file.fullPath || file.webkitRelativePath || file.name;

const hasNeutralinoGlobals = () => {
  const w = window as Window & { NL_PORT?: unknown; NL_TOKEN?: unknown };
  return (typeof w.NL_PORT === "number" || typeof w.NL_PORT === "string") && typeof w.NL_TOKEN === "string" && w.NL_TOKEN.length > 0;
};
const isWindowsAbsolutePath = (path: string) => /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
const isAbsolutePath = (path: string) => path.startsWith("/") || isWindowsAbsolutePath(path);
const audioFilters = [{ name: "Audio", extensions: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "aiff", "wma"] }];
const probeTimeoutMs = 20_000;

let nativeReadyPromise: Promise<boolean> | null = null;

function ensureNativeReady() {
  if (!hasNeutralinoGlobals()) return Promise.resolve(false);
  if (window.__nlReady) return Promise.resolve(true);
  nativeReadyPromise ??= new Promise<boolean>((resolve) => {
    window.addEventListener("ready", () => {
      window.__nlReady = true;
      resolve(true);
    }, { once: true });
    nlInit();
  });
  return nativeReadyPromise;
}

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
  if (!await ensureNativeReady()) {
    throw new Error("Neutralino native runtime is not available.");
  }
  return nlExtensions.dispatch(BACKEND_ID, event, data);
}

async function getExtensionProblem() {
  if (!await ensureNativeReady()) return "Neutralino native runtime is not available.";
  const stats = await nlExtensions.getStats();
  if (!stats.loaded.includes(BACKEND_ID)) return "Go backend extension is not loaded.";
  if (!stats.connected.includes(BACKEND_ID)) return "Go backend extension is not connected.";
  return null;
}

function quoteCommandArg(value: string) {
  let result = "\"";
  let backslashes = 0;
  for (const char of value) {
    if (char === "\\") {
      backslashes += 1;
      continue;
    }
    if (char === "\"") {
      result += "\\".repeat(backslashes * 2 + 1);
      result += "\"";
      backslashes = 0;
      continue;
    }
    result += "\\".repeat(backslashes);
    backslashes = 0;
    result += char;
  }
  result += "\\".repeat(backslashes * 2);
  result += "\"";
  return result;
}

function commandFromArgs(args: string[]) {
  return args.map(quoteCommandArg).join(" ");
}

function pathDir(path: string) {
  const normalized = path.replaceAll("/", "\\");
  const index = normalized.lastIndexOf("\\");
  return index >= 0 ? normalized.slice(0, index) : ".";
}

function trimExt(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

function sanitizePathPart(value: string) {
  return value.trim().replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "") || "converted";
}

function expandOutputName(file: AudioFile, outputFormat: Format, outputBitrate: number, outputTemplate: string) {
  const value = (outputTemplate || "{name}")
    .replaceAll("{name}", trimExt(file.name))
    .replaceAll("{format}", outputFormat.toLowerCase())
    .replaceAll("{bitrate}", String(outputBitrate))
    .replaceAll("{artist}", file.metadata.artist || "unknown")
    .replaceAll("{album}", file.metadata.album || "unknown")
    .replaceAll("{track}", file.metadata.track || "00")
    .replaceAll("{year}", file.metadata.year || "");
  return sanitizePathPart(value);
}

async function pathExists(path: string) {
  return Boolean(await nlFilesystem.getStats(path).catch(() => undefined));
}

async function uniqueOutputPath(path: string) {
  if (!await pathExists(path)) return path;
  const index = path.lastIndexOf(".");
  const base = index > 0 ? path.slice(0, index) : path;
  const ext = index > 0 ? path.slice(index) : "";
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = `${base} (${i})${ext}`;
    if (!await pathExists(candidate)) return candidate;
  }
  throw new Error("Could not find an available output filename.");
}

async function resolveOutputPath(file: AudioFile, outputFormat: Format, outputBitrate: number, outputDest: DestType, outputCustomPath: string, outputSubfolder: string, outputTemplate: string) {
  let outputDir = pathDir(file.path);
  if (outputDest === "subfolder") {
    outputDir = `${outputDir}\\${sanitizePathPart(outputSubfolder || "converted")}`;
    await nlFilesystem.createDirectory(outputDir).catch(() => undefined);
  }
  if (outputDest === "custom") {
    if (!outputCustomPath.trim()) throw new Error("Choose a custom output folder first.");
    outputDir = outputCustomPath;
  }
  const outputName = `${expandOutputName(file, outputFormat, outputBitrate, outputTemplate)}.${EXT_MAP[outputFormat]}`;
  return uniqueOutputPath(`${outputDir}\\${outputName}`);
}

function ffmpegCodecArgs(outputFormat: Format, outputBitrate: number) {
  switch (outputFormat) {
    case "MP3": return ["-codec:a", "libmp3lame", "-b:a", `${outputBitrate}k`];
    case "AAC": return ["-codec:a", "aac", "-b:a", `${outputBitrate}k`];
    case "FLAC": return ["-codec:a", "flac"];
    case "WAV": return ["-codec:a", "pcm_s16le"];
    case "OGG": return ["-codec:a", "libvorbis", "-b:a", `${outputBitrate}k`];
    case "OPUS": return ["-codec:a", "libopus", "-b:a", `${outputBitrate}k`];
    case "AIFF": return ["-codec:a", "pcm_s16be"];
    case "WMA": return ["-codec:a", "wmav2", "-b:a", `${outputBitrate}k`];
  }
}

function metadataArgs(meta: FileMetadata) {
  const entries: Array<[string, string]> = [
    ["title", meta.title],
    ["artist", meta.artist],
    ["album", meta.album],
    ["date", meta.year],
    ["genre", meta.genre],
    ["track", meta.track],
    ["comment", meta.comment],
  ];
  return entries.flatMap(([key, value]) => value.trim() ? ["-metadata", `${key}=${value}`] : []);
}

async function convertWithNativeFFmpeg(file: AudioFile, outputPath: string, outputFormat: Format, outputBitrate: number, shouldPreserveMeta: boolean) {
  const ffmpegPath = `${window.NL_PATH}/extensions/relyyconvert-backend/vendor/ffmpeg/win_x64/ffmpeg.exe`;
  const args = [
    ffmpegPath,
    "-y",
    "-hide_banner",
    "-i",
    file.path,
    ...(shouldPreserveMeta ? ["-map_metadata", "0"] : []),
    ...metadataArgs(file.metadata),
    ...ffmpegCodecArgs(outputFormat, outputBitrate),
    outputPath,
  ];
  const result = await nlOs.execCommand(commandFromArgs(args));
  if (result.exitCode !== 0) {
    throw new Error(`ffmpeg failed: ${result.stdErr || result.stdOut || `exit code ${result.exitCode}`}`);
  }
}

function metadataFromTags(tags?: Record<string, string>): FileMetadata {
  const find = (...keys: string[]) => {
    if (!tags) return "";
    const match = Object.entries(tags).find(([key]) => keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase()));
    return match?.[1] ?? "";
  };
  return {
    title: find("title"),
    artist: find("artist", "album_artist"),
    album: find("album"),
    year: find("date", "year"),
    genre: find("genre"),
    track: find("track", "tracknumber"),
    comment: find("comment", "description"),
  };
}

async function probeWithNativeFFprobe(file: AudioFile): Promise<ProbeResult> {
  const ffprobePath = `${window.NL_PATH}/extensions/relyyconvert-backend/vendor/ffmpeg/win_x64/ffprobe.exe`;
  const command = [
    ffprobePath,
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    file.path,
  ];
  const result = await nlOs.execCommand(commandFromArgs(command));
  if (result.exitCode !== 0) {
    return { id: file.id, name: file.name, path: file.path, error: `ffprobe failed: ${result.stdErr || result.stdOut || `exit code ${result.exitCode}`}` };
  }
  const probe = JSON.parse(result.stdOut) as FFprobeOutput;
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  return {
    id: file.id,
    name: file.name,
    path: file.path,
    size: file.size,
    duration: Number.parseFloat(probe.format?.duration ?? "0") || 0,
    format: (probe.format?.format_name?.split(",")[0] ?? file.srcFmt).toUpperCase(),
    codec: (audioStream?.codec_name ?? file.srcFmt).toUpperCase(),
    bitrate: Number.parseInt(probe.format?.bit_rate ?? "0", 10) || 0,
    metadata: metadataFromTags(probe.format?.tags),
  };
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
  const [backendStatus, setBackendStatus] = useState(() => (hasNeutralinoGlobals() ? "Starting" : "Browser preview"));
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const probeTimersRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const probeTimers = probeTimersRef.current;
    return () => {
      for (const timer of probeTimers.values()) {
        window.clearTimeout(timer);
      }
      probeTimers.clear();
    };
  }, []);

  useEffect(() => {
    if (!hasNeutralinoGlobals()) {
      return;
    }

    let active = true;
    const listen = async () => {
      const ready = await ensureNativeReady();
      if (!ready || !active) return;

      void nlExtensions.getStats().then((stats) => {
        if (!active) return;
        if (!stats.loaded.includes(BACKEND_ID)) {
          setBackendStatus("Backend extension not loaded");
          return;
        }
        if (!stats.connected.includes(BACKEND_ID)) {
          setBackendStatus("Backend extension not connected");
        }
      }).catch(() => {
        if (active) setBackendStatus("Backend status unavailable");
      });

      await nlEvents.on("backend.ready", (event) => {
        const health = detailData<BackendHealth>(event);
        if (!active || !health) return;
        setBackendStatus(health.ok ? "Backend ready" : health.error || "FFmpeg missing");
      });

      await nlEvents.on("media.probed", (event) => {
        const result = detailData<ProbeResult>(event);
        if (!active || !result) return;
        const timer = probeTimersRef.current.get(result.id);
        if (timer) {
          window.clearTimeout(timer);
          probeTimersRef.current.delete(result.id);
        }
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

      await nlEvents.on("conversion.progress", (event) => {
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

      await nlEvents.on("conversion.completed", (event) => {
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

      await nlEvents.on("conversion.failed", (event) => {
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

      await nlEvents.on("conversion.cancelled", (event) => {
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

  const failProbe = useCallback((id: number, error: string) => {
    const timer = probeTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      probeTimersRef.current.delete(id);
    }
    setFiles((prev) =>
      prev.map((file) => (file.id === id && file.status === "probing" ? { ...file, status: "error", error } : file)),
    );
  }, []);

  useEffect(() => {
    if (!hasNeutralinoGlobals()) return;
    void ensureNativeReady().then((ready) => {
      if (!ready) return undefined;
      return nlOs.getPath("downloads");
    }).then((downloadsPath) => {
      if (!downloadsPath) return;
      setCustomPath((current) => current || `${downloadsPath}\\converted`);
    }).catch(() => undefined);
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
    const filesWithPaths = nextFiles.filter((file) => isAbsolutePath(file.path));
    const filesWithoutPaths = nextFiles.filter((file) => !isAbsolutePath(file.path));
    if (filesWithoutPaths.length) {
      setFiles((prev) =>
        prev.map((file) =>
          filesWithoutPaths.some((nextFile) => nextFile.id === file.id)
            ? {
                ...file,
                status: "error",
                error: "This upload method did not provide a real filesystem path. Use Browse Files in the desktop app.",
              }
            : file,
        ),
      );
    }
    if (!filesWithPaths.length) return;

    if (!hasNeutralinoGlobals()) {
      setFiles((prev) =>
        prev.map((file) =>
          filesWithPaths.some((nextFile) => nextFile.id === file.id)
            ? { ...file, status: "error", error: "Run with Neutralino to use the Go conversion backend." }
            : file,
        ),
      );
      return;
    }
    filesWithPaths.forEach((file) => {
      const existingTimer = probeTimersRef.current.get(file.id);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timer = window.setTimeout(() => {
        probeTimersRef.current.delete(file.id);
        setFiles((prev) =>
          prev.map((item) =>
            item.id === file.id && item.status === "probing"
              ? {
                  ...item,
                  status: "error",
                  error: "Probe timed out. The backend did not return media info within 20 seconds. Check that the Go backend is running and ffprobe can read this file.",
                }
              : item,
          ),
        );
      }, probeTimeoutMs);
      probeTimersRef.current.set(file.id, timer);

      void getExtensionProblem()
        .then((problem) => {
          if (!problem) return dispatchBackend("media.probe", { id: file.id, path: file.path, name: file.name });
          setBackendStatus(problem);
          return probeWithNativeFFprobe(file).then((result) => {
            const activeTimer = probeTimersRef.current.get(result.id);
            if (activeTimer) {
              window.clearTimeout(activeTimer);
              probeTimersRef.current.delete(result.id);
            }
            setFiles((prev) =>
              prev.map((item) =>
                item.id === result.id
                  ? {
                      ...item,
                      size: result.size ?? item.size,
                      dur: result.duration ?? item.dur,
                      srcFmt: result.codec || result.format || item.srcFmt,
                      status: result.error ? "error" : "ready",
                      error: result.error,
                      metadata: { ...item.metadata, ...result.metadata },
                    }
                  : item,
              ),
            );
          });
        })
        .catch((error) => {
          failProbe(file.id, error instanceof Error ? error.message : "Backend probe dispatch failed.");
        });
    });
  }, [failProbe]);

  const addBrowserFiles = useCallback((fileList: FileList | File[]) => {
    const nextFiles = Array.from(fileList).map((file) => browserFileToAudio(file as FileWithPath));
    const filesWithPaths = nextFiles.filter((file) => isAbsolutePath(file.path));
    if (!filesWithPaths.length) {
      setFileNotice("This file source did not expose real filesystem paths. Use Browse Files so RelyyConvert can probe and convert the songs.");
      return;
    }
    setFileNotice(null);
    setFiles((prev) => [...prev, ...filesWithPaths]);
    setConvertDone(false);
    probeFiles(filesWithPaths);
  }, [probeFiles]);

  const addPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = paths.filter((path, index) => isAbsolutePath(path) && paths.indexOf(path) === index);
    if (!uniquePaths.length) return;
    const nextFiles = await Promise.all(uniquePaths.map(async (path) => {
      const stats = await nlFilesystem.getStats(path).catch(() => undefined);
      const nextFile = pathToAudio(path, stats?.size ?? 0);
      if (!stats) return { ...nextFile, status: "error" as const, error: "Could not read this file from disk." };
      if (!stats.isFile) return { ...nextFile, status: "error" as const, error: "Selected path is not a file." };
      return nextFile;
    }));
    if (!nextFiles.length) return;
    setFileNotice(null);
    setFiles((prev) => [...prev, ...nextFiles]);
    setConvertDone(false);
    probeFiles(nextFiles.filter((file) => file.status === "probing"));
  }, [probeFiles]);

  const browseFiles = useCallback(() => {
    void ensureNativeReady().then((ready) => {
      if (!ready) {
        setFileNotice("The desktop file picker is unavailable. Start the app with npm run neutralino:run.");
        return undefined;
      }
      return nlOs.showOpenDialog("Select audio files", {
        multiSelections: true,
        filters: audioFilters,
      });
    }).then((paths) => {
      if (paths) return addPaths(paths);
      return undefined;
    }).catch((error) => {
      setFileNotice(error instanceof Error ? error.message : "Could not open the file picker.");
    });
  }, [addPaths]);

  const chooseCustomPath = useCallback(() => {
    void ensureNativeReady().then((ready) => {
      if (!ready) {
        setFileNotice("The desktop folder picker is unavailable. Start the app with npm run neutralino:run.");
        return undefined;
      }
      return nlOs.showFolderDialog("Choose output folder", { defaultPath: customPath });
    })
      .then((path) => {
        if (path) {
          setCustomPath(path);
          setDest("custom");
          setFileNotice(null);
        }
      })
      .catch((error) => setFileNotice(error instanceof Error ? error.message : "Could not open the folder picker."));
  }, [customPath]);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    addBrowserFiles(event.dataTransfer.files);
  }, [addBrowserFiles]);

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

    void (async () => {
      for (const [index, file] of targets.entries()) {
        const outputPath = await resolveOutputPath(file, format, bitrate, dest, customPath, subfolder, template);
        setFiles((prev) =>
          prev.map((item) => (item.id === file.id ? { ...item, status: "converting", progress: Math.max(5, Math.round((index / targets.length) * 100)), outputPath } : item)),
        );
        await convertWithNativeFFmpeg(file, outputPath, format, bitrate, preserveMeta);
        setFiles((prev) =>
          prev.map((item) => (item.id === file.id ? { ...item, status: "done", progress: 100, outputPath } : item)),
        );
      }
      setConverting(false);
      setConvertDone(true);
    })().catch((error) => {
      const message = error instanceof Error ? error.message : "Conversion failed.";
      setConverting(false);
      setConvertDone(false);
      setFiles((prev) =>
        prev.map((file) =>
          file.status === "converting"
            ? { ...file, status: "error", progress: 0, error: message }
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
            onChooseCustomPath={chooseCustomPath}
            onSubfolderChange={setSubfolder}
            onTemplateChange={setTemplate}
            onAppendTemplateTag={(tag) => setTemplate((prev) => prev + tag)}
            onTogglePreserveMeta={() => setPreserveMeta((value) => !value)}
          />

          <main className="converter-main">
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
