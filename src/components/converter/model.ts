export type FileStatus = "ready" | "probing" | "converting" | "done" | "error";
export type DestType = "same" | "custom" | "subfolder";
export type Format = "MP3" | "AAC" | "FLAC" | "WAV" | "OGG" | "OPUS" | "AIFF" | "WMA";

export type FileMetadata = {
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  track: string;
  comment: string;
};

export type AudioFile = {
  id: number;
  name: string;
  path: string;
  size: number;
  srcFmt: string;
  dur: number;
  status: FileStatus;
  progress: number;
  outputPath?: string;
  error?: string;
  metadata: FileMetadata;
};

export const FORMATS: Format[] = ["MP3", "AAC", "FLAC", "WAV", "OGG", "OPUS", "AIFF", "WMA"];

export const BITRATES = [64, 96, 128, 160, 192, 256, 320];

export const LOSSLESS = new Set<Format>(["FLAC", "WAV", "AIFF"]);

export const EXT_MAP: Record<Format, string> = {
  MP3: "mp3",
  AAC: "m4a",
  FLAC: "flac",
  WAV: "wav",
  OGG: "ogg",
  OPUS: "opus",
  AIFF: "aiff",
  WMA: "wma",
};

export const DEST_OPTIONS: Array<{ id: DestType; label: string }> = [
  { id: "same", label: "Same as source" },
  { id: "subfolder", label: "Subfolder in source" },
  { id: "custom", label: "Choose folder..." },
];

export const TEMPLATE_TAGS = ["{name}", "{format}", "{bitrate}", "{artist}", "{album}", "{track}", "{year}"];

export const METADATA_FIELDS: Array<[keyof FileMetadata, string]> = [
  ["title", "Title"],
  ["artist", "Artist"],
  ["album", "Album"],
  ["year", "Year"],
  ["genre", "Genre"],
  ["track", "Track #"],
  ["comment", "Comment"],
];
