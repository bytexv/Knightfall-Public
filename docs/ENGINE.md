# Local chess analysis

Knightfall offers Stockfish.js 17.1 Lite (the default) and **Full NNUE** in Settings → Local engine. Every search runs on the player's device; positions are never sent to an analysis service.

Lite uses the roughly 7 MB single-threaded build. Full uses the larger Stockfish neural networks and about 75 MB of model/WASM assets per architecture. The Windows and mobile packages include both full architectures; the web downloads the applicable one on first use and caches it when browser storage permits. Full assets are excluded from the required offline-shell download, so installing the PWA does not silently download 150 MB. Full needs considerably more memory; Lite is a useful choice on phones or for battery life.

Full uses up to 1, 2, or 4 CPU cores where cross-origin isolation and SharedArrayBuffer are available, bounded by reported hardware concurrency. The desktop host supplies COOP/COEP headers. Browsers and mobile WebViews without isolation use the full single-thread build instead. This is still the full neural network. Analysis budgets range from 0.65 to 15 seconds per position; maximum-strength bot budgets range from 1.5 to 15 seconds. Longer searches do not guarantee perfect play.

If the selected Stockfish build cannot start, Knightfall explicitly labels its lightweight JavaScript fallback. Native packages work without an engine download. Offline web use requires the relevant assets to have been cached successfully; an installed Lite shell does not guarantee that optional full models are cached.

Both builds preserve upstream bytes and names. `public/engine/stockfish-source.tgz` contains Lite corresponding source. `vendor/stockfish-full-source.tgz` in the public repository and matching source release contains the original source, build scripts, Lite network, and both full networks. See `public/engine/FULL-SOURCE.txt` for the exact upstream commit and SHA-256 hashes.

## Scores and suggested moves

`EngineResult.score` and every line's `score` are centipawns from **White's point
of view**, regardless of whose turn it is. `100` is approximately one pawn for
White; `-100` favors Black. This is an evaluation, not a winning probability.

`mate` is present only for a reported mate. A positive value is a forced mate for
White; a negative value favors Black. Its magnitude is the UCI mate distance in
moves. `mate: 0` means the supplied position is already checkmate; check the field
with `mate !== undefined`, not a truthiness test. Mate scores use a centipawn
sentinel of ±10,000 so the evaluation bar can remain bounded.

`bestMove` and principal variations use UCI coordinates, for example `e2e4` or
`e7e8n`. Promotion letters are significant. Terminal positions have
`bestMove: null`. Each suggested move is validated with chess.js before it reaches
the board. Principal variations can be formatted as SAN using the position they
were searched from, not the current board if it has since changed.

The requested depth is a **maximum**, not a promised depth. Searches also have a
time budget. The reported `depth` is the depth actually completed, and depends on
the position and device. Multiple variations divide the available search time.
Short searches and the Lite network can miss tactics. Game-review quality labels
are local estimates and are not official ratings, Elo, or commercial accuracy
scores.

## Engine lifecycle

```ts
const engine = new LocalEngine({
  onStatus(status, name) { /* update status text */ },
});

const result = await engine.analyze(fen, {
  depth: 18,
  movetime: 1200,
  multiPV: 3,
  skill: 20,
});

engine.cancel();  // rejects queued/active promises with AbortError
engine.destroy(); // releases workers and timers when the view unmounts
```

Calls to `analyze` queue in order. For a changing analysis board, cancel the old
request before starting the new one and disregard cancelled callbacks. An active
Stockfish search is stopped and its final `bestmove` message is drained before a
new position starts; this prevents stale moves leaking between positions.

Use a separate engine instance for a batch game review if live board analysis
remains mounted. A React effect cleanup that cancels live analysis must not also
cancel a newly started review. Invalidate the review when its game is replaced,
and always release the instance when the component unmounts.

## Memory and idle workers

The bundled Stockfish build exposes a **128 MiB WebAssembly linear memory per
initialized worker**. This is the memory reservation measured from the actual
browser code path, not a claim that every page is resident in RAM on every device.
The hash table defaults to 16 MiB. Lowering Hash does not shrink the build's fixed
initial linear memory.

An instance releases its unused worker after 15 seconds and starts it again
lazily on the next analysis. Starting a third instance evicts an idle warm worker
when one is available. After overlapping searches finish, excess idle workers
are released immediately. Active and queued work is preserved; this is a target
of two warm workers, not a hard concurrency limit that interrupts searches.
This prevents bot, hint, live-analysis, and review workers from all remaining
allocated when the user is no longer using them.

`new LocalEngine({ hashMb: 16, idleTimeoutMs: 15_000 })` makes those defaults
explicit. Hash is bounded to 4–64 MiB. An idle timeout of zero disables the timer,
but idle workers can still be evicted to make room for another instance. Callers
may keep the same `LocalEngine` object after its status returns to `idle`; normal
`analyze` calls restart it safely. Old worker callbacks cannot populate the new
search. `destroy()` rejects pending startup/search promises with `AbortError` and
clears the worker, callbacks, timers, and shared warm-worker registration.

For reproducible profiling and policy matches:

```sh
node --import tsx --expose-gc scripts/benchmark-engine.mjs --mode=all --profile=fixed --rounds=2 --output=artifacts/qa/engine-fixed.json
node --import tsx scripts/benchmark-engine.mjs --mode=matches --profile=production --rounds=2 --output=artifacts/qa/engine-production.json
```

The fixed profile isolates move-selection policy at depth 8 and skill 20. The
production profile uses the shipped 160/250/400 ms budgets and skill levels for
Sprout, Scout, and Sage. Both use seeded policy randomness and paired colors;
Stockfish's production skill randomness and time-limited searches are not promised
to be bit-for-bit reproducible across hardware. The script saves individual PGNs
beside its JSON report, checks every move/material transition, and distinguishes
real terminal results from unfinished games stopped at the ply limit. These small
matches diagnose behavior; they are not Elo calibration.

The reference production run (seed `20261111`, two paired-color rounds) finished
all 12 games by checkmate: 704 legal plies, seven promotions, and no crashes,
unfinished games, or repetition loops. Sprout won 0 of its 8 games, Scout won 4 of
8, and Sage won 8 of 8. Their selections matched their own engine suggestions
30.4%, 69.8%, and 100% of the time respectively. This small sample confirms the
intended relative difficulty without assigning ratings. A separate fixed-depth
12-game run reproduced all 12 PGNs exactly when repeated with the same seed.

The lifecycle profile requested four simultaneous instances, retained two warm
workers after the searches, then measured zero live workers after the idle delay
and zero after destruction. Fresh Node-process samples at Hash 8, 16, and 32 MiB
reported approximately 174, 174, and 190 MiB total RSS respectively, including Node
itself. Those process figures are diagnostic measurements, not device RAM
requirements; the exact common WASM linear-memory size remained 128 MiB.

Difficulty uses Stockfish's local `Skill Level` setting from 0 to 20. It deliberately
selects weaker moves at low levels. Sprout and Scout additionally apply
`chooseBotMove`: they blend the engine choice with shallow positional ideas and
occasional exploratory moves, so the beginner levels make understandable mistakes
instead of relying on a still-strong low Stockfish setting alone. All choices come
from legal move generation. They recognize mate-in-one and never ignore check by
playing an illegal move. Higher levels preserve the engine move unchanged.
Displayed difficulty descriptions are approximate; no internet rating calibration
is implied. `seededBotRandom` can make the policy reproducible for tests.

## Fallback and failures

If WebAssembly, asset loading, or Stockfish initialization fails, the app switches
to **Knightfall Lite**, a smaller local JavaScript engine. It uses iterative
deepening, alpha-beta search, capture quiescence, and material/positional scoring.
It runs in a dedicated worker when available. Its label is deliberately distinct:
it is much weaker than Stockfish and should not be used for serious analysis.

On older runtimes without workers, the fallback uses a short bounded search on
the main thread. Search deadlines and cancellation prevent a failed worker from
blocking later requests indefinitely. Invalid FEN is rejected before a worker is
started. An engine that has been destroyed cannot accept further work.

Before starting WebAssembly, `validatedPosition` also rejects basic impossible
FEN states that a syntax-only parser can accept: touching kings, the previous
side's king still in check, castling rights without the original king/rook,
impossible en-passant targets, and excess pieces or pawns. This is not a complete
proof that a position can be reached from the initial array. A FEN does not encode
repetition history; the game layer tracks repetition from the full move list.

## Licensing and reproducibility

Stockfish.js and its Stockfish base are GPL-3.0. The unmodified JavaScript and WASM
come from `stockfish@17.1.0`, npm git commit
`602fd7e1a571a2be71f242942db90483731f2a1f`. They are renamed together to
`stockfish.js` and `stockfish.wasm`; their bytes are unchanged.

The app includes [the license](../public/engine/COPYING.txt),
[authors](../public/engine/AUTHORS.txt), and
[source instructions](../public/engine/SOURCE.txt), plus a
[corresponding-source archive](../public/engine/stockfish-source.tgz). That
archive preserves the source and build scripts, omits the precompiled outputs,
and includes the lite NNUE network with its verified hash. The matching complete upstream
source is available at:

https://github.com/nmrugg/stockfish.js/archive/602fd7e1a571a2be71f242942db90483731f2a1f.tar.gz

Run `node scripts/prepare-engine.mjs` after dependency installation to reproduce
the runtime assets and notices. Tests cover real Stockfish UCI searches, both
color score directions, mate, queued requests, cancellation, terminal positions,
and fallback behavior. A Node worker sandbox also exercises Stockfish's browser
code path and relative WASM loading; this is not a substitute for visual browser
or physical-device testing.
