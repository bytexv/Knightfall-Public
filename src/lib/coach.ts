import { Chess } from "chess.js";
import type { LocalEngine, EngineResult } from "./engine";

export function usableSearch(fen: string, result: EngineResult) {
  if (
    !/stockfish/i.test(result.engine) ||
    /fallback/i.test(result.engine) ||
    !Number.isFinite(result.score) ||
    !Number.isFinite(result.depth) ||
    result.depth < 10
  )
    return false;
  const principal = result.lines.find((line) => line.multipv === 1);
  return (
    !!principal &&
    principal.depth >= 10 &&
    principal.pv[0] === result.bestMove &&
    new Chess(fen)
      .moves({ verbose: true })
      .some((move) => move.lan === result.bestMove)
  );
}

export async function analyzeCoachPosition(
  engine: LocalEngine,
  fen: string,
  active: () => boolean,
) {
  const result = await engine.analyze(fen, {
    depth: 16,
    movetime: 1100,
    multiPV: 3,
  });
  if (
    active() &&
    /stockfish/i.test(result.engine) &&
    !new Chess(fen).isGameOver() &&
    !usableSearch(fen, result)
  ) {
    // Give slower devices a longer search concentrated on one line.
    return engine.analyze(fen, { depth: 16, movetime: 2400, multiPV: 1 });
  }
  return result;
}
