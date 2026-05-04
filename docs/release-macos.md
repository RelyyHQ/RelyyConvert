# macOS Release Checklist

## Prerequisites

- Run these commands on macOS.
- Xcode Command Line Tools installed for `codesign`, `pkgbuild`, `productbuild`, `notarytool`, and `stapler`.
- For signed releases, a `Developer ID Application` certificate in this Mac's keychain.
- For signed installer packages, a `Developer ID Installer` certificate in this Mac's keychain.

## Local App Build

```bash
npm run app:build
```

Output:

```text
build/bin/RelyyConvert.app
```

## Sign App

The macOS scripts automatically load `.env.installer.local`, `env.installer.local`, `.env.local`, `env.local`, `.env.release.local`, or `env.release.local`.

If multiple identities are installed, set one explicitly:

```bash
export APPLE_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npm run app:sign:mac
```

If `APPLE_SIGN_IDENTITY` is not set, the script also accepts the RelyyCast-style `APPLE_SIGN_APP` value, then uses the first installed `Developer ID Application` identity. Set `APPLE_TEAM_ID` to prefer an identity for a specific team.

## Build Installer

Unsigned local installer package:

```bash
npm run installer:build:mac
```

Signed installer package:

```bash
export APPLE_INSTALLER_SIGN_IDENTITY="Developer ID Installer: Your Name (TEAMID)"
npm run installer:build:mac:sign
```

Signed and notarized installer package:

```bash
npm run installer:build:mac:release
```

`APPLE_SIGN_PKG` is accepted as an alias for `APPLE_INSTALLER_SIGN_IDENTITY`.

Output:

```text
dist/installer/macos/RelyyConvert-<version>.pkg
```

## Notarization

Preferred keychain profile:

```bash
xcrun notarytool store-credentials "relyy-notary" \
  --apple-id "you@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password"

export APPLE_KEYCHAIN_PROFILE="relyy-notary"
```

App Store Connect API key mode is also supported:

```bash
export APPLE_API_KEY_PATH="/absolute/path/AuthKey_XXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXX"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
```

## Release Command

```bash
npm run release:mac
```
