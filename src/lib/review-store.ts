import type { GameSession } from "./game";
import {
  moveClassifications,
  summarizeReview,
  type MoveReview,
} from "./review";
import { readStore, writeStore } from "./storage";

export const REVIEW_SUMMARIES_KEY = "review-summaries-v1";
const DETAILS_KEY = "review-details-v1";
const MAX_DETAILS_BYTES = 1_500_000;
export interface SavedReviewSummary {
  version: 1;
  gameId: string;
  line: string;
  reviewedAt: number;
  plies: number;
  depth: number;
  white: number | null;
  black: number | null;
  limited: boolean;
}
export interface SavedReview {
  summary: SavedReviewSummary;
  list: MoveReview[];
}
/** Exact move sequence, not just ply count: edited or continued games need a new review. */
export function reviewLine(game: Pick<GameSession, "startFen" | "moves">) {
  return JSON.stringify([
    game.startFen,
    game.moves.map((m) => m.from + m.to + (m.promotion || "")),
  ]);
}
const percent = (value: unknown) =>
  value === null ||
  (typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100);
function validSummary(value: unknown): value is SavedReviewSummary {
  const s = value as SavedReviewSummary;
  return (
    !!s &&
    s.version === 1 &&
    typeof s.gameId === "string" &&
    s.gameId.length <= 128 &&
    typeof s.line === "string" &&
    s.line.length <= 12000 &&
    Number.isSafeInteger(s.plies) &&
    s.plies > 0 &&
    s.plies <= 1000 &&
    Number.isFinite(s.reviewedAt) &&
    s.reviewedAt > 0 &&
    Number.isInteger(s.depth) &&
    s.depth >= 1 &&
    s.depth <= 30 &&
    percent(s.white) &&
    percent(s.black) &&
    typeof s.limited === "boolean"
  );
}
export function readReviewSummaries(): SavedReviewSummary[] {
  const raw = readStore<unknown>(REVIEW_SUMMARIES_KEY, []);
  return Array.isArray(raw) ? raw.slice(0, 200).filter(validSummary) : [];
}
export function summaryForGame(
  game: GameSession,
  summaries = readReviewSummaries(),
) {
  const line = reviewLine(game);
  return (
    summaries.find(
      (s) =>
        s.gameId === game.id &&
        s.plies === game.moves.length &&
        s.line === line,
    ) || null
  );
}
const uci = (value: unknown) =>
  typeof value === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value);
function validList(list: unknown, game: GameSession): list is MoveReview[] {
  if (!Array.isArray(list) || list.length !== game.moves.length || !list.length)
    return false;
  return list.every((m: MoveReview, i) => {
    const move = game.moves[i];
    const evaluation = (e: MoveReview["before"]) =>
      e &&
      Number.isFinite(e.score) &&
      Number.isFinite(e.depth) &&
      e.depth >= 0 &&
      typeof e.engine === "string" &&
      e.engine.length <= 120 &&
      (e.mate === undefined || Number.isFinite(e.mate));
    return (
      m &&
      m.index === i &&
      m.color === move.color &&
      m.played === move.from + move.to + (move.promotion || "") &&
      moveClassifications.includes(m.label) &&
      Number.isFinite(m.score) &&
      Number.isFinite(m.loss) &&
      m.loss >= 0 &&
      (m.mate === undefined || Number.isFinite(m.mate)) &&
      ["limited", "standard", "strong"].includes(m.confidence) &&
      typeof m.forced === "boolean" &&
      typeof m.critical === "boolean" &&
      (m.best === "" || uci(m.best)) &&
      (m.note === undefined || typeof m.note === "string") &&
      (m.opening === undefined || typeof m.opening === "string") &&
      typeof m.playedSAN === "string" &&
      typeof m.bestSAN === "string" &&
      typeof m.reason === "string" &&
      m.reason.length <= 3000 &&
      Array.isArray(m.pv) &&
      m.pv.length <= 16 &&
      m.pv.every(uci) &&
      Array.isArray(m.pvSAN) &&
      m.pvSAN.length === m.pv.length &&
      m.pvSAN.every((s) => typeof s === "string" && s.length <= 20) &&
      evaluation(m.before) &&
      evaluation(m.after)
    );
  });
}
export function readSavedReview(game: GameSession): SavedReview | null {
  const data = readStore<unknown>(DETAILS_KEY, []);
  if (!Array.isArray(data)) return null;
  const line = reviewLine(game);
  const found = data
    .slice(0, 12)
    .find(
      (item: SavedReview) =>
        item &&
        validSummary(item.summary) &&
        item.summary.gameId === game.id &&
        item.summary.line === line &&
        item.summary.plies === game.moves.length,
    );
  return found && validList(found.list, game) ? found : null;
}
export function storeReview(
  game: GameSession,
  list: MoveReview[],
  depth: number,
) {
  if (
    !validList(list, game) ||
    !Number.isInteger(depth) ||
    depth < 1 ||
    depth > 30
  )
    return { summarySaved: false, detailsSaved: false };
  const review = summarizeReview(list);
  const summary: SavedReviewSummary = {
    version: 1,
    gameId: game.id,
    line: reviewLine(game),
    reviewedAt: Date.now(),
    plies: list.length,
    depth,
    white: review.w.quality,
    black: review.b.quality,
    limited: list.some((item) => item.confidence === "limited"),
  };
  const summarySaved = writeStore(
    REVIEW_SUMMARIES_KEY,
    [
      summary,
      ...readReviewSummaries().filter((s) => s.gameId !== game.id),
    ].slice(0, 200),
  );
  const existing = readStore<unknown>(DETAILS_KEY, []);
  const candidates = [
    { summary, list },
    ...(Array.isArray(existing)
      ? existing
          .filter(
            (item) =>
              item &&
              validSummary(item.summary) &&
              item.summary.gameId !== game.id,
          )
          .slice(0, 11)
      : []),
  ];
  while (
    candidates.length > 1 &&
    JSON.stringify(candidates).length > MAX_DETAILS_BYTES
  )
    candidates.pop();
  const detailsSaved =
    JSON.stringify(candidates).length <= MAX_DETAILS_BYTES &&
    writeStore(DETAILS_KEY, candidates);
  if (typeof window !== "undefined")
    window.dispatchEvent(new window.Event("knightfall:reviews-changed"));
  return { summarySaved, detailsSaved };
}
export function removeStoredReview(gameId: string) {
  writeStore(
    REVIEW_SUMMARIES_KEY,
    readReviewSummaries().filter((s) => s.gameId !== gameId),
  );
  const details = readStore<unknown>(DETAILS_KEY, []);
  if (Array.isArray(details))
    writeStore(
      DETAILS_KEY,
      details.filter((item) => item?.summary?.gameId !== gameId),
    );
}
