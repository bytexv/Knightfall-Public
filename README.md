# Knightfall

**Local chess, analysis and training.**

Knightfall is an independent chess studio for the web, Windows and Android. Play local bots, review games with on-device Stockfish, study openings and endgames, solve tactics, or invite a friend on the same Wi-Fi. The native apps bundle the engine and learning content; the web app supports offline use after its first successful cache installation.

Knightfall has its own branding and interface. It is not affiliated with Chess.com, Lichess, or the creators mentioned in its educational content.

## Downloads and updates

Get the latest apps from [GitHub Releases](https://github.com/bytexv/Knightfall-Public/releases/latest). Choose **Windows-Setup.exe** for automatic background downloads and installation on exit, or **Windows-x64.exe** for portable use. Android checks for newer compatible APKs, downloads them in-app, and opens Android’s in-place update confirmation. Saved games and settings stay; GitHub needs the matching signed APK. The web app offers **Reload to update**. See [GitHub release setup](docs/GITHUB.md) for automation and Android signing requirements.

## Start playing

1. Open **Play chess**. Choose one of 30 local bots (estimated 100–3000 Elo), or **Pass & play** for two people sharing a screen. Pick a side and time control, then start.
2. Click or drag a piece to a legal destination. Choose a queen, rook, bishop or knight when a pawn promotes.
3. Open **Analysis** for a guided game review, move classifications, an evaluation graph and per-side summaries. Switch to **Live analysis** for current engine suggestions. Explore a suggested line or retry a move without changing the original game. **Set up** opens the board editor; **Save game** keeps an imported or edited study, and **Play position** starts practice from the current board.
4. Explore **Puzzles**, **Tactics Sprint**, **Learn chess**, and **Endgame school** for guided practice.
5. Use **Settings → Download a backup** and PGN exports to keep copies of your games.

Press **F** to flip the board. Outside input fields and the board itself, **← / →** replay moves. On the board, arrow keys move focus and Enter or Space selects a piece or destination. Right-drag draws an arrow, right-click marks a square, and Escape clears those temporary annotations. The editor also supports Delete to erase a square. **Focus view** in the board toolbar reduces the surrounding interface while you play.

For installation details, see [Install Knightfall](docs/INSTALL.md). For a full feature inventory, see [Features](docs/FEATURES.md).

### Available formats

| Format | What it contains | Delivery/build output |
| --- | --- | --- |
| Web / installable PWA | Responsive app, local engine, learning content, offline cache | `dist/` after `npm run build` |
| Windows x64 | Electron 45 Setup installer with automatic updates, plus portable edition and Wi-Fi host | `artifacts/windows/Knightfall-1.7.0-Windows-Setup.exe` and `Windows-x64.exe` |
| Android | Capacitor 7 app with bundled assets and direct LAN joining | `artifacts/Knightfall-1.7.0-android-debug.apk` |
| iPhone / iPad | Native Capacitor project; the web app can also be added to the Home Screen | `ios/`; no signed IPA is included |

The Windows executable is unsigned. The Android APK is a development build signed with a debug key. They are not app-store releases. Native iOS builds require macOS, Xcode and Apple signing. See [Packaging](docs/PACKAGING.md) and [Mobile](docs/MOBILE.md).

The managed web deployment is private to its owner by default and may require the hosting provider's sign-in. Packaged apps and local-network play do not require a Knightfall account. A private hosted website is not a public multiplayer server.

## Play with a friend on the same Wi-Fi

One computer hosts the game; the other player can use a phone, tablet or computer.

1. Connect both devices to the same normal Wi-Fi network.
2. On Windows, open **Play with friends → Create a room**, choose your name, side and time control, then click **Create Wi-Fi room**. The desktop app starts the local host automatically.
3. Share the displayed local address, such as `http://192.168.1.20:8787`, and the six-character room code. Share the LAN address, not `localhost` or `127.0.0.1`.
4. On the other device, open that address in a browser, choose **Play with friends → Join a room**, and enter the code. The Android app can join directly by entering the host address and code.
5. Keep the host computer awake and Knightfall open. Allow the host through the private-network firewall if the operating system asks.

A computer running the source can host with `npm run lan` instead of the Windows app. The default port is `8787`; use the addresses printed by the server.

The host validates all moves and owns the clocks. Clocks start when the second player joins and continue during a disconnection. Reconnection and saved-seat resumption are supported; keep the same browser tab and host address. Draw offers, resignation and mutually accepted rematches are available. Rematches swap colors.

Rooms exist in host memory and end when the host stops. Guest Wi-Fi or device isolation can block local connections. A hosted HTTPS page cannot usually connect directly to an insecure local WebSocket: use **Open local host** to open the host's HTTP app instead. Local multiplayer uses HTTP/WebSocket on a trusted network; it is not designed for router port forwarding or public internet hosting.

More details: [Same-Wi-Fi play](docs/LAN.md).

## What runs locally

- **Play:** 30 local bot opponents in 100-point steps, strength groups, name/Elo search and a Match my Elo shortcut, a shared-screen mode, clocks with increment, legal-move enforcement, promotion choice, takebacks in local play, hints, replay and results.
- **Game Review:** all saved games in a searchable, filterable library with separate White/Black accuracy after local analysis. Completed reviews survive restarts; changed move sequences need a fresh review. Accuracy is a local training estimate, with unavailable scores shown as a dash.
- **Chess Quiz:** 40 questions across rules, strategy, endgames and interactive checkmate positions. Quick-five and ten-question sessions, answer explanations, saved progress and missed-question retries.
- **Analysis:** Stockfish 17.1 Lite or optional Full NNUE in local workers, up to three principal variations, configurable depth limits, an evaluation bar and cancelable guided review. Review includes ten move classifications, early/middle/late-game summaries, both-side performance Elo ranges, an interactive evaluation graph, suggested-line previews and move retries. A clearly labeled lightweight JavaScript engine is available if Stockfish cannot load.
- **Local Elo:** a persistent practice rating, result history and trend graph for eligible completed games against local bots. It starts at 800 and stays provisional for the first 20 rated games. Games using hints, takebacks or live analysis while in progress are unrated, as are custom starting positions and fallback-engine play. Reviewing an already completed game does not change its recorded result. This device-local estimate is separate from online or official ratings and from a single game's review performance estimate.
- **Learning:** 60 curated tactics from the Lichess CC0 puzzle database; Tactics Sprint with 3-minute, 5-minute and untimed Survival modes; 28 opening primers (including Wittythealien’s Alien Gambit); ten interactive beginner challenges, nine short lessons; and 15 endgame drills, including four draw-defense exercises.
- **Study tools:** a position editor, custom-position bot/shared-screen play, PGN/FEN import, PGN export with plain-text position notes, a searchable local game archive with resume controls, and JSON backup/restore.
- **Personalization:** An Alien Gambit Easter egg adds small alien eyes to the regular pieces and plays the supplied short celebration once; disable the Easter egg or its sound independently in Settings. Sage, Walnut and Ocean boards; sound, coordinates and legal-move hints; a local display name; keyboard and touch controls. Piece movement, captures, castling and promotions animate while leaving move input responsive; reduced-motion preferences disable automatic piece travel and fades.

Bot difficulty descriptions are training estimates, not calibrated online ratings. Sprout and Scout combine local engine suggestions with beginner-oriented move policies; higher levels use the engine's chosen move. Opening creator references are educational, not official celebrity bots. The Botez Gambit and Bongcloud are explicitly identified as memes; the Cow Opening is a system rather than a gambit.

Tactics Sprint gives you three lives and one point for each complete puzzle sequence. A wrong legal move costs a life; the timed modes keep running during feedback and background tabs. The fixed 60-puzzle course becomes harder as you progress. Finish a run to see solved/missed/unfinished positions and study them in the normal puzzle view. Personal bests stay on this device; leaving the Sprint page abandons the active run.

Endgame starting positions were checked against exact tablebases during content preparation. The app does **not** download or query tablebases while you practice: its opponent is the local engine, which may choose different defenses.

## Privacy, saved games and offline use

Positions and analysis requests stay on the device. The application does not include analytics, advertising, cloud game uploads, or cross-device account sync. Fonts, pieces and engine assets are served with the app. Opening an optional source/reference link visits that external website in the normal way.

When a public release repository is configured, the desktop app checks GitHub for a newer stable version at startup and offers a manual check in Settings. Download actions open the validated release link only after you choose; they do not run or install a new app. An unconfigured or private repository does not provide automatic public release checks. See [GitHub releases and updates](docs/GITHUB.md).

The web version needs an initial online load. Keep it open long enough for the full app and engine cache to finish. PWA installation requires HTTPS or a supported localhost origin; a plain HTTP LAN address is for local multiplayer and does not provide the same install/offline guarantees. Native Windows and Android packages already contain the runtime assets. A Wi-Fi game still needs a live network and host even when internet access is unavailable.

Saved games and preferences belong to the current browser origin or native app profile. Clearing site/app data, private browsing, uninstalling, storage eviction, or changing to another host address can remove or hide that data. The archive keeps up to 200 recently saved games. Reloaded casual games pause until **Resume saved game** is selected. Bot and shared-screen games also pause when you browse another section inside the app; unfinished games can be resumed from **Game Review**. LAN clocks remain controlled by the host and do not pause when you browse; leaving an active room requires confirmation and ends that game as a loss.

Review summaries are kept for up to 200 games; detailed move annotations are cached for the latest twelve reviews, within a bounded storage budget. Older games can be reviewed again locally.

The JSON backup includes saved games, the Local Elo ledger, board/profile settings and unassisted puzzle progress. Review caches, quiz sessions/results, beginner-course progress, opening bookmarks, lesson-completion markers, endgame practice markers and Tactics Sprint personal bests are separate local records and are not included in that backup. Export individual games as PGN for a portable chess record. Save a study note before switching to another position; notes and annotation symbols travel as plain-text PGN comments.

## Run from source

Use **Node.js 24 LTS** and npm. Node 22.15 or newer also supports the test runner's module hooks. Native packaging has additional requirements below.

```sh
npm ci
node scripts/prepare-engine.mjs
npm run dev
```

Open the URL printed by Vite. The development server is for UI development; offline caching is generated for the production build.

To build and serve the production app with the local multiplayer host:

```sh
npm run build
npm run lan
```

To inspect only the built frontend, use `npm run preview`. To open the desktop wrapper from source, build first and run `npm run desktop`.

### Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the versions in `package-lock.json` |
| `node scripts/prepare-engine.mjs` | Copy the matching Stockfish 17.1 Lite and Full workers/WASM and engine notices into `public/engine/` |
| `npm run dev` | Run the Vite development server |
| `npm test` | Run the automated chess, engine, UI, storage, PWA and LAN checks |
| `npm run build` | Type-check, build Vite output and generate the offline asset manifest |
| `npm run preview` | Serve the built frontend for inspection |
| `npm run lan` | Serve `dist/` and host local WebSocket games |
| `npm run desktop` | Open the Electron wrapper using the existing `dist/` |
| `npm run package:windows` | Package the existing web build as a Windows x64 portable EXE |
| `npm run package:android` | Build the web app, synchronize Android assets and assemble a debug APK |

Run `prepare-engine.mjs` after a fresh dependency installation or an intentional engine change. The script rejects a mismatched engine version because the included corresponding-source bundle must match the shipped engine.

### Windows packaging

```sh
npm run build
npm run package:windows
node scripts/package-verify.mjs
```

The packaging script writes the EXE, `SHA256SUMS.txt` and build metadata under `artifacts/windows/`. It can cross-build the unsigned portable target from Linux. The app uses a sandboxed renderer and a restricted preload bridge; a LAN listener starts when the user creates a room.

On a machine with a desktop session, this command exercises the real Electron renderer and trusted LAN bridge:

```sh
npx electron . --smoke-test
```

Add `--smoke-game` to also play `1.e4` through the normal UI and verify a legal reply from the actual Stockfish WASM worker:

```sh
npx electron . --smoke-test --smoke-game
```

A successful Linux Electron smoke test does not establish Windows-device compatibility. See [Packaging](docs/PACKAGING.md) for the verification boundaries and release-signing considerations.

### Android and iOS

Android builds require **JDK 21**, Android SDK platform **35**, and build-tools **35.0.0**. Set `JAVA_HOME` and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) for your installation.

```sh
npm run package:android
```

If `dist/` is already the current tested build, use `npm run package:android -- --skip-web-build`. Android exports use the system Save dialog. The app targets Android 6.0 or newer; an up-to-date Android System WebView is recommended.

On macOS, prepare the native iOS project with:

```sh
npm run build
npx cap sync ios
npx cap open ios
```

Select an Apple development team in Xcode and run or archive the app. The bundle ID is `studio.knightfall.chess`. The checked-in project is not a signed installer. See [Mobile](docs/MOBILE.md) for signing, local-network behavior and installation instructions.

The included [release workflow](.github/workflows/build-release.yml) can build and publish GitHub release artifacts on demand or for version tags. Its Android release job requires a configured stable signing identity; local Android builds still use a debug key. The separate [CI workflow](.github/workflows/ci.yml) runs repository checks. Neither workflow publishes to app stores or deploys the website. See [GitHub releases and updates](docs/GITHUB.md) for configuration.

## Development map

| Area | Location |
| --- | --- |
| Application navigation and game flows | `src/App.tsx` |
| Board, analysis, editor and learning views | `src/components/` |
| Chess history, PGN, clocks and persistence | `src/lib/game.ts`, `src/lib/clock.ts`, `src/lib/storage.ts` |
| Local UCI client, fallback and bot policies | `src/lib/engine.ts`, `src/lib/engine-fallback.ts`, `src/lib/bot-policy.ts` |
| Review scoring, variations and local ratings | `src/lib/review.ts`, `src/lib/exploration.ts`, `src/lib/ratings.ts` |
| Board motion and drag transitions | `src/lib/board-motion.ts`, `src/lib/board-animator.ts` |
| Openings, lessons, puzzles and verified endgames | `src/data/` |
| Authoritative HTTP/WebSocket room server | `server/index.mjs` |
| Desktop main process, preload and packaging config | `desktop/` |
| Capacitor native projects | `android/`, `ios/`, `capacitor.config.ts` |
| Service worker, bundled assets and licenses | `public/` |
| Build helpers and regression tests | `scripts/`, `tests/` |

The frontend is a static Vite build. The optional Node server handles LAN play; a static web deployment alone does not add internet matchmaking. When hosting `dist/`, preserve relative asset paths, serve `.wasm` with the correct MIME type, and use HTTPS for installable PWA behavior. The managed deployment configuration lives in `.openai/hosting.json` and preserves the site's private audience.

### Validation

Run `npm test` and `npm run build` after changes. The suite includes real bundled Stockfish execution, a browser-worker loading harness, chess legality and special-move checks, React/jsdom interaction tests, actual HTTP/WebSocket room tests, storage validation and service-worker lifecycle tests. The worker harness is not a substitute for full browser or physical-device testing.

For native changes, also run the relevant packaging verification and test the produced app on its target platform. Android compilation is not the same as a phone/emulator acceptance test. Before distributing a signed release, check move input, promotion, local engine startup, file export, offline launch and a two-device LAN game on the actual target devices.

## Scope and current limitations

Knightfall is a local chess product, not a replacement for an online chess network. It does not include public matchmaking, accounts, a public rated ladder, tournaments, cloud synchronization, fair-play monitoring, streaming, subscriptions or app-store publication.

Analysis quality depends on device speed and search time. The Lite engine is single-threaded; move classifications and game-review quality percentages are local training heuristics, not an official accuracy score. Estimated performance requires enough eligible decisions against a known local bot and is separate from the result-based Local Elo ledger. A depth setting is a limit, not a promise that every search reaches it. The fallback is substantially weaker than Stockfish. See [Local move review](docs/REVIEW.md) for the rules and evidence limits.

PGN support is for a single main-line game with plain-text comments. Analysis exploration keeps the original game intact, but its temporary lines are not a saved branching variation tree or part of the original game's PGN export. FEN validation rejects common impossible states but does not prove complete historical reachability. Draw rules are applied automatically for this casual format rather than using tournament claim procedures. Keep timed mobile games in the foreground because operating systems may suspend background web views.

## License and credits

The application source is **GPL-3.0-or-later**; see [LICENSE](LICENSE). Stockfish's matching source, license and neural-network data are included under `public/engine/`. Distribute the corresponding application/engine source and notices with binaries as required by their licenses.

See [Third-party notices](docs/THIRD-PARTY.md) for Stockfish, chess.js, React, Electron, Capacitor, Lucide, the Cburnett pieces, locally bundled fonts and Lichess CC0 puzzle data. [Engine details](docs/ENGINE.md) document the exact engine build and its local fallback.

### Learning modes (1.5)

Learn chess offers single-move basics, a step-by-step Italian opening with teaching-bot replies, and free practice against a local beginner bot. Pause replies, request hints, take back a turn, or start again. These sessions are untimed and unrated.

Performance Elo is now conservative and rating-context aware; it is withheld where the game cannot support a number. See [review methodology](docs/REVIEW.md).

Opening detail screens also offer **Train with bot**: choose either color, follow the line with automatic teaching-bot replies, then continue freely against the local engine. Version 1.5.1 fixes stale alien-token artwork after desktop upgrades by using a distinct path for alien-eye pieces. No app-data reset is needed.
