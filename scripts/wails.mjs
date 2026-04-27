import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { homedir } from "node:os";

const goBin = "C:\\Program Files\\Go\\bin";
const wailsBin = resolve(homedir(), "go", "bin");
const wailsExe = resolve(wailsBin, process.platform === "win32" ? "wails.exe" : "wails");
const command = existsSync(wailsExe) ? wailsExe : "wails";
const pathParts = [goBin, wailsBin, process.env.PATH || ""].filter(Boolean);

const result = spawnSync(command, process.argv.slice(2), {
  env: { ...process.env, PATH: pathParts.join(delimiter) },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
