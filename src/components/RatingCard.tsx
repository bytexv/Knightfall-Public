import { TrendingUp } from "lucide-react";
import { bots } from "../lib/game";
import { PROVISIONAL_RATED_GAMES, type RatingLedger } from "../lib/ratings";

export default function RatingCard({ ledger }: { ledger: RatingLedger }) {
  const recent = ledger.history.slice(-12);
  const points = [
    recent[0]?.before ?? ledger.rating,
    ...recent.map((entry) => entry.after),
  ];
  const low = Math.min(...points) - 35,
    high = Math.max(...points) + 35;
  const path = points
    .map(
      (value, i) =>
        `${i ? "L" : "M"}${points.length > 1 ? (i * 280) / (points.length - 1) : 0},${65 - ((value - low) / (high - low)) * 58}`,
    )
    .join(" ");
  const last = ledger.history[ledger.history.length - 1];
  return (
    <section className="card rating-card" aria-label="Your local Elo">
      <div className="rating-card-heading">
        <span>YOUR CHESS, IN NUMBERS</span>
        <TrendingUp size={18} />
      </div>
      <div className="rating-value">
        <strong>{ledger.rating}</strong>
        <div>
          <b>Local Elo</b>
          <span>
            {ledger.provisional ? "Provisional estimate" : "Practice rating"}
          </span>
        </div>
        {last && (
          <em className={last.delta >= 0 ? "rating-up" : "rating-down"}>
            {last.delta >= 0 ? "+" : ""}
            {last.delta}
          </em>
        )}
      </div>
      {points.length > 1 ? (
        <svg
          className="rating-chart"
          viewBox="0 0 280 72"
          role="img"
          aria-label={`Recent rating trend from ${points[0]} to ${ledger.rating}`}
        >
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <p className="rating-first-game">
          Your first rated bot game starts the graph.
        </p>
      )}
      <div className="rating-stats">
        <span>
          <b>{ledger.wins}</b>Wins
        </span>
        <span>
          <b>{ledger.draws}</b>Draws
        </span>
        <span>
          <b>{ledger.losses}</b>Losses
        </span>
      </div>
      {ledger.provisional && (
        <div className="rating-placement">
          <div>
            <span
              style={{
                width: `${Math.min(100, (ledger.totalRatedGames / PROVISIONAL_RATED_GAMES) * 100)}%`,
              }}
            />
          </div>
          <small>
            {ledger.totalRatedGames} / {PROVISIONAL_RATED_GAMES} placement games
          </small>
        </div>
      )}
      <details className="rating-explainer">
        <summary>How this rating works</summary>
        <p>
          An estimate from completed games against the local bots. Their Elo
          labels are approximate. This is separate from Chess.com, FIDE, and
          online ratings.
        </p>
        <p>
          Start a normal bot game and finish without hints, takebacks, or live
          analysis. Custom positions and the lightweight fallback engine are
          practice only.
        </p>
      </details>
      {last && (
        <div className="rating-last-game">
          <span>
            Last game ·{" "}
            {bots.find((bot) => bot.id === last.botId)?.name || "Bot"}
          </span>
          <strong>
            {last.before} → {last.after}
          </strong>
        </div>
      )}
    </section>
  );
}
