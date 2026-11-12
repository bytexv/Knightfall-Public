import {
  italianLesson,
  previousPlayerTurn,
  type GuidedLesson,
} from "../data/opening-coach";
import { playedAlienGambit } from "../lib/alien-gambit";
import { AlienAudio } from "./AlienAudio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { Chess, type Color } from "chess.js";
import {
  learningPosition,
  learningGoal,
  explainLearningMove,
} from "../data/guided-game";
import { LocalEngine } from "../lib/engine";
import { chooseBotMove } from "../lib/bot-policy";
import ChessBoard from "./ChessBoard";
import { Modal } from "./Dialogs";
import "./LearningModes.css";
type Mode = "guided" | "practice";
const progressKey = "knightfall:guided-opening";
export function LearningModes({
  onBasics,
  alienEnabled,
  alienAudioEnabled,
}: {
  onBasics: () => void;
  alienEnabled?: boolean;
  alienAudioEnabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [round, setRound] = useState(0);
  const [completed, setCompleted] = useState(() => {
    try {
      return localStorage.getItem(progressKey) === "complete";
    } catch {
      return false;
    }
  });
  const close = useCallback(() => setMode(null), []);
  const complete = useCallback(() => {
    setCompleted(true);
    try {
      localStorage.setItem(progressKey, "complete");
    } catch {
      /* Session progress still works. */
    }
  }, []);
  return (
    <>
      <section className="learning-modes" aria-label="Choose a learning mode">
        <div className="learning-modes-heading">
          <span className="lh-eyebrow">YOUR PACE, YOUR WAY</span>
          <h2>How would you like to learn?</h2>
          <p>
            Start with a single move, follow a whole opening, or try your own
            ideas against a bot.
          </p>
        </div>
        <div className="learning-mode-grid">
          <article>
            <span className="learning-mode-number">01 / THE BASICS</span>
            <h3>One move at a time</h3>
            <p>
              Ten small challenges teach piece movement, check, castling, and
              checkmate. Hints are always available.
            </p>
            <button className="button secondary" onClick={onBasics}>
              Learn to play <ArrowRight size={16} />
            </button>
          </article>
          <article className="learning-mode-featured">
            <span className="learning-mode-number">02 / FOLLOW A PLAN</span>
            <h3>A guided game</h3>
            <p>
              A step-by-step Italian opening lesson. Make a move, watch the
              teaching bot reply, and learn why both moves matter.
            </p>
            <button
              className="button primary"
              onClick={() => {
                setMode("guided");
                setRound((r) => r + 1);
              }}
            >
              Start guided game <ArrowRight size={16} />
            </button>
            {completed && (
              <small>
                <CheckCircle2 size={14} /> Lesson completed · repeat anytime
              </small>
            )}
          </article>
          <article>
            <span className="learning-mode-number">03 / TRY YOUR IDEAS</span>
            <h3>Practice with a coach</h3>
            <p>
              Choose your own moves against a local beginner bot. Ask for a
              suggested move, take back a turn, and try again.
            </p>
            <button
              className="button secondary"
              onClick={() => {
                setMode("practice");
                setRound((r) => r + 1);
              }}
            >
              Play with coach <Bot size={16} />
            </button>
          </article>
        </div>
      </section>
      {mode && (
        <Modal
          title={mode === "guided" ? "Guided game" : "Practice with a coach"}
          onClose={close}
          size="wide"
        >
          <CoachBoard
            key={round}
            initialMode={mode}
            alienEnabled={alienEnabled}
            alienAudioEnabled={alienAudioEnabled}
            onComplete={complete}
            onPractice={() => setMode("practice")}
            onRestart={() => setRound((r) => r + 1)}
          />
        </Modal>
      )}
    </>
  );
}
export function CoachBoard({
  initialMode,
  lesson = italianLesson,
  playerColor = "w",
  alienEnabled = false,
  alienAudioEnabled = false,
  onComplete,
  onPractice,
  onRestart,
}: {
  initialMode: Mode;
  lesson?: GuidedLesson;
  playerColor?: Color;
  alienEnabled?: boolean;
  alienAudioEnabled?: boolean;
  onComplete: () => void;
  onPractice?: () => void;
  onRestart: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [moves, setMoves] = useState<string[]>([]);
  const board = useMemo(() => learningPosition(moves), [moves]);
  const boardRef = useRef(board);
  boardRef.current = board;
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [engineName, setEngineName] = useState("Stockfish Lite");
  const bot = useRef<LocalEngine | null>(null),
    coach = useRef<LocalEngine | null>(null);
  const generation = useRef(0),
    hintRequest = useRef(0),
    locked = useRef(false);
  const [alienUnlocked, setAlienUnlocked] = useState(false);
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() || `coach-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const step = moves.filter(
    (_, i) => i % 2 === (playerColor === "w" ? 0 : 1),
  ).length;
  const totalSteps = lesson.plies.filter(
    (ply) => ply.color === playerColor,
  ).length;
  const completed = mode === "guided" && moves.length >= lesson.plies.length;
  const botToMove = board.turn() !== playerColor && !board.isGameOver();
  const current = lesson.plies[Math.min(moves.length, lesson.plies.length - 1)];
  const canUndo = moves.some((_, i) => i % 2 === (playerColor === "w" ? 0 : 1));
  useEffect(() => {
    const player = new LocalEngine({
        mode: "lite",
        onStatus: (_status, name) => setEngineName(name),
      }),
      helper = new LocalEngine({ mode: "lite" });
    bot.current = player;
    coach.current = helper;
    return () => {
      generation.current++;
      hintRequest.current++;
      player.destroy();
      helper.destroy();
    };
  }, []);
  useEffect(() => {
    if (completed) onComplete();
  }, [completed, onComplete]);
  useEffect(() => {
    hintRequest.current++;
    setHint(null);
    setHintBusy(false);
    coach.current?.cancel();
  }, [moves, mode]);
  useEffect(() => {
    const ticket = ++generation.current;
    if (!botToMove || paused || completed || error) return;
    let active = true;
    const before = board.fen();
    const reply = (uciOrSan: string) => {
      if (
        !active ||
        ticket !== generation.current ||
        boardRef.current.fen() !== before
      )
        return;
      try {
        const next = learningPosition(moves);
        const move = next.move(
          uciOrSan.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(uciOrSan)
            ? {
                from: uciOrSan.slice(0, 2),
                to: uciOrSan.slice(2, 4),
                promotion: uciOrSan[4],
              }
            : uciOrSan,
        );
        boardRef.current = next;
        setMoves([...moves, move.san]);
        locked.current = false;
      } catch {
        setError("The bot could not finish that turn. Try its reply again.");
      }
    };
    const timer = setTimeout(
      () => {
        if (mode === "guided") {
          reply(current.san);
          return;
        }
        void bot.current
          ?.analyze(before, { movetime: 450, depth: 12, skill: 3 })
          .then((result) => {
            if (!active || ticket !== generation.current) return;
            const move = chooseBotMove(before, "sprout", result);
            if (move) reply(move);
            else setError("The bot could not choose a reply. Try again.");
          })
          .catch((reason) => {
            if (
              active &&
              ticket === generation.current &&
              reason?.name !== "AbortError"
            )
              setError(
                "The bot is unavailable. Retry its turn or take back your move.",
              );
          });
      },
      mode === "guided" ? 700 : 250,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      bot.current?.cancel();
    };
  }, [moves, mode, paused, completed, botToMove, error, attempt]);
  const lastPair = useMemo(() => {
    const played = board.history({ verbose: true });
    let start = played.length - 1;
    while (start >= 0 && played[start].color !== playerColor) start--;
    return played.slice(Math.max(0, start));
  }, [board, playerColor]);
  const hintMove = async () => {
    if (botToMove || board.isGameOver() || completed) return;
    if (mode === "guided") {
      const next = learningPosition(moves);
      const move = next.move(current.san);
      setHint({ from: move.from, to: move.to });
      setFeedback(`${current.goal} ${current.why}`);
      return;
    }
    const ticket = ++hintRequest.current,
      fen = board.fen();
    setHintBusy(true);
    try {
      const result = await coach.current?.analyze(fen, {
        movetime: 650,
        depth: 14,
      });
      if (
        ticket !== hintRequest.current ||
        boardRef.current.fen() !== fen ||
        !result?.bestMove
      )
        return;
      const uci = result.bestMove;
      const next = new Chess(fen);
      const move = next.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      setHint({ from: move.from, to: move.to });
      setFeedback(
        `Try ${move.san}. ${explainLearningMove(move, "You").replace("You played", "You could play").replace(" and moved", " and move").replace(" and captured", " and capture").replace(" and promoted", " and promote").replace("You castled", "You could castle")} This is a suggestion from a short local search.`,
      );
    } catch (reason) {
      if (
        ticket === hintRequest.current &&
        (reason as Error)?.name !== "AbortError"
      )
        setFeedback(
          "The hint could not load. You can still choose any legal move.",
        );
    } finally {
      if (ticket === hintRequest.current) setHintBusy(false);
    }
  };
  const undo = () => {
    generation.current++;
    hintRequest.current++;
    bot.current?.cancel();
    coach.current?.cancel();
    const next = previousPlayerTurn(moves, playerColor);
    boardRef.current = learningPosition(next);
    locked.current = false;
    setMoves(next);
    setError("");
    setFeedback("Try a different idea, or replay the lesson move.");
    setHint(null);
    setHintBusy(false);
  };
  return (
    <div className="coach-game">
      <AlienAudio
        gameId={sessionId}
        active={alienEnabled && alienUnlocked}
        enabled={alienAudioEnabled}
      />
      <div className="coach-status">
        <span>
          <Bot size={16} />{" "}
          {mode === "guided"
            ? "Teaching bot · follows this lesson"
            : `Beginner bot · ${engineName}`}
        </span>
        <span>
          YOU PLAY {playerColor === "w" ? "WHITE" : "BLACK"} · UNTIMED · UNRATED
        </span>
      </div>
      <div className="coach-layout">
        <div>
          <ChessBoard
            fen={board.fen()}
            orientation={playerColor}
            alienTheme={alienEnabled && alienUnlocked}
            disabled={botToMove || board.isGameOver() || completed || hintBusy}
            arrows={hint ? [hint] : []}
            lastMove={board.history({ verbose: true }).at(-1)}
            onMove={(from, to, promotion) => {
              if (
                locked.current ||
                boardRef.current.turn() !== playerColor ||
                boardRef.current.isGameOver() ||
                completed ||
                hintBusy
              )
                return;
              try {
                const next = learningPosition(moves),
                  move = next.move({ from, to, promotion });
                if (mode === "guided" && move.san !== current.san) {
                  setFeedback(
                    `That move is legal. For this lesson, ${current.goal.charAt(0).toLowerCase() + current.goal.slice(1)} Other plans are welcome in coach practice.`,
                  );
                  return;
                }
                if (
                  playerColor === "w" &&
                  playedAlienGambit(
                    new Chess().fen(),
                    next.history({ verbose: true }),
                  )
                )
                  setAlienUnlocked(true);
                locked.current = true;
                boardRef.current = next;
                setMoves([...moves, move.san]);
                setFeedback("");
                setError("");
              } catch {
                setFeedback(
                  "Choose a legal destination. The dots show where the selected piece can move.",
                );
              }
            }}
          />
          <div className="coach-board-actions">
            <button
              className="button secondary"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 size={15} />
              Take back a turn
            </button>
            <button
              className="button secondary"
              onClick={() => setPaused(!paused)}
              aria-pressed={paused}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
              {paused ? "Resume bot" : "Pause replies"}
            </button>
          </div>
        </div>
        <div className="coach-instructions">
          <span className="lh-eyebrow">
            {completed
              ? "LESSON COMPLETE"
              : mode === "guided"
                ? `STEP ${Math.min(step + 1, totalSteps)} OF ${totalSteps}`
                : "YOUR PRACTICE GAME"}
          </span>
          <h3>
            {completed
              ? "Teaching line complete."
              : board.isGameOver()
                ? "Game finished"
                : botToMove
                  ? paused
                    ? "Bot paused"
                    : "The bot’s turn"
                  : mode === "guided"
                    ? current.title
                    : "Your move. What do you notice?"}
          </h3>
          {mode === "guided" && !completed && (
            <progress
              aria-label="Guided game progress"
              max={totalSteps}
              value={step}
            />
          )}
          <p>
            {completed
              ? lesson.completion
              : botToMove
                ? paused
                  ? "Resume the bot when you are ready to see its reply."
                  : mode === "guided"
                    ? "Watch how the teaching bot responds. Its reply is chosen to demonstrate this opening."
                    : "The local bot is choosing a legal reply."
                : mode === "guided"
                  ? current.goal
                  : learningGoal(board, playerColor)}
          </p>
          {mode === "guided" && !completed && (
            <p className="coach-why">
              <b>Why this move?</b> {current.why}
            </p>
          )}
          <div className="coach-feedback" role="status">
            {error || feedback}
          </div>
          {error && (
            <button
              className="button primary"
              onClick={() => {
                setError("");
                setAttempt((a) => a + 1);
              }}
            >
              Retry bot reply
            </button>
          )}
          {!completed && !board.isGameOver() && (
            <button
              className="button secondary"
              onClick={() => void hintMove()}
              disabled={botToMove || hintBusy}
            >
              <Lightbulb size={16} />
              {hintBusy ? "Finding a hint…" : "Show a hint"}
            </button>
          )}
          {completed && (
            <button
              className="button primary"
              onClick={() => {
                setMode("practice");
                onPractice?.();
                setPaused(false);
                setFeedback(
                  "Choose your own moves now. You can ask for a hint whenever you need one.",
                );
              }}
            >
              Keep playing with coach <ArrowRight size={16} />
            </button>
          )}
          <section className="coach-replies" aria-label="Last turn explained">
            <h4>What just happened</h4>
            {lastPair.length ? (
              lastPair.map((move, i) => (
                <p key={`${move.before}-${move.san}`}>
                  <b>
                    {move.color === playerColor ? "You" : "Bot"} · {move.san}
                  </b>
                  {mode === "guided"
                    ? lesson.plies[moves.length - lastPair.length + i]?.why
                    : explainLearningMove(
                        move,
                        move.color === playerColor ? "You" : "The bot",
                      )}
                </p>
              ))
            ) : (
              <p>
                Make your first move on the board. Both your move and the bot’s
                reply will be explained here.
              </p>
            )}
          </section>
          <details>
            <summary>Moves played ({moves.length})</summary>
            <p className="coach-score">
              {moves.map((san, i) => (
                <span key={i}>
                  {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}
                  {san}{" "}
                </span>
              ))}
            </p>
          </details>
          <button className="button secondary" onClick={onRestart}>
            <RotateCcw size={15} />
            {initialMode === "guided" ? "Restart lesson" : "New practice game"}
          </button>
          <p className="coach-note">
            This session stays separate from your saved match and Local Elo.
            Closing ends this practice session.
          </p>
        </div>
      </div>
    </div>
  );
}
