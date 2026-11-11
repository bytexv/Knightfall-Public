import { Check, NotebookPen, Save, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  MAX_COMMENT_LENGTH,
  sanitizeComment,
  type GameSession,
} from "../lib/game";
import "./GameNotes.css";

type GameNotesProps = {
  game: GameSession;
  index: number;
  onChange: (index: number, comment: string) => void;
};
const annotations = [
  { symbol: "!", label: "Good move" },
  { symbol: "?", label: "Mistake" },
  { symbol: "!!", label: "Brilliant idea" },
  { symbol: "??", label: "Blunder" },
  { symbol: "!?", label: "Interesting idea" },
  { symbol: "?!", label: "Dubious idea" },
];

export default function GameNotes({ game, index, onChange }: GameNotesProps) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const move = game.moves[index];
  const validPosition = index === -1 || !!move;
  const stored = sanitizeComment(
    index < 0 ? game.initialComment : move?.comment,
  );
  const [draft, setDraft] = useState(stored);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const dirty = sanitizeComment(draft) !== stored;
  const moveNumber = move
    ? Number.parseInt(move.before.split(" ")[5], 10) || 1
    : 1;
  const positionLabel =
    index < 0
      ? "Starting position"
      : move
        ? `After ${moveNumber}${move.color === "b" ? "..." : "."} ${move.san}`
        : "Select a position";

  useEffect(() => {
    setDraft(stored);
    setFeedback("");
    setFailed(false);
  }, [game.id, index, stored]);
  const edit = (value: string) => {
    setDraft(value.slice(0, MAX_COMMENT_LENGTH));
    setFeedback("");
    setFailed(false);
  };
  const save = (clear = false) => {
    if (!validPosition) return;
    const comment = clear ? "" : sanitizeComment(draft);
    try {
      onChange(index, comment);
      setDraft(comment);
      setFailed(false);
      setFeedback(clear ? "Note cleared." : "Note updated.");
    } catch {
      setFailed(true);
      setFeedback("Could not update this note. Please try again.");
    }
  };
  const insert = (symbol: string) => {
    const input = textarea.current;
    const editing = input && document.activeElement === input;
    const start = editing ? input.selectionStart : draft.length;
    const end = editing ? input.selectionEnd : draft.length;
    const prefix = draft.slice(0, start),
      suffix = draft.slice(end);
    const text = `${prefix && !/\s$/.test(prefix) ? " " : ""}${symbol}${suffix && !/^\s/.test(suffix) ? " " : ""}`;
    edit(prefix + text + suffix);
    queueMicrotask(() => {
      input?.focus();
      input?.setSelectionRange(
        Math.min(MAX_COMMENT_LENGTH, start + text.length),
        Math.min(MAX_COMMENT_LENGTH, start + text.length),
      );
    });
  };

  return (
    <section className="card game-notes" aria-labelledby={`${id}-heading`}>
      <div className="panel-heading">
        <h3 id={`${id}-heading`}>
          <NotebookPen size={16} /> Study notes
        </h3>
        <span className="game-notes-position" title={positionLabel}>
          {positionLabel}
        </span>
      </div>
      <label className="game-notes-label" htmlFor={`${id}-text`}>
        Your idea for this position
      </label>
      <textarea
        ref={textarea}
        id={`${id}-text`}
        value={draft}
        onChange={(event) => edit(event.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        rows={5}
        disabled={!validPosition}
        placeholder="What is the plan? What would you try next?"
        aria-describedby={`${id}-hint ${id}-count`}
      />
      <div className="game-notes-tools">
        <div
          className="game-notes-symbols"
          role="group"
          aria-label="Insert a plain-text annotation"
        >
          {annotations.map((annotation) => (
            <button
              key={annotation.symbol}
              type="button"
              aria-label={`Insert ${annotation.symbol}: ${annotation.label}`}
              title={annotation.label}
              disabled={!validPosition || draft.length >= MAX_COMMENT_LENGTH}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(annotation.symbol)}
            >
              {annotation.symbol}
            </button>
          ))}
        </div>
        <span
          id={`${id}-count`}
          className={draft.length > 1900 ? "near-limit" : ""}
        >
          {draft.length.toLocaleString()} /{" "}
          {MAX_COMMENT_LENGTH.toLocaleString()}
        </span>
      </div>
      <p className="game-notes-hint" id={`${id}-hint`}>
        Notes and symbols are plain text and travel with your PGN export.
      </p>
      <div className="game-notes-actions">
        <button
          type="button"
          className="button primary"
          disabled={!validPosition || !dirty}
          onClick={() => save()}
        >
          <Save size={14} /> Save note
        </button>
        <button
          type="button"
          className="button subtle"
          disabled={!validPosition || (!draft && !stored)}
          onClick={() => save(true)}
        >
          <Trash2 size={14} /> Clear
        </button>
        <span
          className={`game-notes-status ${failed ? "failed" : ""}`}
          role="status"
          aria-live="polite"
        >
          {feedback ||
            (dirty ? (
              "Unsaved changes"
            ) : stored ? (
              <>
                <Check size={12} /> Note attached
              </>
            ) : (
              ""
            ))}
        </span>
      </div>
      {dirty && (
        <p className="game-notes-unsaved">
          Save your note before switching to another move.
        </p>
      )}
    </section>
  );
}
