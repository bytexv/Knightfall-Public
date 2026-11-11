import { useCallback, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import { beginnerExercises, tryBeginnerMove } from "../data/beginner-course";
import ChessBoard from "./ChessBoard";
import { Modal } from "./Dialogs";
const key = "knightfall:beginner-course";
export function BeginnerCourse({
  onPractice,
  onEndgames,
}: {
  onPractice: () => void;
  onEndgames: () => void;
}) {
  const [done, setDone] = useState<string[]>(() => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v)
        ? beginnerExercises.filter((e) => v.includes(e.id)).map((e) => e.id)
        : [];
    } catch {
      return [];
    }
  });
  const [index, setIndex] = useState<number | null>(null);
  const [fen, setFen] = useState("");
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState("");
  const close = useCallback(() => setIndex(null), []);
  const open = (i: number) => {
    setIndex(i);
    setFen(beginnerExercises[i].fen);
    setSolved(false);
    setHint(false);
    setFeedback("");
  };
  const exercise = index === null ? null : beginnerExercises[index];
  const next = beginnerExercises.findIndex((e) => !done.includes(e.id));
  return (
    <>
      <section className="beginner-path" aria-label="Your learning path">
        <div className="beginner-intro">
          <span className="lh-eyebrow">
            <GraduationCap size={18} /> START HERE
          </span>
          <h2>Learn a move. Try it yourself.</h2>
          <p>
            No chess experience needed. Ten small board challenges take you from
            your first pawn move to checkmate.
          </p>
          <button
            className="button primary"
            onClick={() => open(Math.max(0, next))}
          >
            {done.length
              ? next < 0
                ? "Practice the basics again"
                : "Continue learning"
              : "Learn to play"}{" "}
            <ArrowRight size={16} />
          </button>
          <span className="beginner-progress">
            {done.length} of {beginnerExercises.length} challenges completed
          </span>
          <progress
            aria-label="Beginner course progress"
            max={beginnerExercises.length}
            value={done.length}
          />
        </div>
        <div className="beginner-steps">
          <div>
            <b>01 · Learn the board</b>
            <p>Move pieces, escape check, castle, and finish a game.</p>
            <button onClick={() => open(0)}>Start the guided course →</button>
          </div>
          <div>
            <b>02 · Spot a good move</b>
            <p>
              Try tactics. Look for checks, captures, and threats before moving.
            </p>
            <button onClick={onPractice}>Practice tactics →</button>
          </div>
          <div>
            <b>03 · Finish with confidence</b>
            <p>
              Learn simple checkmates and how to turn an extra pawn into a win.
            </p>
            <button onClick={onEndgames}>Visit endgame school →</button>
          </div>
        </div>
      </section>
      {exercise && index !== null && (
        <Modal title="Learn to play" onClose={close} size="wide">
          <div className="beginner-lesson-nav" aria-label="Course challenges">
            {beginnerExercises.map((e, i) => (
              <button
                key={e.id}
                aria-label={e.title}
                aria-current={i === index ? "step" : undefined}
                className={i === index ? "current" : ""}
                onClick={() => open(i)}
              >
                {done.includes(e.id) ? <CheckCircle2 size={16} /> : i + 1}
              </button>
            ))}
          </div>
          <div className="beginner-exercise">
            <ChessBoard
              fen={fen}
              onMove={(from, to, promotion) => {
                const result = tryBeginnerMove(exercise, from, to, promotion);
                setFeedback(result.feedback);
                if (result.correct) {
                  setFen(result.fen);
                  setSolved(true);
                  setHint(false);
                  setDone((previous) => {
                    const updated = previous.includes(exercise.id)
                      ? previous
                      : [...previous, exercise.id];
                    try {
                      localStorage.setItem(key, JSON.stringify(updated));
                    } catch {
                      /* Progress still works for this session. */
                    }
                    return updated;
                  });
                }
              }}
              disabled={solved}
              arrows={hint ? [exercise.hint] : []}
            />
            <div className="beginner-instructions">
              <span className="lh-eyebrow">
                CHALLENGE {index + 1} / {beginnerExercises.length} · WHITE TO
                MOVE
              </span>
              <h3>{exercise.title.replace(/^\d+\. /, "")}</h3>
              <p>{exercise.rule}</p>
              <div className="beginner-goal">
                <strong>Your turn</strong>
                <p>{exercise.task}</p>
              </div>
              <p
                className={
                  solved ? "beginner-feedback solved" : "beginner-feedback"
                }
                role="status"
              >
                {feedback ||
                  "Click or drag a piece. The dots show legal moves."}
              </p>
              <div className="beginner-actions">
                {solved ? (
                  index < beginnerExercises.length - 1 ? (
                    <button
                      className="button primary"
                      onClick={() => open(index + 1)}
                    >
                      Next challenge <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      onClick={() => {
                        close();
                        onPractice();
                      }}
                    >
                      Try your first puzzle <ArrowRight size={16} />
                    </button>
                  )
                ) : (
                  <button
                    className="button secondary"
                    aria-pressed={hint}
                    onClick={() => setHint(!hint)}
                  >
                    <Lightbulb size={16} />
                    {hint ? "Hide hint" : "Show a hint"}
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => open(index)}
                >
                  <RotateCcw size={16} />
                  Try again
                </button>
              </div>
              <details>
                <summary>A quick chess reference</summary>
                <p>
                  Win by checkmate. A player may resign, or a game may end in a
                  draw. With a clock, running out of time usually loses.
                </p>
                <p>
                  R = rook · N = knight · B = bishop · Q = queen · K = king.
                  Pawns have no letter. “x” is a capture, “+” is check, “#” is
                  checkmate.
                </p>
                <p>
                  Typical piece values: pawn 1, knight/bishop 3, rook 5, queen
                  9. King safety and checkmate matter more than points.
                </p>
              </details>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
