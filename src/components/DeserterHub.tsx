import { useEffect, useRef, useState } from "react";
import { Compass, Play, Shuffle } from "lucide-react";
import { LocalEngine } from "../lib/engine";
import { findDeserterPosition, type DeserterPosition } from "../lib/deserter";
import { savedGames, type Settings } from "../lib/storage";
import ChessBoard from "./ChessBoard";

export default function DeserterHub({
  settings,
  onStart,
}: {
  settings: Settings;
  onStart: (position: DeserterPosition, elo: number) => void;
}) {
  const [position, setPosition] = useState<DeserterPosition | null>(null),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [error, setError] = useState(""),
    [elo, setElo] = useState(1200);
  const request = useRef<AbortController | null>(null),
    engine = useRef<LocalEngine | null>(null),
    seen = useRef<string[]>([]);
  const games = savedGames().filter(
      (g) => g.practiceKind === "deserter" && g.result,
    ),
    wins = games.filter((g) => g.result!.winner === g.playerColor).length;
  useEffect(
    () => () => {
      request.current?.abort();
      engine.current?.destroy();
    },
    [],
  );
  async function shuffle() {
    request.current?.abort();
    engine.current?.destroy();
    const controller = new AbortController(),
      local = new LocalEngine({
        mode: settings.engineMode,
        threads: settings.engineThreads,
      });
    request.current = controller;
    engine.current = local;
    setBusy(true);
    setError("");
    setAttempt(1);
    try {
      const next = await findDeserterPosition(local, {
        signal: controller.signal,
        onAttempt: setAttempt,
        exclude: seen.current,
      });
      if (controller.signal.aborted) return;
      seen.current = [
        ...seen.current,
        next.fen.split(" ").slice(0, 4).join(" "),
      ].slice(-20);
      setPosition(next);
    } catch (error) {
      if (!controller.signal.aborted)
        setError("Could not prepare a position. Shuffle again.");
    } finally {
      local.destroy();
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="deserter-hub">
      <section className="card deserter-intro">
        <span className="section-kicker">
          <Compass size={16} /> DESERTER PRACTICE
        </span>
        <h2>No opening book. Just you and the position.</h2>
        <p>
          Drop into a random, legal position with a winning chance. Take over
          the advantaged side and finish the game against a local bot. There is
          no single scripted solution.
        </p>
        <div className="deserter-record">
          <strong>{wins}</strong> wins{" "}
          <span> / {games.length} completed missions saved</span>
        </div>
      </section>
      <div className="deserter-layout">
        <section className="deserter-preview">
          {position ? (
            <ChessBoard
              fen={position.fen}
              orientation={position.color}
              disabled
              theme={settings.boardTheme}
            />
          ) : (
            <div className="card deserter-empty">
              <Compass size={58} />
              <h3>Where will you land?</h3>
              <p>
                Shuffle to generate a position from legal play. Stockfish looks
                for a winning edge; a randomized queen endgame is available if
                that search cannot finish.
              </p>
            </div>
          )}
        </section>
        <section className="card deserter-controls">
          <h3>Your mission</h3>
          <p>
            {position
              ? `Play ${position.color === "w" ? "White" : "Black"}. Turn the advantage into checkmate.`
              : "Win from an unfamiliar position. Plan first, then make your move."}
          </p>
          {position && (
            <span className="soft-badge">
              {position.checked
                ? "Stockfish-checked advantage"
                : "Random queen endgame"}
            </span>
          )}
          <label className="range-setting">
            Defender strength <strong>≈ {elo} Elo</strong>
            <input
              aria-label="Deserter bot Elo"
              type="range"
              min="100"
              max="3000"
              step="50"
              value={elo}
              onChange={(event) => setElo(Number(event.target.value))}
            />
          </label>
          <p className="fine-print">
            Estimated practice strength. These untimed games do not change Local
            Elo. A winning evaluation is an opportunity, not a guaranteed
            result.
          </p>
          <button
            className="button secondary full"
            onClick={() => void shuffle()}
            disabled={busy}
          >
            <Shuffle size={17} />
            {busy ? `Finding a position · ${attempt}/10` : "Shuffle position"}
          </button>
          {busy && (
            <button
              className="text-button"
              onClick={() => {
                request.current?.abort();
                engine.current?.destroy();
                setBusy(false);
              }}
            >
              Cancel search
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="button primary full"
            disabled={!position || busy}
            onClick={() => position && onStart(position, elo)}
          >
            <Play size={17} />
            Drop in & play
          </button>
          <ol>
            <li>Check the kings and loose pieces.</li>
            <li>Find your advantage: material, activity or an attack.</li>
            <li>Convert it. The defender will choose its own replies.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
