import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadLocalEnv(root) {
  for (const name of [".env.installer.local", "env.installer.local"]) {
    const file = resolve(root, name);
    if (!existsSync(file)) continue;

    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;

      const key = trimmed.slice(0, index).trim();
      const value = unquote(trimmed.slice(index + 1));
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
