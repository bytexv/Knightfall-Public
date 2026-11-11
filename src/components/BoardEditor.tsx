import { type Color, type PieceSymbol, type Square } from "chess.js";
import {
  ArrowLeftRight,
  Check,
  Copy,
  Eraser,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  editorPieceNames,
  editorSquares,
  emptyBoardSetup,
  nextEditorSquare,
  placeEditorPiece,
  setupFromFen,
  validateBoardSetup,
  type BoardSetup,
  type EditorPiece,
} from "../lib/board-editor";
import "./BoardEditor.css";

export interface BoardEditorProps {
  initialFen?: string;
  onAnalyze: (fen: string) => void;
  onClose: () => void;
}
const pieceOrder: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const nameFor = (piece: EditorPiece) =>
  `${piece.color === "w" ? "White" : "Black"} ${editorPieceNames[piece.type]}`;

/** Position editor content. The owner supplies its surrounding modal/dialog. */
export default function BoardEditor({
  initialFen,
  onAnalyze,
  onClose,
}: BoardEditorProps) {
  const initial = useMemo(() => {
    try {
      return { setup: setupFromFen(initialFen), error: "" };
    } catch {
      return {
        setup: setupFromFen(),
        error:
          "The supplied position could not be read. Start from this board or clear it.",
      };
    }
  }, []);
  const [setup, setSetup] = useState<BoardSetup>(initial.setup);
  const [selected, setSelected] = useState<EditorPiece | null>({
    color: "w",
    type: "p",
  });
  const [orientation, setOrientation] = useState<Color>("w");
  const [focus, setFocus] = useState<Square>("e2");
  const [announcement, setAnnouncement] = useState(initial.error);
  const [copyMessage, setCopyMessage] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);
  const fenRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const squares = useMemo(() => editorSquares(orientation), [orientation]);
  const validation = useMemo(() => validateBoardSetup(setup), [setup]);
  const selectedLabel = selected ? nameFor(selected) : "Eraser";
  const piecesCount = Object.keys(setup.board).length;

  function place(square: Square, piece = selected) {
    setSetup((current) => ({
      ...current,
      board: placeEditorPiece(current.board, square, piece),
    }));
    setFocus(square);
    setCopyMessage("");
    setAnnouncement(
      piece ? `${nameFor(piece)} placed on ${square}.` : `${square} cleared.`,
    );
  }

  function update<K extends keyof BoardSetup>(key: K, value: BoardSetup[K]) {
    setSetup((current) => ({ ...current, [key]: value }));
    setCopyMessage("");
  }

  function reset(clear = false) {
    setSetup(clear ? emptyBoardSetup(setup.turn) : setupFromFen());
    setSelected({ color: "w", type: clear ? "k" : "p" });
    setCopyMessage("");
    setAnnouncement(
      clear
        ? "Board cleared. Place a white king, then a black king."
        : "Starting position restored.",
    );
  }

  async function copyFen() {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(validation.fen);
      setCopyMessage("FEN copied.");
    } catch {
      fenRef.current?.focus();
      fenRef.current?.select();
      setCopyMessage("FEN selected. Use your device’s copy command.");
    }
  }

  return (
    <div className="board-editor">
      <p className="be-intro">
        Build a position, then explore its possibilities. Choose a piece and tap
        any square to place it.
      </p>
      <div className="be-workspace">
        <section className="be-board-section" aria-label="Edit the board">
          <div className="be-board-heading">
            <span>{selectedLabel} selected</span>
            <span>{piecesCount} pieces</span>
          </div>
          <div
            className="be-board"
            role="grid"
            aria-label="Position setup board"
            aria-describedby={`${id}-keys`}
            aria-rowcount={8}
            aria-colcount={8}
            ref={boardRef}
            onKeyDown={(event) => {
              const square = (
                event.target as HTMLElement
              ).closest<HTMLButtonElement>("[data-editor-square]")?.dataset
                .editorSquare as Square | undefined;
              if (!square) return;
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(event.key)
              ) {
                event.preventDefault();
                event.stopPropagation();
                const next = nextEditorSquare(square, event.key, orientation);
                setFocus(next);
                boardRef.current
                  ?.querySelector<HTMLButtonElement>(
                    `[data-editor-square="${next}"]`,
                  )
                  ?.focus();
              } else if (["Delete", "Backspace"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                place(square, null);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                place(square);
              }
            }}
          >
            {Array.from({ length: 8 }, (_, row) => (
              <div className="be-board-row" role="row" key={row}>
                {squares.slice(row * 8, row * 8 + 8).map((square, column) => {
                  const piece = setup.board[square];
                  const dark =
                    (square.charCodeAt(0) + Number(square[1])) % 2 === 0;
                  return (
                    <button
                      key={square}
                      type="button"
                      role="gridcell"
                      aria-rowindex={row + 1}
                      aria-colindex={column + 1}
                      data-editor-square={square}
                      tabIndex={focus === square ? 0 : -1}
                      onFocus={() => setFocus(square)}
                      className={`be-square ${dark ? "be-dark" : "be-light"}`}
                      aria-label={`${square}, ${piece ? nameFor(piece).toLowerCase() : "empty"}`}
                      onClick={() => place(square)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        place(square, null);
                      }}
                    >
                      {piece && (
                        <img
                          draggable={false}
                          src={`./pieces/${piece.color}${piece.type.toUpperCase()}.svg`}
                          alt=""
                        />
                      )}
                      {column === 0 && (
                        <span className="be-rank" aria-hidden="true">
                          {square[1]}
                        </span>
                      )}
                      {row === 7 && (
                        <span className="be-file" aria-hidden="true">
                          {square[0]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="be-board-actions">
            <button
              type="button"
              className="be-small-button"
              onClick={() =>
                setOrientation((side) => (side === "w" ? "b" : "w"))
              }
            >
              <ArrowLeftRight size={15} /> Flip board
            </button>
            <button
              type="button"
              className="be-small-button"
              onClick={() => reset()}
            >
              <RotateCcw size={15} /> Starting position
            </button>
            <button
              type="button"
              className="be-small-button"
              onClick={() => reset(true)}
            >
              <Trash2 size={15} /> Clear
            </button>
          </div>
          <p id={`${id}-keys`} className="be-keyboard-tip">
            Arrow keys move between squares. Enter or Space places a piece.
            Delete erases. Right-click also erases.
          </p>
        </section>
        <div className="be-controls">
          <div className="be-palette" aria-label="Piece palette">
            {(["w", "b"] as const).map((color) => (
              <fieldset className="be-palette-row" key={color}>
                <legend>
                  {color === "w" ? "White pieces" : "Black pieces"}
                </legend>
                <div>
                  {pieceOrder.map((type) => {
                    const piece = { color, type };
                    const active =
                      selected?.color === color && selected.type === type;
                    return (
                      <button
                        type="button"
                        key={type}
                        className={`be-piece-choice ${active ? "be-selected" : ""}`}
                        aria-label={nameFor(piece)}
                        aria-pressed={active}
                        onClick={() => {
                          setSelected(piece);
                          setAnnouncement(
                            `${nameFor(piece)} selected. Tap a square to place it.`,
                          );
                        }}
                      >
                        <img
                          src={`./pieces/${color}${type.toUpperCase()}.svg`}
                          alt=""
                          draggable={false}
                        />
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className={`be-eraser ${!selected ? "be-selected" : ""}`}
              aria-label="Erase pieces"
              aria-pressed={!selected}
              onClick={() => {
                setSelected(null);
                setAnnouncement("Eraser selected. Tap a square to clear it.");
              }}
            >
              <Eraser size={16} /> Erase pieces
            </button>
          </div>
          <div className="be-fields">
            <label htmlFor={`${id}-turn`}>
              Side to move
              <select
                id={`${id}-turn`}
                value={setup.turn}
                onChange={(event) =>
                  update("turn", event.target.value as Color)
                }
              >
                <option value="w">White to move</option>
                <option value="b">Black to move</option>
              </select>
            </label>
            <fieldset className="be-castling">
              <legend>Castling rights</legend>
              <div>
                {[
                  ["K", "White kingside"],
                  ["Q", "White queenside"],
                  ["k", "Black kingside"],
                  ["q", "Black queenside"],
                ].map(([right, label]) => (
                  <label key={right}>
                    <input
                      type="checkbox"
                      checked={setup.castling.includes(right)}
                      onChange={(event) =>
                        update(
                          "castling",
                          event.target.checked
                            ? setup.castling + right
                            : setup.castling.replace(right, ""),
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <small>Enable only if that king and rook have never moved.</small>
            </fieldset>
            <label htmlFor={`${id}-ep`}>
              En-passant square
              <select
                id={`${id}-ep`}
                value={setup.enPassant}
                onChange={(event) => update("enPassant", event.target.value)}
              >
                <option value="-">None</option>
                {[..."abcdefgh"].flatMap((file) =>
                  ["3", "6"].map((rank) => (
                    <option key={file + rank} value={file + rank}>
                      {file + rank}
                    </option>
                  )),
                )}
              </select>
              <small>
                The square passed over by the last pawn double move.
              </small>
            </label>
            <div className="be-counters">
              <label htmlFor={`${id}-halfmove`}>
                Halfmove clock
                <input
                  id={`${id}-halfmove`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={setup.halfmove}
                  onChange={(event) => update("halfmove", event.target.value)}
                />
                <small>Since a capture or pawn move</small>
              </label>
              <label htmlFor={`${id}-fullmove`}>
                Move number
                <input
                  id={`${id}-fullmove`}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={setup.fullmove}
                  onChange={(event) => update("fullmove", event.target.value)}
                />
                <small>Starts at 1</small>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div
        className={`be-validation ${validation.valid ? "be-valid" : "be-invalid"}`}
        role="status"
        aria-live="polite"
      >
        {validation.valid ? (
          <>
            <Check size={16} />
            <span>Ready to analyze · {validation.note}</span>
          </>
        ) : (
          <>
            <span className="be-validation-dot">!</span>
            <span>{validation.error}</span>
          </>
        )}
      </div>
      <div className="be-fen-heading">
        <label htmlFor={`${id}-fen`}>Position FEN</label>
        <button
          type="button"
          className="be-small-button"
          onClick={() => void copyFen()}
        >
          <Copy size={14} /> Copy FEN
        </button>
      </div>
      <textarea
        className="be-fen"
        id={`${id}-fen`}
        ref={fenRef}
        readOnly
        rows={2}
        value={validation.fen}
        spellCheck={false}
      />
      <p className="be-announcement" aria-live="polite">
        {copyMessage ||
          announcement ||
          "Your position is edited locally on this device."}
      </p>
      <div className="be-footer">
        <button
          type="button"
          className="be-button be-secondary"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="be-button be-primary"
          disabled={!validation.valid}
          onClick={() => {
            if (validation.valid) onAnalyze(validation.fen);
          }}
        >
          <Search size={16} /> Analyze position
        </button>
      </div>
    </div>
  );
}
