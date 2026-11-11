import { type Move, type PieceSymbol } from "chess.js";
import { type EngineResult } from "./engine";
import { evaluatePosition, moveToUci } from "./engine-fallback";
import { validatedPosition } from "./engine-position";

/** Descriptive training personalities, not calibrated Elo levels. */
const policies = {
  sprout: {
    engineChance: 0.18,
    explorationChance: 0.22,
    temperature: 145,
    plausibleLoss: 320,
  },
  scout: {
    engineChance: 0.6,
    explorationChance: 0.06,
    temperature: 75,
    plausibleLoss: 180,
  },
} as const;
const values: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};

/** Small reproducible PRNG for tests or a caller that wants repeatable bot play. */
export function seededBotRandom(seed: number): () => number {
  let state = Number.isFinite(seed) ? seed >>> 0 : 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomUnit(rng: () => number): number {
  const value = rng();
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1 - Number.EPSILON, value))
    : 0.5;
}

/**
 * Apply deliberate, bounded beginner variety AFTER a legal engine search.
 * Stronger bots keep the engine's choice. Sprout and Scout mix that choice with
 * one-ply positional ideas and occasional exploration. Every candidate comes
 * from chess.js legal move generation, so weakness never means breaking rules.
 */
export function chooseBotMove(
  fen: string,
  botId: string,
  result: Pick<EngineResult, "bestMove">,
  rng: () => number = Math.random,
): string | null {
  let position;
  try {
    position = validatedPosition(fen);
  } catch {
    return null;
  }
  if (position.isGameOver()) return null;
  const legal = position.moves({ verbose: true });
  const engineMove = legal.find((move) => moveToUci(move) === result.bestMove);
  const policy =
    botId === "sprout" || botId === "scout" ? policies[botId] : null;
  if (!policy) return engineMove ? moveToUci(engineMove) : null;
  // Spot a finished mating pattern at every level. Everything else is a choice.
  const immediateMates = legal.filter((move) => move.san.endsWith("#"));
  if (immediateMates.length)
    return moveToUci(
      immediateMates[Math.floor(randomUnit(rng) * immediateMates.length)],
    );
  const choice = randomUnit(rng);
  if (engineMove && choice < policy.engineChance) return moveToUci(engineMove);
  if (choice < policy.engineChance + policy.explorationChance)
    return moveToUci(legal[Math.floor(randomUnit(rng) * legal.length)]);

  const color = position.turn();
  const direction = color === "w" ? 1 : -1;
  const before = evaluatePosition(position) * direction;
  const ranked: Array<{ move: Move; score: number }> = [];
  for (const move of legal) {
    position.move(move);
    let score = evaluatePosition(position) * direction - before;
    // A shallow learner notices exposed pieces, checks, and castling, but does
    // not calculate the long forcing lines that make Stockfish so difficult.
    const movingType = move.promotion || move.piece;
    if (movingType !== "k" && position.isAttacked(move.to, position.turn())) {
      const defended = position.isAttacked(move.to, color);
      score -= values[movingType] * (defended ? 0.18 : 0.5);
    }
    if (move.san.endsWith("+")) score += 24;
    if (move.isKingsideCastle() || move.isQueensideCastle()) score += 35;
    if (position.isStalemate()) score = -before;
    position.undo();
    ranked.push({ move, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0].score;
  const plausible = ranked.filter(
    (candidate) => best - candidate.score <= policy.plausibleLoss,
  );
  const weights = plausible.map((candidate) =>
    Math.exp((candidate.score - best) / policy.temperature),
  );
  let ticket =
    randomUnit(rng) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < plausible.length; i++) {
    ticket -= weights[i];
    if (ticket < 0) return moveToUci(plausible[i].move);
  }
  return moveToUci(plausible.at(-1)!.move);
}
