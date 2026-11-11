import { BeginnerCourse } from "./BeginnerCourse";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  Clock3,
  Compass,
  Flame,
  GraduationCap,
  Lightbulb,
  Search,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gambits, openingPreview, type Gambit } from "../data/gambits";
import { lessons, type Lesson } from "../data/lessons";
import "./LearnHub.css";

type LearnHubProps = {
  onExplore: (gambit: Gambit) => void;
  onPuzzle: () => void;
  onEndgames: () => void;
};
type Category = "all" | Gambit["category"] | "saved";
const filters: { id: Category; label: string }[] = [
  { id: "all", label: "All openings" },
  { id: "classic", label: "The classics" },
  { id: "creator", label: "Community favorites" },
  { id: "offbeat", label: "Off the beaten path" },
  { id: "saved", label: "Saved" },
];
const readSet = (key: string) => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
};
const saveSet = (key: string, value: Set<string>) => {
  try {
    localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    /* Private mode can deny storage. The in-memory interaction still works. */
  }
};

function OpeningCard({
  gambit,
  saved,
  onSave,
  onExplore,
  index,
}: {
  gambit: Gambit;
  saved: boolean;
  onSave: () => void;
  onExplore: () => void;
  index: number;
}) {
  const piece = gambit.tags.includes("Black")
    ? "bN"
    : gambit.id === "botez"
      ? "wQ"
      : gambit.id === "bongcloud"
        ? "wK"
        : "wN";
  return (
    <article
      className={`lh-opening-card lh-category-${gambit.category}`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="lh-card-top">
        <div className="lh-piece-tile" aria-hidden="true">
          <img src={`./pieces/${piece}.svg`} alt="" />
        </div>
        <span
          className={`lh-difficulty lh-difficulty-${gambit.difficulty.toLowerCase()}`}
        >
          {gambit.difficulty}
        </span>
        <button
          type="button"
          className={`lh-bookmark ${saved ? "is-saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${gambit.name}`}
          aria-pressed={saved}
          title={saved ? "Remove from saved openings" : "Save this opening"}
          onClick={onSave}
        >
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      {gambit.creator ? (
        <span className="lh-creator">
          <GraduationCap size={12} /> {gambit.creator}
        </span>
      ) : (
        <span className="lh-creator lh-eco">
          {gambit.eco || "OPENING LAB"} <span>·</span> {gambit.tags[0]}{" "}
          repertoire
        </span>
      )}
      <h3>{gambit.name}</h3>
      <p className="lh-card-subtitle">{gambit.subtitle}</p>
      <p className="lh-move-preview">
        {openingPreview(gambit.moves)} <span>…</span>
      </p>
      <div className="lh-tags">
        {gambit.tags.slice(1, 3).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <button className="lh-open-button" onClick={onExplore}>
        Explore the line <ArrowUpRight size={17} />
      </button>
    </article>
  );
}

function LessonDialog({
  lesson,
  complete,
  onComplete,
  onClose,
}: {
  lesson: Lesson;
  complete: boolean;
  onComplete: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panelRef.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="lh-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="lh-lesson-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lh-lesson-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="lh-dialog-top">
          <span className="lh-eyebrow">
            <BookOpen size={15} /> {lesson.level}
          </span>
          <button
            className="lh-close"
            aria-label="Close lesson"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <h2 id="lh-lesson-title">{lesson.title}</h2>
        <p className="lh-dialog-summary">{lesson.summary}</p>
        <span className="lh-read-time">
          <Clock3 size={14} /> {lesson.minutes} minute read
        </span>
        <div className="lh-lesson-body">
          {lesson.sections.map((section, index) => (
            <section key={section.title}>
              <span className="lh-section-number">0{index + 1}</span>
              <div>
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </div>
            </section>
          ))}
        </div>
        <div className="lh-challenge">
          <Lightbulb size={22} />
          <div>
            <strong>Put it into practice</strong>
            <p>{lesson.challenge}</p>
          </div>
        </div>
        <button
          className={`lh-complete-button ${complete ? "is-complete" : ""}`}
          onClick={onComplete}
        >
          {complete ? <CheckCircle2 size={18} /> : <Check size={18} />}
          {complete ? "Lesson completed · mark unread" : "Mark as complete"}
        </button>
      </div>
    </div>
  );
}

export function LearnHub({ onExplore, onPuzzle, onEndgames }: LearnHubProps) {
  const [tab, setTab] = useState<"openings" | "lessons">("openings");
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [visibleCount, setVisibleCount] = useState(9);
  const [saved, setSaved] = useState(() => readSet("knightfall.savedOpenings"));
  const [completed, setCompleted] = useState(() =>
    readSet("knightfall.completedLessons"),
  );
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const closeLesson = useCallback(() => setOpenLesson(null), []);
  const result = useMemo(
    () =>
      gambits.filter((gambit) => {
        const searchMatch =
          `${gambit.name} ${gambit.subtitle} ${gambit.description} ${gambit.creator || ""} ${gambit.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase().trim());
        return (
          searchMatch &&
          (category === "all" || category === "saved"
            ? category !== "saved" || saved.has(gambit.id)
            : gambit.category === category) &&
          (difficulty === "all" || gambit.difficulty === difficulty)
        );
      }),
    [query, category, difficulty, saved],
  );
  const toggleSaved = (id: string) =>
    setSaved((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSet("knightfall.savedOpenings", next);
      return next;
    });
  const toggleComplete = (id: string) =>
    setCompleted((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSet("knightfall.completedLessons", next);
      return next;
    });
  const completedCount = lessons.filter((lesson) =>
    completed.has(lesson.id),
  ).length;
  return (
    <div className="learn-hub">
      <header className="lh-heading">
        <div>
          <div className="lh-eyebrow">
            <Compass size={15} /> LEARN & PRACTICE
          </div>
          <h1>Your next good move starts here.</h1>
          <p>
            Learn the basics on the board, build useful habits, then explore the
            openings you enjoy.
          </p>
        </div>
        <button className="lh-practice-button" onClick={onPuzzle}>
          <Target size={18} /> Practice tactics <ArrowRight size={17} />
        </button>
      </header>
      <BeginnerCourse onPractice={onPuzzle} onEndgames={onEndgames} />
      <div
        className="lh-tabs"
        role="tablist"
        aria-label="Learning sections"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '[role="tab"]',
            ),
          );
          const current = tabs.indexOf(
            (event.target as Element).closest<HTMLButtonElement>(
              '[role="tab"]',
            )!,
          );
          if (current < 0) return;
          event.preventDefault();
          event.stopPropagation();
          const nextIndex =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : (current +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    tabs.length) %
                  tabs.length;
          const next = tabs[nextIndex];
          setTab(next.id === "lh-openings-tab" ? "openings" : "lessons");
          next.focus();
        }}
      >
        <button
          id="lh-openings-tab"
          role="tab"
          aria-selected={tab === "openings"}
          tabIndex={tab === "openings" ? 0 : -1}
          aria-controls="lh-openings"
          onClick={() => setTab("openings")}
        >
          <Flame size={17} /> Gambit library <span>{gambits.length}</span>
        </button>
        <button
          id="lh-lessons-tab"
          role="tab"
          aria-selected={tab === "lessons"}
          tabIndex={tab === "lessons" ? 0 : -1}
          aria-controls="lh-lessons"
          onClick={() => setTab("lessons")}
        >
          <GraduationCap size={18} /> Short lessons{" "}
          <span>{lessons.length}</span>
        </button>
      </div>
      {tab === "openings" ? (
        <section
          id="lh-openings"
          role="tabpanel"
          aria-labelledby="lh-openings-tab"
        >
          <div className="lh-feature">
            <div className="lh-feature-copy">
              <span className="lh-feature-label">
                <BookOpen size={14} /> FEATURED LINE · PETROFF DEFENSE
              </span>
              <h2>Stafford Gambit</h2>
              <p>
                The Stafford gives Black quick development and tactical chances.
                Study the threats against f2 and the replies that let White keep
                the extra pawn.
              </p>
              <button
                onClick={() =>
                  onExplore(gambits.find((g) => g.id === "stafford")!)
                }
              >
                Meet the Stafford <ArrowRight size={17} />
              </button>
            </div>
            <div className="lh-feature-art" aria-hidden="true">
              <img className="lh-art-knight" src="./pieces/bN.svg" alt="" />
              <span className="lh-art-caption">
                1. e4 e5 &nbsp; 2. Nf3 Nf6
                <br />
                <strong>3. Nxe5 Nc6 !?</strong>
              </span>
            </div>
          </div>
          <div className="lh-filter-row">
            <div className="lh-filters" aria-label="Opening categories">
              {filters.map((filter) => (
                <button
                  key={filter.id}
                  className={category === filter.id ? "is-active" : ""}
                  aria-pressed={category === filter.id}
                  onClick={() => {
                    setCategory(filter.id);
                    setVisibleCount(9);
                  }}
                >
                  {filter.id === "saved" && <Bookmark size={13} />}
                  {filter.label}
                  {filter.id === "saved" && saved.size > 0 && (
                    <span>{saved.size}</span>
                  )}
                </button>
              ))}
            </div>
            <label className="lh-search">
              <Search size={16} />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisibleCount(9);
                }}
                placeholder="Find your next opening"
                aria-label="Search gambits"
              />
            </label>
          </div>
          <div className="lh-results-row">
            <p aria-live="polite">
              {result.length} {result.length === 1 ? "opening" : "openings"} to
              explore
            </p>
            <label>
              Level{" "}
              <select
                aria-label="Filter openings by level"
                value={difficulty}
                onChange={(e) => {
                  setDifficulty(e.target.value);
                  setVisibleCount(9);
                }}
              >
                <option value="all">All levels</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </label>
          </div>
          {result.length ? (
            <>
              <div className="lh-opening-grid">
                {result.slice(0, visibleCount).map((gambit, index) => (
                  <OpeningCard
                    key={gambit.id}
                    gambit={gambit}
                    saved={saved.has(gambit.id)}
                    onSave={() => toggleSaved(gambit.id)}
                    onExplore={() => onExplore(gambit)}
                    index={index}
                  />
                ))}
              </div>
              {result.length > visibleCount && (
                <button
                  className="lh-show-more"
                  onClick={() => setVisibleCount((n) => n + 9)}
                >
                  Explore more openings <ArrowDown size={16} />
                  <span>{result.length - visibleCount} more</span>
                </button>
              )}
            </>
          ) : (
            <div className="lh-empty">
              <Search size={30} />
              <h3>
                {category === "saved" && !saved.size
                  ? "No saved openings yet"
                  : "No openings found"}
              </h3>
              <p>
                {category === "saved" && !saved.size
                  ? "Bookmark an opening to add it to your repertoire."
                  : "Try a different name, theme or difficulty."}
              </p>
              <button
                onClick={() => {
                  setCategory("all");
                  setQuery("");
                  setDifficulty("all");
                }}
              >
                Browse all openings <ArrowRight size={15} />
              </button>
            </div>
          )}
          <p className="lh-attribution">
            <ShieldCheck size={14} /> Independent educational primers. Creator
            names describe chess culture and teaching associations; no
            affiliation or endorsement. Meme openings are labeled in their
            lessons.
          </p>
        </section>
      ) : (
        <section
          id="lh-lessons"
          role="tabpanel"
          aria-labelledby="lh-lessons-tab"
        >
          <div className="lh-lessons-intro">
            <div>
              <span className="lh-eyebrow">CHESS FUNDAMENTALS</span>
              <h2>What to look for before you move.</h2>
              <p>
                Short lessons on tactics, development, king safety, and the
                decisions that come up in real games.
              </p>
            </div>
            <div className="lh-progress">
              <span>
                {completedCount}
                <small> / {lessons.length}</small>
              </span>
              <p>lessons completed</p>
              <div>
                <i
                  style={{
                    width: `${(completedCount / lessons.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="lh-lesson-grid">
            {lessons.map((lesson, index) => (
              <button
                key={lesson.id}
                className={`lh-lesson-card ${completed.has(lesson.id) ? "is-read" : ""}`}
                onClick={() => setOpenLesson(lesson)}
              >
                <div className="lh-lesson-card-top">
                  <span className="lh-lesson-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    {completed.has(lesson.id) ? (
                      <>
                        <CheckCircle2 size={14} /> Completed
                      </>
                    ) : (
                      <>
                        <Clock3 size={14} /> {lesson.minutes} min
                      </>
                    )}
                  </span>
                </div>
                <span className="lh-lesson-level">{lesson.level}</span>
                <h3>{lesson.title}</h3>
                <p>{lesson.summary}</p>
                <div className="lh-lesson-link">
                  {completed.has(lesson.id) ? "Read again" : "Start reading"}
                  <ArrowUpRight size={17} />
                </div>
              </button>
            ))}
          </div>
          <div className="lh-practice-callout">
            <Target size={27} />
            <div>
              <h3>Try the tactics board.</h3>
              <p>
                Calculate the full line before you move. The opponent’s reply
                matters.
              </p>
            </div>
            <button onClick={onPuzzle}>
              Solve a puzzle <ArrowRight size={17} />
            </button>
          </div>
        </section>
      )}
      {openLesson && (
        <LessonDialog
          lesson={openLesson}
          complete={completed.has(openLesson.id)}
          onComplete={() => toggleComplete(openLesson.id)}
          onClose={closeLesson}
        />
      )}
    </div>
  );
}
export default LearnHub;
