import { Chess, type Color } from "chess.js";
import { useId, useMemo } from "react";
import type { MoveReview } from "../lib/review";

export default function ReviewRecommendation({ fen, review }: { fen: string; review: MoveReview }) {
  const arrow = useId();
  const position = useMemo(() => {
    try {
      const board = new Chess(fen);
      const pieces = board.board().flat().filter(piece => piece !== null);
      const best = board.moves({ verbose: true }).find(move => move.lan === review.best);
      if (!best) return null;
      return { pieces, best };
    } catch { return null; }
  }, [fen, review.best]);
  if (!position || review.played === review.best) return null;
  function point(square: string, side: Color) {
    const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
    return { x: side === "w" ? file : 7 - file, y: side === "w" ? 7 - rank : rank };
  }
  const { best, pieces } = position;
  const from = point(best.from, best.color), to = point(best.to, best.color);
  return <figure className="review-recommendation">
    <figcaption><span>Before {review.playedSAN}</span><strong>{review.confidence === "limited" ? "Consider" : "Recommended"} · {best.san}</strong>
      <small>{best.from} → {best.to}{review.confidence === "limited" ? " · limited search" : ""}</small>
    </figcaption>
    <svg viewBox="0 0 8 8" role="img" aria-label={`Before ${review.playedSAN}, the engine suggests ${best.san}, from ${best.from} to ${best.to}`}>
      <defs>
        <pattern id={arrow + 'tiles'} width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#e8ecd9"/><path d="M1 0h1v1H1zM0 1h1v1H0z" fill="#829679"/></pattern>
        <marker id={arrow} viewBox="0 0 10 10" markerWidth="2.8" markerHeight="2.8" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#a63718"/></marker>
      </defs>
      <rect width="8" height="8" fill={`url(#${arrow}tiles)`}/>
      {pieces.map(piece => <image key={piece.square} {...point(piece.square, best.color)} width="1" height="1" href={`./pieces/${piece.color}${piece.type.toUpperCase()}.svg`}/>)}
      <line x1={from.x+.5} y1={from.y+.5} x2={to.x+.5} y2={to.y+.5} stroke="#a63718" strokeWidth=".14" strokeLinecap="round" markerEnd={`url(#${arrow})`}/>
    </svg>
  </figure>;
}
