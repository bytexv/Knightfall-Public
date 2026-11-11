# Install Knightfall

Knightfall is an original chess studio for web, Windows, and Android. The game rules, analysis engine, bot, library, and puzzles run on your device. No account is needed for the local apps. The hosted website may use its hosting provider's access gate.

## Windows portable app

1. Download `Knightfall-1.1.0-Windows-x64.exe` from the release artifacts.
2. Run it on a 64-bit Windows 10/11 computer. The portable app does not need administrator rights.
3. Games and preferences are kept in the current Windows user's app-data directory. Export important games as PGN before moving to a different computer.

The build is unsigned. Windows may show an unknown-publisher or SmartScreen prompt. The SHA256SUMS file lets you compare a downloaded artifact to the produced build. Code signing requires the publisher's certificate and is not included in this development build.

The desktop renderer is sandboxed with Node integration disabled. A loopback HTTP server serves the bundled app, and a LAN listener starts only when you choose to host a Wi-Fi game.

## Android

See [MOBILE.md](./MOBILE.md) for the Android APK, installation, development builds, and iOS project details. A development APK is signed with a debug key, not a Play Store release key.

## Install the website on a phone or computer

Open the hosted HTTPS website. On Android Chrome or desktop Chrome/Edge, use **Install app** or **Add to home screen** from the browser menu. In iPhone/iPad Safari, use **Share → Add to Home Screen**.

Keep the page open for the first load while its offline assets download. After that, normal local play and Stockfish analysis work without internet. Storage eviction, private browsing, or clearing browser data can remove offline assets and saved games; revisit online to cache the app again. Same-Wi-Fi multiplayer still needs a running host and a network connection.

On iOS, backgrounding a web app can pause JavaScript and disconnect active multiplayer sessions. Keep the app in the foreground while playing timed games.

## Play over the same Wi-Fi

1. Connect both devices to the same normal Wi-Fi network.
2. On Windows, open Knightfall and select **Play with friends → Create a room → Create Wi-Fi room**. Alternatively, a computer with Node.js can run the standalone server below.
3. Share the local address shown by the host, for example `http://192.168.1.42:8787`. Open that address in the second device's browser. In the Android app, enter the host's local address in the Wi-Fi screen.
4. The host creates a room and shares the six-character room code. The second player joins it.
5. Keep the host app open until the game finishes. If Windows Firewall asks, allow access on your private network.

Guest Wi-Fi, campus networks, access-point isolation, VPNs, and host firewalls can prevent devices from reaching one another. Use a trusted private network. Rooms are kept in the host's memory, so closing or restarting the host ends those rooms. Normal local analysis does not need a Wi-Fi server.

The hosted HTTPS app cannot connect to an insecure `ws://` server in many browsers. Open the host's `http://` address for LAN play; this serves the same app directly from the host. Internet multiplayer and matchmaking are not hosted by this local-network server.

## Run from source

Requirements: Node.js 24 LTS (recommended), or Node.js 22.15 or newer, and npm.

```sh
npm ci
node scripts/prepare-engine.mjs
npm run build
npm run lan
```

The server prints the local addresses available to other devices. Default LAN port: `8787`. For development UI work, use `npm run dev`.

Windows packaging:

```sh
npm run build
node scripts/package-windows.mjs
```

Android packaging is documented in [MOBILE.md](./MOBILE.md). `.github/workflows/build-release.yml` provides Windows and Android CI builds. Native iOS distribution requires macOS, Xcode, and an Apple signing identity.

## Licensing and distribution

The bundled Stockfish engine is GPLv3. See its local engine license/provenance files and the repository's third-party notices. Distribute corresponding source and notices alongside binaries, as the licenses require. Creator-named gambit explanations describe public chess culture; they do not imply an endorsement or affiliation.
