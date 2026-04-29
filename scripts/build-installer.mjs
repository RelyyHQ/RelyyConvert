import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./load-local-env.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadLocalEnv(root);

if (process.platform !== "win32") {
  console.error("installer:build is a Windows release command and must run on Windows.");
  console.error(`Current host: ${process.platform}/${process.arch}.`);
  console.error("Use npm run app:build on macOS to build the local .app.");
  console.error("To build the Windows installer, run this on Windows after building RelyyConvert.exe.");
  process.exit(1);
}

const appExe = resolve(root, "build", "bin", "RelyyConvert.exe");
const ffmpegExe = resolve(root, "build", "bin", "third_party", "ffmpeg", "win_x64", "ffmpeg.exe");
const ffprobeExe = resolve(root, "build", "bin", "third_party", "ffmpeg", "win_x64", "ffprobe.exe");
const script = resolve(root, "installer", "windows", "RelyyConvert.iss");
const outDir = resolve(root, "dist", "installer");

const iscc =
  process.env.ISCC_PATH ||
  [
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Programs\\Inno Setup 6\\ISCC.exe` : "",
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
  ].find(existsSync) ||
  "ISCC.exe";

for (const file of [appExe, ffmpegExe, ffprobeExe, script]) {
  if (!existsSync(file)) {
    console.error(`Missing required installer input: ${file}`);
    console.error("Run npm run app:build first and confirm bundled FFmpeg files exist.");
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });

const result = spawnSync(iscc, [script], {
  cwd: root,
  env: { ...process.env, APP_VERSION: process.env.APP_VERSION || "0.1.0" },
  stdio: "inherit",
});

if (result.error) {
  console.error(`Could not run Inno Setup compiler: ${result.error.message}`);
  console.error("Install Inno Setup 6 or set ISCC_PATH.");
  process.exit(1);
}

process.exit(result.status ?? 1);
