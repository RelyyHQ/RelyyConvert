# RelyyConvert

RelyyConvert is a Windows-first desktop audio converter built with Wails, Go, React, and Vite.

## Development

```bash
npm install
npm run wails:dev
```

The Wails shell provides native file dialogs and native drag/drop paths. Dragged files are resolved to their original absolute filesystem paths before probing or conversion.

## FFmpeg

Bundled Windows x64 FFmpeg tools are expected at:

- `third_party/ffmpeg/win_x64/ffmpeg.exe`
- `third_party/ffmpeg/win_x64/ffprobe.exe`

Use an LGPL-compatible FFmpeg build. Keep the matching license, source notice, and build provenance files beside the binaries and reflected in `THIRD_PARTY_NOTICES.md`.

## Build

```bash
npm run app:build
```

This builds the Wails executable at:

```text
build/bin/RelyyConvert.exe
```

The build script copies bundled FFmpeg files into:

```text
build/bin/third_party/ffmpeg/win_x64/
```

## Signing

Install the Windows SDK so `signtool.exe` is available. Signing scripts automatically load `.env.installer.local` or `env.installer.local` when present.

For a local self-signed development certificate:

```powershell
npm run cert:create-dev
npm run app:sign
```

For a CA-issued certificate file:

```powershell
$env:WINDOWS_CERT_PATH="C:\path\to\certificate.pfx"
$env:WINDOWS_CERT_PASSWORD="certificate-password"
npm run app:sign
```

Optional environment variables:

- `SIGNTOOL_PATH`
- `WINDOWS_SIGN_CERT_FILE`
- `WINDOWS_SIGN_CERT_SHA1`
- `WINDOWS_CERT_SUBJECT`
- `WINDOWS_TIMESTAMP_URL`
- `WINDOWS_SIGN_DIGEST`

## Installer

Install Inno Setup 6 and run:

```bash
npm run installer:build
```

The installer output is:

```text
dist/installer/RelyyConvertSetup.exe
```

For the full Windows release pipeline:

```bash
npm run release:windows
```

Upload the latest built artifact to an S3-compatible release bucket such as Cloudflare R2:

```bash
npm run release:upload:dry
npm run release:upload
```

The upload script reads `.env.release.local`, `.env.installer.local`, `.env.local`, or `.env`. See `env.release.example` for required R2 variables.

Required release checks:

- `npm run lint`
- `go test .`
- `npm run app:build`
- `npm run app:sign`
- `npm run installer:build`
