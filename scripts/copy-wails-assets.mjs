import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "third_party", "ffmpeg", "win_x64");
const target = resolve(root, "build", "bin", "third_party", "ffmpeg", "win_x64");
const oldExtensionTarget = resolve(root, "build", "bin", "extensions");

if (!existsSync(source)) {
  console.warn(`Skipping bundled ffmpeg copy; source folder not found: ${source}`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
rmSync(target, { recursive: true, force: true });
rmSync(oldExtensionTarget, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
