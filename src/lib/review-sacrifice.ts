import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import type { EngineResult } from "./engine";
import type { MoveRecord } from "./game";

const values: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};
function material(chess: Chess, color: Color): number {
  return chess
    .board()
    .flat()
    .reduce(
      (sum, piece) =>
        sum +
        (piece ? values[piece.type] * (piece.color === color ? 1 : -1) : 0),
      0,
    );
}
/**
 * Deliberately narrow: the best reply must actually accept the moved piece,
 * losing >=2 pawns net versus the starting position. Equal trades, promotions,
 * forced replies and vague hanging-piece guesses are not brilliance.
 * Caller additionally requires a deep native-engine preferred move.
 */
export function soundSacrifice(
  move: MoveRecord,
  after: EngineResult,
): { materialLoss: number } | null {
  try {
    if (move.promotion || after.depth < 14) return null;
    const direction = move.color === "w" ? 1 : -1;
    if (
      after.score * direction < -30 ||
      (after.mate !== undefined && after.score * direction <= 0)
    )
      return null;
    const initial = new Chess(move.before);
    if (initial.moves().length < 2) return null;
    const moved = initial.get(move.from as Square);
    if (!moved || values[moved.type] < 300) return null;
    const baseline = material(initial, move.color);
    const line = after.lines.find(
      (line) =>
        line.multipv === 1 && line.pv[0] === after.bestMove && line.depth >= 14,
    );
    if (!line) return null;
    const chess = new Chess(move.fen);
    let loss = 0,
      plies = 0;
    for (const uci of line.pv.slice(0, 8)) {
      const reply = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      plies++;
      if (plies === 1) {
        if (!reply.captured || reply.to !== move.to) return null;
        loss = baseline - material(chess, move.color);
        if (loss < 200) return null;
      }
      if (chess.isCheckmate())
        return chess.turn() !== move.color ? { materialLoss: loss } : null;
    }
    // Require a real multi-ply continuation, not a one-ply claim of safety.
    return plies >= 4 ? { materialLoss: loss } : null;
  } catch {
    return null;
  }
}
