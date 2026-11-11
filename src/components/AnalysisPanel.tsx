import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Cpu,
  LoaderCircle,
  RotateCcw,
  Target,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocalEngine, type EngineResult } from "../lib/engine";
import { bots, uciToSan, type GameSession } from "../lib/game";
import {
  evaluationSummary,
  formatEvaluation,
  moveClassifications,
  moveReference,
  reviewMove,
  summarizeReview,
  type MoveReview,
} from "../lib/review";
import "./AnalysisPanel.css";
export type { MoveReview } from "../lib/review";

export type AnalysisPanelProps = {
  fen: string;
  game: GameSession;
  /** Index of the last played main-line move; -1 is the starting position. */
  activeIndex?: number;
  onEvaluation: (value: number) => void;
  onArrow: (from: string, to: string) => void;
  onImport: () => void;
  onReviewSelect: (index: number) => void;
  /** Explore UCI moves from the position AFTER beforeIndex without changing the game. */
  onPreviewLine?: (beforeIndex: number, moves: string[]) => void;
  /** Return to the position before this move for an independent attempt. */
  onRetryMove?: (moveIndex: number) => void;
  onActiveReview?: (review: MoveReview | null) => void;
};
type ReviewState = {
  key: string;
  status: "idle" | "running" | "complete" | "stopped" | "error";
  list: MoveReview[];
  total: number;
  depth: number;
  error: string;
};
const emptyReview = (key: string): ReviewState => ({
  key,
  status: "idle",
  list: [],
  total: 0,
  depth: 16,
  error: "",
});
const qualityMarks: Record<string, string> = {
  Brilliant: "!!",
  Great: "!",
  Best: "★",
  Excellent: "✓",
  Good: "✓",
  Book: "B",
  Inaccuracy: "?!",
  Mistake: "?",
  Miss: "–",
  Blunder: "??",
};
const isMistake = (item: MoveReview) =>
  ["Inaccuracy", "Mistake", "Miss", "Blunder"].includes(item.label);
const isKeyMove = (item: MoveReview) =>
  ["Great", "Brilliant", "Mistake", "Miss", "Blunder"].includes(item.label);
const isAbort = (reason: unknown) =>
  reason instanceof Error && reason.name === "AbortError";
function cacheResult(
  cache: Map<string, EngineResult>,
  key: string,
  result: EngineResult,
) {
  cache.delete(key);
  cache.set(key, result);
  if (cache.size > 180) cache.delete(cache.keys().next().value!);
}
function QualityBadge({
  item,
  large = false,
}: {
  item: MoveReview;
  large?: boolean;
}) {
  return (
    <span
      className={`review-quality ${item.label.toLowerCase()} ${large ? "is-large" : ""}`}
    >
      <b aria-hidden="true">{qualityMarks[item.label]}</b>
      <span>{item.label}</span>
    </span>
  );
}

export default function AnalysisPanel({
  fen,
  game,
  activeIndex,
  onEvaluation,
  onArrow,
  onImport,
  onReviewSelect,
  onPreviewLine,
  onRetryMove,
  onActiveReview,
}: AnalysisPanelProps) {
  const liveEngine = useRef<LocalEngine | null>(null);
  const reviewEngine = useRef<LocalEngine | null>(null);
  const reviewToken = useRef(0);
  const positionCache = useRef(new Map<string, EngineResult>());
  const reviewCache = useRef(new Map<string, ReviewState>());
  const callbacks = useRef({
    onEvaluation,
    onArrow,
    onReviewSelect,
    onActiveReview,
  });
  callbacks.current = { onEvaluation, onArrow, onReviewSelect, onActiveReview };
  const [tab, setTab] = useState<"review" | "live">("review");
  const [filter, setFilter] = useState<"mistakes" | "all">("mistakes");
  const [enabled, setEnabled] = useState(true);
  const [analysis, setAnalysis] = useState<{
    key: string;
    result: EngineResult;
  } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [depth, setDepth] = useState(16);
  // A same-length replacement is a different line. Board navigation is not.
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
  const liveKey = `${depth}:${fen}`;
  const latest = useRef({ fen, gameKey, liveKey, tab });
  latest.current = { fen, gameKey, liveKey, tab };
  const [reviewState, setReviewState] = useState<ReviewState>(() =>
    emptyReview(gameKey),
  );
  const currentReview = useMemo(
    () => (reviewState.key === gameKey ? reviewState : emptyReview(gameKey)),
    [reviewState, gameKey],
  );
  const reviews = currentReview.list;
  const reviewing = currentReview.status === "running";
  // Keyed output prevents a stale result flashing before effect cleanup runs.
  const result = analysis?.key === liveKey ? analysis.result : null;
  const busy =
    pendingKey === liveKey && enabled && tab === "live" && !reviewing;
  const error = liveError?.key === liveKey ? liveError.message : "";
  const selectedIndex =
    activeIndex ?? game.moves.findIndex((move) => move.fen === fen);
  const selectedReview =
    reviews.find((item) => item.index === selectedIndex) ?? null;
  const selectedMove = selectedReview ? game.moves[selectedReview.index] : null;
  const summary = useMemo(
    () =>
      summarizeReview(
        reviews,
        game.rating
          ? {
              opponentElo: game.rating.opponentRating,
              playerColor: game.rating.playerColor,
            }
          : game.mode === "bot"
            ? {
                opponentElo: bots.find((bot) => bot.id === game.botId)?.elo,
                playerColor: game.playerColor,
              }
            : undefined,
      ),
    [reviews, game.rating, game.mode, game.botId, game.playerColor],
  );

  function saveReview(next: ReviewState) {
    reviewCache.current.delete(next.key);
    reviewCache.current.set(next.key, next);
    if (reviewCache.current.size > 5)
      reviewCache.current.delete(reviewCache.current.keys().next().value!);
    setReviewState(next);
  }

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
    reviewToken.current++;
    reviewEngine.current?.cancel();
    const cached = reviewCache.current.get(gameKey);
    setReviewState(
      cached
        ? {
            ...cached,
            status: cached.status === "running" ? "stopped" : cached.status,
          }
        : emptyReview(gameKey),
    );
  }, [gameKey]);

  useEffect(() => {
    callbacks.current.onActiveReview?.(selectedReview);
  }, [selectedReview]);

  useEffect(() => {
    callbacks.current.onEvaluation(
      tab === "review"
        ? (selectedReview?.score ?? 0)
        : enabled
          ? (result?.score ?? 0)
          : 0,
    );
  }, [fen, tab, selectedReview, result, enabled]);

  useEffect(() => {
    const engine = liveEngine.current;
    if (!enabled || tab !== "live" || reviewing || !engine) {
      setPendingKey(null);
      return;
    }
    let cancelled = false;
    const key = liveKey;
    const cached = positionCache.current.get(`live:${key}`);
    setLiveError(null);
    if (cached) {
      setAnalysis({ key, result: cached });
      setPendingKey(null);
      return;
    }
    setPendingKey(key);
    engine.cancel();
    const timer = setTimeout(() => {
      void engine
        .analyze(fen, { depth, movetime: 1200, multiPV: 3 })
        .then((next) => {
          if (
            cancelled ||
            latest.current.liveKey !== key ||
            latest.current.tab !== "live"
          )
            return;
          cacheResult(positionCache.current, `live:${key}`, next);
          setAnalysis({ key, result: next });
          setPendingKey(null);
        })
        .catch((reason: unknown) => {
          if (
            cancelled ||
            latest.current.liveKey !== key ||
            latest.current.tab !== "live"
          )
            return;
          setPendingKey(null);
          if (!isAbort(reason))
            setLiveError({
              key,
              message:
                "Engine unavailable. Switch analysis off and on to try again.",
            });
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      engine.cancel();
    };
  }, [fen, liveKey, enabled, depth, reviewing, tab]);

  async function review() {
    const engine = reviewEngine.current;
    if (!engine || !game.moves.length || reviewing) return;
    const token = ++reviewToken.current;
    const key = gameKey;
    const moves = game.moves.map((move) => ({ ...move }));
    const startFen = game.startFen;
    const isCurrent = () =>
      token === reviewToken.current && latest.current.gameKey === key;
    const list: MoveReview[] = [];
    const nextState = (
      status: ReviewState["status"],
      error = "",
    ): ReviewState => ({
      key,
      status,
      list: [...list],
      total: moves.length,
      depth,
      error,
    });
    async function search(position: string) {
      const cacheKey = `review:${depth}:${position}`;
      const cached = positionCache.current.get(cacheKey);
      if (cached) return cached;
      const next = await engine!.analyze(position, {
        movetime: 650,
        depth,
        multiPV: 3,
      });
      if (isCurrent()) cacheResult(positionCache.current, cacheKey, next);
      return next;
    }
    engine.cancel();
    saveReview(nextState("running"));
    try {
      let before = await search(startFen);
      if (!isCurrent()) return;
      for (let index = 0; index < moves.length; index++) {
        if (!isCurrent()) return;
        const after = await search(moves[index].fen);
        if (!isCurrent()) return;
        list.push(
          reviewMove(index, moves[index], before, after, { startFen, moves }),
        );
        saveReview(nextState("running"));
        before = after;
      }
      if (isCurrent()) {
        saveReview(nextState("complete"));
        callbacks.current.onReviewSelect(
          (list.find(isKeyMove) ?? list[0]).index,
        );
      }
    } catch (reason: unknown) {
      if (!isCurrent()) return;
      saveReview(
        nextState(
          isAbort(reason) ? "stopped" : "error",
          isAbort(reason)
            ? ""
            : "Review paused. Completed moves are saved; restart to continue.",
        ),
      );
    }
  }
  function stop() {
    reviewToken.current++;
    reviewEngine.current?.cancel();
    saveReview({ ...currentReview, status: "stopped", error: "" });
  }
  function select(index: number) {
    onReviewSelect(index);
  }
  function showBest() {
    if (!selectedReview?.best) return;
    if (onPreviewLine) onPreviewLine(selectedReview.index - 1, []);
    else select(selectedReview.index - 1);
    onArrow(selectedReview.best.slice(0, 2), selectedReview.best.slice(2, 4));
  }
  const filtered = filter === "all" ? reviews : reviews.filter(isMistake);
  const nextKey = reviews.find(
    (item) => item.index > selectedIndex && isKeyMove(item),
  );
  const bestLine = selectedReview?.pv?.length
    ? selectedReview.pv
    : selectedReview?.best
      ? [selectedReview.best]
      : [];
  const points = reviews
    .map(
      (item, index) =>
        `${reviews.length === 1 ? 150 : (index / (reviews.length - 1)) * 300},${44 - Math.tanh(item.score / 400) * 36}`,
    )
    .join(" ");

  const reviewButton = (
    <button
      className={`button ${reviews.length ? "secondary review-run-compact" : "primary full"} review-run`}
      onClick={() => void review()}
      disabled={!game.moves.length}
    >
      {reviews.length ? <RotateCcw size={12} /> : <Activity size={16} />}
      {currentReview.status === "stopped" || currentReview.status === "error"
        ? "Restart game review"
        : "Review this game"}
      {!reviews.length && <ArrowRight size={16} />}
    </button>
  );

  return (
    <div className="analysis-stack analysis-studio">
      <section className="card analysis-workbench">
        <div
          className="analysis-tabs"
          role="tablist"
          aria-label="Analysis tools"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            event.stopPropagation();
            const next =
              event.key === "Home"
                ? "review"
                : event.key === "End"
                  ? "live"
                  : tab === "review"
                    ? "live"
                    : "review";
            setTab(next);
            event.currentTarget
              .querySelector<HTMLButtonElement>(`#analysis-tab-${next}`)
              ?.focus();
          }}
        >
          <button
            id="analysis-tab-review"
            role="tab"
            aria-selected={tab === "review"}
            aria-controls="analysis-review-panel"
            tabIndex={tab === "review" ? 0 : -1}
            onClick={() => setTab("review")}
          >
            <Activity size={16} /> Review
          </button>
          <button
            id="analysis-tab-live"
            role="tab"
            aria-selected={tab === "live"}
            aria-controls="analysis-live-panel"
            tabIndex={tab === "live" ? 0 : -1}
            onClick={() => setTab("live")}
          >
            <Cpu size={16} /> Live analysis
          </button>
        </div>
        {tab === "review" ? (
          <div
            id="analysis-review-panel"
            role="tabpanel"
            aria-labelledby="analysis-tab-review"
            className="review-workspace"
          >
            <div className="review-topline">
              <h2>Game review</h2>
              {reviews.length && !reviewing ? (
                reviewButton
              ) : (
                <span>{game.moves.length} moves</span>
              )}
            </div>
            {!reviews.length && !reviewing && (
              <div className="review-start-copy">
                <h3>Find the moves that mattered.</h3>
                <p>
                  Compare your decisions with Stockfish, then try the critical
                  positions again.
                </p>
                {!game.moves.length && (
                  <p className="review-empty-hint">
                    Play a game or import a PGN to begin.
                  </p>
                )}
              </div>
            )}
            {reviewing ? (
              <div className="review-progress">
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Game review progress"
                  aria-valuenow={reviews.length}
                  aria-valuemin={0}
                  aria-valuemax={currentReview.total}
                >
                  <span
                    style={{
                      width: `${currentReview.total ? (reviews.length / currentReview.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <button className="review-stop" onClick={stop}>
                  <LoaderCircle size={14} className="spin" />
                  <span>
                    Stop · {reviews.length}/{currentReview.total} moves
                  </span>
                  <X size={14} />
                </button>
              </div>
            ) : !reviews.length ? (
              reviewButton
            ) : null}
            {currentReview.error && (
              <p className="inline-error" role="alert">
                {currentReview.error}
              </p>
            )}
            {currentReview.status === "stopped" && (
              <p className="review-status" role="status">
                Review stopped. {reviews.length} of {currentReview.total} moves
                analyzed.
              </p>
            )}
            {!!reviews.length && (
              <>
                <div className="review-nav">
                  <button
                    aria-label="Previous move"
                    title="Previous move"
                    disabled={selectedIndex < 0}
                    onClick={() => select(selectedIndex - 1)}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span>
                    {selectedIndex < 0
                      ? "Starting position"
                      : `Move ${selectedIndex + 1} of ${game.moves.length}`}
                  </span>
                  <button
                    aria-label="Next move"
                    title="Next move"
                    disabled={selectedIndex >= game.moves.length - 1}
                    onClick={() => select(selectedIndex + 1)}
                  >
                    <ArrowRight size={16} />
                  </button>
                  <button
                    className="review-next-key"
                    aria-label="Next key move"
                    disabled={!nextKey}
                    onClick={() => nextKey && select(nextKey.index)}
                  >
                    Key move
                    <ChevronRight size={14} />
                  </button>
                </div>
                {selectedReview && selectedMove ? (
                  <div
                    className={`review-focus quality-${selectedReview.label.toLowerCase()}`}
                  >
                    <div className="review-focus-heading">
                      <strong>
                        {moveReference(selectedMove, selectedReview.index)}{" "}
                        {selectedMove.san}
                      </strong>
                      <span>{formatEvaluation(selectedReview)}</span>
                    </div>
                    <QualityBadge item={selectedReview} large />
                    <p>
                      {selectedReview.reason ||
                        selectedReview.note ||
                        "Compare this move with the engine’s preferred continuation."}
                    </p>
                    {selectedReview.best && (
                      <div className="review-alternative">
                        <div>
                          <span>
                            {selectedReview.played === selectedReview.best
                              ? "Engine continuation"
                              : "Engine’s choice"}
                          </span>
                          <strong>
                            {selectedReview.bestSAN ||
                              uciToSan(selectedMove.before, [
                                selectedReview.best,
                              ])[0] ||
                              selectedReview.best}
                          </strong>
                        </div>
                        <p className="review-pv">
                          {selectedReview.pvSAN?.slice(0, 7).join(" ") ||
                            uciToSan(selectedMove.before, bestLine).join(" ")}
                        </p>
                        <div className="review-line-actions">
                          <button onClick={showBest}>
                            <Target size={13} />
                            Show best move
                          </button>
                          <button
                            disabled={!onPreviewLine || !bestLine.length}
                            onClick={() =>
                              onPreviewLine?.(
                                selectedReview.index - 1,
                                bestLine,
                              )
                            }
                            title="Play through the engine continuation"
                          >
                            <ChevronRight size={13} />
                            Explore line
                          </button>
                          <button
                            disabled={!onRetryMove}
                            onClick={() => onRetryMove?.(selectedReview.index)}
                          >
                            <RotateCcw size={13} />
                            Retry move
                          </button>
                        </div>
                      </div>
                    )}
                    <small className="review-search-note">
                      {selectedReview.confidence === "limited"
                        ? "Limited search"
                        : "Stockfish review"}{" "}
                      · depth{" "}
                      {Math.min(
                        selectedReview.before.depth,
                        selectedReview.after.depth,
                      )}
                      . Forcing lines may need a deeper search.
                    </small>
                  </div>
                ) : (
                  <div className="review-position-prompt">
                    <Target size={20} />
                    <p>
                      {selectedIndex < 0
                        ? "This is the starting position."
                        : "This move has not been reviewed yet."}{" "}
                      Select a reviewed move on the graph or in the list.
                    </p>
                  </div>
                )}
                <div className="review-chart-heading">
                  <span>Game evaluation</span>
                  <small>White’s perspective</small>
                </div>
                <div className="eval-chart" aria-label="Game evaluation graph">
                  <div
                    className="review-chart-inner"
                    style={{
                      minWidth: `${Math.max(260, reviews.length * 7)}px`,
                    }}
                  >
                    <svg
                      viewBox="0 0 300 88"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d="M0 44H300" className="review-zero" />
                      <polyline points={points} />
                    </svg>
                    {reviews.map((item) => (
                      <button
                        key={item.index}
                        className={item.score >= 0 ? "positive" : "negative"}
                        aria-label={`Move ${moveReference(game.moves[item.index], item.index)} ${game.moves[item.index].san}: ${item.label}, ${formatEvaluation(item)}`}
                        aria-current={
                          selectedReview?.index === item.index
                            ? "step"
                            : undefined
                        }
                        title={`${moveReference(game.moves[item.index], item.index)} ${game.moves[item.index].san} · ${item.label} · ${formatEvaluation(item)}`}
                        onClick={() => select(item.index)}
                      />
                    ))}
                  </div>
                </div>
                <div
                  className="review-side-summary"
                  aria-label="Quality estimates by side"
                >
                  {(["w", "b"] as const).map((color) => {
                    const side = summary[color];
                    const estimate = side.performanceElo;
                    return (
                      <div key={color}>
                        <span className="review-side-name">
                          <i className={color} />
                          {color === "w"
                            ? game.whiteName || "White"
                            : game.blackName || "Black"}
                        </span>
                        <strong>
                          {side.quality === null
                            ? "—"
                            : `${Math.round(side.quality)}%`}
                        </strong>
                        <small>
                          move quality
                          {currentReview.status !== "complete"
                            ? " · so far"
                            : ""}
                        </small>
                        {estimate ? (
                          <p>
                            <b>
                              {estimate.range[0]}–{estimate.range[1]}
                            </b>
                            <span>training Elo range</span>
                          </p>
                        ) : side.performance ? (
                          <p>
                            <b>{side.performance.band}</b>
                            <span>
                              training performance · {side.performance.score}
                              /100
                            </span>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="review-estimate-note">
                  Local training estimates, not official accuracy or ratings.
                </p>
                <details className="review-breakdown">
                  <summary>Move breakdown</summary>
                  <p className="review-sample-note">
                    Eligible moves: White {summary.w.evaluatedMoves} · Black{" "}
                    {summary.b.evaluatedMoves}. Book and forced moves are
                    excluded from quality estimates.
                  </p>
                  <div className="review-breakdown-head">
                    <span>White</span>
                    <span>Classification</span>
                    <span>Black</span>
                  </div>
                  {moveClassifications
                    .filter(
                      (label) =>
                        summary.w.counts[label] + summary.b.counts[label] > 0,
                    )
                    .map((label) => (
                      <div className="review-breakdown-row" key={label}>
                        <strong>{summary.w.counts[label]}</strong>
                        <span
                          className={`review-quality ${label.toLowerCase()}`}
                        >
                          <b aria-hidden="true">{qualityMarks[label]}</b>
                          {label}
                        </span>
                        <strong>{summary.b.counts[label]}</strong>
                      </div>
                    ))}
                </details>
                <div className="review-list-heading">
                  <h3>Move notes</h3>
                  <div role="group" aria-label="Filter reviewed moves">
                    <button
                      aria-pressed={filter === "mistakes"}
                      onClick={() => setFilter("mistakes")}
                    >
                      Mistakes <span>{reviews.filter(isMistake).length}</span>
                    </button>
                    <button
                      aria-pressed={filter === "all"}
                      onClick={() => setFilter("all")}
                    >
                      All moves
                    </button>
                  </div>
                </div>
                <div className="review-list">
                  {filtered.map((item) => (
                    <button
                      key={item.index}
                      className="review-item"
                      aria-current={
                        selectedReview?.index === item.index
                          ? "step"
                          : undefined
                      }
                      onClick={() => select(item.index)}
                    >
                      <strong>
                        {moveReference(game.moves[item.index], item.index)}{" "}
                        {game.moves[item.index].san}
                      </strong>
                      <QualityBadge item={item} />
                      <span className="review-item-eval">
                        {formatEvaluation(item, 1)}
                      </span>
                    </button>
                  ))}
                  {!filtered.length && (
                    <p className="review-no-mistakes">
                      No significant losses{" "}
                      {currentReview.status === "complete"
                        ? "found in this review"
                        : "in the moves reviewed so far"}
                      . Select All moves to see every classification.
                    </p>
                  )}
                </div>
                <details className="review-method">
                  <summary>How this review is estimated</summary>
                  <p>
                    Labels and move quality come from local Stockfish searches.
                    Brilliant and Great require stronger evidence; short
                    searches can miss tactics. Book moves are excluded from
                    quality estimates. Training Elo, when shown, is an
                    uncalibrated range using the selected bot’s level and
                    sufficient reviewed moves. It is not a rated-game result or
                    a Chess.com rating.
                  </p>
                </details>
              </>
            )}
          </div>
        ) : (
          <div
            id="analysis-live-panel"
            role="tabpanel"
            aria-labelledby="analysis-tab-live"
            className="live-workspace"
          >
            <div className="panel-heading">
              <div className="icon-label">
                <Cpu size={17} />
                <h2>Position analysis</h2>
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
              <span>LOCAL</span>
            </div>
            <div className="evaluation-summary">
              <strong>
                {enabled && result ? formatEvaluation(result) : "—"}
              </strong>
              <div>
                {!enabled
                  ? "Live analysis is paused"
                  : reviewing
                    ? "Reviewing your game"
                    : evaluationSummary(result)}
                <small>
                  {busy && <LoaderCircle size={11} className="spin" />}
                  {!enabled
                    ? "Switch on to analyze this position"
                    : reviewing
                      ? "Live search pauses during game review"
                      : busy
                        ? "Calculating…"
                        : result
                          ? `Depth ${result.depth} · White’s perspective`
                          : error
                            ? "Try enabling analysis again"
                            : "Preparing the local engine"}
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
                      if (move) onArrow(move.slice(0, 2), move.slice(2, 4));
                    }}
                    title="Show suggested move"
                  >
                    <span className="line-score">
                      {formatEvaluation(line, 1)}
                    </span>
                    <span>
                      {uciToSan(fen, line.pv.slice(0, 7)).join(" ") ||
                        "End of line"}
                    </span>
                    <ChevronRight size={13} />
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
              <Check size={13} />
              Select a line to mark its first move on the board.
            </p>
          </div>
        )}
      </section>
      <button className="text-button import-link" onClick={onImport}>
        Import a PGN or FEN <ArrowRight size={15} />
      </button>
    </div>
  );
}
