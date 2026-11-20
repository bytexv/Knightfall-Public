import { RatingLegend } from "./RatingLegend";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color } from "chess.js";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  GraduationCap,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import ChessBoard from "./ChessBoard";
import BotPortrait from "./BotPortrait";
import PositionCoach from "./PositionCoach";
import { LocalEngine, type EngineResult } from "../lib/engine";
import {
  applyMove,
  newSession,
  undoMoves,
  START_FEN,
  type GameSession,
} from "../lib/game";
import { bots, botSearchOptions, resolveBot } from "../lib/bots";
import { analyzeCoachPosition, usableSearch } from "../lib/coach";
import {
  formatEvaluation,
  reviewMove,
  type MoveClassification,
} from "../lib/review";
import {
  readStore,
  writeStore,
  saveGame,
  validateSavedGame,
  type Settings,
} from "../lib/storage";
import { learningGoal } from "../data/guided-game";
import "./CoachRoom.css";

const storageKey = "coach-session";
interface Grade {
  label: MoveClassification | "Unrated";
  note: string;
  evidence?: string;
}
function restoreSession() {
  const saved = validateSavedGame(readStore(storageKey, null));
  return saved?.mode === "bot" && !saved.rating ? saved : null;
}

export default function CoachRoom({ settings }: { settings: Settings }) {
  const [game, setGame] = useState<GameSession | null>(restoreSession);
  const [setup, setSetup] = useState(!game);
  const [side, setSide] = useState<Color | "random">(game?.playerColor ?? "w");
  const [opponent, setOpponent] = useState(game?.botId ?? "sprout");
  const [cursor, setCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [lesson, setLesson] = useState(false);
  const [hint, setHint] = useState<{ from: string; to: string } | null>(null);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const analyst = useRef<LocalEngine | null>(null);
  const player = useRef<LocalEngine | null>(null);
  const cachedPosition = useRef<{ fen: string; result: EngineResult } | null>(
    null,
  );
  const last = (game?.moves.length ?? 0) - 1;
  const index = cursor ?? last;
  const record = game?.moves[index];
  const fen = record?.fen ?? START_FEN;
  const board = useMemo(() => new Chess(fen), [fen]);
  const selected = resolveBot(setup ? opponent : (game?.botId ?? opponent));
  const gradeKey = record ? index + ":" + record.before + ":" + record.san : "";
  const grade = grades[gradeKey];
  const myTurn = !!game && board.turn() === game.playerColor;
  const live = !setup && cursor === null && !game?.result;
  const pending = !!record && !grade;

  useEffect(() => {
    if (setup) return;
    analyst.current = new LocalEngine({
      mode: settings.engineMode,
      threads: settings.engineThreads,
    });
    player.current = new LocalEngine({
      mode: settings.engineMode,
      threads: settings.engineThreads,
    });
    cachedPosition.current = null;
    return () => {
      analyst.current?.destroy();
      player.current?.destroy();
    };
  }, [setup, settings.engineMode, settings.engineThreads]);

  useEffect(() => {
    if (!game) return;
    writeStore(storageKey, game);
    if (game.result) saveGame(game);
  }, [game]);

  useEffect(() => {
    const engine = analyst.current;
    if (setup || !game || !record || grade || !engine) return;
    let active = true;
    function publish(value: Grade) {
      if (active) setGrades((previous) => ({ ...previous, [gradeKey]: value }));
    }
    async function evaluateMove(
      session: GameSession,
      move: NonNullable<typeof record>,
    ) {
      const saved = cachedPosition.current;
      const before =
        saved?.fen === move.before
          ? saved.result
          : await analyzeCoachPosition(engine!, move.before, () => active);
      if (!active) return;
      const after = await analyzeCoachPosition(engine!, move.fen, () => active);
      if (!active) return;
      const terminal = new Chess(move.fen).isGameOver();
      if (!terminal && usableSearch(move.fen, after))
        cachedPosition.current = { fen: move.fen, result: after };
      if (
        index === session.moves.length - 1 &&
        session.result?.reason === "Threefold repetition"
      ) {
        publish({
          label: "Unrated",
          note: "This move ended the game by threefold repetition. The result is a draw.",
        });
        return;
      }
      const review = reviewMove(index, move, before, after, session);
      if (
        review.confidence === "limited" ||
        !usableSearch(move.before, before) ||
        (!terminal && !usableSearch(move.fen, after))
      ) {
        publish({
          label: "Unrated",
          note: "Stockfish could not verify this move at sufficient depth on this device.",
        });
        return;
      }
      publish({
        label: review.label,
        note: review.reason,
        evidence: `${before.engine} · depth ${before.depth} → ${terminal ? "game over" : after.depth} · ${formatEvaluation(before)} → ${formatEvaluation(after)} (White)`,
      });
    }
    void evaluateMove(game, record).catch(() =>
      publish({
        label: "Unrated",
        note: "Analysis was unavailable for this move. You can keep playing.",
      }),
    );
    return () => {
      active = false;
      engine.cancel();
    };
  }, [
    setup,
    game,
    record,
    gradeKey,
    grade,
    index,
    settings.engineMode,
    settings.engineThreads,
  ]);

  useEffect(() => {
    const engine = player.current;
    if (!game || !live || myTurn || pending || !engine) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await engine.analyze(
          game.fen,
          botSearchOptions(selected, settings.botTime),
        );
        if (!active) return;
        const uci = result.bestMove;
        const next =
          uci && applyMove(game, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
        if (!next) throw Error("Missing legal reply");
        setGame(next);
      } catch {
        if (active) setError("The coach could not finish its reply.");
      }
    }, 550);
    return () => {
      active = false;
      clearTimeout(timer);
      engine.cancel();
    };
  }, [
    game,
    live,
    myTurn,
    pending,
    retry,
    selected,
    settings.botTime,
    settings.engineMode,
    settings.engineThreads,
  ]);

  function clearTools() {
    setLesson(false);
    setHint(null);
    setError("");
  }
  function start() {
    clearTools();
    setCursor(null);
    setGrades({});
    setSetup(false);
    const color = side === "random" ? (Math.random() < 0.5 ? "w" : "b") : side;
    setGame(
      newSession({
        mode: "bot",
        started: true,
        botId: opponent,
        playerColor: color,
        title: `Coach practice · ${selected.name}`,
        time: { base: 0, increment: 0 },
      }),
    );
  }
  function move(from: string, to: string, promotion?: string) {
    if (!game || !live || !myTurn || pending) return;
    const next = applyMove(game, from, to, promotion);
    if (next) {
      clearTools();
      setGame(next);
    }
  }
  function browse(next: number) {
    clearTools();
    setCursor(next >= last ? null : Math.max(-1, next));
  }
  const canUndo = !!game?.moves.some((m) => m.color === game.playerColor);
  const stamps = [];
  if (!setup && game) {
    for (const ply of [index - 1, index]) {
      const played = game.moves[ply];
      if (
        !played ||
        board.get(played.to as import("chess.js").Square)?.color !==
          played.color
      )
        continue;
      const rating = grades[ply + ":" + played.before + ":" + played.san];
      if (rating)
        stamps.push({
          square: played.to,
          san: played.san,
          label: rating.label,
        });
    }
  }
  const result = game?.result;
  const status = setup
    ? "Choose your side and a sparring partner."
    : cursor !== null
      ? "Replaying your game"
      : result
        ? result.winner
          ? `${result.winner === "w" ? "White" : "Black"} wins · ${result.reason}`
          : `Draw · ${result.reason}`
        : pending
          ? "Reading the move…"
          : myTurn
            ? "Your move"
            : `${selected.name} to move`;

  return (
    <section className="coach-desk" aria-label="Coach practice">
      <div className="coach-table">
        <div className="coach-caption" role="status">
          <span className="coach-seal">
            {settings.studio === "home" ? <BotPortrait botId={selected.id} /> : <GraduationCap size={24} />}
          </span>
          <div>
            <strong>{setup ? "At the practice board" : status}</strong>
            <p>
              {setup ? (
                "Play at your pace. I’ll mark each move and explain it as we go."
              ) : record ? (
                <>
                  {record.san} {grade ? <b>· {grade.label}</b> : null}
                </>
              ) : (
                learningGoal(board, game?.playerColor)
              )}
            </p>
          </div>
        </div>
        <ChessBoard
          fen={setup ? START_FEN : fen}
          orientation={setup ? (side === "b" ? "b" : "w") : game!.playerColor}
          onMove={move}
          disabled={!live || !myTurn || pending}
          qualityBadges={stamps}
          theme={settings.boardTheme}
          showLegalMoves={settings.legalMoves}
          showCoordinates={settings.coordinates}
          alienTheme={!setup && settings.alienEasterEgg && !!game?.alienGambit}
          lastMove={setup ? undefined : record}
          arrows={!setup && hint ? [hint] : []}
        />
        {!setup && (
          <div className="coach-playbar">
            <button
              aria-label="Previous coach move"
              disabled={index < 0}
              onClick={() => browse(index - 1)}
            >
              <ArrowLeft size={17} />
            </button>
            <span>
              {record
                ? `${Math.floor(index / 2) + 1}${record.color === "w" ? "." : "…"} ${record.san}`
                : "Starting position"}
            </span>
            <button
              aria-label="Next coach move"
              disabled={index === last}
              onClick={() => browse(index + 1)}
            >
              <ArrowRight size={17} />
            </button>
            {cursor !== null && (
              <button onClick={() => browse(last)}>Live board</button>
            )}
          </div>
        )}
      </div>
      <div className="coach-notebook">
        {setup ? (
          <>
            <h2>Set up practice</h2>
            <label htmlFor="coach-strength">Opponent strength</label>
            <select
              id="coach-strength"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · ≈ {b.elo} Elo
                </option>
              ))}
            </select>
            <div className="coach-partner">
              <BotPortrait botId={selected.id} />
              <p>{selected.description}</p>
            </div>
            <fieldset>
              <legend>Your pieces</legend>
              <div className="coach-sides">
                {(["w", "random", "b"] as const).map((c) => (
                  <button
                    key={c}
                    aria-pressed={side === c}
                    onClick={() => setSide(c)}
                  >
                    {c === "w" ? "White" : c === "b" ? "Black" : "Random"}
                  </button>
                ))}
              </div>
            </fieldset>
            <button className="button primary" onClick={start}>
              {game && !game.result
                ? "Start a new practice game"
                : "Play coach"}{" "}
              <ArrowRight size={16} />
            </button>
            {game && (
              <button className="text-button" onClick={() => setSetup(false)}>
                Return to current board
              </button>
            )}
            <small>Untimed practice · Local Elo stays separate</small>
          </>
        ) : (
          <>
            <div className="coach-note-heading">
              <div className="coach-partner">
                <BotPortrait botId={selected.id} />
                <div>
                  <small>Practice partner</small>
                  <h2>
                    {selected.name} <span>≈ {selected.elo}</span>
                  </h2>
                </div>
              </div>
              <button
                aria-label="Coach game setup"
                onClick={() => {
                  clearTools();
                  setSetup(true);
                }}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
            {stamps.length > 0 && (
              <div className="coach-turn-pair" aria-label="Move grades">
                {stamps.map((stamp) => (
                  <span key={stamp.square}>
                    <b>{stamp.san}</b> {stamp.label}
                  </span>
                ))}
              </div>
            )}
            <p aria-live="polite">
              {error ||
                (grade?.note ??
                  (pending
                    ? "Checking the position…"
                    : learningGoal(board, game?.playerColor)))}
            </p>
            {grade?.evidence && (
              <small className="coach-evidence">{grade.evidence}</small>
            )}
            {error && (
              <button
                className="button secondary"
                onClick={() => {
                  setError("");
                  setRetry((r) => r + 1);
                }}
              >
                Retry reply
              </button>
            )}
            {result && (
              <button
                className="button primary"
                onClick={() => {
                  clearTools();
                  setSetup(true);
                }}
              >
                New practice game
              </button>
            )}
            <div className="coach-tools">
              <button
                disabled={!live || !myTurn || pending}
                onClick={() => {
                  setLesson(!lesson);
                  setHint(null);
                }}
              >
                <BookOpen size={16} /> Study position
              </button>
              <button
                disabled={!canUndo || cursor !== null}
                onClick={() => {
                  if (!game) return;
                  clearTools();
                  setGame(
                    undoMoves(
                      game,
                      game.moves.at(-1)?.color === game.playerColor ? 1 : 2,
                    ),
                  );
                }}
              >
                <RotateCcw size={15} /> Take back
              </button>
            </div>
            {lesson && live && myTurn && (
              <PositionCoach
                key={fen}
                fen={fen}
                settings={settings}
                onArrow={(from, to) => setHint({ from, to })}
              />
            )}
          </>
        )}
        <RatingLegend />
      </div>
    </section>
  );
}
