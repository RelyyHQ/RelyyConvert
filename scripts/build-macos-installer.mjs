import {
  assertMacHost,
  buildPkg,
  loadMacEnv,
  notarizeAndStaple,
  resolveAppSigningIdentity,
  run,
  signMacApp,
} from "./macos-signing.mjs";

assertMacHost("installer:build:mac");
loadMacEnv();

const args = new Set(process.argv.slice(2));
const signRequested =
  args.has("--sign") ||
  process.env.RELYY_MAC_SIGN === "1" ||
  process.env.APPLE_SIGN_APP === "true" ||
  process.env.APPLE_SIGN_APP === "1";
const notarizeRequested =
  args.has("--notarize") ||
  process.env.RELYY_MAC_NOTARIZE === "1" ||
  process.env.APPLE_NOTARIZE === "true" ||
  process.env.APPLE_NOTARIZE === "1";
const skipBuild = args.has("--skip-build");

if (!skipBuild) {
  run("npm", ["run", "app:build"]);
}

if (signRequested || notarizeRequested) {
  const identity = resolveAppSigningIdentity();
  console.log(`Signing RelyyConvert.app with: ${identity}`);
  signMacApp(identity);
}

const pkgPath = buildPkg({ sign: signRequested || notarizeRequested });

if (notarizeRequested) {
  notarizeAndStaple(pkgPath);
}

console.log(`macOS installer ready: ${pkgPath}`);
