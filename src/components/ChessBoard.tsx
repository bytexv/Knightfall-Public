import { Chess, type Color, type Square } from "chess.js";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BoardAnimator } from "../lib/board-animator";
import "./ChessBoard.css";
export interface ChessBoardProps {
  fen: string;
  alienTheme?: boolean;
  orientation?: Color;
  onMove?: (from: string, to: string, promotion?: string) => void;
  disabled?: boolean;
  lastMove?: { from: string; to: string } | null;
  arrows?: { from: string; to: string; color?: string }[];
  showCoordinates?: boolean;
  showLegalMoves?: boolean;
  theme?: "sage" | "walnut" | "ocean";
}
const names: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
export default function ChessBoard({
  fen,
  alienTheme = false,
  orientation = "w",
  onMove,
  disabled = false,
  lastMove,
  arrows = [],
  showCoordinates = true,
  showLegalMoves = true,
  theme = "sage",
}: ChessBoardProps) {
  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [marks, setMarks] = useState<string[]>([]);
  const [annotations, setAnnotations] = useState<
    { from: string; to: string; color?: string }[]
  >([]);
  const annotationFrom = useRef<string | null>(null);
  const justAnnotated = useRef(false);
  const board = useRef<HTMLDivElement>(null);
  const pieceLayer = useRef<HTMLDivElement>(null);
  const animator = useRef<BoardAnimator | null>(null);
  const dragFrom = useRef<{
    square: string;
    x: number;
    y: number;
    pointerId: number;
    active: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [focus, setFocus] = useState("e2");
  useLayoutEffect(() => {
    if (!board.current || !pieceLayer.current) return;
    const controller = new BoardAnimator(
      board.current,
      pieceLayer.current,
      alienTheme ? "pieces/alien" : "pieces",
    );
    animator.current = controller;
    return () => {
      controller.destroy();
      animator.current = null;
    };
  }, [alienTheme]);
  useLayoutEffect(() => {
    animator.current?.sync(game.fen(), orientation);
    dragFrom.current = null;
  }, [game, orientation, alienTheme]);
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
    setMarks([]);
    setAnnotations([]);
  }, [fen, orientation]);
  useEffect(() => {
    if (disabled) {
      setSelected(null);
      setPromotion(null);
      if (dragFrom.current) animator.current?.cancelDrag();
      dragFrom.current = null;
    }
  }, [disabled]);
  useEffect(() => {
    if (promotion)
      board.current
        ?.querySelector<HTMLButtonElement>(".promotion-choices button")
        ?.focus();
  }, [promotion]);
  const files = orientation === "w" ? "abcdefgh" : "hgfedcba";
  const ranks = orientation === "w" ? "87654321" : "12345678";
  const squares = [...ranks].flatMap((r) => [...files].map((f) => `${f}${r}`));
  const legal = selected
    ? game.moves({ square: selected as Square, verbose: true })
    : [];
  const check = game.isCheck()
    ? squares.find((s) => {
        const p = game.get(s as Square);
        return p?.type === "k" && p.color === game.turn();
      })
    : null;
  function tryMove(from: string, to: string) {
    if (disabled || !onMove) return false;
    const move = game
      .moves({ square: from as Square, verbose: true })
      .find((m) => m.to === to);
    if (!move) return false;
    if (move.promotion) {
      setPromotion({ from, to });
    } else {
      onMove(from, to);
    }
    setSelected(null);
    return true;
  }
  function click(square: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (disabled) return;
    if (selected && tryMove(selected, square)) return;
    const piece = game.get(square as Square);
    setSelected(
      piece?.color === game.turn() && selected !== square ? square : null,
    );
  }
  const pos = (s: string) => ({
    x: (files.indexOf(s[0]) * 100) / 8 + 6.25,
    y: (ranks.indexOf(s[1]) * 100) / 8 + 6.25,
  });
  return (
    <div className={`chessboard-shell theme-${theme}`}>
      <div
        className="chessboard"
        role="group"
        aria-label={`Chess board. ${game.turn() === "w" ? "White" : "Black"} to move${game.isCheck() ? ", in check" : ""}`}
        ref={board}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setSelected(null);
            setPromotion(null);
            setMarks([]);
            setAnnotations([]);
          }
          if (promotion) {
            if (e.key === "Tab") {
              const choices = Array.from(
                board.current?.querySelectorAll<HTMLButtonElement>(
                  ".promotion-dialog button",
                ) || [],
              );
              const first = choices[0],
                last = choices.at(-1);
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }
            return;
          }
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            const index = squares.indexOf(focus);
            const delta =
              e.key === "ArrowLeft"
                ? -1
                : e.key === "ArrowRight"
                  ? 1
                  : e.key === "ArrowUp"
                    ? -8
                    : 8;
            const next = squares[Math.min(63, Math.max(0, index + delta))];
            setFocus(next);
            board.current
              ?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)
              ?.focus();
          }
        }}
      >
        {squares.map((square, index) => {
          const piece = game.get(square as Square);
          const isDark = (square.charCodeAt(0) + Number(square[1])) % 2 === 0;
          const target = legal.some((m) => m.to === square);
          return (
            <button
              type="button"
              key={square}
              data-square={square}
              tabIndex={focus === square ? 0 : -1}
              onFocus={() => setFocus(square)}
              className={`square ${isDark ? "dark" : "light"} ${selected === square ? "selected" : ""} ${lastMove && (lastMove.from === square || lastMove.to === square) ? "last-move" : ""} ${check === square ? "in-check" : ""} ${marks.includes(square) ? "marked" : ""}`}
              aria-label={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${names[piece.type]}` : ", empty"}${target ? ", legal move" : ""}`}
              aria-pressed={selected === square}
              aria-disabled={disabled}
              onClick={() => click(square)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (justAnnotated.current) {
                  justAnnotated.current = false;
                  return;
                }
                setMarks((m) =>
                  m.includes(square)
                    ? m.filter((s) => s !== square)
                    : [...m, square],
                );
              }}
              onPointerDown={(e) => {
                if (e.button === 2) {
                  annotationFrom.current = square;
                  justAnnotated.current = false;
                  return;
                }
                if (e.button !== 0 || disabled || !onMove) return;
                const p = game.get(square as Square);
                if (p?.color === game.turn()) {
                  animator.current?.cancelDrag();
                  dragFrom.current = {
                    square,
                    x: e.clientX,
                    y: e.clientY,
                    pointerId: e.pointerId,
                    active: false,
                  };
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                }
              }}
              onPointerMove={(e) => {
                const drag = dragFrom.current;
                if (!drag || drag.pointerId !== e.pointerId || disabled) return;
                if (
                  !drag.active &&
                  Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6
                )
                  return;
                if (!drag.active) {
                  drag.active = true;
                  setSelected(drag.square);
                }
                const piece = game.get(drag.square as Square);
                if (!piece) return;
                e.preventDefault();
                animator.current?.moveDrag(
                  drag.square,
                  piece,
                  e.clientX,
                  e.clientY,
                );
              }}
              onPointerUp={(e) => {
                if (e.button === 2 && annotationFrom.current) {
                  const to = document
                    .elementFromPoint(e.clientX, e.clientY)
                    ?.closest<HTMLElement>("[data-square]")?.dataset.square;
                  const from = annotationFrom.current;
                  annotationFrom.current = null;
                  if (to && to !== from) {
                    const color = e.shiftKey
                      ? "#55955c"
                      : e.altKey
                        ? "#6095b2"
                        : "#d2a146";
                    setAnnotations((old) =>
                      old.some((a) => a.from === from && a.to === to)
                        ? old.filter((a) => a.from !== from || a.to !== to)
                        : [...old, { from, to, color }],
                    );
                    justAnnotated.current = true;
                  }
                  return;
                }
                if (
                  !dragFrom.current ||
                  dragFrom.current.pointerId !== e.pointerId ||
                  disabled
                )
                  return;
                const element = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest<HTMLElement>("[data-square]");
                const to =
                  element && board.current?.contains(element)
                    ? element.dataset.square
                    : undefined;
                const drag = dragFrom.current;
                const from = drag.square;
                dragFrom.current = null;
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                const move =
                  to && from !== to
                    ? game
                        .moves({ square: from as Square, verbose: true })
                        .find((candidate) => candidate.to === to)
                    : undefined;
                animator.current?.releaseDrag(
                  to || null,
                  Boolean(move && onMove),
                  Boolean(move?.promotion),
                );
                if (to && from !== to && tryMove(from, to)) {
                  suppressClick.current = true;
                  setTimeout(() => {
                    suppressClick.current = false;
                  }, 50);
                } else if (drag.active) {
                  suppressClick.current = true;
                  setTimeout(() => {
                    suppressClick.current = false;
                  }, 50);
                }
              }}
              onPointerCancel={() => {
                dragFrom.current = null;
                animator.current?.cancelDrag();
              }}
              onLostPointerCapture={() => {
                if (dragFrom.current) {
                  dragFrom.current = null;
                  animator.current?.cancelDrag();
                }
              }}
              onDragStart={(e) => e.preventDefault()}
            >
              {showCoordinates && index % 8 === 0 && (
                <span className="coordinate rank" aria-hidden="true">
                  {square[1]}
                </span>
              )}
              {showCoordinates && index >= 56 && (
                <span className="coordinate file" aria-hidden="true">
                  {square[0]}
                </span>
              )}
              {piece && (
                <img
                  draggable={false}
                  className="chess-piece"
                  src={`./${alienTheme ? "pieces/alien" : "pieces"}/${piece.color}${piece.type.toUpperCase()}.svg`}
                  alt=""
                />
              )}
              {target && showLegalMoves && (
                <span className={piece ? "legal-ring" : "legal-dot"} />
              )}
            </button>
          );
        })}
        <div
          className="board-piece-layer"
          ref={pieceLayer}
          aria-hidden="true"
        />
        <svg className="board-arrows" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <marker
              id="arrow-head"
              markerWidth="3"
              markerHeight="3"
              refX="2.1"
              refY="1.5"
              orient="auto"
            >
              <path d="M0,0 L3,1.5 L0,3 Z" fill="context-stroke" />
            </marker>
          </defs>
          {[...annotations, ...arrows].map((a, i) => {
            const f = pos(a.from),
              t = pos(a.to);
            return (
              <line
                key={i}
                x1={f.x}
                y1={f.y}
                x2={t.x}
                y2={t.y}
                stroke={a.color || "#d2a146"}
                strokeWidth="1.7"
                opacity=".85"
                markerEnd="url(#arrow-head)"
              />
            );
          })}
        </svg>
        {promotion && (
          <div className="promotion-backdrop">
            <div
              className="promotion-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Choose promotion piece"
            >
              <div>
                <strong>Promote your pawn</strong>
                <button
                  className="icon-button"
                  onClick={() => setPromotion(null)}
                  aria-label="Cancel promotion"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="promotion-choices">
                {["q", "r", "b", "n"].map((p) => (
                  <button
                    key={p}
                    aria-label={`Promote to ${names[p]}`}
                    onClick={() => {
                      onMove?.(promotion.from, promotion.to, p);
                      setPromotion(null);
                    }}
                  >
                    <img
                      src={`./${alienTheme ? "pieces/alien" : "pieces"}/${game.turn()}${p.toUpperCase()}.svg`}
                      alt={names[p]}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
