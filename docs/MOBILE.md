# Knightfall mobile

Knightfall uses the same local React chess application in a Capacitor native shell. The Android APK contains the board, learning content and Stockfish engine, so bot games and analysis work without a cloud service. A current Android System WebView is recommended. Older WebViews automatically use the bundled fallback engine when Stockfish’s WebAssembly build cannot run; update System WebView for the strongest local analysis.

## Install Android

Use the included `Knightfall-1.2.0-android-debug.apk` on Android 6.0 or newer. Open the APK on your phone and allow installation from that download/file app when Android prompts. This is a development build signed with a debug key, not a Play Store release. No Google account, server login or subscription is required for local play. PGN and text exports use Android’s system Save dialog, so you can choose a destination without granting broad storage permissions.

For same-Wi-Fi multiplayer, start **Host a room** on the Windows app or run `npm run lan` on a computer. Connect the phone to the same Wi-Fi, enter the displayed host URL in Knightfall's Wi-Fi page, and join the room code. The Android app permits cleartext HTTP/WebSocket traffic for this local feature. The host computer must stay awake and permit the app through its private-network firewall. Guest/public Wi-Fi may isolate devices from each other.

## Rebuild Android

Requirements: Node 22.15 or newer, JDK 21, Android SDK platform 35 and build-tools 35.0.0. Install Android Studio or the official Android command-line tools. Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to your SDK and `JAVA_HOME` to JDK 21. If using Android Studio, open `android/` and let it create its local SDK configuration.

```sh
npm ci
node scripts/prepare-engine.mjs
node scripts/package-mobile.mjs
```

The script builds the web app, runs `cap sync android`, and assembles a debug APK in `artifacts/`. Pass `--skip-web-build` only when `dist/` already contains the current tested build. Android's generated `local.properties`, Gradle caches, build outputs and private signing keys must remain untracked.

To prepare a store release, configure a private release keystore in your local Gradle environment or Android Studio, increment `versionCode` in `android/app/build.gradle`, and use Android Studio's **Generate Signed Bundle / APK**. Never commit a keystore or its passwords. Debug builds and release builds signed by different keys cannot update one another in place.

Version 1.2 uses Android `versionCode` 3. The GitHub release workflow requires a configured stable signing identity and verifies its certificate before publishing an APK. That workflow does not change the local packaging script's debug signing. Keep the same certificate when updating an existing installation; see [GitHub releases and updates](./GITHUB.md).

## iPhone and iPad

The `ios/` project is included. Building and signing an `.ipa` requires macOS, Xcode and an Apple development team; the Linux development environment cannot produce a signed iOS installer.

On a Mac:

```sh
npm ci
node scripts/prepare-engine.mjs
npm run build
npx cap sync ios
npx cap open ios
```

Select your Apple team in Xcode's **Signing & Capabilities**, attach a device, then run or archive the `App` target. Bundle ID: `studio.knightfall.chess`. The app includes a local-network permission explanation for same-Wi-Fi games. The `NSAppTransportSecurity` web-content exception permits local HTTP/WebSocket hosts; the app does not load arbitrary remote pages into its native shell.

You can also install the HTTPS web version on iPhone via Safari **Share → Add to Home Screen**. Load it once online and let its offline cache finish before disconnecting. Browser offline availability depends on device storage and the browser retaining cached site data.

## Data and verification

Games, Local Elo and preferences are stored on the device. Android automatic app-data backup is disabled; use Settings' JSON backup for games, ratings, preferences and puzzle progress, or PGN export for individual games. Uninstalling or clearing app data removes local records. LAN rooms live on the host computer and end when the host server stops. No public matchmaking, remote accounts, app-store publication or cloud sync is implied by these packages.

Earlier development builds were installed and launched in an Android 11 (API 30) emulator. Historical checks covered offline bot play, the native Save dialog and parsing the exported PGN back with chess.js; that emulator's WebView 83 exercised the local fallback engine. Consult the current release's QA reports for checks repeated on its exact APK. A successful compilation or an earlier build's result does not verify every new interaction. Physical-device testing with a current WebView is still recommended before broad distribution, especially for Stockfish performance, animation/touch behavior and router/firewall variations. Use your own stable release signing key for long-term installs.
