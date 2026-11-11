import { Chess, type Color, type PieceSymbol } from "chess.js";

export interface BoardPiece {
  color: Color;
  type: PieceSymbol;
}
export interface PieceMotion {
  from: string;
  to: string;
  before: BoardPiece;
  after: BoardPiece;
}
export interface PiecePresence {
  square: string;
  piece: BoardPiece;
}
export interface BoardTransition {
  kind: "move" | "reverse" | "replace" | "none";
  moves: PieceMotion[];
  removed: PiecePresence[];
  added: PiecePresence[];
}

const placement = (fen: string) => fen.split(" ").slice(0, 2).join(" ");
const piece = (color: Color, type: PieceSymbol): BoardPiece => ({
  color,
  type,
});

function forward(before: Chess, after: Chess): BoardTransition | null {
  const target = placement(after.fen());
  for (const candidate of before.moves({ verbose: true })) {
    const destination = after.get(candidate.to);
    const source = after.get(candidate.from);
    if (
      destination?.color !== candidate.color ||
      destination.type !== (candidate.promotion || candidate.piece)
    )
      continue;
    if (source?.color === candidate.color && source.type === candidate.piece)
      continue;
    before.move(candidate);
    const matches = placement(before.fen()) === target;
    before.undo();
    if (!matches) continue;
    const moves: PieceMotion[] = [
      {
        from: candidate.from,
        to: candidate.to,
        before: piece(candidate.color, candidate.piece),
        after: piece(candidate.color, candidate.promotion || candidate.piece),
      },
    ];
    if (candidate.isKingsideCastle() || candidate.isQueensideCastle()) {
      const rank = candidate.color === "w" ? "1" : "8";
      moves.push({
        from: `${candidate.isKingsideCastle() ? "h" : "a"}${rank}`,
        to: `${candidate.isKingsideCastle() ? "f" : "d"}${rank}`,
        before: piece(candidate.color, "r"),
        after: piece(candidate.color, "r"),
      });
    }
    const removed: PiecePresence[] = candidate.captured
      ? [
          {
            square: candidate.isEnPassant()
              ? `${candidate.to[0]}${candidate.from[1]}`
              : candidate.to,
            piece: piece(
              candidate.color === "w" ? "b" : "w",
              candidate.captured,
            ),
          },
        ]
      : [];
    return { kind: "move", moves, removed, added: [] };
  }
  return null;
}

/** Only animate a real adjacent chess position. Loading a different game is a cut. */
export function getBoardTransition(
  beforeFen: string,
  afterFen: string,
): BoardTransition {
  const empty = (kind: BoardTransition["kind"]): BoardTransition => ({
    kind,
    moves: [],
    removed: [],
    added: [],
  });
  try {
    const before = new Chess(beforeFen);
    const after = new Chess(afterFen);
    if (placement(before.fen()) === placement(after.fen()))
      return empty("none");
    const move = forward(before, after);
    if (move) return move;
    const reverse = forward(after, before);
    if (reverse)
      return {
        kind: "reverse",
        moves: reverse.moves.map((motion) => ({
          from: motion.to,
          to: motion.from,
          before: motion.after,
          after: motion.before,
        })),
        removed: [],
        added: reverse.removed,
      };
  } catch {
    // Invalid imported positions must never create stale visual pieces.
  }
  return empty("replace");
}

/** Logical square coordinates keep motion proportional when the board resizes. */
export function squarePoint(square: string, orientation: Color) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return orientation === "w"
    ? { x: file, y: 7 - rank }
    : { x: 7 - file, y: rank };
}
