# Windows Release Checklist

## Prerequisites

- Go installed.
- Node dependencies installed with `npm install`.
- Wails CLI installed. The repo script also checks `%USERPROFILE%\go\bin\wails.exe`.
- Inno Setup 6 installed for installer builds.
- Windows SDK installed for `signtool.exe`.
- LGPL-compatible FFmpeg and FFprobe files present in `third_party/ffmpeg/win_x64/`.

## Build App

```bash
npm run app:build
```

Verify:

- `build/bin/RelyyConvert.exe`
- `build/bin/third_party/ffmpeg/win_x64/ffmpeg.exe`
- `build/bin/third_party/ffmpeg/win_x64/ffprobe.exe`

## Sign App

The signing scripts automatically load `.env.installer.local` or `env.installer.local`.

Local self-signed development certificate:

```powershell
npm run cert:create-dev
npm run app:sign
```

Certificate file:

```powershell
$env:WINDOWS_CERT_PATH="C:\path\to\certificate.pfx"
$env:WINDOWS_CERT_PASSWORD="certificate-password"
npm run app:sign
```

Certificate from Windows certificate store:

```powershell
$env:WINDOWS_CERT_SUBJECT="Your Code Signing Subject"
npm run app:sign
```

## Build Installer

```bash
npm run installer:build
```

Output:

```text
dist/installer/RelyyConvertSetup.exe
```

Run `npm run app:sign` again after installer creation to sign the installer.

## Release Command

```bash
npm run release:windows
```
