import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Cpu,
  Flag,
  Handshake,
  Play,
  Shuffle,
  Users,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bots, timeControls, type GameSession } from "../lib/game";
import {
  botBands,
  botBand,
  defaultBot,
  matchingBots,
  recommendedBot,
} from "../lib/bots";

export function NewGamePanel({
  onStart,
  onWifi,
  initialBot = "scout",
  initialTimeIndex = 3,
  playerRating = 800,
}: {
  onStart: (settings: {
    mode: "bot" | "local";
    botId: string;
    color: "w" | "b" | "random";
    time: { base: number; increment: number };
  }) => void;
  onWifi: () => void;
  initialBot?: string;
  initialTimeIndex?: number;
  playerRating?: number;
}) {
  const [mode, setMode] = useState<"bot" | "local">("bot");
  const initialOpponent =
    bots.find((bot) => bot.id === initialBot) || defaultBot;
  const [botId, setBotId] = useState(initialOpponent.id);
  const [band, setBand] = useState<string>(() => botBand(initialOpponent));
  const [query, setQuery] = useState("");
  const [timeIndex, setTimeIndex] = useState(initialTimeIndex);
  const [color, setColor] = useState<"w" | "b" | "random">("w");
  const bot = bots.find((b) => b.id === botId) || defaultBot;
  const visibleBots = matchingBots(band, query);
  const suggested = recommendedBot(playerRating);
  return (
    <section className="card new-game-card">
      <div className="panel-heading">
        <h2>Set up a game</h2>
        <span className="live-pill">
          <span /> Local play
        </span>
      </div>
      <p className="panel-intro">Pick an opponent, a clock, and your side.</p>
      <div className="segmented mode-tabs">
        <button
          className={mode === "bot" ? "active" : ""}
          aria-pressed={mode === "bot"}
          onClick={() => setMode("bot")}
        >
          <Cpu size={16} /> Play a bot
        </button>
        <button
          className={mode === "local" ? "active" : ""}
          aria-pressed={mode === "local"}
          onClick={() => setMode("local")}
        >
          <Users size={16} /> Pass & play
        </button>
      </div>
      {mode === "bot" ? (
        <>
          <div className="field-label">
            YOUR OPPONENT <span>{bots.length} local bots · ≈ 100–3000</span>
          </div>
          <div className="bot-filters">
            <label>
              <span>Strength</span>
              <select
                aria-label="Bot strength group"
                value={band}
                onChange={(event) => {
                  setBand(event.target.value);
                  setQuery("");
                }}
              >
                {botBands.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label} · {group.min}–{group.max}
                  </option>
                ))}
                <option value="all">All 30 bots</option>
              </select>
            </label>
            <label>
              <span>Find an opponent</span>
              <input
                type="search"
                aria-label="Search bots by name or Elo"
                placeholder="Name or Elo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={80}
              />
            </label>
          </div>
          <div className="bot-match-row">
            <span role="status">
              {visibleBots.length}{" "}
              {visibleBots.length === 1 ? "opponent" : "opponents"}
              {query.trim() ? " found across all levels" : " in this group"}
            </span>
            <button
              className="text-button"
              type="button"
              title={`Choose ${suggested.name}, approximately ${suggested.elo} Elo`}
              onClick={() => {
                setBotId(suggested.id);
                setBand(botBand(suggested));
                setQuery("");
              }}
            >
              Match my Elo
            </button>
          </div>
          <div className="bot-picker bot-roster" aria-label="Choose a bot">
            {visibleBots.map((b) => (
              <button
                key={b.id}
                data-bot-choice={b.id}
                className={`bot-choice ${botId === b.id ? "selected" : ""}`}
                onClick={() => setBotId(b.id)}
                aria-label={`${b.name}, approximately ${b.elo} Elo, ${b.rating}`}
                aria-pressed={botId === b.id}
              >
                <span
                  className="bot-avatar"
                  aria-hidden="true"
                  data-bot={b.id}
                  style={{ backgroundColor: b.color }}
                >
                  {b.name.slice(0, 2).toUpperCase()}
                </span>
                <strong>{b.name}</strong>
                <small>≈ {b.elo}</small>
                {botId === b.id && (
                  <span className="bot-check">
                    <Check size={10} />
                  </span>
                )}
              </button>
            ))}
          </div>
          {visibleBots.length === 0 && (
            <div className="bot-empty">
              <p>
                No opponent matches “{query}”. Try a name or rating such as
                1500.
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setQuery("");
                  setBand("all");
                }}
              >
                Show all bots
              </button>
            </div>
          )}
          <div className="bot-description" aria-live="polite">
            <div
              className="bot-avatar"
              aria-hidden="true"
              data-bot={bot.id}
              style={{ backgroundColor: bot.color }}
            >
              {bot.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <strong>
                {bot.name}{" "}
                <span>
                  · ≈ {bot.elo} Elo · {bot.rating}
                </span>
              </strong>
              <span className="bot-focus">Practice: {bot.focus}</span>
              <p>{bot.description}</p>
            </div>
          </div>
          <p className="elo-explainer">
            <strong>Practice estimates, not official ratings.</strong> Strength
            varies with your device and engine. Finish a normal game without
            hints or takebacks to update your Local Elo.
          </p>
        </>
      ) : (
        <div className="local-description">
          <div className="large-icon">
            <Users size={26} />
          </div>
          <h3>Two players. One board.</h3>
          <p>
            Take turns on this screen. Choose the clock below, or play untimed.
          </p>
        </div>
      )}
      <div className="field-label">
        TIME CONTROL{" "}
        <CircleHelp
          size={13}
          aria-label="Minutes per side; plus indicates seconds added after each move"
        />
      </div>
      <div className="time-picker">
        {timeControls.map((t, i) => (
          <button
            key={i}
            className={timeIndex === i ? "selected" : ""}
            aria-pressed={timeIndex === i}
            onClick={() => setTimeIndex(i)}
          >
            <strong>{t.label}</strong>
            <span>{t.kind}</span>
          </button>
        ))}
      </div>
      <div className="color-row">
        <span>Play as</span>
        <div className="color-picker">
          <button
            aria-label="Play white"
            aria-pressed={color === "w"}
            className={color === "w" ? "selected" : ""}
            onClick={() => setColor("w")}
          >
            <img src="./pieces/wK.svg" alt="" />
          </button>
          <button
            aria-label="Random color"
            aria-pressed={color === "random"}
            className={color === "random" ? "selected" : ""}
            onClick={() => setColor("random")}
          >
            <Shuffle size={18} />
          </button>
          <button
            aria-label="Play black"
            aria-pressed={color === "b"}
            className={color === "b" ? "selected" : ""}
            onClick={() => setColor("b")}
          >
            <img src="./pieces/bK.svg" alt="" />
          </button>
        </div>
      </div>
      <button
        className="button primary start-game full"
        onClick={() =>
          onStart({
            mode,
            botId,
            color,
            time: {
              base: timeControls[timeIndex].base,
              increment: timeControls[timeIndex].increment,
            },
          })
        }
      >
        <Play size={17} fill="currentColor" />{" "}
        {mode === "bot" ? `Play with ${bot.name}` : "Start local game"}
        <ArrowRight size={18} />
      </button>
      <button className="wifi-link" onClick={onWifi}>
        <Wifi size={15} /> Play a friend on the same Wi-Fi{" "}
        <ArrowRight size={14} />
      </button>
    </section>
  );
}
function fullMoveNumber(game: GameSession, ply: number) {
  const recorded = Number.parseInt(
    game.moves[ply]?.before?.split(" ")[5] || "",
    10,
  );
  if (Number.isFinite(recorded) && recorded > 0) return recorded;
  const start = Number.parseInt(game.startFen.split(" ")[5] || "1", 10) || 1;
  return (
    start +
    Math.floor((ply + (game.startFen.split(" ")[1] === "b" ? 1 : 0)) / 2)
  );
}
export function MoveList({
  game,
  index,
  onSelect,
  children,
}: {
  game: GameSession;
  index: number;
  onSelect: (n: number) => void;
  children?: React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const result: { number: number; w?: number; b?: number }[] = [];
    game.moves.forEach((move, ply) => {
      const number = fullMoveNumber(game, ply);
      let row = result.at(-1);
      if (!row || row.number !== number || row[move.color] !== undefined) {
        row = { number };
        result.push(row);
      }
      row[move.color] = ply;
    });
    return result;
  }, [game.moves, game.startFen]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (index < 0) {
      list.scrollTop = 0;
      return;
    }
    const selected = list.querySelector<HTMLButtonElement>(
      `button[data-ply="${index}"]`,
    );
    const row = selected?.closest(".move-pair") as HTMLElement | null;
    if (!row) return;
    const viewport = list.getBoundingClientRect(),
      bounds = row.getBoundingClientRect();
    // Scroll only this list, so replaying moves never pulls the board out of view.
    if (bounds.top < viewport.top) list.scrollTop -= viewport.top - bounds.top;
    else if (bounds.bottom > viewport.bottom)
      list.scrollTop += bounds.bottom - viewport.bottom;
  }, [index, game.moves.length, game.id]);
  const selectedMove = game.moves[index];
  return (
    <section className="card moves-card">
      <div className="panel-heading">
        <h2>Move history</h2>
        <span className="muted">{game.moves.length} plies</span>
      </div>
      <div
        ref={listRef}
        className="move-list"
        role={rows.length ? "list" : undefined}
        aria-label={rows.length ? "Move history" : undefined}
      >
        {rows.length ? (
          rows.map((row, rowIndex) => (
            <div
              className="move-pair"
              key={`${row.number}-${rowIndex}`}
              role="listitem"
              aria-label={`Move ${row.number}`}
            >
              <span>
                {row.number}
                {row.w === undefined ? "..." : "."}
              </span>
              {(["w", "b"] as const).map((color) => {
                const ply = row[color];
                if (ply === undefined)
                  return (
                    <span
                      key={color}
                      className="move-placeholder"
                      aria-hidden="true"
                    >
                      —
                    </span>
                  );
                const move = game.moves[ply];
                return (
                  <button
                    key={color}
                    data-ply={ply}
                    className={ply === index ? "selected" : ""}
                    aria-current={ply === index ? "step" : undefined}
                    aria-label={`Move ${row.number}, ${color === "w" ? "White" : "Black"}: ${move.san}`}
                    onClick={() => onSelect(ply)}
                  >
                    {move.san}
                  </button>
                );
              })}
            </div>
          ))
        ) : (
          <div className="moves-empty">
            <img src="./pieces/wN.svg" alt="" />
            <p>No moves yet.</p>
            <small>Moves will appear here as you play.</small>
          </div>
        )}
      </div>
      <div className="replay-controls">
        <button
          className="icon-button"
          aria-label="First position"
          onClick={() => onSelect(-1)}
          disabled={index < 0}
        >
          <ChevronsLeft size={19} />
        </button>
        <button
          className="icon-button"
          aria-label="Previous move"
          onClick={() => onSelect(Math.max(-1, index - 1))}
          disabled={index < 0}
        >
          <ChevronLeft size={19} />
        </button>
        <span>
          {index < 0 || !selectedMove
            ? "Starting position"
            : `Move ${fullMoveNumber(game, index)} · ${selectedMove.color === "b" ? "Black" : "White"}`}
        </span>
        <button
          className="icon-button"
          aria-label="Next move"
          onClick={() => onSelect(Math.min(game.moves.length - 1, index + 1))}
          disabled={index >= game.moves.length - 1}
        >
          <ChevronRight size={19} />
        </button>
        <button
          className="icon-button"
          aria-label="Latest position"
          onClick={() => onSelect(game.moves.length - 1)}
          disabled={index >= game.moves.length - 1}
        >
          <ChevronsRight size={19} />
        </button>
      </div>
      {children}
    </section>
  );
}
export function GameActions({
  onResign,
  onDraw,
  onNew,
  allowDraw = true,
}: {
  onResign: () => void;
  onDraw: () => void;
  onNew: () => void;
  allowDraw?: boolean;
}) {
  return (
    <div className="game-actions">
      <button onClick={onNew}>
        <Play size={15} /> New game
      </button>
      {allowDraw && (
        <button onClick={onDraw}>
          <Handshake size={15} /> Draw
        </button>
      )}
      <button onClick={onResign}>
        <Flag size={15} /> Resign
      </button>
    </div>
  );
}
