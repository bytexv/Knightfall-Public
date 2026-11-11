import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  Cpu,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocalEngine, type EngineResult } from "../lib/engine";
import { uciToSan, type GameSession } from "../lib/game";
import {
  evaluationSummary,
  formatEvaluation,
  moveReference,
  reviewMove,
  type MoveReview,
} from "../lib/review";
export type { MoveReview } from "../lib/review";

type Props = {
  fen: string;
  game: GameSession;
  onEvaluation: (value: number) => void;
  onArrow: (from: string, to: string) => void;
  onImport: () => void;
  onReviewSelect: (index: number) => void;
};
type ReviewState = {
  key: string;
  status: "idle" | "running" | "complete" | "stopped" | "error";
  list: MoveReview[];
  total: number;
  error: string;
};
const emptyReview = (key: string): ReviewState => ({
  key,
  status: "idle",
  list: [],
  total: 0,
  error: "",
});

export default function AnalysisPanel({
  fen,
  game,
  onEvaluation,
  onArrow,
  onImport,
  onReviewSelect,
}: Props) {
  const liveEngine = useRef<LocalEngine | null>(null);
  const reviewEngine = useRef<LocalEngine | null>(null);
  const reviewToken = useRef(0);
  const callbacks = useRef({ onEvaluation, onArrow });
  callbacks.current = { onEvaluation, onArrow };
  const [enabled, setEnabled] = useState(true);
  const [analysis, setAnalysis] = useState<{
    fen: string;
    result: EngineResult;
  } | null>(null);
  const [pendingFen, setPendingFen] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<{
    fen: string;
    message: string;
  } | null>(null);
  const [depth, setDepth] = useState(16);
  // Include the whole line, not just its length: branches can replace a move
  // without changing the game ID or the number of moves.
  const gameKey = useMemo(
    () =>
      JSON.stringify([
        game.id,
        game.startFen,
        game.moves.map((move) => [
          move.from,
          move.to,
          move.promotion || "",
          move.fen,
        ]),
      ]),
    [game.id, game.startFen, game.moves],
  );
  const latest = useRef({ fen, gameKey });
  latest.current = { fen, gameKey };
  const [reviewState, setReviewState] = useState<ReviewState>(() =>
    emptyReview(gameKey),
  );
  // These keys hide old output in the same render that a position/game changes,
  // before effects cancel the underlying searches.
  const result = analysis?.fen === fen ? analysis.result : null;
  const currentReview =
    reviewState.key === gameKey ? reviewState : emptyReview(gameKey);
  const reviewing = currentReview.status === "running";
  const reviews = currentReview.list;
  const busy = pendingFen === fen && enabled && !reviewing;
  const error = liveError?.fen === fen ? liveError.message : "";

  useEffect(() => {
    const live = new LocalEngine(),
      review = new LocalEngine();
    liveEngine.current = live;
    reviewEngine.current = review;
    return () => {
      reviewToken.current++;
      live.destroy();
      review.destroy();
      liveEngine.current = null;
      reviewEngine.current = null;
    };
  }, []);

  useEffect(() => {
    setAnalysis(null);
    setLiveError(null);
    callbacks.current.onEvaluation(0);
  }, [fen]);

  useEffect(() => {
    reviewToken.current++;
    reviewEngine.current?.cancel();
    setReviewState(emptyReview(gameKey));
  }, [gameKey]);

  useEffect(() => {
    const engine = liveEngine.current;
    if (!enabled || reviewing || !engine) {
      setPendingFen(null);
      return;
    }
    let cancelled = false;
    setPendingFen(fen);
    setLiveError(null);
    engine.cancel();
    const timer = setTimeout(() => {
      void engine
        .analyze(fen, { depth, movetime: 1200, multiPV: 3 })
        .then((next) => {
          if (cancelled || latest.current.fen !== fen) return;
          setAnalysis({ fen, result: next });
          callbacks.current.onEvaluation(next.score);
          setPendingFen(null);
        })
        .catch((reason: unknown) => {
          if (cancelled || latest.current.fen !== fen) return;
          setPendingFen(null);
          if (!(reason instanceof Error) || reason.name !== "AbortError") {
            setLiveError({
              fen,
              message:
                "Engine unavailable. Switch analysis off and on to try again.",
            });
          }
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      engine.cancel();
    };
  }, [fen, enabled, depth, reviewing]);

  async function review() {
    const engine = reviewEngine.current;
    if (!engine || !game.moves.length || reviewing) return;
    const token = ++reviewToken.current;
    const key = gameKey;
    const startFen = game.startFen;
    const moves = game.moves.map((move) => ({ ...move }));
    const isCurrent = () =>
      token === reviewToken.current && latest.current.gameKey === key;
    engine.cancel();
    setReviewState({
      key,
      status: "running",
      list: [],
      total: moves.length,
      error: "",
    });
    const list: MoveReview[] = [];
    try {
      let before = await engine.analyze(startFen, { movetime: 400, depth });
      if (!isCurrent()) return;
      for (let index = 0; index < moves.length; index++) {
        if (!isCurrent()) return;
        const after = await engine.analyze(moves[index].fen, {
          movetime: 400,
          depth,
        });
        if (!isCurrent()) return;
        list.push(reviewMove(index, moves[index], before, after));
        setReviewState({
          key,
          status: "running",
          list: [...list],
          total: moves.length,
          error: "",
        });
        before = after;
      }
      if (isCurrent())
        setReviewState({
          key,
          status: "complete",
          list: [...list],
          total: moves.length,
          error: "",
        });
    } catch (reason: unknown) {
      if (!isCurrent()) return;
      const aborted = reason instanceof Error && reason.name === "AbortError";
      setReviewState({
        key,
        status: aborted ? "stopped" : "error",
        list: [...list],
        total: moves.length,
        error: aborted
          ? ""
          : "Review paused. Your completed moves are below; try again to restart.",
      });
    }
  }

  function stop() {
    reviewToken.current++;
    reviewEngine.current?.cancel();
    setReviewState((previous) =>
      previous.key === gameKey
        ? { ...previous, status: "stopped", error: "" }
        : emptyReview(gameKey),
    );
  }

  const quality = reviews.length
    ? Math.round(
        Math.max(
          0,
          100 -
            reviews.reduce(
              (sum, item) => sum + Math.min(100, item.loss / 4),
              0,
            ) /
              reviews.length,
        ),
      )
    : null;
  const selectedReview = reviews.find(
    (item) => game.moves[item.index]?.fen === fen,
  );
  const selectedMove = selectedReview ? game.moves[selectedReview.index] : null;
  const progress = reviews.length;
  const summary = !enabled
    ? "Live analysis is paused"
    : reviewing && !result
      ? "Reviewing your game"
      : evaluationSummary(result);
  const detail = !enabled
    ? "Switch on to analyze this position"
    : reviewing
      ? "Live search pauses while your game is reviewed"
      : busy
        ? "Calculating…"
        : result
          ? `Depth ${result.depth} · evaluations from White’s perspective`
          : error
            ? "Try enabling analysis again"
            : "Preparing the local engine";

  return (
    <div className="analysis-stack">
      <section className="card analysis-card">
        <div className="panel-heading">
          <div className="icon-label">
            <Cpu size={18} />
            <h3>Local analysis</h3>
          </div>
          <button
            className={`switch ${enabled ? "on" : ""}`}
            role="switch"
            aria-checked={enabled}
            aria-label="Enable local engine"
            onClick={() => setEnabled((value) => !value)}
          >
            <span />
          </button>
        </div>
        <div className="engine-indicator">
          <span className={`status-dot ${busy ? "pulsing" : ""}`} />
          {result?.engine || "Stockfish 17.1 Lite"}
          <span>ON DEVICE</span>
        </div>
        <div className="evaluation-summary">
          <strong>{result ? formatEvaluation(result) : "—"}</strong>
          <div>
            {summary}
            <small>
              {busy && <LoaderCircle size={11} className="spin" />}
              {detail}
            </small>
          </div>
        </div>
        <div className="engine-lines">
          {enabled &&
            result?.lines.slice(0, 3).map((line, index) => (
              <button
                key={index}
                className="engine-line"
                disabled={!line.pv[0]}
                onClick={() => {
                  const move = line.pv[0];
                  if (move)
                    callbacks.current.onArrow(
                      move.slice(0, 2),
                      move.slice(2, 4),
                    );
                }}
                title="Show suggested move"
              >
                <span className="line-score">{formatEvaluation(line, 1)}</span>
                <span>
                  {uciToSan(fen, line.pv.slice(0, 7)).join(" ") ||
                    "End of line"}
                </span>
                <ChevronDown size={13} />
              </button>
            ))}
        </div>
        <div className="engine-settings">
          <span>Depth limit</span>
          <select
            aria-label="Analysis depth"
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
          >
            <option value="12">12 · Fast</option>
            <option value="16">16 · Balanced</option>
            <option value="20">20 · Deep</option>
            <option value="24">24 · Maximum</option>
          </select>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <p className="privacy-note">
          <Check size={13} /> Your positions stay on your device.
        </p>
      </section>
      <section className="card review-card">
        <div className="panel-heading">
          <div className="icon-label">
            <Sparkles size={18} />
            <h3>Game review</h3>
          </div>
          {quality !== null && (
            <span className="soft-badge">
              {quality}%{" "}
              {currentReview.status === "complete" ? "quality" : "so far"}
            </span>
          )}
        </div>
        <p>Find the turning points. See what to improve on your next game.</p>
        {reviewing ? (
          <>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Game review progress"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={currentReview.total}
            >
              <span
                style={{
                  width: `${currentReview.total ? (progress / currentReview.total) * 100 : 0}%`,
                }}
              />
            </div>
            <button className="button secondary full" onClick={stop}>
              <X size={15} /> Stop · {progress}/{currentReview.total} moves
            </button>
          </>
        ) : (
          <button
            className="button primary full"
            onClick={() => void review()}
            disabled={!game.moves.length}
          >
            <Activity size={16} />
            {currentReview.status === "stopped" ||
            currentReview.status === "error"
              ? "Restart game review"
              : "Review this game"}
            <ArrowRight size={16} />
          </button>
        )}
        {currentReview.error && (
          <p className="inline-error" role="alert">
            {currentReview.error}
          </p>
        )}
        {currentReview.status === "stopped" && (
          <p className="fine-print" role="status">
            Review stopped. {progress} of {currentReview.total} moves analyzed.
          </p>
        )}
        {reviews.length > 0 && (
          <>
            <div className="eval-chart" aria-label="Game evaluation graph">
              {reviews.map((item) => (
                <button
                  key={item.index}
                  style={{
                    height: `${Math.min(90, Math.max(8, 50 + item.score / 30))}%`,
                  }}
                  className={item.score >= 0 ? "positive" : "negative"}
                  aria-label={`Move ${moveReference(game.moves[item.index], item.index)} ${game.moves[item.index].san}: ${item.label}, ${formatEvaluation(item)}`}
                  aria-current={
                    selectedReview?.index === item.index ? "step" : undefined
                  }
                  title={`Move ${moveReference(game.moves[item.index], item.index)} ${game.moves[item.index].san}: ${item.label}, ${formatEvaluation(item)}`}
                  onClick={() => onReviewSelect(item.index)}
                />
              ))}
            </div>
            {selectedReview && selectedMove && (
              <div className="review-focus">
                <div>
                  <strong>
                    {moveReference(selectedMove, selectedReview.index)}{" "}
                    {selectedMove.san}
                  </strong>
                  <span className="soft-badge">{selectedReview.label}</span>
                </div>
                <p>
                  {selectedReview.note ||
                    (selectedReview.label === "Best"
                      ? "You found the engine’s preferred move at this search depth."
                      : selectedReview.loss < 35
                        ? "This move keeps the position’s evaluation close to the best line."
                        : `About ${(selectedReview.loss / 100).toFixed(1)} pawns of estimated evaluation lost.`)}
                </p>
                {selectedReview.best && selectedReview.label !== "Best" && (
                  <button
                    className="text-button"
                    onClick={() => onReviewSelect(selectedReview.index - 1)}
                  >
                    Explore{" "}
                    {uciToSan(selectedMove.before, [selectedReview.best])[0] ||
                      selectedReview.best}{" "}
                    instead <ArrowRight size={13} />
                  </button>
                )}
              </div>
            )}
            <div className="review-list">
              {reviews
                .filter((item) => item.loss >= 35)
                .slice(0, 12)
                .map((item) => (
                  <button
                    key={item.index}
                    className="review-item"
                    aria-current={
                      selectedReview?.index === item.index ? "step" : undefined
                    }
                    onClick={() => onReviewSelect(item.index)}
                  >
                    <span
                      className={`move-quality ${item.label.toLowerCase()}`}
                    >
                      {item.label === "Blunder"
                        ? "??"
                        : item.label === "Mistake"
                          ? "?"
                          : "?!"}
                    </span>
                    <strong>
                      {moveReference(game.moves[item.index], item.index)}{" "}
                      {game.moves[item.index].san}
                    </strong>
                    <span>{item.label}</span>
                  </button>
                ))}
              {reviews.every((item) => item.loss < 35) && (
                <p className="muted">
                  {currentReview.status === "complete"
                    ? "A clean game at this search depth."
                    : "No major evaluation losses in the moves reviewed so far."}
                </p>
              )}
            </div>
            <p className="fine-print">
              Quality is a local estimate from capped evaluation loss, not an
              official rating or accuracy score. Mate transitions are handled
              separately. Short searches can miss tactics.
            </p>
          </>
        )}
      </section>
      <button className="text-button import-link" onClick={onImport}>
        Import a PGN or FEN <ArrowRight size={15} />
      </button>
    </div>
  );
}
