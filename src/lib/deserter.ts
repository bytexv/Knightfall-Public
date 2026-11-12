import { Chess, type Color } from "chess.js";
import type { EngineOptions, EngineResult } from "./engine";
export interface DeserterPosition {
  fen: string;
  color: Color;
  source: "random-play" | "random-endgame";
  checked: boolean;
}
const unit = (rng: () => number) =>
  Math.max(0, Math.min(0.999999, Number(rng()) || 0));
const choose = <T>(items: T[], rng: () => number) =>
  items[Math.floor(unit(rng) * items.length)];
const cancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
};

/** Real legal play creates reachable positions, not arbitrary piece placement. */
export async function randomGamePosition(
  rng = Math.random,
  signal?: AbortSignal,
): Promise<string> {
  const game = new Chess(),
    target = 26 + Math.floor(unit(rng) * 70);
  for (let ply = 0; ply < target; ply++) {
    cancelled(signal);
    const legal = game
      .moves({ verbose: true })
      .filter((m) => !m.san.endsWith("#"));
    if (!legal.length) break;
    const sharp = legal.filter((m) => m.captured || m.san.endsWith("+"));
    game.move(choose(sharp.length && unit(rng) < 0.6 ? sharp : legal, rng));
    if (game.isGameOver()) {
      game.undo();
      break;
    }
    if (ply % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return game.fen();
}

/** A bounded fallback is still randomized through legal play and has a known
 * winning material balance. Never offer a drawn or already-finished position. */
export function randomWinningEndgame(rng = Math.random): DeserterPosition {
  const black = unit(rng) < 0.5;
  const game = new Chess(
    black
      ? "8/8/5k2/8/4q3/8/1K6/8 b - - 0 1"
      : "8/6k1/8/3Q4/8/2K5/8/8 w - - 0 1",
  );
  const color: Color = black ? "b" : "w";
  const rounds = 6 + Math.floor(unit(rng) * 18);
  for (let i = 0; i < rounds * 2; i++) {
    const legal = game.moves({ verbose: true }).filter((move) => {
      game.move(move);
      const queen = game
        .board()
        .flat()
        .find((p) => p?.type === "q" && p.color === color);
      const okay =
        !!queen &&
        !game.isGameOver() &&
        !game.isAttacked(queen.square, color === "w" ? "b" : "w");
      game.undo();
      return okay;
    });
    if (!legal.length) break;
    game.move(choose(legal, rng));
  }
  if (game.turn() !== color) {
    const legal = game.moves({ verbose: true }).filter((move) => {
      game.move(move);
      const good = !game.isGameOver();
      game.undo();
      return good;
    });
    if (legal.length) game.move(choose(legal, rng));
    else game.undo();
  }
  return { fen: game.fen(), color, source: "random-endgame", checked: false };
}

export async function findDeserterPosition(
  engine: {
    analyze: (fen: string, options: EngineOptions) => Promise<EngineResult>;
  },
  options: {
    rng?: () => number;
    signal?: AbortSignal;
    onAttempt?: (n: number) => void;
    exclude?: string[];
  } = {},
): Promise<DeserterPosition> {
  const rng = options.rng || Math.random;
  for (let attempt = 1; attempt <= 10; attempt++) {
    cancelled(options.signal);
    options.onAttempt?.(attempt);
    const fen = await randomGamePosition(rng, options.signal),
      board = new Chess(fen);
    if (
      board.isGameOver() ||
      options.exclude?.includes(fen.split(" ").slice(0, 4).join(" "))
    )
      continue;
    let result: EngineResult;
    try {
      result = await engine.analyze(fen, {
        depth: 14,
        movetime: 500,
        multiPV: 1,
      });
    } catch (error) {
      cancelled(options.signal);
      if ((error as Error).name === "AbortError") throw error;
      break;
    }
    cancelled(options.signal);
    if (!/stockfish/i.test(result.engine) || /fallback/i.test(result.engine))
      break;
    const perspective = board.turn() === "w" ? 1 : -1;
    const winning =
      result.mate !== undefined
        ? result.mate * perspective > 1
        : result.score * perspective >= 180;
    if (winning && result.depth >= 10)
      return { fen, color: board.turn(), source: "random-play", checked: true };
  }
  cancelled(options.signal);
  return randomWinningEndgame(rng);
}
