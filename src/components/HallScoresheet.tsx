import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Color } from "chess.js";
import { Copy, PanelsTopLeft, X } from "lucide-react";
import { playedAlienGambit } from "../lib/alien-gambit";
import type { GameSession } from "../lib/game";
import { moveReference } from "../lib/review";
import type { Settings } from "../lib/storage";
import ChessBoard from "./ChessBoard";
import { MoveList } from "./GameControls";
import "./HallScoresheet.css";

interface Props {
  game: GameSession;
  orientation: Color;
  settings: Pick<Settings, "boardTheme" | "coordinates" | "alienEasterEgg">;
  onCopy: (text: string, message: string) => void;
}

interface ReplayPosition {
  gameId: string;
  startFen: string;
  index: number;
  fen: string;
}

function notationThrough(game: GameSession, index: number): string {
  return game.moves
    .slice(0, index + 1)
    .map((move, ply) => {
      if (move.color === "b" && ply > 0) return move.san;
      return `${moveReference(move, ply).replace("…", "...")} ${move.san}`;
    })
    .join(" ");
}

export default function HallScoresheet({
  game,
  orientation,
  settings,
  onCopy,
}: Props) {
  const [selected, setSelected] = useState<ReplayPosition | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const latest = game.moves.length - 1;
  const replayValid =
    selected !== null &&
    selected.gameId === game.id &&
    selected.startFen === game.startFen &&
    (selected.index === -1 || game.moves[selected.index]?.fen === selected.fen);
  const index = replayValid ? selected.index : latest;
  const move = game.moves[index];
  const label = move
    ? `${moveReference(move, index)} ${move.san}`
    : "Starting position";

  // A pinned position may disappear when the live game is taken back or replaced.
  useEffect(() => {
    if (selected && !replayValid) setSelected(null);
  }, [selected, replayValid]);

  function select(index: number) {
    setSelected({
      gameId: game.id,
      startFen: game.startFen,
      index,
      fen: game.moves[index]?.fen ?? game.startFen,
    });
  }
  function close() {
    setSelected(null);
    openButton.current?.focus({ preventScroll: true });
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey
    )
      return;
    if ((event.target as HTMLElement).closest(".chessboard")) {
      // The mini board handles arrow navigation between squares.
      if (event.key.startsWith("Arrow")) return;
    }
    if (event.key === "Escape" && replayValid) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (latest >= 0)
        select(
          Math.max(
            -1,
            Math.min(latest, index + (event.key === "ArrowLeft" ? -1 : 1)),
          ),
        );
    }
  }

  const alienTheme =
    replayValid &&
    settings.alienEasterEgg &&
    (game.alienGambit === true || game.mode === "lan") &&
    playedAlienGambit(game.startFen, game.moves.slice(0, index + 1));

  return (
    <section
      className="hall-scoresheet"
      aria-label="Scoresheet"
      onKeyDown={keyboard}
    >
      <MoveList game={game} title="Scoresheet" index={index} onSelect={select}>
        <div className="hall-sheet-tools">
          <button
            type="button"
            ref={openButton}
            disabled={latest < 0}
            aria-expanded={replayValid}
            aria-label={replayValid ? "Close replay" : "Open replay"}
            onClick={() => (replayValid ? close() : select(latest))}
          >
            {replayValid ? (
              <X size={15} aria-hidden="true" />
            ) : (
              <PanelsTopLeft size={15} aria-hidden="true" />
            )}
            {replayValid ? "Close replay" : "Open replay"}
          </button>
          <button
            type="button"
            disabled={index < 0}
            onClick={() =>
              onCopy(notationThrough(game, index), "Move notation copied.")
            }
          >
            <Copy size={15} aria-hidden="true" /> Copy moves
          </button>
        </div>
        {replayValid && (
          <figure className="hall-replay">
            <figcaption aria-live="polite">
              <span>Replay board</span>
              <strong>{label}</strong>
            </figcaption>
            <ChessBoard
              fen={selected.fen}
              lastMove={move}
              theme={settings.boardTheme}
              orientation={orientation}
              alienTheme={alienTheme}
              showCoordinates={settings.coordinates}
              showLegalMoves={false}
              disabled
            />
          </figure>
        )}
      </MoveList>
    </section>
  );
}
