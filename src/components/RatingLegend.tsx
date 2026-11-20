import type { MoveClassification } from "../lib/review";

export type Rating = MoveClassification | "Unrated";
export const ratings = {
  Brilliant: ["!!", "#08736f", "A deep search supports giving up material. Even after the opponent takes it, the compensation holds."],
  Great: ["!", "#236e96", "The top move saves or wins a position where the next choice is much worse."],
  Best: ["★", "#316b43", "The engine chose this move first at the depth searched."],
  Excellent: ["+", "#367354", "The move preserves almost all of the evaluation, within about 0.15 pawns."],
  Good: ["✓", "#526a3b", "A sound choice that gives up less than half a pawn of evaluation."],
  Book: ["B", "#78562f", "The sequence follows a line in the opening library and the move holds up in analysis."],
  Inaccuracy: ["?!", "#836319", "A better move would typically keep between half a pawn and one pawn of evaluation."],
  Mistake: ["?", "#a65020", "This move usually costs between one and about two pawns of evaluation."],
  Miss: ["×", "#80457e", "A forced mate or a clear winning opportunity slipped away."],
  Blunder: ["??", "#a33d44", "The move gives up a large advantage, usually at least 2.2 pawns of evaluation, or allows a forced mate."],
  Unrated: ["·", "#58616a", "Coach hasn’t obtained enough reliable engine evidence to grade this move."],
} as const satisfies Record<Rating, readonly [string, string, string]>;

export function RatingLegend() {
  return <details className="rating-legend">
    <summary>Move rating guide</summary>
    <p>A pawn of evaluation measures the engine’s estimate of the position. A deeper search can change a rating.</p>
    <dl>{(Object.keys(ratings) as Rating[]).map(label => <div key={label}>
      <dt><b aria-hidden="true" style={{backgroundColor: ratings[label][1]}}>{ratings[label][0]}</b>{label}</dt>
      <dd>{ratings[label][2]}</dd>
    </div>)}</dl>
  </details>;
}
