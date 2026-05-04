import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./load-local-env.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
loadLocalEnv(root);

if (process.platform !== "win32") {
  console.error("app:sign is a Windows release command and must run on Windows.");
  console.error(`Current host: ${process.platform}/${process.arch}.`);
  console.error("macOS app builds are already ad-hoc signed by the Wails build/copy step.");
  console.error("To sign the Windows .exe or installer, run this on Windows with signtool available.");
  process.exit(1);
}

const defaultDevCertPath = resolve(root, "certs", "RelyyConvert-dev-codesign.pfx");

const files = [
  resolve(root, "build", "bin", "RelyyConvert.exe"),
  resolve(root, "dist", "installer", "RelyyConvertSetup.exe"),
].filter(existsSync);

const signtool =
  process.env.SIGNTOOL_PATH ||
  [
    "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22621.0\\x64\\signtool.exe",
    "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22000.0\\x64\\signtool.exe",
    "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\signtool.exe",
  ].find(existsSync) ||
  "signtool.exe";

const certPath =
  process.env.WINDOWS_CERT_PATH ||
  process.env.WINDOWS_SIGN_CERT_FILE ||
  (existsSync(defaultDevCertPath) ? defaultDevCertPath : "");
const certPassword = process.env.WINDOWS_CERT_PASSWORD;
const certSubject = process.env.WINDOWS_CERT_SUBJECT;
const certSha1 = process.env.WINDOWS_SIGN_CERT_SHA1;
const timestampUrl = process.env.WINDOWS_TIMESTAMP_URL || "http://timestamp.digicert.com";
const digest = process.env.WINDOWS_SIGN_DIGEST || "SHA256";

if (!files.length) {
  console.error("No Windows build outputs found to sign. Run npm run app:build first.");
  process.exit(1);
}

const baseArgs = ["sign", "/fd", digest, "/tr", timestampUrl, "/td", digest];

if (certPath) {
  baseArgs.push("/f", certPath);
  if (certPassword) baseArgs.push("/p", certPassword);
} else if (certSha1) {
  baseArgs.push("/sha1", certSha1);
} else if (certSubject) {
  baseArgs.push("/n", certSubject);
} else {
  console.error("Missing signing certificate. Set WINDOWS_CERT_PATH, WINDOWS_SIGN_CERT_FILE, WINDOWS_SIGN_CERT_SHA1, or WINDOWS_CERT_SUBJECT.");
  console.error("Optional: WINDOWS_CERT_PASSWORD, WINDOWS_TIMESTAMP_URL, WINDOWS_SIGN_DIGEST, SIGNTOOL_PATH.");
  process.exit(1);
}

for (const file of files) {
  const result = spawnSync(signtool, [...baseArgs, file], { stdio: "inherit" });
  if (result.error) {
    console.error(`Could not run signtool: ${result.error.message}`);
    console.error("Install the Windows SDK or set SIGNTOOL_PATH.");
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
