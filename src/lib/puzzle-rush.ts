import { Chess } from "chess.js";
import { puzzles, type Puzzle } from "../data/puzzles";

export type RushMode = "three" | "five" | "survival";
export type RushPhase = "playing" | "reply" | "solved" | "mistake" | "finished";
export type RushFinishReason =
  "time" | "lives" | "completed" | "stopped" | "error";
export type RushOutcome = "solved" | "missed" | "unfinished";
export interface RushAttempt {
  puzzleId: string;
  outcome: RushOutcome;
  elapsedMs: number;
  attemptedMove?: string;
}
export interface RushStamp {
  runId: string;
  puzzleId: string;
  ply: number;
}
export interface RushState {
  runId: string;
  mode: RushMode;
  phase: RushPhase;
  startedAt: number;
  deadline: number | null;
  endedAt: number | null;
  puzzleStartedAt: number;
  index: number;
  ply: number;
  fen: string;
  lastMove: { from: string; to: string } | null;
  score: number;
  lives: number;
  attempts: RushAttempt[];
  finishReason: RushFinishReason | null;
}
export const rushModes: {
  id: RushMode;
  label: string;
  duration: number | null;
  description: string;
}[] = [
  {
    id: "three",
    label: "3 minutes",
    duration: 180000,
    description: "A quick burst of focus.",
  },
  {
    id: "five",
    label: "5 minutes",
    duration: 300000,
    description: "A little more thinking time.",
  },
  {
    id: "survival",
    label: "Survival",
    duration: null,
    description: "No clock. Make every life count.",
  },
];
/** A fixed progressive course makes personal bests comparable and supports learning through repetition. */
export const rushCourse: Puzzle[] = [...puzzles].sort(
  (a, b) => a.rating - b.rating || a.id.localeCompare(b.id),
);
export function rushPuzzle(
  state: RushState,
  course: Puzzle[] = rushCourse,
): Puzzle {
  return course[state.index];
}
export function rushStamp(
  state: RushState,
  course: Puzzle[] = rushCourse,
): RushStamp {
  return {
    runId: state.runId,
    puzzleId: rushPuzzle(state, course).id,
    ply: state.ply,
  };
}
function matches(
  state: RushState,
  stamp: RushStamp | undefined,
  course: Puzzle[],
): boolean {
  return (
    !stamp ||
    (stamp.runId === state.runId &&
      stamp.puzzleId === rushPuzzle(state, course)?.id &&
      stamp.ply === state.ply)
  );
}
export function startRush(
  mode: RushMode,
  now: number,
  runId?: string,
  course: Puzzle[] = rushCourse,
): RushState {
  if (!course.length)
    throw new Error("The challenge needs at least one puzzle.");
  // Keep ID generation out of a default parameter: older browser-target
  // transforms can emit an invalid receiver binding for optional method calls.
  let id = runId;
  if (id === undefined) {
    const cryptoProvider = globalThis.crypto;
    id =
      cryptoProvider && typeof cryptoProvider.randomUUID === "function"
        ? cryptoProvider.randomUUID()
        : `${now}-${Math.random()}`;
  }
  const duration = rushModes.find((item) => item.id === mode)?.duration ?? null;
  return {
    runId: id,
    mode,
    phase: "playing",
    startedAt: now,
    deadline: duration === null ? null : now + duration,
    endedAt: null,
    puzzleStartedAt: now,
    index: 0,
    ply: 0,
    fen: course[0].fen,
    lastMove: null,
    score: 0,
    lives: 3,
    attempts: [],
    finishReason: null,
  };
}
export function rushTimeLeft(state: RushState, now: number): number | null {
  return state.deadline === null
    ? null
    : Math.max(0, state.deadline - (state.endedAt ?? now));
}
export function rushElapsed(state: RushState, now: number): number {
  return Math.max(0, (state.endedAt ?? now) - state.startedAt);
}
export function finishRush(
  state: RushState,
  reason: RushFinishReason,
  now: number,
  course: Puzzle[] = rushCourse,
): RushState {
  if (state.phase === "finished") return state;
  const endedAt =
    reason === "time" && state.deadline !== null ? state.deadline : now;
  const attempts =
    state.phase === "playing" || state.phase === "reply"
      ? [
          ...state.attempts,
          {
            puzzleId: rushPuzzle(state, course).id,
            outcome: "unfinished" as const,
            elapsedMs: Math.max(0, endedAt - state.puzzleStartedAt),
          },
        ]
      : state.attempts;
  return {
    ...state,
    phase: "finished",
    finishReason: reason,
    endedAt,
    attempts,
  };
}
export function tickRush(
  state: RushState,
  now: number,
  course: Puzzle[] = rushCourse,
): RushState {
  return state.phase !== "finished" &&
    state.deadline !== null &&
    now >= state.deadline
    ? finishRush(state, "time", now, course)
    : state;
}
export function playRushMove(
  state: RushState,
  uci: string,
  now: number,
  course: Puzzle[] = rushCourse,
): RushState {
  const active = tickRush(state, now, course);
  if (active.phase !== "playing" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
    return active;
  const puzzle = rushPuzzle(active, course);
  const chess = new Chess(active.fen);
  let move;
  try {
    move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
  } catch {
    return active;
  }
  const checkmate = chess.isCheckmate();
  if (uci !== puzzle.solution[active.ply] && !checkmate) {
    const failed: RushState = {
      ...active,
      phase: "mistake",
      lives: active.lives - 1,
      attempts: [
        ...active.attempts,
        {
          puzzleId: puzzle.id,
          outcome: "missed",
          elapsedMs: Math.max(0, now - active.puzzleStartedAt),
          attemptedMove: uci,
        },
      ],
    };
    return failed.lives <= 0
      ? finishRush(failed, "lives", now, course)
      : failed;
  }
  const next = {
    ...active,
    fen: chess.fen(),
    ply: active.ply + 1,
    lastMove: { from: move.from, to: move.to },
  };
  if (next.ply >= puzzle.solution.length || checkmate)
    return {
      ...next,
      phase: "solved",
      score: next.score + 1,
      attempts: [
        ...next.attempts,
        {
          puzzleId: puzzle.id,
          outcome: "solved",
          elapsedMs: Math.max(0, now - next.puzzleStartedAt),
        },
      ],
    };
  return { ...next, phase: "reply" };
}
export function playRushReply(
  state: RushState,
  stamp: RushStamp,
  now: number,
  course: Puzzle[] = rushCourse,
): RushState {
  const active = tickRush(state, now, course);
  if (active.phase !== "reply" || !matches(active, stamp, course))
    return active;
  const uci = rushPuzzle(active, course).solution[active.ply];
  try {
    const chess = new Chess(active.fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return {
      ...active,
      phase: "playing",
      fen: chess.fen(),
      ply: active.ply + 1,
      lastMove: { from: move.from, to: move.to },
    };
  } catch {
    return finishRush(active, "error", now, course);
  }
}
export function advanceRush(
  state: RushState,
  now: number,
  stamp?: RushStamp,
  course: Puzzle[] = rushCourse,
): RushState {
  const active = tickRush(state, now, course);
  if (
    !["solved", "mistake"].includes(active.phase) ||
    !matches(active, stamp, course)
  )
    return active;
  const index = active.index + 1;
  if (index >= course.length)
    return finishRush(active, "completed", now, course);
  return {
    ...active,
    phase: "playing",
    index,
    fen: course[index].fen,
    ply: 0,
    lastMove: null,
    puzzleStartedAt: now,
  };
}
export type RushBests = Record<RushMode, number>;
export function sanitizeRushBests(value: unknown): RushBests {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const score = (key: RushMode) =>
    typeof record[key] === "number" &&
    Number.isInteger(record[key]) &&
    record[key] >= 0 &&
    record[key] <= rushCourse.length
      ? (record[key] as number)
      : 0;
  return {
    three: score("three"),
    five: score("five"),
    survival: score("survival"),
  };
}
