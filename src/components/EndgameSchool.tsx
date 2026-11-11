import { Chess, type Square } from "chess.js";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Crown,
  Flag,
  Lightbulb,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  endgames,
  endgameVerification,
  type EndgameDrill,
} from "../data/endgames";
import { uciToSan } from "../lib/game";
import "./EndgameSchool.css";
export type { EndgameDrill } from "../data/endgames";

type Props = { onPractice: (drill: EndgameDrill) => void };
type Category = "All drills" | EndgameDrill["category"];
const categories: Category[] = [
  "All drills",
  "Checkmate technique",
  "Pawn endings",
  "Rook endings",
];
const progressKey = "knightfall.endgamesPracticed";
function readPracticed() {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(progressKey) || "[]",
    );
    return new Set(
      Array.isArray(stored)
        ? stored.filter(
            (id): id is string =>
              typeof id === "string" &&
              endgames.some((drill) => drill.id === id),
          )
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function PositionPreview({
  drill,
  large = false,
}: {
  drill: EndgameDrill;
  large?: boolean;
}) {
  const chess = useMemo(() => new Chess(drill.fen), [drill.fen]);
  const files = drill.playerColor === "w" ? "abcdefgh" : "hgfedcba";
  const ranks = drill.playerColor === "w" ? "87654321" : "12345678";
  return (
    <div
      className={`eg-position ${large ? "eg-position-large" : ""}`}
      role="img"
      aria-label={`Starting position for ${drill.title}. ${drill.playerColor === "w" ? "White" : "Black"} to move.`}
    >
      {[...ranks].flatMap((rank, row) =>
        [...files].map((file, column) => {
          const square = `${file}${rank}` as Square;
          const piece = chess.get(square);
          return (
            <span
              key={square}
              className={`eg-square ${(row + column) % 2 ? "eg-dark" : "eg-light"}`}
            >
              {piece && (
                <img
                  src={`./pieces/${piece.color}${piece.type.toUpperCase()}.svg`}
                  alt=""
                  aria-hidden="true"
                />
              )}
              {large && column === 0 && (
                <small className="eg-rank">{rank}</small>
              )}
              {large && row === 7 && <small className="eg-file">{file}</small>}
            </span>
          );
        }),
      )}
    </div>
  );
}

function DrillDialog({
  drill,
  onClose,
  onStart,
}: {
  drill: EndgameDrill;
  onClose: () => void;
  onStart: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showHint, setShowHint] = useState(false);
  const color = drill.playerColor === "w" ? "White" : "Black";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="eg-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="eg-dialog"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eg-drill-title"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const controls = ref.current?.querySelectorAll<HTMLElement>(
              'button, a[href], summary, [tabindex="0"]',
            );
            if (!controls?.length) return;
            const first = controls[0],
              last = controls[controls.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="eg-dialog-top">
          <span className="eg-eyebrow">
            <BookOpen size={14} />
            {drill.category}
          </span>
          <button
            className="eg-close"
            aria-label="Close endgame lesson"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="eg-drill-title">{drill.title}</h2>
        <p className="eg-dialog-description">{drill.description}</p>
        <div className="eg-dialog-position">
          <PositionPreview drill={drill} large />
          <div className="eg-position-notes">
            <span
              className={`eg-objective ${drill.objective === "draw" ? "eg-draw" : ""}`}
            >
              {drill.objective === "draw" ? (
                <Shield size={15} />
              ) : (
                <Flag size={15} />
              )}{" "}
              {drill.objective === "draw" ? "Hold the draw" : "Convert the win"}
            </span>
            <h3>Your goal</h3>
            <p>{drill.goal}</p>
            <div className="eg-player">
              <span className={`eg-player-stone ${drill.playerColor}`} />
              <span>
                You play <strong>{color}</strong>
                <small>{color} to move · Untimed</small>
              </span>
            </div>
          </div>
        </div>
        <div className="eg-lesson-intro">
          <h3>The idea</h3>
          <p>{drill.lesson}</p>
        </div>
        <div className="eg-plan">
          <h3>Your plan</h3>
          {drill.plan.map((step, index) => (
            <div key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
        <div className="eg-watch">
          <Lightbulb size={18} />
          <div>
            <strong>Watch for this</strong>
            <p>{drill.commonMistake}</p>
          </div>
        </div>
        <div className="eg-hint">
          <button
            onClick={() => setShowHint((value) => !value)}
            aria-expanded={showHint}
          >
            <Lightbulb size={14} />
            {showHint ? "Hide first-move hint" : "Show a first-move hint"}
            <ChevronRight size={14} className={showHint ? "eg-rotated" : ""} />
          </button>
          {showHint && (
            <p>
              One move that preserves the{" "}
              {drill.objective === "draw" ? "draw" : "win"} is{" "}
              <strong>
                {uciToSan(drill.fen, [drill.verification.bestMove])[0] ||
                  drill.verification.bestMove}
              </strong>
              . Other moves may also work.
            </p>
          )}
        </div>
        <div className="eg-start-row">
          <span>
            <ShieldCheck size={14} /> Verified starting position
          </span>
          <button className="eg-start-button" onClick={onStart}>
            {drill.objective === "draw" ? "Defend" : "Practice"} as {color}
            <ArrowRight size={17} />
          </button>
        </div>
        <p className="eg-engine-note">
          Practice against the local bot. The starting result assumes perfect
          play; the on-device engine may choose different defenses. A draw drill
          succeeds when the game ends in a draw.
        </p>
      </div>
    </div>
  );
}

export function EndgameSchool({ onPractice }: Props) {
  const [category, setCategory] = useState<Category>("All drills");
  const [level, setLevel] = useState("All levels");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EndgameDrill | null>(null);
  const [practiced, setPracticed] = useState(readPracticed);
  const close = useCallback(() => setSelected(null), []);
  const filtered = useMemo(
    () =>
      endgames.filter(
        (drill) =>
          (category === "All drills" || drill.category === category) &&
          (level === "All levels" || drill.difficulty === level) &&
          `${drill.title} ${drill.description} ${drill.tags.join(" ")}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [category, level, query],
  );
  const start = (drill: EndgameDrill) => {
    const next = new Set(practiced).add(drill.id);
    setPracticed(next);
    try {
      localStorage.setItem(progressKey, JSON.stringify([...next]));
    } catch {
      /* Practice remains available when storage is disabled. */
    }
    setSelected(null);
    onPractice(drill);
  };
  return (
    <div className="endgame-school">
      <header className="eg-heading">
        <div>
          <span className="eg-eyebrow">
            <Crown size={15} /> ENDGAME SCHOOL
          </span>
          <h1>Finish with confidence.</h1>
          <p>Fewer pieces. Clearer ideas. A whole new kind of chess.</p>
        </div>
        <div className="eg-progress-summary">
          <span>
            {practiced.size}
            <small> / {endgames.length}</small>
          </span>
          <p>positions practiced</p>
        </div>
      </header>
      <section className="eg-hero">
        <div>
          <span className="eg-hero-label">
            <Sparkles size={14} /> THE FINAL FEW PIECES
          </span>
          <h2>
            Technique is a quiet
            <br />
            superpower.
          </h2>
          <p>
            Learn the plan, then make it happen. Practice essential checkmates,
            turn pawns into queens, or save a position with a resourceful draw.
          </p>
          <button onClick={() => setSelected(endgames[0])}>
            Start with the essentials <ArrowRight size={17} />
          </button>
        </div>
        <div className="eg-hero-art" aria-hidden="true">
          <span className="eg-orbit eg-orbit-one" />
          <span className="eg-orbit eg-orbit-two" />
          <img className="eg-hero-king" src="./pieces/wK.svg" alt="" />
          <img className="eg-hero-pawn" src="./pieces/bP.svg" alt="" />
          <span className="eg-art-note">
            A good ending
            <br />
            <strong>starts with a plan.</strong>
          </span>
        </div>
      </section>
      <div className="eg-category-row">
        <div className="eg-category-filters" aria-label="Endgame categories">
          {categories.map((value) => (
            <button
              key={value}
              className={category === value ? "is-active" : ""}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="eg-search">
          <Search size={15} />
          <input
            type="search"
            aria-label="Search endgame drills"
            placeholder="Find a technique"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="eg-results-row">
        <p aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "position" : "positions"}{" "}
          to practice
        </p>
        <label>
          Level
          <select
            aria-label="Filter endgames by level"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option>All levels</option>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </label>
      </div>
      {filtered.length ? (
        <div className="eg-grid">
          {filtered.map((drill) => (
            <article key={drill.id} className="eg-card">
              <div className="eg-card-preview">
                <PositionPreview drill={drill} />
                <div className="eg-card-meta">
                  <span
                    className={`eg-level eg-level-${drill.difficulty.toLowerCase()}`}
                  >
                    {drill.difficulty}
                  </span>
                  <span className="eg-card-objective">
                    {drill.objective === "draw" ? (
                      <Shield size={20} />
                    ) : (
                      <Flag size={20} />
                    )}
                    <strong>
                      {drill.objective === "draw"
                        ? "Hold the draw"
                        : "Convert the win"}
                    </strong>
                    <small>
                      Play as {drill.playerColor === "w" ? "White" : "Black"}
                    </small>
                  </span>
                  {practiced.has(drill.id) && (
                    <span className="eg-tried">
                      <CheckCircle2 size={12} /> Practiced
                    </span>
                  )}
                </div>
              </div>
              <span className="eg-card-category">{drill.category}</span>
              <h3>{drill.title}</h3>
              <p>{drill.description}</p>
              <div className="eg-card-tags">
                {drill.tags.slice(0, 2).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <button
                className="eg-read-button"
                onClick={() => setSelected(drill)}
              >
                Read the plan <ArrowUpRight size={17} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="eg-empty">
          <Search size={29} />
          <h3>No positions match that search.</h3>
          <p>Try another technique or level.</p>
          <button
            onClick={() => {
              setCategory("All drills");
              setLevel("All levels");
              setQuery("");
            }}
          >
            Show all drills <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="eg-footer-note">
        <ShieldCheck size={16} />
        <p>
          {endgameVerification.note}{" "}
          <a href={endgameVerification.url} target="_blank" rel="noreferrer">
            About the verification <ArrowUpRight size={11} />
          </a>
        </p>
      </div>
      {selected && (
        <DrillDialog
          key={selected.id}
          drill={selected}
          onClose={close}
          onStart={() => start(selected)}
        />
      )}
    </div>
  );
}
export default EndgameSchool;
