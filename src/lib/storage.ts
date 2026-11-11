import { Capacitor, registerPlugin } from "@capacitor/core";
import { puzzles } from "../data/puzzles";
import { validatedPosition } from "./engine-position";
import { sanitizeGameRating } from "./ratings";
import {
  bots,
  resultFor,
  sanitizeComment,
  sanitizePlayerName,
  type GameSession,
  type MoveRecord,
} from "./game";

export interface Settings {
  boardTheme: "sage" | "walnut" | "ocean";
  sound: boolean;
  coordinates: boolean;
  legalMoves: boolean;
  name: string;
  alienEasterEgg: boolean;
  alienAudio: boolean;
  engineMode: "lite" | "full";
  engineThreads: number;
  analysisTime: number;
  botTime: number;
}
export const defaultSettings: Settings = {
  boardTheme: "walnut",
  sound: true,
  coordinates: true,
  legalMoves: true,
  name: "You",
  alienEasterEgg: true,
  alienAudio: true,
  engineMode: "lite",
  engineThreads: 2,
  analysisTime: 1200,
  botTime: 1500,
};
const modes = new Set(["bot", "local", "analysis", "gambit", "puzzle", "lan"]);
const puzzleIds = new Set(puzzles.map((puzzle) => puzzle.id));
const MAX_GAMES = 200;
const MAX_PLIES = 1000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const boundedNumber = (value: unknown, fallback: number, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= max
    ? value
    : fallback;
const safeText = (value: unknown, fallback: string, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max) || fallback
    : fallback;

/** Accept only known settings and their actual runtime types, including backups from older versions. */
export function sanitizeSettings(value: unknown): Settings {
  const raw = isRecord(value) ? value : {};
  return {
    boardTheme:
      raw.boardTheme === "sage" ||
      raw.boardTheme === "walnut" ||
      raw.boardTheme === "ocean"
        ? raw.boardTheme
        : defaultSettings.boardTheme,
    sound: typeof raw.sound === "boolean" ? raw.sound : defaultSettings.sound,
    coordinates:
      typeof raw.coordinates === "boolean"
        ? raw.coordinates
        : defaultSettings.coordinates,
    legalMoves:
      typeof raw.legalMoves === "boolean"
        ? raw.legalMoves
        : defaultSettings.legalMoves,
    name: safeText(raw.name, defaultSettings.name, 24),
    alienEasterEgg: raw.alienEasterEgg !== false,
    alienAudio: raw.alienAudio !== false,
    engineMode: raw.engineMode === "full" ? "full" : "lite",
    engineThreads: [1, 2, 4].includes(Number(raw.engineThreads))
      ? Number(raw.engineThreads)
      : 2,
    analysisTime: [650, 1200, 3000, 8000, 15000].includes(
      Number(raw.analysisTime),
    )
      ? Number(raw.analysisTime)
      : 1200,
    botTime: [1500, 3000, 8000, 15000].includes(Number(raw.botTime))
      ? Number(raw.botTime)
      : 1500,
  };
}

/** Keep each real puzzle at most once; corrupted values cannot inflate progress or crash .includes(). */
export function sanitizeSolved(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === "string" && puzzleIds.has(id),
      ),
    ),
  ];
}

/**
 * Rebuild trusted move records from legal moves instead of trusting stored FEN/SAN.
 * Presentation metadata can fall back safely; missing identity or illegal chess data rejects the game.
 */
export function validateSavedGame(value: unknown): GameSession | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.length > 128 ||
    typeof value.startFen !== "string" ||
    value.startFen.length > 200 ||
    !Array.isArray(value.moves) ||
    value.moves.length > MAX_PLIES
  )
    return null;
  try {
    const chess = validatedPosition(value.startFen);
    const startFen = chess.fen();
    const moves: MoveRecord[] = [];
    for (const item of value.moves) {
      if (
        !isRecord(item) ||
        typeof item.from !== "string" ||
        !/^[a-h][1-8]$/.test(item.from) ||
        typeof item.to !== "string" ||
        !/^[a-h][1-8]$/.test(item.to) ||
        (item.promotion !== undefined &&
          (typeof item.promotion !== "string" ||
            !/^[qrbn]$/.test(item.promotion)))
      )
        return null;
      const before = chess.fen();
      const move = chess.move({
        from: item.from,
        to: item.to,
        promotion: item.promotion as string | undefined,
      });
      const comment = sanitizeComment(item.comment);
      moves.push({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        san: move.san,
        fen: chess.fen(),
        color: move.color,
        captured: move.captured,
        before,
        ...(comment ? { comment } : {}),
      });
    }
    const timeRaw = isRecord(value.time) ? value.time : {};
    const time = {
      base: Math.round(boundedNumber(timeRaw.base, 600, 86400)),
      increment: Math.round(boundedNumber(timeRaw.increment, 0, 600)),
    };
    const clocksRaw = isRecord(value.clocks) ? value.clocks : {};
    const clocks =
      time.base === 0
        ? { w: 0, b: 0 }
        : {
            w: boundedNumber(clocksRaw.w, time.base * 1000, 604800000),
            b: boundedNumber(clocksRaw.b, time.base * 1000, 604800000),
          };
    const storedResult: GameSession["result"] =
      isRecord(value.result) &&
      (value.result.winner === "w" ||
        value.result.winner === "b" ||
        value.result.winner === null)
        ? {
            winner: value.result.winner,
            reason: safeText(value.result.reason, "Recorded result", 120),
          }
        : null;
    const game: GameSession = {
      id: value.id.trim(),
      mode: modes.has(value.mode as string)
        ? (value.mode as GameSession["mode"])
        : "analysis",
      startFen,
      fen: chess.fen(),
      moves,
      playerColor: value.playerColor === "b" ? "b" : "w",
      botId: bots.some((bot) => bot.id === value.botId)
        ? (value.botId as string)
        : "scout",
      started: value.started === true,
      alienGambit: value.alienGambit === true,
      result: resultFor(chess) || storedResult,
      createdAt: boundedNumber(
        value.createdAt,
        Date.now(),
        Date.now() + 86400000,
      ),
      time,
      clocks,
      title: safeText(value.title, "Saved game", 120),
      ...(sanitizeComment(value.initialComment)
        ? { initialComment: sanitizeComment(value.initialComment) }
        : {}),
      ...(sanitizePlayerName(value.whiteName)
        ? { whiteName: sanitizePlayerName(value.whiteName) }
        : {}),
      ...(sanitizePlayerName(value.blackName)
        ? { blackName: sanitizePlayerName(value.blackName) }
        : {}),
    };
    const rating = sanitizeGameRating(value.rating, game);
    if (rating) game.rating = rating;
    return game;
  } catch {
    return null;
  }
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`knightfall:${key}`);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
export function writeStore(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(`knightfall:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Replaying every archived game on every clock tick or repeated read would be expensive.
// Cache only the exact serialized snapshot; external tabs and imports invalidate it naturally.
let archiveRaw: string | null | undefined;
let archiveCache: GameSession[] = [];
export function savedGames(): GameSession[] {
  try {
    const raw = localStorage.getItem("knightfall:games");
    if (raw === archiveRaw) return archiveCache.slice();
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      parsed = [];
    }
    const ids = new Set<string>();
    const games = Array.isArray(parsed)
      ? parsed.slice(0, MAX_GAMES).flatMap((value) => {
          const game = validateSavedGame(value);
          if (!game || ids.has(game.id)) return [];
          ids.add(game.id);
          return [game];
        })
      : [];
    archiveRaw = raw;
    archiveCache = games;
    return games.slice();
  } catch {
    return [];
  }
}
export function saveGame(game: GameSession) {
  if (!Array.isArray(game?.moves)) return false;
  const valid = validateSavedGame(game);
  if (
    !valid ||
    (!valid.moves.length && valid.mode !== "analysis" && !valid.initialComment)
  )
    return false;
  const games = [
    valid,
    ...savedGames().filter((saved) => saved.id !== valid.id),
  ].slice(0, MAX_GAMES);
  const saved = writeStore("games", games);
  if (saved) {
    archiveRaw = JSON.stringify(games);
    archiveCache = games;
  }
  return saved;
}

const nativeFiles = registerPlugin<{
  save(args: {
    filename: string;
    data: string;
  }): Promise<{ saved: boolean; filename: string }>;
}>("KnightfallFiles");
export async function downloadFile(
  name: string,
  text: string,
  type = "text/plain",
): Promise<boolean> {
  if (Capacitor.getPlatform() === "android") {
    try {
      const result = await nativeFiles.save({ filename: name, data: text });
      return result.saved;
    } catch (error) {
      if ((error as { code?: string }).code === "USER_CANCELLED") return false;
      throw error;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  return true;
}
export function playSound(kind: "move" | "capture" | "check" | "end" = "move") {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(
      kind === "check"
        ? 650
        : kind === "capture"
          ? 220
          : kind === "end"
            ? 420
            : 340,
      ctx.currentTime,
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === "end" ? 700 : 140,
      ctx.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    osc.onended = () => void ctx.close();
  } catch {
    /* Muted by browser/device. */
  }
}
