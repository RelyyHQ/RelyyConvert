import { useCallback, useState } from "react";
import { BadgeQuestionMark, CircleQuestionMark, Maximize2, MinusIcon, Moon, Sun, X } from "lucide-react";

type AppWindowChromeProps = {
  appName: string;
  subtitle: string;
  darkMode: boolean;
  currentTimeLabel: string;
  currentDateLabel: string;
  statusLabel: string;
  onToggleDarkMode: () => void;
};

function callRuntime(method: string) {
  const fn = window.runtime?.[method];
  if (typeof fn === "function") fn();
}

export default function AppWindowChrome({
  appName,
  subtitle,
  darkMode,
  currentTimeLabel,
  currentDateLabel,
  onToggleDarkMode,
}: Readonly<AppWindowChromeProps>) {
  const [showHelp, setShowHelp] = useState(false);

  const openLink = useCallback((link: string) => {
    window.open(link, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <header
      data-wails-drag
      onDoubleClick={() => callRuntime("WindowToggleMaximise")}
      className="app-window-chrome relative flex items-center gap-2 border-b border-[hsl(var(--theme-border))] px-2.5 py-2 select-none"
    >
      <div
        data-wails-no-drag
        aria-hidden={!showHelp}
        onMouseDown={(event) => event.stopPropagation()}
        className={`absolute right-2 top-full z-30 mt-1 w-48 rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] p-2 text-sm text-[hsl(var(--theme-muted))] shadow-lg ${showHelp ? "block" : "hidden"}`}
      >
        <p className="mb-2 flex items-center gap-1">
          <BadgeQuestionMark className="h-4 w-4" />
          Need help?
        </p>
        <button type="button" onClick={() => openLink("https://docs.relyy.app")} className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-white/70 dark:hover:bg-white/5">
          Documentation
        </button>
        <button type="button" onClick={() => openLink("https://support.relyy.app")} className="block w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-white/70 dark:hover:bg-white/5">
          Support
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/favicon.ico" alt="App icon" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))]" />
        <div className="min-w-0">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.22em] text-[hsl(var(--theme-muted))]">{subtitle}</p>
          <h1 className="truncate text-xs font-semibold leading-4">{appName}</h1>
        </div>
      </div>

      <div data-wails-no-drag className="ml-auto flex items-center gap-1.5">
        <span className="rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--theme-muted))]">
          {currentTimeLabel}
        </span>
        <span className="rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--theme-muted))]">
          {currentDateLabel}
        </span>
        <button type="button" onClick={() => setShowHelp((value) => !value)} title="Help / Documentation" className="inline-flex h-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2.5 transition-colors hover:bg-white/70 dark:hover:bg-white/5">
          <CircleQuestionMark className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onToggleDarkMode} title="Toggle light and dark mode" className="inline-flex h-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] px-2.5 transition-colors hover:bg-white/70 dark:hover:bg-white/5">
          {darkMode ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        </button>
        <button type="button" onClick={() => callRuntime("WindowMinimise")} title="Minimize" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] transition-colors hover:bg-white/70 dark:hover:bg-white/5">
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => callRuntime("WindowToggleMaximise")} title="Maximize" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] transition-colors hover:bg-white/70 dark:hover:bg-white/5">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => callRuntime("Quit")} title="Close" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface-alt))] transition-colors hover:bg-white/70 dark:hover:bg-white/5">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
