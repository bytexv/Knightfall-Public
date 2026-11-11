import { Chess, type Move, type PieceSymbol } from "chess.js";
import { validatedPosition } from "./engine-position";

/** Small, local emergency engine. Stockfish is always preferred when available. */
export interface SearchOptions {
  depth?: number;
  movetime?: number;
  multiPV?: number;
  skill?: number;
}

export interface SearchLine {
  multipv: number;
  score: number;
  mate?: number;
  pv: string[];
  depth: number;
}

export interface SearchResult {
  bestMove: string | null;
  score: number;
  mate?: number;
  lines: SearchLine[];
  depth: number;
  engine: string;
}

const VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 0,
};
const MATE = 100_000;
const TIMEOUT = Symbol("search-timeout");
const engineName = "Knightfall Lite";

export function moveToUci(
  move: Pick<Move, "from" | "to" | "promotion">,
): string {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

/** Static score in centipawns, always from White's point of view. */
export function evaluatePosition(game: Chess): number {
  const board = game.board();
  let score = 0;
  let nonPawnMaterial = 0;
  const pawns = {
    w: Array.from({ length: 8 }, () => [] as number[]),
    b: Array.from({ length: 8 }, () => [] as number[]),
  };
  const bishops = { w: 0, b: 0 };
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[row][file];
      if (!piece) continue;
      if (piece.type === "p") pawns[piece.color][file].push(row);
      else nonPawnMaterial += VALUES[piece.type];
      if (piece.type === "b") bishops[piece.color]++;
    }
  }
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[row][file];
      if (!piece) continue;
      const sign = piece.color === "w" ? 1 : -1;
      const advance = piece.color === "w" ? 6 - row : row - 1;
      const centrality = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - file);
      let positional = 0;
      if (piece.type === "p") {
        positional = advance * 9 + (3.5 - Math.abs(3.5 - file)) * 5;
        const own = pawns[piece.color];
        const enemy = pawns[piece.color === "w" ? "b" : "w"];
        if (own[file].length > 1) positional -= 13;
        if (!(own[file - 1]?.length || own[file + 1]?.length)) positional -= 12;
        const ahead = (r: number) => (piece.color === "w" ? r < row : r > row);
        if (![file - 1, file, file + 1].some((f) => enemy[f]?.some(ahead)))
          positional += 12 + advance * advance * 3;
      } else if (piece.type === "n") positional = centrality * 15 - 48;
      else if (piece.type === "b") positional = centrality * 7 - 12;
      else if (piece.type === "r")
        positional =
          (advance === 5 ? 20 : 0) +
          (!pawns[piece.color][file].length ? 15 : 0);
      else if (piece.type === "q") positional = centrality * 3;
      else if (piece.type === "k") {
        positional =
          nonPawnMaterial < 2000 ? centrality * 12 : -centrality * 10;
        if (
          nonPawnMaterial >= 2000 &&
          (file === 6 || file === 2) &&
          (row === 7 || row === 0)
        )
          positional += 30;
      }
      score += sign * (VALUES[piece.type] + positional);
    }
  }
  if (bishops.w >= 2) score += 25;
  if (bishops.b >= 2) score -= 25;
  return Math.round(score);
}

function orderValue(move: Move): number {
  return (
    (move.captured ? 10 * VALUES[move.captured] - VALUES[move.piece] : 0) +
    (move.promotion ? VALUES[move.promotion] + 500 : 0) +
    (move.san.includes("+") || move.san.includes("#") ? 80 : 0)
  );
}

/** Runs synchronously inside a dedicated Worker; no server or network is used. */
export function searchPosition(
  fen: string,
  options: SearchOptions = {},
): SearchResult {
  const game = validatedPosition(fen);
  const rootSign = game.turn() === "w" ? 1 : -1;
  const maxDepth = Math.max(1, Math.min(6, options.depth ?? 4));
  const deadline =
    performance.now() + Math.max(50, Math.min(10_000, options.movetime ?? 650));
  let nodes = 0;
  const checkTime = () => {
    if ((++nodes & 63) === 0 && performance.now() > deadline) throw TIMEOUT;
  };
  const terminalScore = (ply: number): number | undefined => {
    if (game.isCheckmate()) return -MATE + ply;
    if (game.isDraw()) return 0;
    return undefined;
  };
  const quiescence = (
    alpha: number,
    beta: number,
    ply: number,
    remaining: number,
  ): number => {
    checkTime();
    const terminal = terminalScore(ply);
    if (terminal !== undefined) return terminal;
    const inCheck = game.isCheck();
    const standing = evaluatePosition(game) * (game.turn() === "w" ? 1 : -1);
    if (remaining <= 0) return standing;
    if (!inCheck) {
      if (standing >= beta) return beta;
      if (standing > alpha) alpha = standing;
    }
    const moves = game
      .moves({ verbose: true })
      .filter((m) => inCheck || m.captured || m.promotion)
      .sort((a, b) => orderValue(b) - orderValue(a));
    for (const move of moves) {
      game.move(move);
      let score: number;
      try {
        score = -quiescence(-beta, -alpha, ply + 1, remaining - 1);
      } finally {
        game.undo();
      }
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };
  const negamax = (
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
  ): { score: number; pv: string[] } => {
    checkTime();
    const terminal = terminalScore(ply);
    if (terminal !== undefined) return { score: terminal, pv: [] };
    if (depth === 0) return { score: quiescence(alpha, beta, ply, 4), pv: [] };
    let best = -Infinity;
    let pv: string[] = [];
    const moves = game
      .moves({ verbose: true })
      .sort((a, b) => orderValue(b) - orderValue(a));
    for (const move of moves) {
      game.move(move);
      let reply: { score: number; pv: string[] };
      try {
        reply = negamax(depth - 1, -beta, -alpha, ply + 1);
      } finally {
        game.undo();
      }
      const score = -reply.score;
      if (score > best) {
        best = score;
        pv = [moveToUci(move), ...reply.pv];
      }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return { score: best, pv };
  };

  const terminal = terminalScore(0);
  if (terminal !== undefined)
    return {
      bestMove: null,
      score: terminal === 0 ? 0 : Math.sign(terminal * rootSign) * 10_000,
      ...(game.isCheckmate() ? { mate: 0 } : {}),
      lines: [],
      depth: 0,
      engine: engineName,
    };
  const rootMoves = game
    .moves({ verbose: true })
    .sort((a, b) => orderValue(b) - orderValue(a));
  let completed: Array<{ move: Move; score: number; pv: string[] }> =
    rootMoves.map((move) => ({
      move,
      score: evaluatePosition(game) * rootSign,
      pv: [moveToUci(move)],
    }));
  let completedDepth = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: typeof completed = [];
    try {
      for (const previous of completed) {
        if (performance.now() > deadline && next.length) throw TIMEOUT;
        game.move(previous.move);
        let reply: { score: number; pv: string[] };
        try {
          reply = negamax(depth - 1, -Infinity, Infinity, 1);
        } finally {
          game.undo();
        }
        next.push({
          move: previous.move,
          score: -reply.score,
          pv: [moveToUci(previous.move), ...reply.pv],
        });
      }
      completed = next.sort((a, b) => b.score - a.score);
      completedDepth = depth;
      if (completed[0].score >= MATE - 100) break;
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      if (completedDepth === 0 && next.length)
        completed = next.sort((a, b) => b.score - a.score);
      break;
    }
  }
  const toLine = (
    entry: (typeof completed)[number],
    index: number,
  ): SearchLine => {
    const whiteScore = entry.score * rootSign;
    const isMate = Math.abs(entry.score) >= MATE - 100;
    return {
      multipv: index + 1,
      score: isMate ? Math.sign(whiteScore) * 10_000 : Math.round(whiteScore),
      ...(isMate
        ? {
            mate:
              Math.sign(whiteScore) *
              Math.ceil((MATE - Math.abs(entry.score)) / 2),
          }
        : {}),
      pv: entry.pv,
      depth: completedDepth,
    };
  };
  const lines = completed
    .slice(0, Math.max(1, Math.min(5, options.multiPV ?? 1)))
    .map(toLine);
  const best = lines[0];
  const skill = Math.max(0, Math.min(20, options.skill ?? 20));
  // Lower levels choose from plausible legal alternatives. They are not rated Elo.
  const candidates =
    skill >= 18
      ? completed.slice(0, 1)
      : completed
          .filter(
            (e) =>
              completed[0].score - e.score <= Math.pow(20 - skill, 2) * 1.8,
          )
          .slice(0, Math.max(1, 6 - Math.floor(skill / 4)));
  const chosen =
    candidates[Math.floor(Math.random() * candidates.length)] || completed[0];
  return {
    bestMove: moveToUci(chosen.move),
    score: best.score,
    ...(best.mate !== undefined ? { mate: best.mate } : {}),
    lines,
    depth: completedDepth,
    engine: engineName,
  };
}
