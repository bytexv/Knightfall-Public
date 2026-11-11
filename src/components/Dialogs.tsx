import { Clipboard, FileUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { importFen, importPgn, type GameSession } from "../lib/game";
export function Modal({
  title,
  onClose,
  children,
  size = "default",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "default" | "wide";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const nodes = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex="0"]',
        ) || [],
      ).filter((n) => !n.hasAttribute("disabled"));
    nodes()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const a = nodes(),
          first = a[0],
          last = a.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${size === "wide" ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (game: GameSession) => void;
}) {
  const [format, setFormat] = useState<"pgn" | "fen">("pgn");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <Modal title="Bring your game." onClose={onClose}>
      <p className="muted">
        Paste a game or position to explore it with local analysis.
      </p>
      <div className="segmented">
        <button
          className={format === "pgn" ? "active" : ""}
          onClick={() => {
            setFormat("pgn");
            setError("");
          }}
        >
          PGN game
        </button>
        <button
          className={format === "fen" ? "active" : ""}
          onClick={() => {
            setFormat("fen");
            setError("");
          }}
        >
          FEN position
        </button>
      </div>
      <label className="field-label" htmlFor="import-text">
        {format === "pgn"
          ? "PORTABLE GAME NOTATION"
          : "FORSYTH–EDWARDS NOTATION"}
      </label>
      <textarea
        id="import-text"
        rows={8}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={
          format === "pgn"
            ? "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"
            : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        }
      />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <input
          ref={input}
          type="file"
          accept=".pgn,.fen,.txt"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 3000000) {
              setError("Choose a single game under 3 MB.");
              return;
            }
            setValue(await file.text());
            if (file.name.endsWith(".fen")) setFormat("fen");
          }}
        />
        <button
          className="button secondary"
          onClick={() => input.current?.click()}
        >
          <FileUp size={16} /> Open file
        </button>
        <button
          className="button primary"
          disabled={!value.trim()}
          onClick={() => {
            try {
              const imported =
                format === "fen" ? importFen(value) : importPgn(value);
              onClose();
              onImport(imported);
            } catch (e) {
              setError(
                `This ${format.toUpperCase()} could not be read. ${e instanceof Error ? e.message : "Check the notation and try again."}`,
              );
            }
          }}
        >
          <Clipboard size={16} /> Analyze{" "}
          {format === "fen" ? "position" : "game"}
        </button>
      </div>
    </Modal>
  );
}
