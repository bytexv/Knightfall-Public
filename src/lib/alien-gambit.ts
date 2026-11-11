import { Chess } from "chess.js";
export const alienLine = [
  "e2e4",
  "c7c6",
  "d2d4",
  "d7d5",
  "b1c3",
  "d5e4",
  "c3e4",
  "g8f6",
  "e4g5",
  "h7h6",
  "g5f7",
];
export function playedAlienGambit(
  startFen: string,
  moves: readonly { from: string; to: string; promotion?: string }[],
) {
  return (
    startFen === new Chess().fen() &&
    moves.length >= alienLine.length &&
    alienLine.every(
      (uci, index) =>
        moves[index].from + moves[index].to + (moves[index].promotion || "") ===
        uci,
    )
  );
}
