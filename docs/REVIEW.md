# Local move review

Knightfall's move labels and percentages are local training heuristics. They are not chess.com's classification algorithm, an official accuracy metric, or a calibrated rating measurement. The engine searches on the device; the review has no external analysis service.

## Game Review library (1.7)

Game Review lists every game still in the device's archive, up to 200 saved games, with search, status filters, date/accuracy sorting and pagination. White and Black accuracy are the same per-color quality calculation used in the review summary below. Unreviewed games say “Not reviewed”; a dash means the review has no sufficiently evaluated independent decisions for that side. The average uses the saved player color and only games with an available score.

Review starts local analysis directly from a game row. A complete review persists its summary; the latest twelve detailed reviews are also cached within a 1.5-million-character budget. Reopening a cached game restores its move classifications and suggested lines. Older detailed results can be recalculated; their accuracy summaries remain. A changed starting position or move sequence invalidates the previous review even if the number of moves is unchanged. Partial or interrupted reviews do not become completed archive scores. Existing game modes, results and clocks are retained when reviewing an unchanged record.

These caches are local to the app/browser and are currently separate from the JSON game backup. Storage failures are reported in the review panel. Export games as PGN or a backup so they can be reviewed again if device data is removed.

## Move classifications

Scores use White's perspective internally. Loss is converted to the moving player's perspective, with evaluations bounded to ±15 pawns to keep forced-mate sentinels from producing enormous losses. The engine's preferred move is not penalized when consecutive short searches disagree. Keeping a forced mate for the same side does not lose evaluation merely because the mate distance changes.

| Label | Local rule |
| --- | --- |
| Brilliant | The preferred move offers material, the best reply actually captures that piece, and the net loss after acceptance is at least 2 pawns compared with the original position. Both native Stockfish searches and their relevant lines reach depth 14. A legal continuation retains at least a near-balanced evaluation or a forced mate for the player. There must be more than one legal move. |
| Great | The preferred move has a sound evaluation, but the second MultiPV candidate is at least 1.8 pawns worse and no better than +0.8 for the player. Both candidates reach depth 14 at similar depths. Choosing between two overwhelming wins does not qualify. |
| Best | The engine's preferred move, unless a more specific category applies. |
| Excellent | An alternative losing at most 0.15 pawns in the search. |
| Good | An alternative losing less than 0.50 pawns. |
| Book | The exact move prefix appears in the included opening library, from the standard initial position, without a material evaluation loss. The Botez blunder example and Bongcloud meme line are excluded. This does not recognize all chess opening theory or transpositions. |
| Inaccuracy | Loss from 0.50 to under 1 pawn. |
| Mistake | Loss from 1 to under 2.2 pawns. |
| Miss | A previously found forced mate is no longer found, or a depth-14 search's winning advantage of at least 3 pawns falls below 1 pawn. Allowing a new forced mate against the player is a Blunder. |
| Blunder | Loss of at least 2.2 pawns, or allowing a new forced mate. |

Brilliant is intentionally uncommon. Equal-value exchanges, promotions, forced only-legal replies, an unaccepted hanging piece, a one-move continuation, and weak or shallow searches cannot satisfy the sacrifice rule. A sound exchange sacrifice of rook for knight may fall below the 2-pawn net-material threshold and receive Great or Best instead. This conservative false-negative tradeoff avoids awarding brilliance from an unsupported guess.

Depth below 10, or the lightweight fallback engine, receives a limited-confidence notice. Special Brilliant and Great labels require native Stockfish at depth 14. Depth alone is not proof that a position is solved. Principal variations are replayed as legal moves before displaying SAN, and an invalid suffix is discarded.

## Quality and estimated performance

Per-color quality uses independent, sufficiently searched decisions. Book moves, only-legal moves, shallow/fallback searches, and positions already evaluated as forced mate are excluded from the performance sample. So are positions already at least 5 pawns worse or 10 pawns better for the player, where obvious cleanup moves can distort a skill estimate. Each eligible move contributes `100 × exp(−min(loss, 1000) / 200)`, where loss is in centipawns. Their mean, rounded to an integer, is the displayed 0–100 training quality index. Category counts still include all reviewed moves.

A preliminary precision band needs at least 8 eligible moves. Its 0–100 range is a deliberately broad display allowance, not a statistical confidence interval. Fewer decisions show the available review results without inventing a performance band.

An **Estimated performance Elo** range requires a finished standard-start game, a complete review, and at least 12 eligible decisions for that side. Both pre-game ratings must be known: a recorded local-rated game uses its historical ledger entry (never the viewer's current rating), while an imported PGN can supply `WhiteElo` and `BlackElo`. Unknown ratings, assistance, fallback-engine play, clock-expiry results and custom starting positions withhold the estimate. PGN ratings are user-supplied and not externally verified.

The calculation is a conservative, result-based local estimate; move quality is **not converted to Elo**:

1. Compute expected score `p0 = 1 / (1 + 10^((opponent − own) / 400))` from pre-game references.
2. Let `w = eligible_decisions / (eligible_decisions + 24)` and observed score `s` be 0, 0.5 or 1.
3. Shrink the single result toward that prior: `p = (4 × p0 + w × s) / (4 + w)`.
4. Convert to `opponent + 400 × log10(p / (1 − p))`, cap the movement to ±200 from the own reference, round to 25, and bound to 100–3200.
5. Display a broad ±550 allowance while provisional or imported, ±350 after 20 prior local-rated games. These are heuristic allowances, **not calibrated confidence intervals**.

Easy perfect moves cannot create a master rating; losing to the strongest bot cannot raise a beginner to its level. Both sides use the same calculation with their own references and scores. This does not measure playing strength independently of the rating history, change the Local Elo ledger, or predict Chess.com/FIDE ratings. Bot difficulty numbers remain uncalibrated training estimates. Empirical calibration against a rated game corpus is still needed before claiming accuracy on any external rating scale.

## Validation

The unit fixtures in `tests/fixtures/review-stockfish.json` record the actual bundled Stockfish 17.1 Lite engine at depth 18 with three principal variations. They include sound queen, rook, bishop, and exchange sacrifices for both colors. The positions are from the CC0 Lichess puzzle database. Tests also cover equal-value trades, only-legal replies, illegal/short principal variations, shallow/fallback searches, White/Black score directions, mates, recognized opening prefixes, and insufficient performance samples.

## Phase summary and both-side performance estimates (1.4)

The completed review opens an interactive summary with Move totals and Early · middle · late views. Each phase shows both sides' classification totals and move quality, and a link to its largest evaluated loss when at least 50 centipawns. Phases advance monotonically: opening until move 10, middlegame afterward or with reduced material (phase weight ≤16), endgame at phase weight ≤8. Weights are knight/bishop 1, rook 2, queen 4 across both armies; kings and pawns contribute zero. Imported endgames therefore start in the endgame phase. These are practical teaching boundaries, not a universal definition of game phases.

Since 1.5, both sides use the context-aware method above. Small or unreliable samples show “Not enough evidence”; sufficient samples without eligible rating context show “Rating unavailable.” Move-quality percentages and classification totals remain available independently of Elo.
