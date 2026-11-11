import { Chess, type Color } from "chess.js";
import { gambits } from "../data/gambits";
import type { EngineResult } from "./engine";
import type { MoveRecord } from "./game";
import { soundSacrifice } from "./review-sacrifice";

export const moveClassifications = [
  "Brilliant",
  "Great",
  "Best",
  "Excellent",
  "Good",
  "Book",
  "Inaccuracy",
  "Mistake",
  "Miss",
  "Blunder",
] as const;
export type MoveClassification = (typeof moveClassifications)[number];
export type ReviewConfidence = "limited" | "standard" | "strong";
export type ReviewEvaluation = Pick<
  EngineResult,
  "score" | "mate" | "depth" | "engine"
>;
export interface MoveReview {
  index: number;
  color: Color;
  score: number;
  mate?: number;
  loss: number;
  label: MoveClassification;
  best: string;
  played: string;
  playedSAN: string;
  bestSAN: string;
  before: ReviewEvaluation;
  after: ReviewEvaluation;
  /** Recommended continuation from the position BEFORE this move. */
  pv: string[];
  pvSAN: string[];
  reason: string;
  note?: string;
  confidence: ReviewConfidence;
  critical: boolean;
  forced: boolean;
  opening?: string;
}
export interface ReviewContext {
  startFen: string;
  moves: readonly MoveRecord[];
}
export interface ReviewSummaryContext {
  opponentElo?: number;
  playerColor?: Color;
}
export interface ColorReviewSummary {
  color: Color;
  moves: number;
  evaluatedMoves: number;
  quality: number | null;
  averageLoss: number | null;
  counts: Record<MoveClassification, number>;
  performance: {
    score: number;
    band: "Developing" | "Steady" | "Precise" | "Very precise";
    range: [number, number];
    sampleSize: number;
  } | null;
  performanceElo: {
    estimate: number;
    range: [number, number];
    sampleSize: number;
    basis: string;
  } | null;
}
export interface ReviewSummary {
  w: ColorReviewSummary;
  b: ColorReviewSummary;
  quality: number | null;
  reviewedPlies: number;
}

type Evaluation = Pick<EngineResult, "score" | "mate">;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const finiteScore = (score: number) => (Number.isFinite(score) ? score : 0);
const nativeEngine = (result: EngineResult) =>
  /stockfish/i.test(result.engine) && !/fallback/i.test(result.engine);

/** Mate zero is terminal: the signed score still identifies the winning side. */
function mateWinner(result: Evaluation): 1 | -1 | null {
  if (result.mate === undefined) return null;
  return result.score > 0 ? 1 : -1;
}
export function formatEvaluation(result: Evaluation, decimals = 2): string {
  if (result.mate !== undefined)
    return `${mateWinner(result) === 1 ? "+" : "−"}M${Math.abs(result.mate)}`;
  return `${result.score >= 0 ? "+" : ""}${(result.score / 100).toFixed(decimals)}`;
}
export function evaluationSummary(result: Evaluation | null): string {
  if (!result) return "Finding the best continuation";
  const side = result.score > 0 ? "White" : "Black";
  if (result.mate !== undefined)
    return result.mate === 0
      ? `${side} wins by checkmate`
      : `${side} has a forced mate`;
  if (Math.abs(result.score) < 40) return "The position is balanced";
  return `${side} ${Math.abs(result.score) >= 500 ? "has a large advantage" : Math.abs(result.score) >= 150 ? "is better" : "is slightly better"}`;
}
export function moveReference(
  move: Pick<MoveRecord, "before" | "color">,
  index: number,
): string {
  const number = Number(move.before.split(" ")[5]);
  return `${Number.isInteger(number) && number > 0 ? number : Math.floor(index / 2) + 1}${move.color === "b" ? "…" : "."}`;
}

/** Keep only a legal PV prefix; engine protocol output is not trusted as notation. */
function legalLine(fen: string, line: readonly string[]) {
  const pv: string[] = [],
    san: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of line.slice(0, 16)) {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      pv.push(move.from + move.to + (move.promotion || ""));
      san.push(move.san);
    }
  } catch {
    /* An invalid suffix must never produce invented SAN. */
  }
  return { pv, san };
}

const initialFen = new Chess().fen();
// Meme blunder demonstrations are educational, but are not opening theory.
const openingLines = gambits
  .filter((g) => !["botez", "bongcloud"].includes(g.id))
  .map((g) => {
    const chess = new Chess();
    return {
      name: g.name,
      moves: g.moves.map((san) => {
        const move = chess.move(san);
        return move.from + move.to + (move.promotion || "");
      }),
    };
  });
export function bookOpeningFor(
  context: ReviewContext | undefined,
  index: number,
): string | null {
  if (
    !context ||
    index < 0 ||
    index >= context.moves.length ||
    context.startFen !== initialFen
  )
    return null;
  const prefix = context.moves
    .slice(0, index + 1)
    .map((move) => move.from + move.to + (move.promotion || ""));
  const matches = openingLines.filter(
    (line) =>
      prefix.length <= line.moves.length &&
      prefix.every((move, i) => move === line.moves[i]),
  );
  if (!matches.length) return null;
  return matches.length === 1
    ? matches[0].name
    : `${matches.length} opening-library lines`;
}

function confidenceFor(
  before: EngineResult,
  after: EngineResult,
  terminal: boolean,
): ReviewConfidence {
  if (!Number.isFinite(before.score) || !Number.isFinite(after.score))
    return "limited";
  if (!nativeEngine(before) || (!terminal && !nativeEngine(after)))
    return "limited";
  const depth = Math.min(before.depth, terminal ? before.depth : after.depth);
  return depth >= 14 ? "strong" : depth >= 10 ? "standard" : "limited";
}
function uniquelyStrong(
  move: MoveRecord,
  before: EngineResult,
  direction: number,
): boolean {
  const candidates = [...before.lines].sort((a, b) => a.multipv - b.multipv);
  const top = candidates.find(
    (line) => line.multipv === 1 && line.pv[0] === before.bestMove,
  );
  const second = candidates.find(
    (line) =>
      line.multipv === 2 &&
      line.pv[0] !== before.bestMove &&
      legalLine(move.before, [line.pv[0]]).pv.length === 1,
  );
  if (
    !top ||
    !second ||
    top.depth < 14 ||
    second.depth < 14 ||
    Math.abs(top.depth - second.depth) > 2
  )
    return false;
  const firstScore = clamp(top.score * direction, -1500, 1500);
  const otherScore = clamp(second.score * direction, -1500, 1500);
  // A single way to maintain equality or gain a decisive advantage is notable;
  // choosing between two already overwhelming wins is not.
  return (
    firstScore >= -40 && otherScore <= 80 && firstScore - otherScore >= 180
  );
}

/** Conservative local training labels. These are not a commercial site's classification algorithm. */
export function reviewMove(
  index: number,
  move: MoveRecord,
  before: EngineResult,
  after: EngineResult,
  context?: ReviewContext,
): MoveReview {
  const direction = move.color === "w" ? 1 : -1;
  const played = move.from + move.to + (move.promotion || "");
  const best = before.bestMove || "";
  const preferred = played === best;
  const beforeWinner = mateWinner(before),
    afterWinner = mateWinner(after);
  let legalMoves = 0,
    terminal = false;
  try {
    legalMoves = new Chess(move.before).moves().length;
    terminal = new Chess(move.fen).isGameOver();
  } catch {
    /* Invalid records cannot earn special labels. */
  }
  const forced = legalMoves === 1;
  const confidence = confidenceFor(before, after, terminal);
  const rawLoss = Math.max(
    0,
    (clamp(finiteScore(before.score), -1500, 1500) -
      clamp(finiteScore(after.score), -1500, 1500)) *
      direction,
  );
  let loss = rawLoss;
  const continuedMate = beforeWinner !== null && beforeWinner === afterWinner;
  if (preferred || continuedMate || afterWinner === direction) loss = 0;
  else if (afterWinner === -direction && beforeWinner !== -direction)
    loss = Math.max(300, loss);
  else if (beforeWinner === direction && afterWinner !== direction)
    loss = Math.max(100, loss);

  let label: MoveClassification = preferred
    ? "Best"
    : loss <= 15
      ? "Excellent"
      : loss < 50
        ? "Good"
        : loss < 100
          ? "Inaccuracy"
          : loss < 220
            ? "Mistake"
            : "Blunder";
  let reason = preferred
    ? "This was the engine’s preferred move in the position."
    : loss <= 15
      ? "This continuation preserves almost all of the position’s value in this search."
      : loss < 50
        ? "A sound move with a small difference from the engine’s preferred continuation."
        : loss < 100
          ? "A more accurate continuation was available; this move gives up some of the position’s value."
          : loss < 220
            ? "This move gives the opponent a substantially better position than the engine’s preferred continuation."
            : "This move loses a large amount of the position’s value in this search.";

  if (!preferred && afterWinner === -direction && beforeWinner !== -direction) {
    label = "Blunder";
    reason = "The reply allows a forced mate in this search.";
  } else if (
    !preferred &&
    beforeWinner === direction &&
    afterWinner !== direction
  ) {
    label = "Miss";
    reason =
      "A forced mate was available before this move; this continuation no longer shows that mate in the search.";
  } else if (
    !preferred &&
    confidence === "strong" &&
    before.score * direction >= 300 &&
    after.score * direction < 100 &&
    loss >= 200
  ) {
    label = "Miss";
    reason =
      "The search found a winning advantage before this move, but this continuation lets it slip to a near-balanced position or worse.";
  } else if (continuedMate) {
    reason =
      afterWinner === direction
        ? "This move keeps the forced mating attack; a changing mate distance does not count as lost evaluation."
        : "The position remains a forced mate for the opponent; this search does not find a saving move.";
  }

  const contextualMove = context?.moves[index];
  const opening =
    contextualMove &&
    contextualMove.before === move.before &&
    contextualMove.fen === move.fen
      ? bookOpeningFor(context, index)
      : null;
  if (opening && loss < 50 && !["Miss", "Blunder"].includes(label)) {
    label = "Book";
    reason = `This exact sequence appears in the opening library: ${opening}. Recognition is limited to the included lines.`;
  } else if (
    preferred &&
    !forced &&
    legalMoves > 1 &&
    confidence === "strong" &&
    rawLoss <= 60 &&
    afterWinner !== -direction
  ) {
    const confirmedLine = before.lines.find(
      (line) => line.multipv === 1 && line.pv[0] === played && line.depth >= 14,
    );
    const sacrifice = confirmedLine ? soundSacrifice(move, after) : null;
    if (sacrifice) {
      label = "Brilliant";
      reason = `The engine supports a sound material sacrifice: the principal reply accepts ${sacrifice.materialLoss / 100} pawns of net material, while the continuation ${afterWinner === direction ? "keeps a forced mating attack" : "retains at least a balanced position"}. This is a conservative local heuristic.`;
    } else if (uniquelyStrong(move, before, direction)) {
      label = "Great";
      reason =
        "A uniquely strong choice: the next analyzed candidate loses at least 1.8 pawns of evaluation, while this move keeps the position sound.";
    }
  }
  if (forced) reason += " There was only one legal move.";
  if (confidence === "limited")
    reason +=
      " The search is shallow or uses the lightweight engine, so treat this label cautiously.";
  else if (preferred && rawLoss > 100 && !continuedMate)
    reason +=
      " The before/after searches disagree; the preferred move is not penalized for that search uncertainty.";
  const line =
    before.lines.find((line) => line.pv[0] === best)?.pv ||
    (best ? [best] : []);
  const { pv, san: pvSAN } = legalLine(move.before, line);
  const snapshot = (result: EngineResult): ReviewEvaluation => ({
    score: finiteScore(result.score),
    ...(result.mate !== undefined ? { mate: result.mate } : {}),
    depth: result.depth,
    engine: result.engine,
  });
  return {
    index,
    color: move.color,
    score: finiteScore(after.score),
    ...(after.mate !== undefined ? { mate: after.mate } : {}),
    loss,
    label,
    best,
    played,
    playedSAN: move.san,
    bestSAN: legalLine(move.before, best ? [best] : []).san[0] || "",
    before: snapshot(before),
    after: snapshot(after),
    pv,
    pvSAN,
    reason,
    note: reason,
    confidence,
    critical: ["Brilliant", "Great", "Miss", "Mistake", "Blunder"].includes(
      label,
    ),
    forced,
    ...(opening && label === "Book" ? { opening } : {}),
  };
}

/** Per-move bounded loss index; explicitly a training measure, not official accuracy. */
const qualityFor = (moves: readonly MoveReview[]): number | null =>
  moves.length
    ? Math.round(
        moves.reduce(
          (sum, move) => sum + 100 * Math.exp(-clamp(move.loss, 0, 1000) / 200),
          0,
        ) / moves.length,
      )
    : null;
const independentDecision = (move: MoveReview) => {
  const perspective = move.color === "w" ? 1 : -1;
  const score = move.before.score * perspective;
  return (
    move.label !== "Book" &&
    !move.forced &&
    move.confidence !== "limited" &&
    move.before.mate === undefined &&
    score > -500 &&
    score < 1000
  );
};
export function summarizeReview(
  reviews: readonly MoveReview[],
  context: ReviewSummaryContext = {},
): ReviewSummary {
  const summarize = (color: Color): ColorReviewSummary => {
    const moves = reviews.filter((move) => move.color === color);
    // Book, forced replies, forced mates and already overwhelming positions
    // reveal little about strength. Keep their labels, but exclude the sample.
    const evaluated = moves.filter(independentDecision);
    const quality = qualityFor(evaluated);
    const counts = Object.fromEntries(
      moveClassifications.map((label) => [
        label,
        moves.filter((move) => move.label === label).length,
      ]),
    ) as Record<MoveClassification, number>;
    const spread = Math.max(
      8,
      Math.round(35 / Math.sqrt(Math.max(1, evaluated.length))),
    );
    const performance: ColorReviewSummary["performance"] =
      evaluated.length >= 8 && quality !== null
        ? {
            score: quality,
            band:
              quality >= 90
                ? "Very precise"
                : quality >= 75
                  ? "Precise"
                  : quality >= 55
                    ? "Steady"
                    : "Developing",
            range: [
              Math.max(0, quality - spread),
              Math.min(100, quality + spread),
            ],
            sampleSize: evaluated.length,
          }
        : null;
    let performanceElo: ColorReviewSummary["performanceElo"] = null;
    if (
      color === context.playerColor &&
      Number.isFinite(context.opponentElo) &&
      context.opponentElo! >= 100 &&
      context.opponentElo! <= 3200 &&
      evaluated.length >= 12 &&
      quality !== null
    ) {
      // Deliberately transparent, uncalibrated mapping: the known local bot's
      // difficulty estimate, adjusted by 12 points per quality point from 75,
      // capped at +/-300. A separate quality ceiling prevents poor play against
      // the strongest bot from automatically producing an expert estimate.
      // This is NOT a rating update or an Elo prediction.
      const botAnchored =
        context.opponentElo! + clamp((quality - 75) * 12, -300, 300);
      const qualityCeiling = 100 + 28 * quality;
      const estimate = clamp(
        Math.round(Math.min(botAnchored, qualityCeiling) / 25) * 25,
        100,
        3200,
      );
      performanceElo = {
        estimate,
        range: [Math.max(100, estimate - 300), Math.min(3200, estimate + 300)],
        sampleSize: evaluated.length,
        basis: "uncalibrated local bot training estimate",
      };
    }
    return {
      color,
      moves: moves.length,
      evaluatedMoves: evaluated.length,
      quality,
      averageLoss: evaluated.length
        ? Math.round(
            evaluated.reduce((sum, move) => sum + move.loss, 0) /
              evaluated.length,
          )
        : null,
      counts,
      performance,
      performanceElo,
    };
  };
  const eligible = reviews.filter(independentDecision);
  return {
    w: summarize("w"),
    b: summarize("b"),
    quality: qualityFor(eligible),
    reviewedPlies: reviews.length,
  };
}

/** A broad, uncalibrated training range, never a rating update. */
export function estimatePerformanceElo(side: ColorReviewSummary) {
  if (side.evaluatedMoves < 12 || side.quality === null) return null;
  const estimate = Math.round((100 + 26 * side.quality) / 25) * 25;
  return {
    estimate,
    range: [Math.max(100, estimate - 450), Math.min(3200, estimate + 450)] as [
      number,
      number,
    ],
    sampleSize: side.evaluatedMoves,
  };
}

/** Material and full-move number define phases, including imported endgames. */
export function summarizeGamePhases(
  reviews: readonly MoveReview[],
  moves: readonly MoveRecord[],
) {
  const buckets: MoveReview[][] = [[], [], []];
  let phase = 0;
  const phases = moves.map((move) => {
    const board = new Chess(move.before);
    const weights: Record<string, number> = { n: 1, b: 1, r: 2, q: 4 };
    const material = board
      .board()
      .flat()
      .reduce((sum, piece) => sum + (piece ? weights[piece.type] || 0 : 0), 0);
    phase = Math.max(
      phase,
      material <= 8
        ? 2
        : Number(move.before.split(" ")[5]) > 10 || material <= 16
          ? 1
          : 0,
    );
    return phase;
  });
  for (const review of reviews)
    if (phases[review.index] !== undefined)
      buckets[phases[review.index]].push(review);
  return ["Opening · early game", "Middlegame", "Endgame · late game"].map(
    (title, index) => ({
      title,
      reviews: buckets[index],
      summary: summarizeReview(buckets[index]),
    }),
  );
}
