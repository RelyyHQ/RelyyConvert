import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { BadgeQuestionMark, CircleQuestionMark, Maximize2, MinusIcon, Moon, Sun, X } from "lucide-react";
import { app as nlApp, init as nlInit, os as nlOs, window as nlWindow } from "@neutralinojs/lib";

type DetectedPlatform = "windows" | "macos" | "linux" | "unknown";

type AppWindowChromeProps = {
  appName: string;
  subtitle: string;
  darkMode: boolean;
  currentTimeLabel: string;
  currentDateLabel: string;
  statusLabel: string;
  onToggleDarkMode: () => void;
};

let nlInitStarted = false;
const nlReadyCallbacks: Array<() => void> = [];

function detectPlatform(): DetectedPlatform {
  const w = window as Window & { NL_OS?: unknown };
  if (typeof w.NL_OS === "string") {
    const source = w.NL_OS.toLowerCase();
    if (source.includes("windows")) return "windows";
    if (source.includes("darwin") || source.includes("mac")) return "macos";
    if (source.includes("linux")) return "linux";
  }

  const source = [navigator.platform, navigator.userAgent, navigator.appVersion].join(" ").toLowerCase();
  if (source.includes("win")) return "windows";
  if (source.includes("mac")) return "macos";
  if (source.includes("linux")) return "linux";
  return "unknown";
}

function hasNeutralinoGlobals() {
  const w = window as Window & { NL_PORT?: unknown; NL_TOKEN?: unknown };
  return (typeof w.NL_PORT === "number" || typeof w.NL_PORT === "string")
    && typeof w.NL_TOKEN === "string"
    && w.NL_TOKEN.length > 0;
}

function ensureNlReady(onReady: () => void) {
  const w = window as Window & { __nlReady?: boolean };
  if (w.__nlReady) {
    onReady();
    return;
  }

  nlReadyCallbacks.push(onReady);
  if (nlInitStarted) return;

  nlInitStarted = true;
  window.addEventListener("ready", function handleReady() {
    window.removeEventListener("ready", handleReady);
    w.__nlReady = true;
    const callbacks = nlReadyCallbacks.splice(0);
    for (const callback of callbacks) callback();
  });
  nlInit();
}

export default function AppWindowChrome({
  appName,
  subtitle,
  darkMode,
  currentTimeLabel,
  currentDateLabel,
  onToggleDarkMode,
}: Readonly<AppWindowChromeProps>) {
  const [neutralinoReady, setNeutralinoReady] = useState(false);
  const [platform] = useState<DetectedPlatform>(() => detectPlatform());
  const [showHelp, setShowHelp] = useState(false);
  const dragRegionRegisteredRef = useRef(false);
  const dragFallbackEnabledRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer = 0;

    function connectNeutralino() {
      if (!hasNeutralinoGlobals()) return;
      window.clearInterval(timer);
      ensureNlReady(() => {
        if (active) setNeutralinoReady(true);
      });
    }

    timer = window.setInterval(connectNeutralino, 250);
    connectNeutralino();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!neutralinoReady) return;

    async function setupWindowChrome() {
      if (platform === "macos") {
        try {
          await nlWindow.setBorderless(false);
        } catch (error) {
          console.warn("[AppWindowChrome] setBorderless(false) failed.", error);
        }
      }

      const exclude: Array<string | HTMLElement> = [];
      for (const id of ["window-controls", "theme-toggle", "help-button"]) {
        const element = document.getElementById(id);
        if (element) exclude.push(element);
      }

      for (const element of document.querySelectorAll<HTMLElement>("[data-no-drag='true']")) {
        if (!exclude.includes(element)) exclude.push(element);
      }

      try {
        await nlWindow.setDraggableRegion("app-window-chrome", { exclude });
        dragRegionRegisteredRef.current = true;
        dragFallbackEnabledRef.current = false;
      } catch (error) {
        dragRegionRegisteredRef.current = false;
        dragFallbackEnabledRef.current = platform === "windows" || platform === "unknown";
        console.warn("[AppWindowChrome] setDraggableRegion failed.", error);
      }

      try {
        await nlWindow.focus();
      } catch (error) {
        console.warn("[AppWindowChrome] focus failed.", error);
      }
    }

    void setupWindowChrome();
    return () => {
      if (!dragRegionRegisteredRef.current) return;
      void nlWindow.unsetDraggableRegion("app-window-chrome").catch((error: unknown) => {
        console.warn("[AppWindowChrome] unsetDraggableRegion failed.", error);
      });
    };
  }, [neutralinoReady, platform]);

  const onMinimize = useCallback(async () => {
    if (!neutralinoReady) return;
    try {
      await nlWindow.minimize();
    } catch (error) {
      console.error("[AppWindowChrome] minimize failed.", error);
    }
  }, [neutralinoReady]);

  const onMaximize = useCallback(async () => {
    if (!neutralinoReady) {
      console.warn("[AppWindowChrome] maximize ignored; Neutralino not ready.");
      return;
    }

    try {
      console.info("[AppWindowChrome] maximize requested.");
      await nlWindow.maximize();
    } catch (error) {
      console.error("[AppWindowChrome] maximize failed.", error);
    }
  }, [neutralinoReady]);

  const onClose = useCallback(async () => {
    if (neutralinoReady) {
      try {
        console.info("[AppWindowChrome] close requested; exiting app.");
        await nlApp.exit();
        return;
      } catch (error) {
        console.error("[AppWindowChrome] app exit failed.", error);
      }
    }
    window.close();
  }, [neutralinoReady]);

  const onHeaderMouseDown = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      if (!neutralinoReady || !dragFallbackEnabledRef.current || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-drag='true']")) return;
      try {
        await nlWindow.beginDrag();
      } catch (error) {
        console.error("[AppWindowChrome] beginDrag failed.", error);
      }
    },
    [neutralinoReady],
  );

  const openLink = useCallback(
    async (link: string) => {
      try {
        const url = new URL(link);
        if (!["http:", "https:"].includes(url.protocol)) return;
        if (neutralinoReady) {
          await nlOs.open(url.href);
          return;
        }
        window.open(url.href, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.warn("[AppWindowChrome] open link failed.", error);
      }
    },
    [neutralinoReady],
  );

  return (
    <header
      id="app-window-chrome"
      onMouseDown={(event) => void onHeaderMouseDown(event)}
      className="relative flex items-center gap-2 border-b border-[hsl(var(--theme-border))] px-2.5 py-2 select-none [-webkit-app-region:drag]"
    >
      <div
        data-no-drag="true"
        aria-hidden={!showHelp}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        className={`absolute right-2 top-full z-30 mt-1 w-48 rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] p-2 text-sm text-[hsl(var(--theme-muted))] shadow-lg [-webkit-app-region:no-drag] ${showHelp ? "block" : "hidden"}`}
      >
        <p className="mb-2 flex items-center gap-1">
          <BadgeQuestionMark className="h-4 w-4" />
          Need help?
        </p>
        <button
          type="button"
          data-no-drag="true"
          onClick={() => void openLink("https://docs.relyy.app")}
          className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-white/70 dark:hover:bg-white/5"
        >
          Documentation
        </button>
        <button
          type="button"
          data-no-drag="true"
          onClick={() => void openLink("https://support.relyy.app")}
          className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-white/70 dark:hover:bg-white/5"
        >
          Support
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <img
          src="/favicon.ico"
          alt="App icon"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))]"
        />
        <div className="min-w-0">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-[hsl(var(--theme-muted))]">
            {subtitle}
          </p>
          <h1 className="truncate text-xs font-semibold leading-4">{appName}</h1>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 [-webkit-app-region:no-drag]">
        <span className="rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--theme-muted))]">
          {currentTimeLabel}
        </span>
        <span className="rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--theme-muted))]">
          {currentDateLabel}
        </span>
        <button
          id="help-button"
          data-no-drag="true"
          type="button"
          onClick={() => setShowHelp((value) => !value)}
          title="Help / Documentation"
          className="inline-flex h-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2.5 transition-colors hover:bg-white/70 dark:hover:bg-white/5"
        >
          <CircleQuestionMark className="h-3.5 w-3.5" />
        </button>
        <button
          id="theme-toggle"
          data-no-drag="true"
          type="button"
          onClick={onToggleDarkMode}
          title="Toggle light and dark mode"
          className="inline-flex h-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2.5 transition-colors hover:bg-white/70 dark:hover:bg-white/5"
        >
          {darkMode ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        </button>
        {platform === "windows" ? (
          <div id="window-controls" data-no-drag="true" className="flex items-center gap-1">
            <button
              type="button"
              data-no-drag="true"
              onClick={() => void onMinimize()}
              title="Minimize"
              disabled={!neutralinoReady}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] transition-colors hover:bg-white/70 disabled:opacity-50 dark:hover:bg-white/5"
            >
              <MinusIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-no-drag="true"
              onClick={() => void onMaximize()}
              title="Maximize"
              disabled={!neutralinoReady}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] transition-colors hover:bg-white/70 disabled:opacity-50 dark:hover:bg-white/5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-no-drag="true"
              onClick={() => void onClose()}
              title="Close"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] transition-colors hover:bg-white/70 dark:hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
