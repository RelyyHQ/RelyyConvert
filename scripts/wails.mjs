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

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error(
      [
        "Wails CLI was not found.",
        `Looked for: ${wailsExe}`,
        'Install it with: go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0',
      ].join("\n"),
    );
  } else {
    console.error(result.error.message);
  }
}

process.exit(result.status ?? 1);
