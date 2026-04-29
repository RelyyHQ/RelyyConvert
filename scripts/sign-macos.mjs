import {
  assertMacHost,
  loadMacEnv,
  resolveAppSigningIdentity,
  signMacApp,
} from "./macos-signing.mjs";

assertMacHost("app:sign:mac");
loadMacEnv();

const identity = resolveAppSigningIdentity();
console.log(`Signing RelyyConvert.app with: ${identity}`);
signMacApp(identity);
console.log("macOS app signature is valid.");
