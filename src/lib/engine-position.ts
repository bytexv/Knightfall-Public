import { Chess, type Color, type Square } from "chess.js";

/** Validate basic legality before a user-supplied FEN reaches native WASM. */
export function validatedPosition(fen: string): Chess {
  const position = new Chess(fen);
  const pieces = position
    .board()
    .flat()
    .filter((piece) => piece !== null);
  const turn = position.turn();
  const previous: Color = turn === "w" ? "b" : "w";
  const previousKing = pieces.find(
    (piece) => piece.color === previous && piece.type === "k",
  );
  if (previousKing && position.isAttacked(previousKing.square, turn)) {
    throw new Error(
      "The side that just moved cannot be in check. Check the kings and side to move.",
    );
  }
  for (const color of ["w", "b"] as const) {
    const own = pieces.filter((piece) => piece.color === color);
    if (
      own.length > 16 ||
      own.filter((piece) => piece.type === "p").length > 8
    ) {
      throw new Error(
        "A position cannot contain more than 16 pieces or 8 pawns of one color.",
      );
    }
  }
  const fields = fen.trim().split(/\s+/);
  for (const [right, king, rook, color] of [
    ["K", "e1", "h1", "w"],
    ["Q", "e1", "a1", "w"],
    ["k", "e8", "h8", "b"],
    ["q", "e8", "a8", "b"],
  ] as const) {
    if (!fields[2].includes(right)) continue;
    if (
      position.get(king)?.type !== "k" ||
      position.get(king)?.color !== color ||
      position.get(rook)?.type !== "r" ||
      position.get(rook)?.color !== color
    ) {
      throw new Error(
        `Castling right ${right} requires its king and rook on their original squares.`,
      );
    }
  }
  if (fields[3] !== "-") {
    const target = fields[3] as Square;
    const pawnSquare = `${target[0]}${turn === "w" ? "5" : "4"}` as Square;
    const originSquare = `${target[0]}${turn === "w" ? "7" : "2"}` as Square;
    const pawn = position.get(pawnSquare);
    if (
      position.get(target) ||
      position.get(originSquare) ||
      pawn?.type !== "p" ||
      pawn.color !== previous
    ) {
      throw new Error(
        "The en-passant square must follow an opposing pawn double move.",
      );
    }
  }
  return position;
}
