import { applyMove, newSession, type GameSession } from "./game";

export interface Exploration {
  sourceId: string;
  anchor: number;
  mode: "line" | "retry" | "explore";
  line: GameSession;
  index: number;
  playing: boolean;
  expected?: string;
  feedback?: string;
}

/** A disposable variation. The recorded game and its review never change. */
export function explorePosition(
  game: GameSession,
  anchor: number,
  moves: string[] = [],
  mode: Exploration["mode"] = "explore",
  expected?: string,
): Exploration {
  const index = Math.max(
    -1,
    Math.min(game.moves.length - 1, Math.trunc(anchor)),
  );
  const fen = index < 0 ? game.startFen : game.moves[index].fen;
  let line = newSession({
    mode: "analysis",
    startFen: fen,
    started: true,
    time: { base: 0, increment: 0 },
    title: "Analysis variation",
  });
  for (const uci of moves.slice(0, 24)) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    const next = applyMove(line, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
    if (!next) break;
    line = next;
  }
  return {
    sourceId: game.id,
    anchor: index,
    mode,
    line,
    index: -1,
    playing: mode === "line" && line.moves.length > 0,
    expected,
  };
}

export function explorationFen(exploration: Exploration): string {
  return exploration.index < 0
    ? exploration.line.startFen
    : exploration.line.moves[exploration.index]?.fen ||
        exploration.line.startFen;
}

export function playExplorationMove(
  exploration: Exploration,
  from: string,
  to: string,
  promotion = "q",
): Exploration | null {
  const base = {
    ...exploration.line,
    moves: exploration.line.moves.slice(0, exploration.index + 1),
    fen: explorationFen(exploration),
    result: null,
  };
  const next = applyMove(base, from, to, promotion);
  if (!next) return null;
  const move = next.moves[next.moves.length - 1];
  const uci = move.from + move.to + (move.promotion || "");
  const feedback =
    exploration.mode === "retry" && exploration.index === -1
      ? uci === exploration.expected
        ? "You found the engine’s preferred move."
        : "Your move is on the board. Compare it with the engine’s line."
      : exploration.feedback;
  return {
    ...exploration,
    line: next,
    index: next.moves.length - 1,
    playing: false,
    feedback,
  };
}
