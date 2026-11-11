# Local clocks

`src/lib/clock.ts` contains the shared rules for browser-local and bot games.
Only a started, unfinished `local` or `bot` game with a positive finite base time
is timed. Analysis, opening rehearsal, puzzles, and untimed games do not tick.
Wi-Fi games use the host's authoritative clock instead.

`advanceClock(game, elapsedMs)` is immutable and does not read time itself. It
deducts finite, nonnegative elapsed milliseconds from the side to move, preserves
fractional milliseconds, clamps at zero, and returns a result when time expires.
The move function applies increment separately, once, after the clock has been
settled. A move cannot add increment after its player's clock has already expired.

At timeout, the prospective winner must have mating material. A bare king does
not win on time against a rook. A lone minor piece against a bare king also cannot
win; two knights may win because a mating position is possible with cooperation.
The material test matches the Wi-Fi host's policy. It is a material rule, not a
general proof that every unusual blocked position permits checkmate.

## UI integration

Keep one timestamp anchor for the current game. A display interval should settle
the elapsed time against the current snapshot and move that anchor forward. It
must not assign the whole interval to a side that changed partway through it.

Settle the clock immediately **before** a human move, a bot move, a takeback,
resignation/draw, or saving/replacing the current game. Apply the operation to the
settled snapshot. Reset the anchor when starting, replacing, or resuming a game.
For example, when White moves at 150 ms and the display ticks at 200 ms, White
owes 150 ms and Black owes 50 ms.

An imperative `gameRef` can provide the current snapshot between React renders.
Update it along with the committed React state. Keep timestamp/ref mutation out
of React state-updater functions, which development StrictMode may call twice.
Using a monotonic timestamp avoids ordinary wall-clock corrections; delayed
intervals must deduct their actual elapsed duration rather than a fixed 200 ms.

The tests cover side switches within an interval, exact timeout, delayed ticks,
increment timing, takebacks, non-timed modes, invalid elapsed values, and timeout
material parity with the LAN host.
