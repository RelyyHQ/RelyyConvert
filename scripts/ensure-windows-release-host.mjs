const command = process.argv[2] || "this command";

if (process.platform === "win32") {
  process.exit(0);
}

console.error(`${command} is a Windows release command and must run on Windows.`);
console.error(`Current host: ${process.platform}/${process.arch}.`);
console.error("Use npm run app:build on macOS to build the local .app.");
console.error("To build/sign the Windows .exe or installer, run the Windows release commands on a Windows host with PowerShell, the Windows SDK, and Inno Setup installed.");
process.exit(1);
