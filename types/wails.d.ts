import type { FileMetadata, Format, DestType } from "../src/components/converter/model";

type ProbeResult = {
  path: string;
  name: string;
  size: number;
  duration: number;
  format: string;
  codec: string;
  bitrate: number;
  metadata: FileMetadata;
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

type WailsUnsubscribe = () => void;

declare global {
  interface Window {
    go?: {
      main?: {
        App: {
          BrowseAudioFiles: () => Promise<string[]>;
          ChooseOutputFolder: (defaultPath: string) => Promise<string>;
          GetDownloadsPath: () => Promise<string>;
          ProbeFiles: (paths: string[]) => Promise<ProbeResult[]>;
          ConvertFiles: (request: ConvertRequest) => Promise<void>;
          CancelConversion: () => Promise<void>;
        };
      };
    };
    runtime?: {
      EventsOn?: <T = unknown>(eventName: string, callback: (data: T) => void) => WailsUnsubscribe;
      OnFileDrop?: (callback: (x: number, y: number, paths: string[]) => void, useDropTarget?: boolean) => void;
      OnFileDropOff?: () => void;
      WindowMinimise?: () => void;
      WindowToggleMaximise?: () => void;
      Quit?: () => void;
      [key: string]: unknown;
    };
  }
}

export {};
