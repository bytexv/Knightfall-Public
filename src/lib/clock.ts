import { Chess, type Color } from "chess.js";
import { type GameResult, type GameSession } from "./game";

/** LAN clocks are authoritative on the host; study modes never run a local clock. */
export function isTimedLocal(game: GameSession): boolean {
  return (
    (game.mode === "bot" || game.mode === "local") &&
    game.started === true &&
    !game.result &&
    Number.isFinite(game.time.base) &&
    game.time.base > 0
  );
}

/**
 * Match the Wi-Fi host's timeout rule: consider the winning side's material,
 * not just whether the board as a whole has insufficient material.
 */
export function canSideMate(fen: string, color: Color): boolean {
  const position = new Chess(fen);
  if (position.isInsufficientMaterial()) return false;
  const pieces = position
    .board()
    .flat()
    .filter((piece) => piece && piece.type !== "k");
  const mine = pieces.filter((piece) => piece!.color === color);
  if (!mine.length) return false;
  const theirs = pieces.filter((piece) => piece!.color !== color);
  if (mine.length === 1 && ["b", "n"].includes(mine[0]!.type) && !theirs.length)
    return false;
  return true;
}

export function timeoutResult(fen: string, loser: Color): GameResult {
  const winner = loser === "w" ? "b" : "w";
  const canWin = canSideMate(fen, winner);
  return {
    winner: canWin ? winner : null,
    reason: canWin
      ? "Time expired"
      : "Time expired · insufficient mating material",
  };
}

/**
 * Charge elapsed milliseconds to the side that is to move in this snapshot.
 * The caller must settle the old position before committing a move or takeback.
 * This function is immutable and has no timers or clock reads, so React may
 * safely repeat it. Invalid/backward elapsed values never add or deduct time.
 */
export function advanceClock(
  game: GameSession,
  elapsedMs: number,
): GameSession {
  if (!isTimedLocal(game) || !Number.isFinite(elapsedMs) || elapsedMs < 0)
    return game;
  let position: Chess;
  try {
    position = new Chess(game.fen);
  } catch {
    return game;
  }
  const turn = position.turn();
  const current = game.clocks[turn];
  if (!Number.isFinite(current)) return game;
  const remaining = Math.max(0, current - elapsedMs);
  if (remaining === current && remaining > 0) return game;
  return {
    ...game,
    clocks: { ...game.clocks, [turn]: remaining },
    ...(remaining === 0 ? { result: timeoutResult(game.fen, turn) } : {}),
  };
}
