# Knightfall 1.3

An independent chess studio for web, Windows and Android. Local play, analysis and learning run on your device.

## New in 1.3

- Public source and app downloads: https://github.com/bytexv/Knightfall-Public.
- A Windows Setup installer with automatic background update checks and downloads. SHA-512 is verified before the downloaded installer is marked ready. Updates install on normal app exit, or after confirming **Restart and update**. The app does not restart a live game automatically.
- Android checks for newer APKs at startup and when returning to the app after four hours. An update indicator opens Settings; the APK download requires Android installation approval.
- Web updates download through the service worker and show **Reload to update** when ready. Reload is your choice.
- The portable Windows edition remains available, with manual download/install.

Install the new Setup edition once to enable automatic Windows updates. Earlier 1.2 apps shipped without a repository connection and cannot discover this first connected release automatically. Keep the existing app profile; saved games and Local Elo use the same application identity.

GitHub Actions builds and publishes Windows/source/web releases from stable version tags. Signed Android builds join that release only when the five repository signing secrets described in `docs/GITHUB.md` are configured. GitHub denied this session access to those secrets, so this release's compatible APK was built and signed locally instead. No keystore was uploaded.

## Included from 1.2

- Guided game review with move badges, an interactive evaluation graph, per-side summaries and filters for important decisions. The ten classifications run from Brilliant and Great through Book, Mistake, Miss and Blunder; their rules are documented in `docs/REVIEW.md`.
- Suggested-line previews and move retries that leave the original game intact. Switch to **Live analysis** for current engine lines.
- A persistent Local Elo counter, rating history and trend graph for eligible completed bot games. Games using hints, takebacks or live analysis while in progress do not count; custom positions and fallback-engine games are also unrated. Ratings are included in JSON backup/restore.
- Animated moves, captures, castling and promotions, with responsive dragging and support for reduced-motion preferences.
- A desktop update panel for configured GitHub releases. The portable edition can check public repositories at startup or manually; its downloads open only after you choose. The installed Windows edition now supports automatic updates. Unconfigured and private repositories show the appropriate availability guidance.

The warm paper, walnut and charcoal club design, personalized board heading and recent-games sidebar introduced in 1.1 remain part of the app.

## Included

- Six local bots, shared-screen chess, timed or untimed games, promotion choices, hints, takebacks, replay and a focus view.
- Stockfish 17.1 Lite analysis, three suggested lines, game review and a clearly labeled lightweight fallback.
- 60 tactical puzzles, Tactics Sprint, 27 opening primers, nine lessons and 15 endgame drills, including draw-defense practice.
- A board editor, play from a custom position, PGN/FEN import, PGN export with study notes, a local game archive, backups and board settings.
- Same-Wi-Fi rooms with host-validated moves and clocks, reconnection, draw offers and rematches.

Tactics Sprint offers 3-minute, 5-minute and untimed Survival modes with three lives. Finish a run to record its result and personal best; leaving the Sprint page abandons the active run. Endgame starting positions were tablebase-verified, but practice uses the local engine rather than a cloud tablebase service.

## Install

**Windows:** Install `Knightfall-1.3.0-Windows-Setup.exe` on 64-bit Windows 10/11 for automatic updates. `Knightfall-1.3.0-Windows-x64.exe` is the optional portable edition. Both are unsigned development builds; Windows may display an unknown-publisher prompt. No separate Node.js installation is needed.

**Android:** Open `Knightfall-1.3.0-Android.apk` on the phone and allow installation from that file/download app when prompted. This APK uses a debug signing key and is not a Play Store release. Android 6.0 or newer is targeted; keep Android System WebView updated where possible.

**Web:** Use the private web link supplied with the release. The hosting provider may require sign-in. Chrome/Edge can install the app from their menu; on iPhone, use Safari **Share → Add to Home Screen**. Keep the first online load open while offline assets finish caching.

**iOS:** The source includes a Capacitor iOS project, not a signed IPA. A native iPhone/iPad build requires macOS, Xcode and Apple signing.

## Play over the same Wi-Fi

1. Put both devices on the same Wi-Fi network.
2. On Windows, open **Play with friends → Create a room**. Choose the settings and click **Create Wi-Fi room**.
3. Share the displayed local address, such as `http://192.168.1.20:8787`, and six-character room code.
4. The other player opens that address in a browser and chooses **Join a room**. The Android app can enter the host address and code directly.
5. Keep the host awake and open. Allow private-network firewall access if requested.

Share the LAN address, not `localhost`. Guest-network isolation can prevent connections. Browser players should open the local HTTP app instead of connecting from the private HTTPS website. The host owns the clocks, which continue during disconnection; closing the host ends its memory-only rooms.

A computer can also host from the source archive using Node.js 24 LTS:

```sh
npm ci
node scripts/prepare-engine.mjs
npm run build
npm run lan
```

## Data and scope

Games, Local Elo and settings stay in the current browser/app profile. Use PGN export and **Settings → Download a backup** before clearing app data. The JSON backup includes games, the rating ledger, settings and unassisted puzzle progress; separate learning markers and Sprint bests are not included. Native packages bundle the engine; offline web use depends on successful caching and retained browser storage.

There is no public matchmaking, cloud account system, public rated ladder, cloud synchronization or app-store publication. Bot levels, Local Elo and review quality are local training estimates, not calibrated online ratings or official accuracy scores. A review's estimated-performance range needs enough eligible decisions against a known local bot; it is separate from the result-based Local Elo ledger. The hosted web deployment is private by default; the packaged apps and local-network games need no Knightfall account.

## Verification boundaries

The source includes native Linux Electron acceptance checks for the real renderer, legal board moves, local Stockfish WASM and the desktop LAN bridge. Automated checks cover chess rules, review scoring, rating persistence, animations, content, clocks, storage, UI interactions and actual local HTTP/WebSocket rooms. The release's accompanying QA reports identify which checks ran against its exact build; historical Android emulator checks do not establish acceptance of every new interaction.

The Windows package was cross-built; running Electron on Linux does not establish Windows-device compatibility. Emulator checks do not certify every physical Android device or phone-to-PC Wi-Fi setup. No signed iOS build or iPhone native-device test is claimed. Windows code signing, Android release signing and target-device acceptance testing remain release-distribution steps.

The source archive includes native projects, build scripts, tests, documentation and licenses. Knightfall is GPL-3.0-or-later; bundled Stockfish source/notices and third-party credits are included. See the source archive’s `README.md`, `docs/INSTALL.md` and `docs/THIRD-PARTY.md` for details.
