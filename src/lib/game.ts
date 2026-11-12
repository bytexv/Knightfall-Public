import { bots, resolveBot } from "./bots";
import { Chess, type Color, type Square } from "chess.js";
import { playedAlienGambit } from "./alien-gambit";
import { validatedPosition } from "./engine-position";
import type { GameRatingMetadata } from "./ratings";
export const START_FEN = new Chess().fen();
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_PGN_LENGTH = 3_000_000;
export const MAX_GAME_PLIES = 1000;
/** PGN comments are plain text; normalize controls and every brace before chess.js serializes them. */
export function sanitizeComment(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/\{/g, "[")
    .replace(/\}/g, "]")
    .trim()
    .slice(0, MAX_COMMENT_LENGTH)
    .replace(/[\uD800-\uDBFF]$/, "")
    .trimEnd();
}
/** PGN tag strings do not reliably round-trip embedded quotes in chess.js. */
export function sanitizePlayerName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/["\\]/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trimEnd();
}
export type GameMode =
  "bot" | "local" | "analysis" | "gambit" | "puzzle" | "lan";
export interface MoveRecord {
  from: string;
  to: string;
  promotion?: string;
  san: string;
  fen: string;
  color: Color;
  captured?: string;
  before: string;
  comment?: string;
}
export interface GameResult {
  winner: Color | null;
  reason: string;
}
export interface GameSession {
  id: string;
  mode: GameMode;
  startFen: string;
  fen: string;
  moves: MoveRecord[];
  playerColor: Color;
  botId: string;
  customBotElo?: number;
  practiceKind?: "deserter";
  started: boolean;
  result: GameResult | null;
  createdAt: number;
  time: { base: number; increment: number };
  clocks: { w: number; b: number };
  title: string;
  initialComment?: string;
  whiteName?: string;
  blackName?: string;
  whiteElo?: number;
  blackElo?: number;
  rating?: GameRatingMetadata;
  alienGambit?: boolean;
}
export { bots } from "./bots";
export const timeControls = [
  { label: "1 min", base: 60, increment: 0, kind: "Bullet" },
  { label: "3 + 2", base: 180, increment: 2, kind: "Blitz" },
  { label: "5 min", base: 300, increment: 0, kind: "Blitz" },
  { label: "10 min", base: 600, increment: 0, kind: "Rapid" },
  { label: "15 + 10", base: 900, increment: 10, kind: "Rapid" },
  { label: "∞", base: 0, increment: 0, kind: "Untimed" },
];
export function newSession(options: Partial<GameSession> = {}): GameSession {
  const fen = options.startFen || START_FEN;
  const time = options.time || { base: 600, increment: 0 };
  return {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    mode: "bot",
    moves: [],
    playerColor: "w",
    botId: "scout",
    started: false,
    result: null,
    createdAt: Date.now(),
    time,
    clocks: { w: time.base * 1000, b: time.base * 1000 },
    title: "Friendly game",
    ...options,
    startFen: fen,
    fen: options.fen || fen,
  };
}
export function restoreChess(session: Pick<GameSession, "startFen" | "moves">) {
  const chess = new Chess(session.startFen);
  for (const move of session.moves)
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  return chess;
}
export function resultFor(chess: Chess): GameResult | null {
  if (chess.isCheckmate())
    return { winner: chess.turn() === "w" ? "b" : "w", reason: "Checkmate" };
  if (chess.isStalemate()) return { winner: null, reason: "Stalemate" };
  if (chess.isThreefoldRepetition())
    return { winner: null, reason: "Threefold repetition" };
  if (chess.isInsufficientMaterial())
    return { winner: null, reason: "Insufficient material" };
  if (chess.isDrawByFiftyMoves())
    return { winner: null, reason: "Fifty-move rule" };
  return null;
}
export function applyMove(
  session: GameSession,
  from: string,
  to: string,
  promotion = "q",
): GameSession | null {
  if (session.result) return null;
  try {
    const chess = restoreChess(session);
    const before = chess.fen();
    const move = chess.move({ from, to, promotion });
    if (!move) return null;
    const record: MoveRecord = {
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      san: move.san,
      fen: chess.fen(),
      color: move.color,
      captured: move.captured,
      before,
    };
    return {
      ...session,
      started: true,
      fen: chess.fen(),
      moves: [...session.moves, record],
      alienGambit:
        session.alienGambit === true ||
        ((session.mode !== "bot" || session.playerColor === "w") &&
          playedAlienGambit(session.startFen, [...session.moves, record])),
      result: resultFor(chess),
      clocks: {
        ...session.clocks,
        [move.color]:
          session.clocks[move.color] + session.time.increment * 1000,
      },
    };
  } catch {
    return null;
  }
}
export function undoMoves(session: GameSession, count = 1): GameSession {
  const moves = session.moves.slice(
    0,
    Math.max(0, session.moves.length - count),
  );
  return {
    ...session,
    moves,
    fen: moves.at(-1)?.fen || session.startFen,
    result: null,
  };
}
export function sessionPgn(session: GameSession): string {
  const c = new Chess(session.startFen);
  const initialComment = sanitizeComment(session.initialComment);
  if (initialComment) c.setComment(initialComment);
  for (const move of session.moves) {
    c.move({ from: move.from, to: move.to, promotion: move.promotion });
    const comment = sanitizeComment(move.comment);
    if (comment) c.setComment(comment);
  }
  const bot = resolveBot(session.botId, session.customBotElo);
  c.header(
    "Event",
    "Knightfall casual game",
    "Site",
    "Local",
    "Date",
    new Date(session.createdAt).toISOString().slice(0, 10).replace(/-/g, "."),
    "White",
    sanitizePlayerName(session.whiteName) ||
      (session.mode === "bot" && session.playerColor === "b"
        ? bot?.name || "Computer"
        : "White"),
    "Black",
    sanitizePlayerName(session.blackName) ||
      (session.mode === "bot" && session.playerColor === "w"
        ? bot?.name || "Computer"
        : "Black"),
    "Result",
    session.result
      ? session.result.winner === "w"
        ? "1-0"
        : session.result.winner === "b"
          ? "0-1"
          : "1/2-1/2"
      : "*",
  );
  if (validPgnElo(session.whiteElo))
    c.header("WhiteElo", String(session.whiteElo));
  if (validPgnElo(session.blackElo))
    c.header("BlackElo", String(session.blackElo));
  return c.pgn();
}
export function validPgnElo(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 3200
  );
}
export function importPgn(pgn: string): GameSession {
  if (pgn.length > MAX_PGN_LENGTH)
    throw new Error("PGN is too large. Please import one game under 3 MB.");
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  if (history.length > MAX_GAME_PLIES)
    throw new Error(
      "Please import a single game with at most 1,000 half-moves.",
    );
  const startFen = history[0]?.before || chess.fen();
  validatedPosition(startFen);
  const comments = new Map(
    chess
      .getComments()
      .map((entry) => [entry.fen, sanitizeComment(entry.comment)]),
  );
  const initialComment = comments.get(startFen);
  const whiteName = sanitizePlayerName(chess.getHeaders().White),
    blackName = sanitizePlayerName(chess.getHeaders().Black);
  const moves = history.map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
    san: m.san,
    fen: m.after,
    before: m.before,
    color: m.color,
    captured: m.captured,
    ...(comments.get(m.after) ? { comment: comments.get(m.after) } : {}),
  }));
  return newSession({
    mode: "analysis",
    startFen,
    fen: chess.fen(),
    moves,
    ...(initialComment ? { initialComment } : {}),
    ...(whiteName && whiteName !== "?" ? { whiteName } : {}),
    ...(blackName && blackName !== "?" ? { blackName } : {}),
    ...(validPgnElo(Number(chess.getHeaders().WhiteElo))
      ? { whiteElo: Number(chess.getHeaders().WhiteElo) }
      : {}),
    ...(validPgnElo(Number(chess.getHeaders().BlackElo))
      ? { blackElo: Number(chess.getHeaders().BlackElo) }
      : {}),
    started: true,
    result:
      resultFor(chess) ||
      (["1-0", "0-1", "1/2-1/2"].includes(chess.getHeaders().Result)
        ? {
            winner:
              chess.getHeaders().Result === "1-0"
                ? "w"
                : chess.getHeaders().Result === "0-1"
                  ? "b"
                  : null,
            reason: "Imported result",
          }
        : null),
    time: { base: 0, increment: 0 },
    title: chess.getHeaders().Event || "Imported game",
  });
}
export function importFen(fen: string): GameSession {
  const chess = validatedPosition(fen.trim());
  return newSession({
    mode: "analysis",
    startFen: chess.fen(),
    fen: chess.fen(),
    started: true,
    time: { base: 0, increment: 0 },
    title: "Custom position",
    result: resultFor(chess),
  });
}
export function formatClock(ms: number, untimed = false) {
  if (untimed) return "∞";
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function uciToSan(fen: string, line: string[]): string[] {
  try {
    const chess = new Chess(fen);
    const result: string[] = [];
    for (const uci of line) {
      const m = chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci[4],
      });
      if (!m) break;
      result.push(m.san);
    }
    return result;
  } catch {
    return [];
  }
}
export function capturedPieces(fen: string, color: Color) {
  const board = new Chess(fen).board().flat().filter(Boolean);
  const initial: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
  return Object.entries(initial).flatMap(([piece, count]) =>
    Array(
      Math.max(
        0,
        count -
          board.filter((p) => p?.color === color && p.type === piece).length,
      ),
    ).fill(piece),
  );
}
