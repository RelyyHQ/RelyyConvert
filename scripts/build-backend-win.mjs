import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(root, "extensions", "relyyconvert-backend");
const outDir = resolve(backendDir, "bin", "win_x64");
const goBinary = process.env.GO_BINARY || (existsSync("C:\\Program Files\\Go\\bin\\go.exe") ? "C:\\Program Files\\Go\\bin\\go.exe" : "go");

mkdirSync(outDir, { recursive: true });

const result = spawnSync(goBinary, ["build", "-o", resolve(outDir, "relyyconvert-backend.exe"), "."], {
  cwd: backendDir,
  env: { ...process.env, GOOS: "windows", GOARCH: "amd64" },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
