import { resolveBot } from "../lib/bots";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Play,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { bots, type GameSession } from "../lib/game";
import { readReviewSummaries, summaryForGame } from "../lib/review-store";

export default function ReviewLibrary({
  games,
  onReview,
  onResume,
  onImport,
  onExport,
  onDelete,
  onPlay,
}: {
  games: GameSession[];
  onReview: (game: GameSession) => void;
  onResume: (game: GameSession) => void;
  onImport: () => void;
  onExport: (game: GameSession) => void;
  onDelete: (game: GameSession) => void;
  onPlay: () => void;
}) {
  const [summaries, setSummaries] = useState(readReviewSummaries);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const refresh = () => setSummaries(readReviewSummaries());
    window.addEventListener("storage", refresh);
    window.addEventListener("knightfall:reviews-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("knightfall:reviews-changed", refresh);
    };
  }, []);
  useEffect(() => setPage(0), [query, filter, sort]);
  const rows = useMemo(
    () =>
      games.map((game) => {
        const opponent =
          resolveBot(game.botId, game.customBotElo).name;
        return {
          game,
          summary: summaryForGame(game, summaries),
          white:
            game.whiteName ||
            (game.playerColor === "w"
              ? "You"
              : game.mode === "bot"
                ? opponent
                : "White"),
          black:
            game.blackName ||
            (game.playerColor === "b"
              ? "You"
              : game.mode === "bot"
                ? opponent
                : "Black"),
        };
      }),
    [games, summaries],
  );
  const reviewed = rows.filter((row) => row.summary);
  const ownAccuracy = reviewed.flatMap((row) => {
    const value =
      row.game.playerColor === "w" ? row.summary!.white : row.summary!.black;
    return value === null ? [] : [value];
  });
  const filtered = rows.filter(
    (row) =>
      `${row.game.title} ${row.white} ${row.black}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (filter === "all" ||
        (filter === "reviewed"
          ? !!row.summary
          : filter === "unreviewed"
            ? !row.summary
            : !!row.game.result)),
  );
  filtered.sort((a, b) =>
    sort === "accuracy"
      ? ((b.game.playerColor === "w" ? b.summary?.white : b.summary?.black) ??
          -1) -
        ((a.game.playerColor === "w" ? a.summary?.white : a.summary?.black) ??
          -1)
      : sort === "oldest"
        ? a.game.createdAt - b.game.createdAt
        : b.game.createdAt - a.game.createdAt,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    activePage = Math.min(page, pages - 1);
  return (
    <div className="review-library">
      <section className="review-hero card">
        <div className="review-hero-icon">
          <Activity size={30} />
        </div>
        <div>
          <span className="section-kicker">YOUR CHESS, EXPLAINED</span>
          <h2>Every game has something to teach you.</h2>
          <p>
            Find the turning points. Learn from the misses. Bring one good idea
            to your next game.
          </p>
        </div>
        <button className="button primary" onClick={onImport}>
          <Upload size={16} /> Import PGN
        </button>
      </section>
      <div className="review-stat-grid">
        <article className="card">
          <span>Games saved</span>
          <strong>{games.length}</strong>
          <small>On this device</small>
        </article>
        <article className="card">
          <span>Games reviewed</span>
          <strong>
            {reviewed.length}
            <small> / {games.length}</small>
          </strong>
          <small>Local engine analysis</small>
        </article>
        <article className="card">
          <span>Your average accuracy</span>
          <strong>
            {ownAccuracy.length
              ? `${Math.round(ownAccuracy.reduce((a, b) => a + b, 0) / ownAccuracy.length)}%`
              : "—"}
          </strong>
          <small>
            {ownAccuracy.length
              ? `${ownAccuracy.length} reviewed games with a score`
              : "Review a game to see your score"}
          </small>
        </article>
      </div>
      <section className="card review-archive">
        <div className="review-library-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search games"
              placeholder="Search games or players"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filter games</span>
            <select
              aria-label="Filter games"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All games</option>
              <option value="reviewed">Reviewed</option>
              <option value="unreviewed">Not reviewed</option>
              <option value="finished">Finished</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Sort games</span>
            <select
              aria-label="Sort games"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="accuracy">Highest accuracy</option>
            </select>
          </label>
        </div>
        <div className="review-table-scroll">
          <table className="review-games-table">
            <caption>All saved games and local analysis accuracy</caption>
            <thead>
              <tr>
                <th>Players / game</th>
                <th>Result</th>
                <th>
                  Accuracy <small>White · Black</small>
                </th>
                <th>Moves / played</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(activePage * 20, activePage * 20 + 20)
                .map(({ game, summary, white, black }) => (
                  <tr key={game.id} data-review-game={game.id}>
                    <td>
                      <button
                        className="review-player-link"
                        onClick={() => onReview(game)}
                      >
                        <span>
                          <i className="piece-dot white" />
                          {white}
                        </span>
                        <span>
                          <i className="piece-dot black" />
                          {black}
                        </span>
                        <small>{game.title}</small>
                      </button>
                    </td>
                    <td>
                      <span
                        className={`result-badge ${game.result?.winner === game.playerColor ? "win" : ""}`}
                      >
                        {!game.result
                          ? "In progress"
                          : game.result.winner === null
                            ? "½–½"
                            : game.result.winner === "w"
                              ? "1–0"
                              : "0–1"}
                      </span>
                      <small className="review-result-detail">
                        {game.result?.reason ||
                          (game.mode === "analysis"
                            ? "Imported / study"
                            : "Unfinished")}
                      </small>
                    </td>
                    <td>
                      {summary ? (
                        <>
                          <div
                            className="accuracy-pair"
                            aria-label={`White accuracy ${summary.white === null ? "not available" : Math.round(summary.white) + " percent"}, Black accuracy ${summary.black === null ? "not available" : Math.round(summary.black) + " percent"}`}
                          >
                            <span className="accuracy-white">
                              {summary.white === null
                                ? "—"
                                : `${Math.round(summary.white)}%`}
                            </span>
                            <span className="accuracy-black">
                              {summary.black === null
                                ? "—"
                                : `${Math.round(summary.black)}%`}
                            </span>
                          </div>
                          <small className="review-result-detail">
                            {summary.limited
                              ? "Limited-depth review"
                              : "Reviewed"}{" "}
                            {summary.limited ? null : (
                              <CheckCircle2 size={11} />
                            )}
                          </small>
                        </>
                      ) : (
                        <span className="not-reviewed">Not reviewed</span>
                      )}
                    </td>
                    <td>
                      <strong>{Math.ceil(game.moves.length / 2)} moves</strong>
                      <small className="review-result-detail">
                        {new Date(game.createdAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </small>
                    </td>
                    <td>
                      <div className="review-row-actions">
                        <button
                          className="button secondary"
                          disabled={!game.moves.length}
                          onClick={() => onReview(game)}
                        >
                          {summary ? "Open review" : "Review"}
                          <ArrowRight size={14} />
                        </button>
                        <div className="row-actions">
                          {!game.result &&
                            ["bot", "local"].includes(game.mode) && (
                              <button
                                className="icon-button"
                                aria-label={`Resume ${game.title}`}
                                onClick={() => onResume(game)}
                              >
                                <Play size={15} />
                              </button>
                            )}
                          <button
                            className="icon-button"
                            aria-label={`Export ${game.title}`}
                            onClick={() => onExport(game)}
                          >
                            <Download size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Delete ${game.title}`}
                            onClick={() => onDelete(game)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-library">
            <Activity size={38} />
            <h3>
              {games.length
                ? "No games match these filters."
                : "Your next game belongs here."}
            </h3>
            <p>
              {games.length
                ? "Try another player name or show all games."
                : "Games save automatically as you play. Import a PGN to review a game from elsewhere."}
            </p>
            <button
              className="button primary"
              onClick={
                games.length
                  ? () => {
                      setQuery("");
                      setFilter("all");
                    }
                  : onPlay
              }
            >
              {games.length ? "Show all games" : "Play a game"}
            </button>
          </div>
        )}
        <div className="review-pagination">
          <span>
            {filtered.length} games · Page {activePage + 1} of {pages}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous games page"
              disabled={activePage === 0}
              onClick={() => setPage(activePage - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Next games page"
              disabled={activePage >= pages - 1}
              onClick={() => setPage(activePage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <p className="review-library-note">
        Accuracy is Knightfall’s local move-quality estimate, not Chess.com’s
        proprietary score. Book and forced moves are excluded; “—” means there
        are not enough evaluated decisions. A changed game needs a fresh review.
        Your games and scores stay on this device.
      </p>
    </div>
  );
}
