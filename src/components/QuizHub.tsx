import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  Play,
  RotateCcw,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { quizQuestions, quizTopics, quizChoices } from "../data/quiz";
import {
  startQuiz,
  answerQuiz,
  advanceQuiz,
  quizScore,
  readQuizRun,
  readQuizProgress,
  completeQuiz,
  saveQuizRun,
  saveQuizProgress,
  type QuizRun,
} from "../lib/quiz";
import ChessBoard from "./ChessBoard";

export default function QuizHub({ onPuzzles }: { onPuzzles: () => void }) {
  const [run, setRun] = useState(() => {
    const saved = readQuizRun();
    return saved && !saved.finished ? saved : null;
  });
  const current = useRef(run);
  current.current = run;
  const [progress, setProgress] = useState(readQuizProgress);
  const [topic, setTopic] = useState("All topics");
  const [paused, setPaused] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [warning, setWarning] = useState("");
  // A new question starts at its board/prompt, including after long feedback
  // on a phone. Do not move the page while an answer is being read.
  useEffect(() => {
    if (run && !paused) window.scrollTo?.({ top: 0, behavior: "instant" });
  }, [run?.id, run?.index, run?.finished, paused]);
  function commit(next: QuizRun | null) {
    current.current = next;
    setRun(next);
    if (!saveQuizRun(next))
      setWarning(
        "Your quiz works, but device storage could not save progress.",
      );
  }
  function begin(count: number, mistakes = false) {
    const next = startQuiz(
      mistakes ? "All topics" : topic,
      count,
      mistakes ? progress.mistakes : undefined,
    );
    if (next) {
      commit(next);
      setPaused(false);
      setShowMove(false);
    }
  }
  const q = run
    ? quizQuestions.find((q) => q.id === run.ids[run.index])!
    : null;
  const chosen = run?.answers[run.index];
  const score = run ? quizScore(run) : 0;
  const best = progress.results
    .filter((r) => r.total === 10)
    .reduce((n, r) => Math.max(n, r.correct), 0);
  const poolSize = quizQuestions.filter(
    (q) => topic === "All topics" || q.topic === topic,
  ).length;
  let boardFen = q?.fen;
  if (boardFen && showMove && q?.move) {
    const board = new Chess(boardFen);
    board.move({
      from: q.move.slice(0, 2),
      to: q.move.slice(2, 4),
      promotion: q.move[4],
    });
    boardFen = board.fen();
  }
  const board =
    boardFen && q?.fen ? (
      <div className="quiz-board">
        <ChessBoard
          fen={boardFen}
          orientation={new Chess(q.fen).turn()}
          disabled
          theme="sage"
          lastMove={
            showMove && q.move
              ? { from: q.move.slice(0, 2), to: q.move.slice(2, 4) }
              : null
          }
        />
        <p>
          {showMove
            ? "Checkmate — the king has no escape."
            : `${new Chess(q.fen).turn() === "w" ? "White" : "Black"} to move · choose an answer`}
        </p>
      </div>
    ) : null;
  if (!run || paused)
    return (
      <div className="quiz-hub">
        <section className="quiz-hero card">
          <div>
            <span className="section-kicker">
              A FEW MINUTES. A LITTLE SHARPER.
            </span>
            <h2>How well do you know your chess?</h2>
            <p>
              Read the position, pick an answer, and learn why it works. No
              clock. No pressure.
            </p>
            <div className="quiz-hero-tags">
              <span>
                <CircleHelp size={15} />
                {quizQuestions.length} questions
              </span>
              <span>
                <BookOpen size={15} />
                Explanations after every answer
              </span>
              <span>
                <Target size={15} />
                Board challenges
              </span>
            </div>
          </div>
          <div className="quiz-hero-mark" aria-hidden="true">
            ♞<span>?</span>
          </div>
        </section>
        {warning && <p role="status">{warning}</p>}
        {run && !run.finished && (
          <div className="quiz-resume card">
            <p>
              Your quiz is saved at question {run.index + 1} of {run.ids.length}
              .
            </p>
            <button className="button primary" onClick={() => setPaused(false)}>
              Resume quiz <Play size={16} />
            </button>
          </div>
        )}
        <div className="quiz-home-layout">
          <section className="card quiz-setup">
            <h3>Choose your challenge</h3>
            <label className="quiz-topic-label">
              Topic
              <select
                aria-label="Quiz topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                {quizTopics.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <div className="quiz-mode-cards">
              <button onClick={() => begin(5)}>
                <span className="quiz-mode-icon">
                  <Play size={22} />
                </span>
                <strong>Quick five</strong>
                <span>{Math.min(5, poolSize)} questions · a short warm-up</span>
                <ArrowRight size={18} />
              </button>
              <button onClick={() => begin(10)}>
                <span className="quiz-mode-icon">
                  <Trophy size={22} />
                </span>
                <strong>Full challenge</strong>
                <span>
                  {Math.min(10, poolSize)} questions · test your knowledge
                </span>
                <ArrowRight size={18} />
              </button>
              <button
                disabled={!progress.mistakes.length}
                onClick={() => begin(10, true)}
              >
                <span className="quiz-mode-icon">
                  <RotateCcw size={22} />
                </span>
                <strong>Practice mistakes</strong>
                <span>
                  {progress.mistakes.length
                    ? `${progress.mistakes.length} questions to revisit`
                    : "Missed questions appear here"}
                </span>
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
          <aside className="card quiz-progress-card">
            <span className="section-kicker">YOUR PROGRESS</span>
            <h3>Keep showing up.</h3>
            <div>
              <strong>{progress.results.length}</strong>
              <span>completed quizzes saved</span>
            </div>
            <div>
              <strong>
                {progress.results.some((r) => r.total === 10)
                  ? `${best}/10`
                  : "—"}
              </strong>
              <span>best ten-question score</span>
            </div>
            <p>
              Quiz results are for learning. They do not change your Local Elo.
            </p>
            <button className="text-button" onClick={onPuzzles}>
              Prefer playing the moves? Try puzzles <ArrowRight size={15} />
            </button>
          </aside>
        </div>
      </div>
    );
  if (run.finished)
    return (
      <section className="card quiz-finish">
        <div className="quiz-finish-icon">
          <Trophy size={34} />
        </div>
        <span className="section-kicker">QUIZ COMPLETE</span>
        <h2>
          {score === run.ids.length
            ? "A clean sweep."
            : "One more step forward."}
        </h2>
        <div className="quiz-final-score">
          {score}
          <span> / {run.ids.length}</span>
        </div>
        <p>
          {score === run.ids.length
            ? "Every answer correct. Try another topic or take those ideas to the board."
            : "Review the explanations below, then try your missed questions again."}
        </p>
        {warning && <p role="status">{warning}</p>}
        <div className="quiz-finish-actions">
          <button
            className="button primary"
            onClick={() => {
              commit(null);
              setPaused(false);
            }}
          >
            Choose another quiz <ArrowRight size={16} />
          </button>
          {progress.mistakes.length > 0 && (
            <button
              className="button secondary"
              onClick={() => begin(10, true)}
            >
              Practice mistakes <RotateCcw size={16} />
            </button>
          )}
        </div>
        <div className="quiz-answer-review">
          {run.ids.map((id, index) => {
            const item = quizQuestions.find((q) => q.id === id)!,
              correct = run.answers[index] === item.answer;
            return (
              <details key={id}>
                <summary>
                  <span className={correct ? "quiz-correct" : "quiz-wrong"}>
                    {correct ? <Check size={16} /> : <X size={16} />}
                  </span>
                  <span>
                    {index + 1}. {item.prompt}
                  </span>
                </summary>
                <p>
                  <strong>Your answer:</strong> {run.answers[index]}
                </p>
                {!correct && (
                  <p>
                    <strong>Correct answer:</strong> {item.answer}
                  </p>
                )}
                <p>{item.explanation}</p>
              </details>
            );
          })}
        </div>
      </section>
    );
  return (
    <div className="quiz-session">
      <div className="quiz-session-top">
        <button className="text-button" onClick={() => setPaused(true)}>
          <ArrowLeft size={16} /> Save & leave quiz
        </button>
        <span>
          {score} correct · {run.index + 1} of {run.ids.length}
        </span>
      </div>
      <progress
        className="quiz-progress"
        aria-label="Quiz progress"
        max={run.ids.length}
        value={run.index + (chosen !== null ? 1 : 0)}
      />
      <div className={`quiz-question-layout ${board ? "has-board" : ""}`}>
        {board}
        <section className="card quiz-question">
          <div className="quiz-question-meta">
            <span className="section-kicker">QUESTION {run.index + 1}</span>
            <span className="soft-badge">{q!.topic}</span>
          </div>
          <h2>{q!.prompt}</h2>
          <p className="quiz-instruction">Choose one answer.</p>
          <div className="quiz-choices">
            {quizChoices(q!).map((choice, index) => (
              <button
                key={choice}
                className={`${chosen !== null && choice === q!.answer ? "is-correct" : ""} ${chosen === choice && choice !== q!.answer ? "is-wrong" : ""}`}
                disabled={chosen !== null}
                aria-pressed={chosen === choice}
                onClick={() => {
                  const latest = current.current;
                  if (!latest) return;
                  const next = answerQuiz(latest, choice);
                  if (next !== latest) commit(next);
                }}
              >
                <span className="quiz-choice-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>{choice}</span>
                {chosen !== null && choice === q!.answer && (
                  <CheckCircle2 size={20} />
                )}
              </button>
            ))}
          </div>
          {chosen !== null && (
            <div
              className={`quiz-feedback ${chosen === q!.answer ? "quiz-correct" : "quiz-wrong"}`}
              role="status"
            >
              <strong>
                {chosen === q!.answer ? "Correct." : "Not quite."}
              </strong>
              {chosen !== q!.answer && (
                <p>
                  The answer is: <b>{q!.answer}</b>.
                </p>
              )}
              <p>{q!.explanation}</p>
              {q!.move && (
                <button
                  className="text-button"
                  onClick={() => setShowMove(!showMove)}
                >
                  {showMove ? "Reset position" : "Show the checkmate"}{" "}
                  <Play size={15} />
                </button>
              )}
            </div>
          )}
          {warning && <p role="status">{warning}</p>}
          <button
            className="button primary full quiz-next"
            disabled={chosen === null}
            onClick={() => {
              const latest = current.current;
              if (!latest) return;
              const next = advanceQuiz(latest);
              if (next === latest) return;
              commit(next);
              setShowMove(false);
              if (next.finished) {
                const updated = completeQuiz(next, readQuizProgress());
                setProgress(updated);
                if (!saveQuizProgress(updated))
                  setWarning(
                    "Quiz finished, but your result could not be saved on this device.",
                  );
              }
            }}
          >
            {run.index === run.ids.length - 1
              ? "See my results"
              : "Next question"}
            <ArrowRight size={17} />
          </button>
        </section>
      </div>
    </div>
  );
}
