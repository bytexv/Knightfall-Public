import { useEffect, useRef, useState } from "react";
import { LocalEngine } from "../lib/engine";
import type { GameSession } from "../lib/game";
import { reviewMove, summarizeReview, type MoveReview } from "../lib/review";
import { readSavedReview, reviewLine, storeReview } from "../lib/review-store";
import { saveGame, type Settings } from "../lib/storage";

export default function FinishReview({
  game,
  settings,
}: {
  game: GameSession;
  settings: Settings;
}) {
  const key = game.id + reviewLine(game),
    [list, setList] = useState<MoveReview[] | null>(
      () => readSavedReview(game)?.list || null,
    );
  const [state, setState] = useState<
      "running" | "paused" | "complete" | "error"
    >(list ? "complete" : "running"),
    [progress, setProgress] = useState(0),
    [attempt, setAttempt] = useState(0),
    [warning, setWarning] = useState("");
  const [side, setSide] = useState(game.playerColor),
    control = useRef<() => void>(() => {});
  useEffect(() => {
    const saved = readSavedReview(game);
    if (saved) {
      setList(saved.list);
      setState("complete");
      return;
    }
    if (!game.moves.length) {
      setState("complete");
      setList([]);
      return;
    }
    let active = true;
    const engine = new LocalEngine({
      mode: settings.engineMode,
      threads: settings.engineThreads,
    });
    control.current = () => {
      active = false;
      engine.destroy();
      setState("paused");
    };
    setState("running");
    setProgress(0);
    setList(null);
    setWarning("");
    void (async () => {
      try {
        const options = {
          depth: 14,
          movetime: Math.min(settings.analysisTime, 650),
          multiPV: 3,
        };
        let before = await engine.analyze(game.startFen, options);
        const completed: MoveReview[] = [];
        for (let i = 0; i < game.moves.length; i++) {
          if (!active) return;
          const after = await engine.analyze(game.moves[i].fen, options);
          if (!active) return;
          completed.push(
            reviewMove(i, game.moves[i], before, after, {
              startFen: game.startFen,
              moves: game.moves,
            }),
          );
          before = after;
          setProgress(i + 1);
        }
        if (active) {
          setList(completed);
          setState("complete");
          const savedGame = saveGame(game);
          const saved = storeReview(game, completed, 14);
          if (!savedGame || !saved.summarySaved)
            setWarning(
              "Review finished, but device storage could not save it.",
            );
        }
      } catch (error) {
        if (active) setState("error");
      } finally {
        engine.destroy();
      }
    })();
    return () => {
      active = false;
      engine.destroy();
    };
  }, [
    key,
    attempt,
    settings.engineMode,
    settings.engineThreads,
    settings.analysisTime,
  ]);
  const summary = list ? summarizeReview(list)[side] : null;
  const local = game.mode === "local",
    counts = summary?.counts;
  return (
    <section className="finish-review" aria-label="Finished game move summary">
      <div className="finish-review-heading">
        <strong>
          {local ? `${side === "w" ? "White" : "Black"}’s moves` : "Your moves"}
        </strong>
        {local && (
          <select
            aria-label="Review player"
            value={side}
            onChange={(e) => setSide(e.target.value as "w" | "b")}
          >
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        )}
      </div>
      {state === "running" ? (
        <div className="finish-review-progress" role="status">
          <span>
            Reviewing your game · {progress} / {game.moves.length} moves
          </span>
          <progress max={game.moves.length} value={progress} />
          <button className="text-button" onClick={() => control.current()}>
            Stop review
          </button>
        </div>
      ) : state !== "complete" ? (
        <p role="status">
          {state === "error" ? "Review could not finish." : "Review paused."}{" "}
          <button
            className="text-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </p>
      ) : (
        <>
          <div className="finish-accuracy">
            <strong>
              {summary?.quality === null || !summary
                ? "—"
                : `${summary.quality}%`}
            </strong>
            <span>
              {local ? "Move accuracy" : "Your move accuracy"}
              <small>
                Local estimate · {summary?.evaluatedMoves || 0} evaluated
                decisions
              </small>
            </span>
          </div>
          <div className="finish-counts">
            {[
              ["Brilliant", counts?.Brilliant],
              ["Great", counts?.Great],
              [
                "Good",
                counts ? counts.Best + counts.Excellent + counts.Good : 0,
              ],
              ["Inaccuracies", counts?.Inaccuracy],
              ["Mistakes", counts?.Mistake],
              ["Blunders", counts?.Blunder],
              ["Misses", counts?.Miss],
            ].map(([label, n]) => (
              <div key={label} data-move-class={label}>
                <strong>{n ?? 0}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Good includes Best, Excellent and Good moves. Book and forced moves
            do not inflate accuracy. A dash means there is not enough reliable
            analysis.
          </p>
        </>
      )}
      {warning && <p role="status">{warning}</p>}
    </section>
  );
}
