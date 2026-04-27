import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "extensions", "relyyconvert-backend", "vendor", "ffmpeg", "win_x64");
const target = resolve(root, "build", "bin", "extensions", "relyyconvert-backend", "vendor", "ffmpeg", "win_x64");

if (!existsSync(source)) {
  console.warn(`Skipping bundled ffmpeg copy; source folder not found: ${source}`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
