import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(root, "extensions", "relyyconvert-backend");
const outDir = resolve(backendDir, "bin", "win_x64");

mkdirSync(outDir, { recursive: true });

const result = spawnSync("go", ["build", "-o", resolve(outDir, "relyyconvert-backend.exe"), "."], {
  cwd: backendDir,
  env: { ...process.env, GOOS: "windows", GOARCH: "amd64" },
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
