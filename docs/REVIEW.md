# Local move review

Knightfall's move labels and percentages are local training heuristics. They are not chess.com's classification algorithm, an official accuracy metric, or a calibrated rating measurement. The engine searches on the device; the review has no external analysis service.

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

An **Estimated performance** Elo-style range is available only for the human side against a known local bot difficulty, with at least 12 eligible moves. Imported games and unknown opponents do not get a guessed Elo number. The transparent, uncalibrated mapping is:

1. Start with the local bot's catalog difficulty estimate.
2. Add `12 × (quality − 75)`, capped to ±300.
3. Apply a quality ceiling of `100 + 28 × quality`. This prevents poor play against a very strong bot from automatically receiving an expert estimate.
4. Round the center to 25 points and bound it to 100–3200.
5. Show a broad ±300 range, clipped to the same bounds.

This range is a local training estimate, **not an official rating**, not a prediction of online performance, and not an update to the separate local rating ledger. Bot catalog numbers themselves are training estimates. Opponent strength, search depth, sample size, and game complexity limit how much can be inferred from a single game.

## Validation

The unit fixtures in `tests/fixtures/review-stockfish.json` record the actual bundled Stockfish 17.1 Lite engine at depth 18 with three principal variations. They include sound queen, rook, bishop, and exchange sacrifices for both colors. The positions are from the CC0 Lichess puzzle database. Tests also cover equal-value trades, only-legal replies, illegal/short principal variations, shallow/fallback searches, White/Black score directions, mates, recognized opening prefixes, and insufficient performance samples.
