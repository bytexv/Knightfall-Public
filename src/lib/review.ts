import type { EngineResult } from "./engine";
import type { MoveRecord } from "./game";

export interface MoveReview {
  index: number;
  score: number;
  mate?: number;
  loss: number;
  label: "Best" | "Good" | "Inaccuracy" | "Mistake" | "Blunder";
  best: string;
  note?: string;
}

type Evaluation = Pick<EngineResult, "score" | "mate">;

/** A mate score is a result, not a literal 100-pawn material advantage. */
function mateWinner(result: Evaluation): 1 | -1 | null {
  if (result.mate === undefined) return null;
  // Mate zero is terminal: use the signed score to identify the winning side.
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

/**
 * A short-search training estimate, not an official accuracy metric. Scores are
 * White-relative. Forced-mate continuations with the same winner do not incur
 * artificial loss when the mate distance changes or reaches zero.
 */
export function reviewMove(
  index: number,
  move: MoveRecord,
  before: EngineResult,
  after: EngineResult,
): MoveReview {
  const direction = move.color === "w" ? 1 : -1;
  const played = move.from + move.to + (move.promotion || "");
  const best = before.bestMove || "";
  const beforeWinner = mateWinner(before),
    afterWinner = mateWinner(after);
  const boundedScore = (score: number) =>
    Math.max(-1500, Math.min(1500, score));
  let loss = Math.max(
    0,
    (boundedScore(before.score) - boundedScore(after.score)) * direction,
  );
  let note: string | undefined;
  if (
    played === best ||
    (beforeWinner !== null && beforeWinner === afterWinner) ||
    afterWinner === direction
  ) {
    loss = 0;
  } else if (afterWinner === -direction && beforeWinner !== -direction) {
    loss = Math.max(300, loss);
    note = "The reply allows a forced mate in this search.";
  } else if (beforeWinner === direction && afterWinner !== direction) {
    loss = Math.max(100, loss);
    note = "A forced mate was available before this move.";
  }
  const label =
    played === best
      ? "Best"
      : loss < 35
        ? "Good"
        : loss < 100
          ? "Inaccuracy"
          : loss < 220
            ? "Mistake"
            : "Blunder";
  return {
    index,
    score: after.score,
    ...(after.mate !== undefined ? { mate: after.mate } : {}),
    loss,
    label,
    best,
    ...(note ? { note } : {}),
  };
}
