# Knightfall feature inventory

This inventory describes the implemented application and distinguishes its local capabilities from services that are not included. Build and installation instructions are in the [README](../README.md).

## Play

| Feature | Behavior |
| --- | --- |
| Local bots | Sprout, Scout, Sage, Rook, Nova and Stockfish; six training difficulty settings |
| Beginner behavior | Sprout and Scout mix engine choices with legal, beginner-oriented positional and exploratory moves |
| Shared-screen chess | Two players alternate on one board with independent clocks |
| Custom-position play | Start a bot or shared-screen game from the current Analysis FEN; untimed is the default |
| Time controls | Bullet, blitz, rapid and untimed presets; supported presets include increment |
| Rules | Legal moves, check, checkmate, stalemate, castling, en passant and all four promotion choices |
| Game endings | Resignation, agreed local draws, common automatic draws and timeout handling |
| Board input | Click/tap, drag, keyboard square navigation, promotion selection and board flipping |
| Training help | Legal-move dots, local hints and takebacks in casual local play |
| Replay | Move list and first/previous/next/last navigation |
| Board annotations | Temporary right-drag arrows and right-click square marks; Shift/Alt select alternate arrow colors; Escape clears them |
| Focus view | A board-focused layout available from the board toolbar |
| Persistence | Local games saved on the device; unfinished bot/shared-screen games can be resumed from My games |
| Casual-game pause | Bot/shared-screen play pauses when browsing another app section or reloading; LAN clocks continue on the host |

Difficulty labels are not calibrated Elo ratings. Two people playing on the same screen should agree before accepting a draw. Hints and takebacks are disabled in Wi-Fi games.

## Local analysis and study

- Stockfish 17.1 Lite JavaScript/WASM, single-threaded, running on the device.
- A separately named Knightfall Lite fallback if the Stockfish worker cannot initialize.
- White-relative evaluation, mate scores and up to three suggested variations.
- Depth limits with bounded search time; actual completed depth is displayed.
- Cancelable full-game review, partial progress, an evaluation chart and move-quality estimates.
- Separate live-analysis and review workers, with stale results invalidated when positions or game lines change.
- Selected-move explanations and links back to the position before an alternative move.
- PGN or FEN import and PGN export, including comments and player names.
- Position-specific study notes, plain-text annotation symbols and explicit note saving.
- Branching from an earlier position by replacing the current study's continuation.
- A board editor with a piece palette, erase/clear/reset, side to move, castling rights, en-passant square and move counters.
- Basic position-validity checks before analysis; FEN copying for reuse elsewhere.

PGN import is bounded to one main-line game under 3 MB and at most 1,000 half-moves. Each note is bounded to 2,000 characters. Visual arrows and square marks are temporary and do not travel in PGN; saved text notes do. The app is not a persistent variation-tree editor, and a FEN does not contain repetition history. Review percentages and labels are short-search training estimates, not an official accuracy metric.

## Learning content

| Area | Included content | Practice behavior |
| --- | --- | --- |
| Tactics | 60 Lichess CC0 positions across 15 themes | Full solution sequences, automatic opponent replies, hints, reveal, theme selection and unassisted-solve progress |
| Tactics Sprint | The same 60-puzzle progressive course | 3-minute, 5-minute and untimed Survival modes; three lives; local personal bests and study recap |
| Opening lab | 27 opening primers | Search, category/level filters, saved openings, line replay and rehearsal |
| Short lessons | Nine lessons | Opening principles, blunder checks, tactics, calculation, gambit compensation, endgames, game review, clocks and special moves |
| Endgame school | 15 verified starting positions | Read the plan, inspect the board, reveal a first-move hint, then practice against a local bot |
| Draw defense | Four endgame drills | Opposition, rook-pawn corner defense, wrong-colored bishop and Philidor defense |
| Endgame technique | Eleven winning drills | Queen/rook/two-rook/bishop-pair/bishop-and-knight mates, key squares, passed pawns, races and Lucena |

Puzzle FENs already begin at the solver's turn. Their ratings are source-dataset snapshots, not ratings assigned to the user. Puzzle solution moves were checked for legality and independently cross-checked with Stockfish. Endgame starting results were checked against Syzygy tablebases during development; the app does not call a tablebase service during play.

Creator-associated content includes the Stafford, Vienna, Botez, Bongcloud and Cow openings. Associations are explained in context without endorsement claims. Meme openings are labeled honestly, and every primer explains both the idea and the cost or risk.

### Tactics Sprint

Choose **3 minutes**, **5 minutes**, or untimed **Survival**. Each run starts with three lives. Complete every move in a puzzle sequence to earn one point; a wrong legal move costs one life and pauses that position until **Continue** is selected. Timed modes keep counting during feedback and while the browser tab is in the background.

The 60 positions form a fixed course ordered by source puzzle rating. Opponent replies play automatically, and a run ends when time expires, all lives are used, the course is complete, or the player finishes it. The result recap lists solved, missed and unfinished positions; **Study** opens a position in normal puzzle practice. Mode-specific personal bests are stored locally. There are no hints, global ratings or server leaderboards in this mode. Leaving the Sprint page abandons the current run.

## Same-Wi-Fi multiplayer

- A Windows app or standalone Node process hosts the app and authoritative room server.
- Two players join with a local address and six-character room code.
- The host validates legal moves, turn order and results; clients cannot submit their own board state.
- Server-owned clocks with increment; clocks continue while a player is disconnected.
- Automatic reconnect attempts and saved-seat resumption within the same browser session.
- Resignation, draw offer/accept/decline and mutually accepted rematches with colors swapped.
- Bounded messages, room/client limits, origin checks and protected static-file serving.
- PGN export and local game archival for completed rounds.

There is no relay service or internet matchmaking. Rooms are memory-only and disappear when the host exits. A guest network or access-point isolation can prevent devices from connecting. Browser clients should open the local HTTP host rather than connect from the private hosted HTTPS site. See [LAN details](LAN.md).

## Platforms and offline behavior

| Capability | Web/PWA | Windows portable | Android APK | Native iOS project |
| --- | --- | --- | --- | --- |
| Board, local bots and learning | Yes | Yes | Yes | Shared implementation |
| Offline local play | After successful cache installation | Assets bundled | Assets bundled | Assets copied during build |
| Local Stockfish | Cached worker/WASM | Bundled worker/WASM | Bundled worker/WASM | Shared engine integration |
| Join a Wi-Fi game | Open the host's HTTP app | Direct local connection | Direct host address + code | Project configured for local-network access |
| Start a Wi-Fi host | Requires external Node/desktop host | Built in | No | No |
| Native binary supplied | Not applicable | Unsigned x64 EXE | Debug-signed APK | No signed IPA |

The native iOS project requires macOS, Xcode and signing before it can be installed as an app. Its presence is not a claim of a completed iPhone device test. Android packaging and Windows cross-packaging similarly do not replace testing the produced binaries on their target devices.

The PWA service worker installs the runtime assets atomically and uses content-based cache versions. It does not cache API responses or WebSocket traffic. Offline installation requires a suitable secure origin and sufficient browser storage. Native mobile builds use bundled assets rather than service-worker installation.

## Personalization and data

- Sage, Walnut and Ocean board themes.
- Move sounds, coordinates and legal-move hints can be toggled.
- A local display name; no account registration.
- A searchable archive of up to 200 recently saved games.
- PGN export; Android uses the system Save dialog.
- JSON backup/restore for games, settings and unassisted puzzle progress.
- Validated restoration of game histories, settings and puzzle IDs; corrupt saved entries are rejected or safely defaulted.
- Opening bookmarks, lesson completion, endgame practice markers and Tactics Sprint personal bests are saved separately on the device.

The JSON backup does not currently include those separate learning markers or Sprint personal bests. There is no cloud backup or cross-device sync. Clearing browser/app data or changing origins can remove access to local records. Export important games before deleting app data.

## Deliberately outside the current scope

Public accounts, internet matchmaking, rated competitions, a global leaderboard, tournaments, cloud game synchronization, fair-play monitoring, spectator broadcasts, paid memberships, app-store releases, code-signed Windows distribution and a signed native iOS installer are not provided.

Knightfall is intended for local play and learning. All bots, review labels and content associations are independent training features rather than claims of equivalence to a commercial chess platform.
