import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./load-local-env.mjs";

export const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const appName = "RelyyConvert";
export const appBundle = resolve(root, "build", "bin", `${appName}.app`);
export const distInstallerDir = resolve(root, "dist", "installer", "macos");

export function loadMacEnv() {
  loadLocalEnv(root);
  for (const name of [".env.local", "env.local", ".env.release.local", "env.release.local"]) {
    loadEnvFile(resolve(root, name));
  }
  loadEnvFile(resolve(root, ".local", "macos-signing.env"));

  if (!process.env.APPLE_API_ISSUER && process.env.APPLE_API_ISSUER_ID) {
    process.env.APPLE_API_ISSUER = process.env.APPLE_API_ISSUER_ID;
  }
}

export function assertMacHost(command) {
  if (process.platform === "darwin") return;

  console.error(`${command} is a macOS release command and must run on macOS.`);
  console.error(`Current host: ${process.platform}/${process.arch}.`);
  process.exit(1);
}

export function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  return process.env.APP_VERSION || packageJson.version || "0.1.0";
}

export function requireCommand(command) {
  const result = spawnSync("which", [command], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`${command} is required for this macOS release command.`);
    process.exit(1);
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });

  if (result.error) return "";
  return `${result.stdout || ""}${result.stderr || ""}`;
}

export function resolveAppSigningIdentity() {
  const configured =
    process.env.APPLE_SIGN_IDENTITY ||
    process.env.APPLE_DEVELOPER_ID_APP ||
    process.env.APPLE_SIGN_APP ||
    process.env.RELYY_SAVED_APPLE_SIGN_IDENTITY ||
    "";
  if (configured) return configured;

  const identities = listIdentities("codesigning", "Developer ID Application");
  const teamId = process.env.APPLE_TEAM_ID || process.env.APPLE_DEVELOPER_TEAM_ID || "";
  const matched = teamId ? identities.find((identity) => identity.includes(`(${teamId})`)) : "";
  const identity = matched || identities[0] || "";

  if (!identity) {
    console.error("No Developer ID Application signing identity found.");
    console.error("Set APPLE_SIGN_IDENTITY, APPLE_DEVELOPER_ID_APP, or install a Developer ID Application certificate.");
    process.exit(1);
  }

  return identity;
}

export function resolveInstallerSigningIdentity() {
  const configured =
    process.env.APPLE_INSTALLER_SIGN_IDENTITY ||
    process.env.APPLE_DEVELOPER_ID_PKG ||
    process.env.APPLE_SIGN_PKG ||
    "";
  if (configured) return configured;

  const identities = listIdentities("basic", "Developer ID Installer");
  const teamId = process.env.APPLE_TEAM_ID || process.env.APPLE_DEVELOPER_TEAM_ID || "";
  const matched = teamId ? identities.find((identity) => identity.includes(`(${teamId})`)) : "";
  return matched || identities[0] || "";
}

export function signMacApp(identity = resolveAppSigningIdentity()) {
  if (!existsSync(appBundle)) {
    console.error(`Missing macOS app bundle: ${appBundle}`);
    console.error("Run npm run app:build first.");
    process.exit(1);
  }

  const macosDir = resolve(appBundle, "Contents", "MacOS");
  const nestedBinaries = [
    resolve(macosDir, "third_party", "ffmpeg", "ffmpeg"),
    resolve(macosDir, "third_party", "ffmpeg", "ffprobe"),
    resolve(macosDir, appName),
  ];

  for (const binary of nestedBinaries) {
    signPath(binary, identity);
  }

  signPath(appBundle, identity, ["--deep"]);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle]);
}

export function buildPkg({ sign = false } = {}) {
  if (!existsSync(appBundle)) {
    console.error(`Missing macOS app bundle: ${appBundle}`);
    console.error("Run npm run app:build first.");
    process.exit(1);
  }

  requireCommand("pkgbuild");
  requireCommand("productbuild");

  const version = readPackageVersion();
  const stagingDir = resolve(distInstallerDir, "_pkg");
  const resourcesDir = resolve(stagingDir, "resources");
  const componentPkg = resolve(stagingDir, `${appName}-${version}-component.pkg`);
  const distribution = resolve(stagingDir, "distribution.xml");
  const finalPkg = resolve(distInstallerDir, `${appName}-${version}.pkg`);
  const bundleId = process.env.APPLE_BUNDLE_ID || process.env.MACOS_BUNDLE_ID || "com.wails.RelyyConvert";

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(resourcesDir, { recursive: true });
  mkdirSync(distInstallerDir, { recursive: true });

  writeFileSync(resolve(resourcesDir, "welcome.txt"), `Welcome to the ${appName} installer.\n\nThis installer places ${appName} in /Applications.\n`);
  writeFileSync(resolve(resourcesDir, "conclusion.txt"), `${appName} has been installed.\n\nYou can launch it from Applications.\n`);

  run("pkgbuild", [
    "--component",
    appBundle,
    "--install-location",
    "/Applications",
    "--identifier",
    bundleId,
    "--version",
    version,
    componentPkg,
  ]);

  writeFileSync(
    distribution,
    `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
  <title>${appName} Installer</title>
  <welcome file="welcome.txt"/>
  <conclusion file="conclusion.txt"/>
  <options customize="never" require-scripts="false"/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <choices-outline>
    <line choice="default">
      <line choice="${bundleId}.choice"/>
    </line>
  </choices-outline>
  <choice id="default"/>
  <choice id="${bundleId}.choice" visible="false">
    <pkg-ref id="${bundleId}.pkg"/>
  </choice>
  <pkg-ref id="${bundleId}.pkg" version="${version}" onConclusion="none">${basename(componentPkg)}</pkg-ref>
</installer-gui-script>
`,
  );

  const productbuildArgs = [
    "--distribution",
    distribution,
    "--resources",
    resourcesDir,
    "--package-path",
    stagingDir,
  ];

  if (sign) {
    const installerIdentity = resolveInstallerSigningIdentity();
    if (!installerIdentity) {
      console.error("No Developer ID Installer signing identity found.");
      console.error("Set APPLE_INSTALLER_SIGN_IDENTITY, APPLE_DEVELOPER_ID_PKG, or install a Developer ID Installer certificate.");
      process.exit(1);
    }
    productbuildArgs.push("--sign", installerIdentity);
  }

  productbuildArgs.push(finalPkg);
  run("productbuild", productbuildArgs);
  return finalPkg;
}

export function notarizeAndStaple(artifact) {
  requireCommand("xcrun");

  const profile =
    process.env.APPLE_KEYCHAIN_PROFILE ||
    process.env.RELYY_NOTARY_PROFILE ||
    process.env.NOTARIZE_PROFILE ||
    process.env.RELYY_SAVED_APPLE_KEYCHAIN_PROFILE ||
    "";
  const apiKeyPath = process.env.APPLE_API_KEY_PATH || "";
  const apiKeyId = process.env.APPLE_API_KEY_ID || "";
  const apiIssuer = process.env.APPLE_API_ISSUER || "";

  if (profile) {
    const args = ["notarytool", "submit", artifact, "--wait", "--keychain-profile", profile];
    if (process.env.APPLE_KEYCHAIN_PATH) args.push("--keychain", process.env.APPLE_KEYCHAIN_PATH);
    run("xcrun", args);
  } else if (apiKeyPath && apiKeyId && apiIssuer) {
    run("xcrun", [
      "notarytool",
      "submit",
      artifact,
      "--wait",
      "--key",
      apiKeyPath,
      "--key-id",
      apiKeyId,
      "--issuer",
      apiIssuer,
    ]);
  } else {
    console.error("Notarization requested, but no notary credentials found.");
    console.error("Set APPLE_KEYCHAIN_PROFILE, RELYY_NOTARY_PROFILE, or APPLE_API_KEY_PATH/APPLE_API_KEY_ID/APPLE_API_ISSUER.");
    process.exit(1);
  }

  run("xcrun", ["stapler", "staple", artifact]);
}

function signPath(path, identity, extraArgs = []) {
  if (!existsSync(path)) return;

  spawnSync("codesign", ["--remove-signature", path], {
    stdio: "ignore",
  });

  const args = ["--force", ...extraArgs, "--options", "runtime", "--sign", identity];
  if (identity !== "-") args.push("--timestamp");
  args.push(path);
  run("codesign", args);
}

function listIdentities(policy, filter) {
  return capture("security", ["find-identity", "-v", "-p", policy])
    .split(/\r?\n/)
    .map((line) => line.match(/"(.+?)"/)?.[1] || "")
    .filter((identity) => identity.includes(filter));
}

function loadEnvFile(file) {
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    const value = unquote(trimmed.slice(index + 1));
    if (!process.env[key]) process.env[key] = value;
  }
}

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
