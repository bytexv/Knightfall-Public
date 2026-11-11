import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { validatedPosition } from "./engine-position";

export interface EditorPiece {
  color: Color;
  type: PieceSymbol;
}
export type EditorBoard = Partial<Record<Square, EditorPiece>>;
export interface BoardSetup {
  board: EditorBoard;
  turn: Color;
  castling: string;
  enPassant: string;
  halfmove: string;
  fullmove: string;
}
export interface SetupValidation {
  fen: string;
  valid: boolean;
  error: string;
  note: string;
}
export const editorPieceNames: Record<PieceSymbol, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export function emptyBoardSetup(turn: Color = "w"): BoardSetup {
  return {
    board: {},
    turn,
    castling: "",
    enPassant: "-",
    halfmove: "0",
    fullmove: "1",
  };
}

export function setupFromFen(fen = new Chess().fen()): BoardSetup {
  const position = new Chess(fen);
  const fields = fen.trim().split(/\s+/);
  const board: EditorBoard = {};
  for (const piece of position.board().flat())
    if (piece) board[piece.square] = { color: piece.color, type: piece.type };
  return {
    board,
    turn: position.turn(),
    castling: fields[2].replace("-", ""),
    enPassant: fields[3],
    halfmove: fields[4],
    fullmove: fields[5],
  };
}

export function setupToFen(setup: BoardSetup): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "";
    let empty = 0;
    for (const file of "abcdefgh") {
      const piece = setup.board[`${file}${rank}` as Square];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      row += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const castling =
    [..."KQkq"].filter((right) => setup.castling.includes(right)).join("") ||
    "-";
  return `${rows.join("/")} ${setup.turn} ${castling} ${setup.enPassant || "-"} ${setup.halfmove.trim()} ${setup.fullmove.trim()}`;
}

/** Placing a king relocates that color's existing king instead of duplicating it. */
export function placeEditorPiece(
  board: EditorBoard,
  square: Square,
  piece: EditorPiece | null,
): EditorBoard {
  const next = { ...board };
  if (piece?.type === "k") {
    for (const [otherSquare, otherPiece] of Object.entries(next)) {
      if (otherPiece?.color === piece.color && otherPiece.type === "k")
        delete next[otherSquare as Square];
    }
  }
  if (piece) next[square] = { ...piece };
  else delete next[square];
  return next;
}

export function editorSquares(orientation: Color): Square[] {
  const files = orientation === "w" ? "abcdefgh" : "hgfedcba";
  const ranks = orientation === "w" ? "87654321" : "12345678";
  return [...ranks].flatMap((rank) =>
    [...files].map((file) => `${file}${rank}` as Square),
  );
}

export function nextEditorSquare(
  square: Square,
  key: string,
  orientation: Color,
): Square {
  const squares = editorSquares(orientation);
  const index = Math.max(0, squares.indexOf(square));
  let row = Math.floor(index / 8),
    column = index % 8;
  if (key === "ArrowLeft") column = Math.max(0, column - 1);
  if (key === "ArrowRight") column = Math.min(7, column + 1);
  if (key === "ArrowUp") row = Math.max(0, row - 1);
  if (key === "ArrowDown") row = Math.min(7, row + 1);
  if (key === "Home") column = 0;
  if (key === "End") column = 7;
  return squares[row * 8 + column];
}

export function validateBoardSetup(setup: BoardSetup): SetupValidation {
  const fen = setupToFen(setup);
  const fail = (error: string): SetupValidation => ({
    fen,
    valid: false,
    error,
    note: "",
  });
  for (const [color, name] of [
    ["w", "white"],
    ["b", "black"],
  ] as const) {
    const kings = Object.values(setup.board).filter(
      (piece) => piece?.color === color && piece.type === "k",
    );
    if (kings.length !== 1)
      return fail(
        kings.length
          ? `Keep exactly one ${name} king on the board.`
          : `Place a ${name} king on the board.`,
      );
  }
  for (const [square, piece] of Object.entries(setup.board)) {
    if (piece?.type === "p" && (square[1] === "1" || square[1] === "8"))
      return fail(
        `Move the pawn off ${square}, or replace it with a promoted piece. Pawns cannot stay on the first or last rank.`,
      );
  }
  const kingSquares = (["w", "b"] as const).map(
    (color) =>
      Object.entries(setup.board).find(
        ([, piece]) => piece?.color === color && piece.type === "k",
      )![0],
  );
  if (
    Math.abs(kingSquares[0].charCodeAt(0) - kingSquares[1].charCodeAt(0)) <=
      1 &&
    Math.abs(Number(kingSquares[0][1]) - Number(kingSquares[1][1])) <= 1
  )
    return fail(
      "Kings cannot touch. Move either king so they are at least two squares apart.",
    );
  if (
    !/^\d+$/.test(setup.halfmove.trim()) ||
    !Number.isSafeInteger(Number(setup.halfmove))
  )
    return fail("Enter a whole number of zero or more for the halfmove clock.");
  if (
    !/^\d+$/.test(setup.fullmove.trim()) ||
    !Number.isSafeInteger(Number(setup.fullmove)) ||
    Number(setup.fullmove) < 1
  )
    return fail("Enter a whole number of one or more for the move number.");
  try {
    const position = validatedPosition(fen);
    let note = `${setup.turn === "w" ? "White" : "Black"} to move`;
    if (position.isCheckmate()) note = "Checkmate position";
    else if (position.isStalemate()) note = "Stalemate position";
    else if (position.isInsufficientMaterial())
      note = "Draw by insufficient material";
    else if (position.isDrawByFiftyMoves()) note = "Fifty-move draw position";
    else if (position.isCheck()) note += " · in check";
    return { fen, valid: true, error: "", note };
  } catch (error) {
    let message =
      error instanceof Error
        ? error.message.replace(/^Invalid FEN:\s*/i, "")
        : "Check the pieces and position settings.";
    const castling = message.match(/^Castling right ([KQkq])/);
    if (castling) {
      const right = castling[1],
        white = right === right.toUpperCase(),
        kingside = right.toUpperCase() === "K";
      message = `Turn off ${white ? "White" : "Black"} ${kingside ? "kingside" : "queenside"} castling, or return its king to e${white ? "1" : "8"} and rook to ${kingside ? "h" : "a"}${white ? "1" : "8"}.`;
    }
    if (/en.passant/i.test(message))
      message = `Choose None for en passant, unless the opponent just advanced a pawn two squares. With ${setup.turn === "w" ? "White" : "Black"} to move, its target belongs on rank ${setup.turn === "w" ? "6" : "3"}.`;
    return fail(message);
  }
}
