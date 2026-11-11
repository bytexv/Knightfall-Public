import type { Color } from "chess.js";
import {
  bots,
  resultFor,
  restoreChess,
  START_FEN,
  type GameSession,
} from "./game";
import { timeoutResult } from "./clock";

/** A device-local practice estimate, not an official or externally calibrated rating. */
export const INITIAL_PRACTICE_RATING = 800;
export const PROVISIONAL_RATED_GAMES = 20;
export const MAX_RATING_HISTORY = 5000;
export const MAX_RATING_PENDING = 32;
const MIN_RATING = 100;
const MAX_RATING = 3200;
const MAX_TIMESTAMP = 4_102_444_800_000;

export type RatingAssistance = "hint" | "takeback" | "analysis" | "fallback";
export interface RatingEnrollment {
  gameId: string;
  ticket: string;
  botId: string;
  opponentRating: number;
  playerColor: Color;
  createdAt: number;
}
export interface GameRatingMetadata extends RatingEnrollment {
  version: 1;
  assistance: RatingAssistance[];
  engine: "pending" | "stockfish" | "fallback";
}
export interface RatingEntry {
  gameId: string;
  botId: string;
  opponentRating: number;
  playerColor: Color;
  score: 0 | 0.5 | 1;
  before: number;
  after: number;
  delta: number;
  kFactor: 20 | 40;
  createdAt: number;
  finishedAt: number;
  reason: string;
}
export interface RatingLedger {
  version: 1;
  rating: number;
  totalRatedGames: number;
  wins: number;
  draws: number;
  losses: number;
  provisional: boolean;
  /** Oldest first. IDs are retained for deduplication, including games no longer in the archive. */
  history: RatingEntry[];
  pending: RatingEnrollment[];
}
export type RatingRecordReason =
  | "recorded"
  | "already-recorded"
  | "unrated"
  | "missing-enrollment"
  | "assisted"
  | "fallback"
  | "engine-unverified"
  | "unfinished"
  | "invalid-game"
  | "ledger-full";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 128 &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value);
const validTimestamp = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_TIMESTAMP;
const assistances = new Set<RatingAssistance>([
  "hint",
  "takeback",
  "analysis",
  "fallback",
]);
const drawReasons = new Set([
  "Stalemate",
  "Threefold repetition",
  "Insufficient material",
  "Fifty-move rule",
  "Time expired · insufficient mating material",
]);
const botRating = (id: unknown) => bots.find((bot) => bot.id === id)?.elo;

export function emptyRatingLedger(): RatingLedger {
  return {
    version: 1,
    rating: INITIAL_PRACTICE_RATING,
    totalRatedGames: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    provisional: true,
    history: [],
    pending: [],
  };
}

function sanitizeEnrollment(value: unknown): RatingEnrollment | null {
  if (
    !isRecord(value) ||
    !validId(value.gameId) ||
    !validId(value.ticket) ||
    typeof value.botId !== "string" ||
    !botRating(value.botId) ||
    value.opponentRating !== botRating(value.botId) ||
    (value.playerColor !== "w" && value.playerColor !== "b") ||
    !validTimestamp(value.createdAt)
  )
    return null;
  return {
    gameId: value.gameId,
    ticket: value.ticket,
    botId: value.botId,
    opponentRating: value.opponentRating as number,
    playerColor: value.playerColor,
    createdAt: value.createdAt,
  };
}

/** Invalid eligibility is discarded rather than repaired into an eligible game. */
export function sanitizeGameRating(
  value: unknown,
  game?: Pick<
    GameSession,
    "id" | "botId" | "playerColor" | "createdAt" | "startFen"
  >,
): GameRatingMetadata | undefined {
  const enrollment = sanitizeEnrollment(value);
  if (
    !enrollment ||
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.assistance) ||
    value.assistance.length > assistances.size ||
    value.assistance.some(
      (reason) => !assistances.has(reason as RatingAssistance),
    ) ||
    !["pending", "stockfish", "fallback"].includes(value.engine as string)
  )
    return undefined;
  if (
    game &&
    (game.id !== enrollment.gameId ||
      game.botId !== enrollment.botId ||
      game.playerColor !== enrollment.playerColor ||
      game.createdAt !== enrollment.createdAt ||
      game.startFen !== START_FEN)
  )
    return undefined;
  const assistance = [...new Set(value.assistance)] as RatingAssistance[];
  const engine = assistance.includes("fallback")
    ? "fallback"
    : (value.engine as GameRatingMetadata["engine"]);
  if (engine === "fallback" && !assistance.includes("fallback"))
    assistance.push("fallback");
  return { version: 1, ...enrollment, assistance, engine };
}

type EntrySource = Omit<RatingEntry, "before" | "after" | "delta" | "kFactor">;
function sanitizeEntry(value: unknown): EntrySource | null {
  if (
    !isRecord(value) ||
    !validId(value.gameId) ||
    typeof value.botId !== "string" ||
    !botRating(value.botId) ||
    value.opponentRating !== botRating(value.botId) ||
    (value.playerColor !== "w" && value.playerColor !== "b") ||
    (value.score !== 0 && value.score !== 0.5 && value.score !== 1) ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.finishedAt) ||
    value.finishedAt < value.createdAt ||
    typeof value.reason !== "string" ||
    value.reason.length > 120 ||
    !value.reason.trim()
  )
    return null;
  if (
    value.reason === "Resignation"
      ? value.score !== 0
      : drawReasons.has(value.reason)
        ? value.score !== 0.5
        : value.reason === "Checkmate" || value.reason === "Time expired"
          ? value.score === 0.5
          : true
  )
    return null;
  return {
    gameId: value.gameId,
    botId: value.botId,
    opponentRating: value.opponentRating as number,
    playerColor: value.playerColor,
    score: value.score,
    createdAt: value.createdAt,
    finishedAt: value.finishedAt,
    reason: value.reason.replace(/[\u0000-\u001f\u007f]/g, " ").trim(),
  };
}

function appendEntry(ledger: RatingLedger, source: EntrySource): void {
  const before = ledger.rating;
  const kFactor = ledger.totalRatedGames < PROVISIONAL_RATED_GAMES ? 40 : 20;
  const expected = 1 / (1 + 10 ** ((source.opponentRating - before) / 400));
  const after = Math.max(
    MIN_RATING,
    Math.min(
      MAX_RATING,
      Math.round(before + kFactor * (source.score - expected)),
    ),
  );
  ledger.history.push({
    ...source,
    before,
    after,
    delta: after - before,
    kFactor,
  });
  ledger.rating = after;
  ledger.totalRatedGames += 1;
  if (source.score === 1) ledger.wins += 1;
  else if (source.score === 0.5) ledger.draws += 1;
  else ledger.losses += 1;
  ledger.provisional = ledger.totalRatedGames < PROVISIONAL_RATED_GAMES;
}

/** Derived totals and Elo deltas are always recomputed; unknown fields never become trusted state. */
export function sanitizeRatingLedger(value: unknown): RatingLedger {
  const ledger = emptyRatingLedger();
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.history) ||
    value.history.length > MAX_RATING_HISTORY
  )
    return ledger;
  const ids = new Set<string>();
  for (const item of value.history) {
    const source = sanitizeEntry(item);
    if (!source || ids.has(source.gameId)) continue;
    ids.add(source.gameId);
    appendEntry(ledger, source);
  }
  const tickets = new Set<string>();
  if (Array.isArray(value.pending)) {
    for (const item of value.pending.slice(-MAX_RATING_PENDING)) {
      const pending = sanitizeEnrollment(item);
      if (!pending || ids.has(pending.gameId) || tickets.has(pending.ticket))
        continue;
      ids.add(pending.gameId);
      tickets.add(pending.ticket);
      ledger.pending.push(pending);
    }
  }
  return ledger;
}

/** Merge backups without losing already counted IDs. Current records win any conflicting duplicate. */
export function mergeRatingLedgers(
  current: unknown,
  incoming: unknown,
): RatingLedger {
  const own = sanitizeRatingLedger(current);
  const backup = sanitizeRatingLedger(incoming);
  const ids = new Set(own.history.map((entry) => entry.gameId));
  const additional = backup.history.filter((entry) => !ids.has(entry.gameId));
  const history = [
    ...own.history,
    ...additional.slice(0, MAX_RATING_HISTORY - own.history.length),
  ];
  if (additional.length) history.sort((a, b) => a.finishedAt - b.finishedAt);
  const ownPending = new Set(own.pending.map((entry) => entry.gameId));
  const ownTickets = new Set(own.pending.map((entry) => entry.ticket));
  return sanitizeRatingLedger({
    version: 1,
    history,
    pending: [
      ...backup.pending.filter(
        (entry) =>
          !ownPending.has(entry.gameId) && !ownTickets.has(entry.ticket),
      ),
      ...own.pending,
    ],
  });
}

/** Call only when creating a new ordinary bot game, never while loading/importing an existing session. */
export function beginRatedGame(
  game: GameSession,
  source: RatingLedger,
): { game: GameSession; ledger: RatingLedger } {
  const ledger = sanitizeRatingLedger(source);
  if (
    game.mode !== "bot" ||
    game.startFen !== START_FEN ||
    game.fen !== START_FEN ||
    game.moves.length ||
    game.result ||
    !validId(game.id) ||
    !validTimestamp(game.createdAt) ||
    !botRating(game.botId) ||
    (game.playerColor !== "w" && game.playerColor !== "b") ||
    game.rating ||
    ledger.history.some((entry) => entry.gameId === game.id) ||
    ledger.pending.some((entry) => entry.gameId === game.id) ||
    ledger.history.length >= MAX_RATING_HISTORY
  )
    return { game, ledger };
  const ticket =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const enrollment: RatingEnrollment = {
    gameId: game.id,
    ticket,
    botId: game.botId,
    opponentRating: botRating(game.botId)!,
    playerColor: game.playerColor,
    createdAt: game.createdAt,
  };
  ledger.pending = [...ledger.pending, enrollment].slice(-MAX_RATING_PENDING);
  return {
    game: {
      ...game,
      rating: { version: 1, ...enrollment, assistance: [], engine: "pending" },
    },
    ledger,
  };
}

export function markRatingAssisted(
  game: GameSession,
  reason: RatingAssistance,
): GameSession {
  // Looking at a completed game is review, not help with its outcome. A takeback
  // can reopen it, and a fallback reply can itself be the final move.
  if (game.result && (reason === "analysis" || reason === "hint")) return game;
  const rating = sanitizeGameRating(game.rating, game);
  if (!rating || !assistances.has(reason) || rating.assistance.includes(reason))
    return game;
  return {
    ...game,
    rating: {
      ...rating,
      assistance: [...rating.assistance, reason],
      ...(reason === "fallback" ? { engine: "fallback" as const } : {}),
    },
  };
}

/** Record the engine that actually supplied a bot move. One fallback move makes the whole game unrated. */
export function markRatingEngine(
  game: GameSession,
  engine: "stockfish" | "fallback",
): GameSession {
  if (engine === "fallback") return markRatingAssisted(game, "fallback");
  const rating = sanitizeGameRating(game.rating, game);
  if (!rating || rating.engine !== "pending") return game;
  return { ...game, rating: { ...rating, engine: "stockfish" } };
}

export function recordRatedResult(
  source: RatingLedger,
  game: GameSession,
  now = Date.now(),
): {
  ledger: RatingLedger;
  entry: RatingEntry | null;
  reason: RatingRecordReason;
} {
  const ledger = sanitizeRatingLedger(source);
  const skip = (reason: RatingRecordReason) => ({
    ledger,
    entry: null,
    reason,
  });
  if (ledger.history.some((entry) => entry.gameId === game.id))
    return skip("already-recorded");
  const rating = sanitizeGameRating(game.rating, game);
  if (!rating || game.mode !== "bot") return skip("unrated");
  const pending = ledger.pending.find(
    (entry) => entry.gameId === game.id && entry.ticket === rating.ticket,
  );
  if (
    !pending ||
    pending.botId !== rating.botId ||
    pending.playerColor !== rating.playerColor ||
    pending.createdAt !== rating.createdAt
  )
    return skip("missing-enrollment");
  if (rating.engine === "fallback" || rating.assistance.includes("fallback"))
    return skip("fallback");
  if (rating.assistance.length) return skip("assisted");
  if (!game.result) return skip("unfinished");
  if (rating.engine !== "stockfish") return skip("engine-unverified");
  if (ledger.history.length >= MAX_RATING_HISTORY) return skip("ledger-full");
  if (
    game.moves.length > 1000 ||
    !game.moves.some((move) => move.color === game.playerColor) ||
    !game.moves.some((move) => move.color !== game.playerColor)
  )
    return skip("invalid-game");
  try {
    const chess = restoreChess(game);
    if (chess.fen() !== game.fen) return skip("invalid-game");
    let result = resultFor(chess);
    if (
      !result &&
      game.result.reason === "Resignation" &&
      game.result.winner === (game.playerColor === "w" ? "b" : "w")
    )
      result = game.result;
    if (!result && game.time.base > 0 && game.clocks[chess.turn()] === 0) {
      const timed = timeoutResult(chess.fen(), chess.turn());
      if (
        timed.reason === game.result.reason &&
        timed.winner === game.result.winner
      )
        result = timed;
    }
    if (
      !result ||
      result.winner !== game.result.winner ||
      result.reason !== game.result.reason
    )
      return skip("invalid-game");
    appendEntry(ledger, {
      gameId: game.id,
      botId: rating.botId,
      opponentRating: rating.opponentRating,
      playerColor: rating.playerColor,
      score:
        result.winner === null
          ? 0.5
          : result.winner === game.playerColor
            ? 1
            : 0,
      createdAt: game.createdAt,
      finishedAt: Math.max(
        game.createdAt,
        validTimestamp(now) ? now : Date.now(),
      ),
      reason: result.reason,
    });
    ledger.pending = ledger.pending.filter((entry) => entry.gameId !== game.id);
    return {
      ledger,
      entry: ledger.history[ledger.history.length - 1],
      reason: "recorded",
    };
  } catch {
    return skip("invalid-game");
  }
}
