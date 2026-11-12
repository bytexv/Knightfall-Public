import { Chess, type Color, type Square } from "chess.js";
export interface Premove {
  from: string;
  to: string;
  promotion?: string;
}

/** Geometric candidates only: the opponent has not played yet. Legality is
 * checked against the real position at execution, including check and castling. */
export function premoveTargets(
  fen: string,
  from: string,
  color: Color,
): string[] {
  const game = new Chess(fen),
    piece = game.get(from as Square);
  if (!piece || piece.color !== color || game.turn() === color) return [];
  const x = from.charCodeAt(0) - 97,
    y = Number(from[1]) - 1;
  const targets: string[] = [];
  for (let nx = 0; nx < 8; nx++)
    for (let ny = 0; ny < 8; ny++) {
      const to = String.fromCharCode(97 + nx) + (ny + 1),
        dx = nx - x,
        dy = ny - y;
      if (to === from || game.get(to as Square)?.color === color) continue;
      const ax = Math.abs(dx),
        ay = Math.abs(dy),
        forward = color === "w" ? 1 : -1;
      const castle =
        piece.type === "k" &&
        from === (color === "w" ? "e1" : "e8") &&
        dy === 0 &&
        ax === 2 &&
        fen
          .split(" ")[2]
          .includes(color === "w" ? (dx > 0 ? "K" : "Q") : dx > 0 ? "k" : "q");
      if (
        (piece.type === "p" &&
          ((dy === forward && ax <= 1) ||
            (dx === 0 &&
              dy === 2 * forward &&
              y === (color === "w" ? 1 : 6)))) ||
        (piece.type === "n" && ax * ay === 2) ||
        (piece.type === "b" && ax === ay) ||
        (piece.type === "r" && (dx === 0 || dy === 0)) ||
        (piece.type === "q" && (dx === 0 || dy === 0 || ax === ay)) ||
        (piece.type === "k" && (Math.max(ax, ay) === 1 || castle))
      )
        targets.push(to);
    }
  return targets;
}
export function legalPremove(
  fen: string,
  color: Color,
  move: Premove,
): Premove | null {
  try {
    const game = new Chess(fen);
    if (
      game.turn() !== color ||
      game.isGameOver() ||
      game.get(move.from as Square)?.color !== color
    )
      return null;
    const played = game.move({ ...move, promotion: move.promotion || "q" });
    return {
      from: played.from,
      to: played.to,
      ...(played.promotion ? { promotion: played.promotion } : {}),
    };
  } catch {
    return null;
  }
}
