import { useEffect, useState } from "react";
import type { MoveRecord } from "../lib/game";
import { LocalEngine } from "../lib/engine";
import { reviewMove, type MoveReview } from "../lib/review";
import type { Settings } from "../lib/storage";
import ChessBoard from "./ChessBoard";

/** The parent keys this card by the player's move. A bot reply does not replace it. */
export default function MoveCoach({ move, index, settings, onStop }: {
  move: MoveRecord; index: number; settings: Settings; onStop: () => void;
}) {
  const [feedback, setFeedback] = useState<MoveReview | null>(null);
  const [showPosition, setShowPosition] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const engine = new LocalEngine({ mode: settings.engineMode, threads: settings.engineThreads });
    const options = { depth: 16, movetime: 1000 };
    async function compare() {
      try {
        const before = await engine.analyze(move.before, options);
        if (!active || before.bestMove === move.from + move.to + (move.promotion || "")) return;
        const after = await engine.analyze(move.fen, options);
        if (!active) return;
        const result = reviewMove(index, move, before, after);
        if (result.confidence !== "limited" && result.bestSAN && result.best !== result.played &&
            ["Miss", "Mistake", "Blunder"].includes(result.label)) setFeedback(result);
      } catch {
        if (active) setUnavailable(true);
      } finally {
        engine.destroy();
      }
    }
    void compare();
    return () => { active = false; engine.destroy(); };
  }, [index, move.before, move.fen, settings.engineMode, settings.engineThreads]);
  return <aside className="move-coach" aria-label="Automatic move coach">
    <div><strong>Move coach</strong><button className="text-button" onClick={onStop}>Turn off feedback</button></div>
    <div aria-live="polite">{feedback && <section>
      <p>After <b>{move.san}</b>, the engine prefers <strong>{feedback.bestSAN}</strong>.</p>
      <small>Possible {feedback.label.toLowerCase()} · local search depth {Math.min(feedback.before.depth, feedback.after.depth)}</small>
      <details onToggle={event => setShowPosition(event.currentTarget.open)}><summary>See the earlier position</summary>
        {showPosition && <ChessBoard fen={move.before} orientation={move.color} disabled theme={settings.boardTheme}
          arrows={[{from:feedback.best.slice(0,2), to:feedback.best.slice(2,4)}]}/>}
        <p>Suggested line · {feedback.pvSAN.slice(0,5).join(" ")}</p>
      </details>
    </section>}{unavailable && <small>Feedback was unavailable for this move.</small>}</div>
  </aside>;
}
