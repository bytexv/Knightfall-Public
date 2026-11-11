# Packaging and verification

## Build inputs

- Shared web app: React, Vite and TypeScript; versions are locked in `package-lock.json`.
- Windows runtime: Electron 45.3.0 x64, obtained by electron-builder from the upstream Electron release.
- Android shell: Capacitor 7, Android SDK 35 and JDK 21.
- Engine: local Stockfish JavaScript/WASM files prepared by `scripts/prepare-engine.mjs`.
- App artwork: the original Knightfall knight in `public/icon.svg`; the PNG and ICO variants derive from that SVG.

The Vite plugin in `scripts/pgn-compat.ts` explicitly defaults two optional chess.js parser offsets before integer conversion. This handles an observed Chromium 83 Android x86 emulator defect where `undefined | 0` produces `2147483647`, which otherwise stalls PGN parsing. The guard is limited to the bundled chess.js parser, is covered by production-bundle tests, and fails the build if the upstream expressions change.

`package.json` contains the application version. Increase it before shipping an update. Keep the native Android versionCode monotonic when publishing to an app store.

## Web and offline PWA

```sh
npm ci
node scripts/prepare-engine.mjs
npm run build
```

The postbuild command runs `scripts/package-pwa.mjs`. It enumerates built assets, hashes their contents, and writes `dist/sw-manifest.js`. The service worker installs the entire runtime shell and engine atomically before activating. Corresponding-source archives stay available in the packaged app but are excluded from the offline web cache because they are not needed to play. New versions use a new cache key. The previous version remains active until the app closes or explicitly requests `SKIP_WAITING`. API endpoints and WebSocket requests are never cached.

Run `node --test tests/pwa.test.mjs` for offline fetch, cache lifecycle, multiplayer exclusion, and interrupted-download behavior.

## Windows portable EXE

```sh
node scripts/package-windows.mjs
```

The script requires an existing web build. Output is under `artifacts/windows/`; the distributable is `Knightfall-1.1.0-Windows-x64.exe`. It packages the app into ASAR and wraps the 64-bit runtime as a portable executable. No Node.js install is required on the recipient's computer.

The build is unsigned, and Windows resource editing is disabled to permit cross-compilation from Linux without Wine. It therefore does not claim verified publisher identity. Publishing a signed release should run on Windows with your signing configuration.

The desktop process starts a loopback server at a stable saved port (8786 by default), preserving the browser origin used for saved games and preferences. A separate LAN server starts only from the Wi-Fi host command. Only the trusted main frame can invoke that IPC handler. The renderer has context isolation, sandboxing, a restrictive content-security policy, no Node integration, and no arbitrary IPC bridge. Release fuses disable Node-mode/environment/inspector entrypoints and privileged file URLs, and enable embedded ASAR integrity validation and ASAR-only app loading.

The Windows binary can be built on Linux, but running a Linux Electron smoke test does not establish Windows runtime compatibility. Final release QA should open the portable executable on Windows 10/11 and exercise a two-device LAN game with the host firewall enabled.

## Android and iOS

See `docs/MOBILE.md` and `scripts/package-mobile.mjs`.

The Android development artifact is signed with a debug key. A production APK/AAB requires a release keystore controlled by the publisher. iOS distribution requires macOS, Xcode, a signing team, and provisioning; the checked-in iOS project is not a signed IPA.

## Checksums

`package-windows.mjs` writes `artifacts/windows/SHA256SUMS.txt`. To verify a Windows download in PowerShell:

```powershell
Get-FileHash .\Knightfall-1.1.0-Windows-x64.exe -Algorithm SHA256
```

Compare the hexadecimal value with the checksum file distributed with the build. The checksum detects changed bytes; it does not replace code signing or authenticate a publisher by itself.

## Reproducible source handoff

Distribute the source tree (including lockfiles, native projects, engine notices, licenses, tests and build scripts) with release artifacts. Exclude `node_modules`, environment-specific SDK paths, `.gradle`, intermediate native build directories, and credentials. Generated native `local.properties` files must remain ignored.

The native binaries may include toolchain timestamps and signing metadata, so the instructions reproduce the release contents rather than promise identical binary bytes across machines.

A GitHub Actions workflow in `.github/workflows/build-release.yml` builds Windows and Android artifacts on demand or for a version tag. It does not publish to an app store, require signing secrets, or deploy the web app.

## Native desktop smoke check

On a machine with a desktop session, run:

```sh
npm run build
npx electron . --smoke-test
```

This loads the real bundled renderer with the production sandbox/preload, checks that the app rendered without exposing Node and has 64 equal chessboard squares, invokes the trusted LAN bridge, prints `KNIGHTFALL_DESKTOP_SMOKE` on success, and exits. It uses an isolated temporary app-data directory. The basic smoke command does not play a game; add `--smoke-game` below to verify a bot response. Neither mode replaces a Windows-device acceptance test.

After producing the Windows artifact, run:

```sh
node scripts/package-verify.mjs
```

This inspects the PE architecture, extracts the shipped ASAR into an isolated temporary directory, checks that every offline asset matches the current web build, and runs the shipped server with only its packaged dependencies. It verifies the UI entrypoint and correct WebAssembly response MIME type, then removes the extraction.

For a full local-bot smoke check and screenshot:

```sh
npx electron . --smoke-test --smoke-game --smoke-screenshot=artifacts/qa/desktop.png
```

This plays `1. e4` through the rendered board and verifies a legal response from the actual local Stockfish Web Worker. For responsive native-renderer checks, add `--smoke-viewport=390x844`. This does not simulate Android's operating system; use the native Android package for device acceptance. In a headless Linux test environment with Electron 45, `--ozone-platform=headless --ozone-override-screen-size=1600,1100 --disable-gpu` can supply a software display.
