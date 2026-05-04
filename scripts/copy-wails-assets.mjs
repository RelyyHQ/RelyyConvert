import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "third_party", "ffmpeg");
const appBundle = resolve(root, "build", "bin", "RelyyConvert.app");
const targets = [
  resolve(root, "build", "bin", "third_party", "ffmpeg"),
  resolve(appBundle, "Contents", "MacOS", "third_party", "ffmpeg"),
].filter((target) => !target.includes(".app") || existsSync(appBundle));
const oldExtensionTarget = resolve(root, "build", "bin", "extensions");

if (!existsSync(source)) {
  console.warn(`Skipping bundled ffmpeg copy; source folder not found: ${source}`);
  process.exit(0);
}

rmSync(oldExtensionTarget, { recursive: true, force: true });

for (const target of targets) {
  mkdirSync(target, { recursive: true });
  copyIfExists("win_x64", target);
  copyIfExists("ffmpeg", target);
  copyIfExists("ffprobe", target);
}

if (process.platform === "darwin" && existsSync(appBundle)) {
  signDarwinPath(resolve(appBundle, "Contents", "MacOS", "third_party", "ffmpeg", "ffmpeg"));
  signDarwinPath(resolve(appBundle, "Contents", "MacOS", "third_party", "ffmpeg", "ffprobe"));
  signDarwinPath(appBundle, ["--deep"]);
}

function copyIfExists(name, targetRoot) {
  const sourcePath = resolve(source, name);
  const targetPath = resolve(targetRoot, name);
  if (!existsSync(sourcePath)) {
    return;
  }

  rmSync(targetPath, { recursive: true, force: true });
  cpSync(sourcePath, targetPath, { recursive: true });
}

function signDarwinPath(path, extraArgs = []) {
  if (!existsSync(path)) {
    return;
  }

  const result = spawnSync("codesign", ["--force", ...extraArgs, "--sign", "-", path], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
