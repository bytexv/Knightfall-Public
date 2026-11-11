import { Chess } from "chess.js";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Flame,
  Heart,
  Infinity as InfinityIcon,
  RotateCcw,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  advanceRush,
  finishRush,
  playRushMove,
  playRushReply,
  rushCourse,
  rushElapsed,
  rushModes,
  rushPuzzle,
  rushStamp,
  rushTimeLeft,
  sanitizeRushBests,
  startRush,
  tickRush,
  type RushMode,
  type RushState,
} from "../lib/puzzle-rush";
import {
  playSound,
  readStore,
  sanitizeSettings,
  writeStore,
} from "../lib/storage";
import ChessBoard from "./ChessBoard";
import "./PuzzleRush.css";

const BEST_KEY = "rush-bests-v1";
const READY_FEN = new Chess().fen();
const clockText = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
export default function PuzzleRush({
  onStudyPuzzle,
}: {
  onStudyPuzzle?: (id: string) => void;
}) {
  const [mode, setMode] = useState<RushMode>("three");
  const [run, setRun] = useState<RushState | null>(null);
  const [now, setNow] = useState(Date.now);
  const [bests, setBests] = useState(() =>
    sanitizeRushBests(readStore(BEST_KEY, null)),
  );
  const [settings] = useState(() =>
    sanitizeSettings(readStore("settings", null)),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const oldBest = useRef(0);
  const savedRun = useRef<string | null>(null);
  const active = !!run && run.phase !== "finished";
  const puzzle = run ? rushPuzzle(run) : rushCourse[0];
  const playerColor = new Chess(puzzle.fen).turn();
  const selectedMode = rushModes.find(
    (item) => item.id === (run?.mode || mode),
  )!;
  const timeLeft = run ? rushTimeLeft(run, now) : selectedMode.duration;
  const displayedTime = run
    ? (timeLeft ?? rushElapsed(run, now))
    : (timeLeft ?? 0);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      setRun((current) => (current ? tickRush(current, time) : current));
    };
    const interval = setInterval(tick, 200);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active]);

  useEffect(() => {
    if (!run || !["reply", "solved"].includes(run.phase)) return;
    const stamp = rushStamp(run);
    const reply = run.phase === "reply";
    let current = true;
    const timer = setTimeout(
      () => {
        if (!current) return;
        const time = Date.now();
        setNow(time);
        setRun((state) =>
          state
            ? reply
              ? playRushReply(state, stamp, time)
              : advanceRush(state, time, stamp)
            : state,
        );
      },
      reply ? 400 : 700,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [run?.runId, run?.phase, run?.index, run?.ply]);

  useEffect(() => {
    if (!run || run.phase !== "finished" || savedRun.current === run.runId)
      return;
    savedRun.current = run.runId;
    const stored = sanitizeRushBests(readStore(BEST_KEY, null));
    const next = {
      three: Math.max(bests.three, stored.three),
      five: Math.max(bests.five, stored.five),
      survival: Math.max(bests.survival, stored.survival),
    };
    next[run.mode] = Math.max(next[run.mode], run.score);
    setBests(next);
    setSaveFailed(!writeStore(BEST_KEY, next));
  }, [run?.phase, run?.runId]);

  function begin() {
    const time = Date.now();
    const stored = sanitizeRushBests(readStore(BEST_KEY, null));
    const nextBests = {
      three: Math.max(bests.three, stored.three),
      five: Math.max(bests.five, stored.five),
      survival: Math.max(bests.survival, stored.survival),
    };
    oldBest.current = nextBests[mode];
    setBests(nextBests);
    setNow(time);
    setConfirmStop(false);
    setSaveFailed(false);
    setRun(startRush(mode, time));
  }
  function move(from: string, to: string, promotion?: string) {
    const time = Date.now();
    setNow(time);
    setRun((current) =>
      current
        ? playRushMove(current, from + to + (promotion || ""), time)
        : current,
    );
    if (settings.sound) playSound("move");
  }
  function continueRun() {
    const time = Date.now();
    setNow(time);
    setRun((current) => (current ? advanceRush(current, time) : current));
  }
  function stop() {
    const time = Date.now();
    setNow(time);
    setRun((current) =>
      current ? finishRush(tickRush(current, time), "stopped", time) : current,
    );
    setConfirmStop(false);
  }
  const status = !run
    ? "Ready when you are."
    : run.phase === "reply"
      ? "Your opponent responds…"
      : run.phase === "solved"
        ? "Found it. One point earned."
        : run.phase === "mistake"
          ? "One life down. A new position awaits."
          : run.phase === "finished"
            ? "Take a breath. Take a lesson."
            : `${playerColor === "w" ? "White" : "Black"} to move. Find the best sequence.`;
  const finishedTitle =
    run?.finishReason === "completed"
      ? "That is the whole course."
      : run?.finishReason === "time"
        ? "Time. Nicely focused."
        : run?.finishReason === "lives"
          ? "Every miss teaches you."
          : run?.finishReason === "error"
            ? "This run hit a snag."
            : "A little practice adds up.";

  return (
    <section className="rush-layout" aria-label="Tactics Sprint">
      <div className="rush-board-column">
        <div className="rush-board-meta">
          <span>
            <Flame size={16} /> TACTICS SPRINT
          </span>
          <span>
            {run
              ? `Position ${run.index + 1} of ${rushCourse.length}`
              : `${rushCourse.length} positions. One progressive course.`}
          </span>
        </div>
        <div className="rush-player">
          <div>
            <img src={`./pieces/${playerColor}K.svg`} alt="" />
            <span>
              <strong>
                You play {playerColor === "w" ? "White" : "Black"}
              </strong>
              <small>
                {run && run.phase !== "finished"
                  ? "Find the full continuation"
                  : "Checks. Captures. Threats."}
              </small>
            </span>
          </div>
          <div
            className={`rush-clock ${active && timeLeft !== null && timeLeft < 30000 ? "urgent" : ""}`}
            aria-label={timeLeft === null ? "Elapsed time" : "Time remaining"}
          >
            <Clock3 size={18} />
            <strong>
              {!run && timeLeft === null ? "∞" : clockText(displayedTime)}
            </strong>
          </div>
        </div>
        <div className="rush-board-wrap">
          <ChessBoard
            fen={run?.fen || READY_FEN}
            orientation={playerColor}
            onMove={move}
            disabled={!run || run.phase !== "playing"}
            lastMove={run?.lastMove}
            theme={settings.boardTheme}
            showCoordinates={settings.coordinates}
            showLegalMoves={settings.legalMoves}
          />
          {!run && (
            <div className="rush-ready-cover">
              <span>
                <Zap size={26} />
                <strong>Trust your calculation.</strong>
                <small>Choose your pace, then make your first move.</small>
              </span>
            </div>
          )}
        </div>
        <div
          className={`rush-board-status ${run?.phase || "ready"}`}
          role="status"
        >
          {run?.phase === "solved" ? (
            <Check size={18} />
          ) : run?.phase === "mistake" ? (
            <X size={18} />
          ) : (
            <Flame size={17} />
          )}
          <span>{status}</span>
          {run?.phase === "mistake" && (
            <button className="text-button" onClick={continueRun}>
              Continue <ArrowRight size={15} />
            </button>
          )}
        </div>
        {active && (
          <div className="rush-live-note">
            <span>
              The clock keeps running if you leave this tab. Leaving this page
              ends the run.
            </span>
            {confirmStop ? (
              <div>
                <span>Finish this run?</span>
                <button className="text-button" onClick={stop}>
                  Finish
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirmStop(false)}
                >
                  Keep going
                </button>
              </div>
            ) : (
              <button
                className="text-button"
                onClick={() => setConfirmStop(true)}
              >
                Finish run
              </button>
            )}
          </div>
        )}
        {run?.phase === "finished" && (
          <div className="rush-source-note">
            Positions from the{" "}
            <a
              href="https://database.lichess.org/#puzzles"
              target="_blank"
              rel="noreferrer"
            >
              Lichess CC0 database
            </a>
            . Puzzle ratings describe these exercises, not your playing
            strength.
          </div>
        )}
      </div>
      <aside className="rush-panel">
        {!run ? (
          <section className="card rush-setup">
            <span className="soft-badge">A LITTLE FIRE FOR YOUR FOCUS</span>
            <div className="rush-hero-icon">
              <Flame size={34} />
            </div>
            <h2>
              Three lives.
              <br />
              One more move.
            </h2>
            <p>
              Solve a sequence. Earn a point. The positions get harder as you
              go.
            </p>
            <div className="rush-mode-label">CHOOSE YOUR PACE</div>
            <div className="rush-modes">
              {rushModes.map((item) => (
                <button
                  key={item.id}
                  className={mode === item.id ? "selected" : ""}
                  onClick={() => setMode(item.id)}
                  aria-pressed={mode === item.id}
                >
                  {item.id === "survival" ? (
                    <InfinityIcon size={20} />
                  ) : (
                    <Clock3 size={20} />
                  )}
                  <strong>{item.label}</strong>
                  <small>Best: {bests[item.id]}</small>
                </button>
              ))}
            </div>
            <p className="rush-mode-description">
              {rushModes.find((item) => item.id === mode)?.description}
            </p>
            <button className="button primary full" onClick={begin}>
              <Zap size={17} /> Start{" "}
              {mode === "survival"
                ? "survival"
                : mode === "three"
                  ? "3-minute run"
                  : "5-minute run"}
              <ArrowRight size={17} />
            </button>
            <div className="rush-rules">
              <span>
                <Heart size={16} /> Three misses end your run.
              </span>
              <span>
                <Check size={16} /> Finish every move in the line to score.
              </span>
              <span>
                <Trophy size={16} /> Personal bests stay on this device.
              </span>
            </div>
            <p className="rush-footnote">
              Practice the same progressive course and build pattern
              recognition. Scores stay on this device.
            </p>
          </section>
        ) : (
          <>
            <section
              className={`card rush-score-card ${run.phase === "finished" ? "is-finished" : ""}`}
            >
              <div className="rush-score-heading">
                <span className="soft-badge">
                  {run.phase === "finished"
                    ? "RUN COMPLETE"
                    : selectedMode.label.toUpperCase()}
                </span>
                <Flame size={23} />
              </div>
              <div className="rush-score">
                <strong aria-label={`${run.score} puzzles solved`}>
                  {run.score}
                </strong>
                <span>puzzles solved</span>
              </div>
              <div
                className="rush-lives"
                role="img"
                aria-label={`${run.lives} lives remaining`}
              >
                {[0, 1, 2].map((index) => (
                  <Heart
                    key={index}
                    size={23}
                    fill={index < run.lives ? "currentColor" : "none"}
                    className={index < run.lives ? "" : "lost"}
                  />
                ))}
              </div>
              {run.phase === "finished" ? (
                <>
                  <h2>{finishedTitle}</h2>
                  <p>
                    {run.score > oldBest.current &&
                    run.score === bests[run.mode]
                      ? "A new personal best. Keep that pattern recognition growing."
                      : run.finishReason === "error"
                        ? "No points were awarded for the incomplete position. Start a fresh run to try again."
                        : "Revisit a missed idea while it is fresh. That is where the next point comes from."}
                  </p>
                  <div className="rush-result-stats">
                    <div>
                      <strong>{clockText(rushElapsed(run, now))}</strong>
                      <span>time spent</span>
                    </div>
                    <div>
                      <strong>
                        {
                          run.attempts.filter(
                            (item) => item.outcome === "missed",
                          ).length
                        }
                      </strong>
                      <span>misses</span>
                    </div>
                    <div>
                      <strong>{bests[run.mode]}</strong>
                      <span>personal best</span>
                    </div>
                  </div>
                  <button className="button primary full" onClick={begin}>
                    <RotateCcw size={17} /> Try again <ArrowRight size={17} />
                  </button>
                  <button
                    className="text-button full"
                    onClick={() => {
                      setRun(null);
                      setConfirmStop(false);
                    }}
                  >
                    Choose another mode
                  </button>
                  {saveFailed && (
                    <p className="inline-error">
                      Your browser could not save this best score. The result is
                      still shown here.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="rush-active-stats">
                    <span>
                      Personal best<strong>{bests[run.mode]}</strong>
                    </span>
                    <span>
                      Current puzzle<strong>{puzzle.rating}</strong>
                    </span>
                  </div>
                  <div className="rush-sequence">
                    <span>Sequence progress</span>
                    <strong>
                      {run.ply} / {puzzle.solution.length}
                    </strong>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(100, (run.ply / puzzle.solution.length) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p>
                    {run.phase === "mistake"
                      ? "A miss costs one life. Continue when you are ready; the timer keeps moving."
                      : "Take a moment to calculate the reply. A complete sequence is worth one point."}
                  </p>
                  {run.phase === "mistake" && (
                    <button
                      className="button primary full"
                      onClick={continueRun}
                    >
                      Next position <ArrowRight size={17} />
                    </button>
                  )}
                </>
              )}
            </section>
            <section className="card rush-recap">
              <div className="panel-heading">
                <h2>
                  {run.phase === "finished"
                    ? "Ideas to take with you"
                    : "This run"}
                </h2>
                <span>{run.attempts.length}</span>
              </div>
              {run.attempts.length ? (
                <ol>
                  {run.attempts.map((attempt, index) => {
                    const item = rushCourse.find(
                      (p) => p.id === attempt.puzzleId,
                    )!;
                    return (
                      <li key={attempt.puzzleId}>
                        <span className={`rush-recap-icon ${attempt.outcome}`}>
                          {attempt.outcome === "solved" ? (
                            <Check size={15} />
                          ) : attempt.outcome === "missed" ? (
                            <X size={15} />
                          ) : (
                            <Clock3 size={15} />
                          )}
                        </span>
                        <div>
                          <strong>
                            {run.phase === "finished"
                              ? item.title
                              : `Position ${index + 1}`}
                          </strong>
                          <small>
                            {item.rating} ·{" "}
                            {attempt.outcome === "solved"
                              ? "Solved"
                              : attempt.outcome === "missed"
                                ? "Missed"
                                : "Unfinished"}
                          </small>
                        </div>
                        {run.phase === "finished" && onStudyPuzzle && (
                          <button
                            className="text-button"
                            onClick={() => onStudyPuzzle(item.id)}
                            aria-label={`Study ${item.title}`}
                          >
                            <BookOpen size={15} />
                            <span>Study</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="rush-recap-empty">
                  <Trophy size={25} />
                  <p>Your first point is one good idea away.</p>
                </div>
              )}
            </section>
          </>
        )}
      </aside>
    </section>
  );
}
