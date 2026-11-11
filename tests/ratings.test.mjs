import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  importPgn,
  newSession,
  START_FEN,
  undoMoves,
} from "../src/lib/game.ts";
import { advanceClock } from "../src/lib/clock.ts";
import {
  readStore,
  writeStore,
  validateSavedGame,
  saveGame,
  savedGames,
} from "../src/lib/storage.ts";
import {
  INITIAL_PRACTICE_RATING,
  MAX_RATING_HISTORY,
  MAX_RATING_PENDING,
  emptyRatingLedger,
  sanitizeRatingLedger,
  sanitizeGameRating,
  beginRatedGame,
  markRatingAssisted,
  markRatingEngine,
  recordRatedResult,
  mergeRatingLedgers,
} from "../src/lib/ratings.ts";

const DATE = 1_700_000_000_000;
const winMoves = ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"];
const lossMoves = ["f2f3", "e7e5", "g2g4", "d8h4"];
const drawMoves = [
  "g1f3",
  "g8f6",
  "f3g1",
  "f6g8",
  "g1f3",
  "g8f6",
  "f3g1",
  "f6g8",
];
function play(game, moves) {
  for (const uci of moves) {
    game = applyMove(game, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
    assert.ok(game, `Legal fixture move ${uci}`);
  }
  return game;
}
function enroll(id = "first", ledger = emptyRatingLedger(), options = {}) {
  return beginRatedGame(
    newSession({ id, started: true, createdAt: DATE, ...options }),
    ledger,
  );
}
function completed(
  id = "first",
  ledger = emptyRatingLedger(),
  moves = winMoves,
  options = {},
) {
  const next = enroll(id, ledger, options);
  return {
    ledger: next.ledger,
    game: markRatingEngine(play(next.game, moves), "stockfish"),
  };
}
function historyEntry(id, score = 1, options = {}) {
  return {
    gameId: id,
    botId: "scout",
    opponentRating: 800,
    playerColor: "w",
    score,
    createdAt: DATE,
    finishedAt: DATE + 10,
    reason: score === 0.5 ? "Threefold repetition" : "Checkmate",
    ...options,
  };
}

let previousStorage;
beforeEach(() => {
  previousStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
});
afterEach(() => {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
});

test("a fresh local practice estimate starts at 800 and old/imported games never enroll automatically", () => {
  const ledger = emptyRatingLedger();
  assert.equal(INITIAL_PRACTICE_RATING, 800);
  assert.equal(ledger.rating, 800);
  assert.equal(ledger.totalRatedGames, 0);
  assert.equal(ledger.provisional, true);
  const legacy = play(newSession({ started: true }), winMoves);
  assert.equal(legacy.rating, undefined);
  assert.equal(recordRatedResult(ledger, legacy).reason, "unrated");
  const imported = importPgn("1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0");
  assert.equal(
    recordRatedResult(ledger, { ...imported, mode: "bot" }).reason,
    "unrated",
  );
  assert.equal(beginRatedGame(legacy, ledger).game.rating, undefined);
});

test("only a new standard bot game receives an enrollment bound to its identity and opponent", () => {
  const { game, ledger } = enroll();
  assert.equal(game.rating.version, 1);
  assert.equal(game.rating.opponentRating, 800);
  assert.equal(game.rating.engine, "pending");
  assert.deepEqual(game.rating.assistance, []);
  assert.equal(ledger.pending[0].ticket, game.rating.ticket);
  assert.equal(beginRatedGame(game, ledger).ledger.pending.length, 1);
  for (const options of [
    { mode: "analysis" },
    { mode: "local" },
    { mode: "lan" },
    { mode: "gambit" },
    { mode: "puzzle" },
    { botId: "invented" },
    { startFen: "7k/8/8/8/8/8/P7/KR6 w - - 0 1" },
    { fen: START_FEN.replace(" w ", " b ") },
    { playerColor: "x" },
    { createdAt: Infinity },
  ])
    assert.equal(
      enroll("not-eligible", emptyRatingLedger(), options).game.rating,
      undefined,
    );
  assert.equal(
    emptyRatingLedger().pending.length,
    0,
    "input ledger is not mutated",
  );
});

test("win/loss/draw use human color, catalog Elo and the Elo expected-score formula", () => {
  for (const [moves, color, score, expected] of [
    [winMoves, "w", 1, 820],
    [lossMoves, "w", 0, 780],
    [drawMoves, "w", 0.5, 800],
    [lossMoves, "b", 1, 820],
  ]) {
    const { game, ledger } = completed("outcome", emptyRatingLedger(), moves, {
      playerColor: color,
    });
    const result = recordRatedResult(ledger, game, DATE + 100);
    assert.equal(result.reason, "recorded");
    assert.equal(result.ledger.rating, expected);
    assert.equal(result.entry.score, score);
    assert.equal(result.entry.kFactor, 40);
    assert.equal(result.ledger.wins, Number(score === 1));
    assert.equal(result.ledger.draws, Number(score === 0.5));
    assert.equal(result.ledger.losses, Number(score === 0));
    assert.equal(result.ledger.pending.length, 0);
    assert.equal(ledger.history.length, 0, "source ledger is immutable");
  }
  const stronger = completed("stronger", emptyRatingLedger(), winMoves, {
    botId: "sage",
  });
  assert.equal(
    recordRatedResult(stronger.ledger, stronger.game).entry.delta,
    36,
  );
});

test("the same completed game cannot be counted twice, even if its later result is edited", () => {
  const { game, ledger } = completed();
  const first = recordRatedResult(ledger, game, DATE + 100);
  for (const repeated of [
    game,
    { ...game, result: { winner: "b", reason: "Resignation" } },
  ]) {
    const second = recordRatedResult(first.ledger, repeated);
    assert.equal(second.reason, "already-recorded");
    assert.equal(second.entry, null);
    assert.deepEqual(second.ledger, first.ledger);
  }
});

test("game metadata and the enrollment survive actual storage reload while results remain deduplicated", () => {
  const enrolled = enroll();
  const unfinished = markRatingEngine(
    play(enrolled.game, ["e2e4", "e7e5"]),
    "stockfish",
  );
  assert.equal(writeStore("ratings", enrolled.ledger), true);
  assert.equal(saveGame(unfinished), true);
  const loadedGame = savedGames()[0];
  const loadedLedger = sanitizeRatingLedger(readStore("ratings", null));
  assert.deepEqual(loadedGame.rating, unfinished.rating);
  const finished = play(loadedGame, winMoves.slice(2));
  const update = recordRatedResult(loadedLedger, finished, DATE + 100);
  assert.equal(update.reason, "recorded");
  writeStore("ratings", update.ledger);
  saveGame(finished);
  const reloaded = recordRatedResult(
    sanitizeRatingLedger(readStore("ratings", null)),
    savedGames()[0],
  );
  assert.equal(reloaded.reason, "already-recorded");
  assert.equal(reloaded.ledger.totalRatedGames, 1);
});

test("hints, takebacks, or analysis during play permanently exclude that game", () => {
  for (const reason of ["hint", "takeback", "analysis"]) {
    const initial = enroll(reason);
    const assisted = markRatingAssisted(initial.game, reason);
    assert.notEqual(assisted, initial.game);
    assert.deepEqual(initial.game.rating.assistance, []);
    assert.equal(markRatingAssisted(assisted, reason), assisted);
    const game = markRatingEngine(play(assisted, winMoves), "stockfish");
    assert.equal(recordRatedResult(initial.ledger, game).reason, "assisted");
    const loaded = validateSavedGame(JSON.parse(JSON.stringify(game)));
    assert.deepEqual(loaded.rating.assistance, [reason]);
  }
  const finished = completed();
  const reopened = markRatingAssisted(undoMoves(finished.game), "takeback");
  assert.equal(
    recordRatedResult(finished.ledger, play(reopened, ["h5f7"])).reason,
    "assisted",
  );
});

test("post-game review does not disqualify a completed game before its result is recorded", () => {
  const { game, ledger } = completed();
  assert.equal(markRatingAssisted(game, "analysis"), game);
  assert.equal(markRatingAssisted(game, "hint"), game);
  assert.equal(recordRatedResult(ledger, game).reason, "recorded");
});

test("fallback use is irreversible, including a fallback move that ends the game", () => {
  const { game, ledger } = completed();
  const fallback = markRatingEngine(game, "fallback");
  assert.equal(fallback.rating.engine, "fallback");
  assert.deepEqual(fallback.rating.assistance, ["fallback"]);
  assert.equal(markRatingEngine(fallback, "stockfish"), fallback);
  assert.equal(recordRatedResult(ledger, fallback).reason, "fallback");
  const loaded = validateSavedGame({
    ...fallback,
    rating: { ...fallback.rating, assistance: [] },
  });
  assert.deepEqual(
    loaded.rating.assistance,
    ["fallback"],
    "stored engine fallback cannot be erased by an empty assistance list",
  );
  const pending = enroll("pending");
  assert.equal(
    recordRatedResult(pending.ledger, play(pending.game, winMoves)).reason,
    "engine-unverified",
  );
});

test("source metadata alone cannot enroll an imported/copy game or change its identity or bot", () => {
  const { game, ledger } = completed();
  assert.equal(
    recordRatedResult(emptyRatingLedger(), game).reason,
    "missing-enrollment",
  );
  for (const change of [
    { id: "copied" },
    { botId: "stockfish" },
    { playerColor: "b" },
    { createdAt: DATE + 1 },
  ]) {
    assert.equal(
      recordRatedResult(ledger, { ...game, ...change }).reason,
      "unrated",
    );
    assert.equal(validateSavedGame({ ...game, ...change }).rating, undefined);
  }
  assert.equal(
    recordRatedResult(ledger, { ...game, mode: "analysis" }).reason,
    "unrated",
  );
  assert.ok(
    validateSavedGame({ ...game, mode: "analysis" }).rating,
    "review retains source context without allowing a new rating",
  );
  assert.equal(
    recordRatedResult(ledger, {
      ...game,
      rating: { ...game.rating, ticket: "copied-ticket" },
    }).reason,
    "missing-enrollment",
  );
});

test("resignation is a human loss after actual play; early resignation and fabricated bot resignation wins are excluded", () => {
  const initial = enroll();
  const current = markRatingEngine(
    play(initial.game, ["e2e4", "e7e5"]),
    "stockfish",
  );
  const loss = { ...current, result: { winner: "b", reason: "Resignation" } };
  assert.equal(recordRatedResult(initial.ledger, loss).entry.score, 0);
  assert.equal(
    recordRatedResult(initial.ledger, {
      ...current,
      result: { winner: "w", reason: "Resignation" },
    }).reason,
    "invalid-game",
  );
  const tooEarly = {
    ...markRatingEngine(initial.game, "stockfish"),
    result: { winner: "b", reason: "Resignation" },
  };
  assert.equal(
    recordRatedResult(initial.ledger, tooEarly).reason,
    "invalid-game",
  );
  assert.equal(
    recordRatedResult(initial.ledger, {
      ...current,
      result: { winner: null, reason: "Draw by agreement" },
    }).reason,
    "invalid-game",
  );
});

test("a real clock timeout can rate, but a claimed timeout with time remaining cannot", () => {
  const initial = enroll();
  const current = markRatingEngine(
    play(initial.game, ["e2e4", "e7e5"]),
    "stockfish",
  );
  const timedOut = advanceClock(current, 600_000);
  assert.equal(timedOut.result.reason, "Time expired");
  assert.equal(recordRatedResult(initial.ledger, timedOut).entry.score, 0);
  assert.equal(
    recordRatedResult(initial.ledger, {
      ...timedOut,
      clocks: { ...timedOut.clocks, w: 1 },
    }).reason,
    "invalid-game",
  );
  assert.equal(
    recordRatedResult(initial.ledger, {
      ...timedOut,
      result: { winner: "w", reason: "Time expired" },
    }).reason,
    "invalid-game",
  );
});

test("recording replays chess and rejects mismatching results, FEN and illegal moves", () => {
  const { game, ledger } = completed();
  for (const change of [
    { result: { winner: "b", reason: "Checkmate" } },
    { result: { winner: "w", reason: "Recorded result" } },
    { fen: START_FEN },
    { moves: [{ ...game.moves[0], to: "e5" }, ...game.moves.slice(1)] },
  ])
    assert.equal(
      recordRatedResult(ledger, { ...game, ...change }).reason,
      "invalid-game",
    );
  assert.equal(
    recordRatedResult(ledger, { ...game, result: null }).reason,
    "unfinished",
  );
});

test("ledger validation derives counters and Elo from bounded results instead of trusting tampered totals", () => {
  const valid = historyEntry("valid");
  const restored = sanitizeRatingLedger({
    version: 1,
    rating: 999999,
    totalRatedGames: Infinity,
    wins: 10000,
    history: [
      { ...valid, before: -99, after: 999999, delta: 999999, kFactor: 999 },
      valid,
      historyEntry("invalid-score", 900),
      historyEntry("invalid-bot", 1, { botId: "fake" }),
      historyEntry("invalid-opponent", 1, { opponentRating: 9999 }),
      historyEntry("invalid-time", 1, { finishedAt: -1 }),
      historyEntry("invalid-reason", 1, { reason: "Invented win" }),
      historyEntry("invalid-resignation", 1, { reason: "Resignation" }),
    ],
    pending: [],
  });
  assert.equal(restored.rating, 820);
  assert.equal(restored.wins, 1);
  assert.equal(restored.totalRatedGames, 1);
  assert.equal(restored.history[0].delta, 20);
  for (const raw of [
    null,
    [],
    true,
    5,
    "data",
    {},
    { version: 2, history: [] },
    { version: 1, history: null },
  ]) {
    assert.deepEqual(sanitizeRatingLedger(raw), emptyRatingLedger());
  }
});

test("unknown game eligibility is rejected rather than normalized into an eligible record", () => {
  const { game } = enroll();
  for (const change of [
    { version: 2 },
    { ticket: "" },
    { opponentRating: 3000 },
    { engine: "cloud" },
    { assistance: ["unrecognized"] },
    { assistance: "hint" },
    { createdAt: NaN },
    { playerColor: "x" },
  ]) {
    assert.equal(
      sanitizeGameRating({ ...game.rating, ...change }, game),
      undefined,
    );
    assert.equal(
      validateSavedGame({ ...game, rating: { ...game.rating, ...change } })
        .rating,
      undefined,
    );
  }
  assert.equal(sanitizeGameRating(null), undefined);
});

test("provisional games use K40, later games K20, and displayed estimates stay bounded", () => {
  const ledger = sanitizeRatingLedger({
    version: 1,
    history: Array.from({ length: 21 }, (_, i) => historyEntry(`game-${i}`)),
    pending: [],
  });
  assert.equal(ledger.history[19].kFactor, 40);
  assert.equal(ledger.history[20].kFactor, 20);
  assert.equal(ledger.provisional, false);
  assert.equal(ledger.totalRatedGames, 21);
  const high = sanitizeRatingLedger({
    version: 1,
    history: Array.from({ length: 5000 }, (_, i) =>
      historyEntry(`win-${i}`, 1, { botId: "stockfish", opponentRating: 3000 }),
    ),
  });
  const low = sanitizeRatingLedger({
    version: 1,
    history: Array.from({ length: 5000 }, (_, i) =>
      historyEntry(`loss-${i}`, 0, { botId: "sprout", opponentRating: 400 }),
    ),
  });
  assert.equal(high.rating, 3200);
  assert.equal(low.rating, 100);
});

test("history capacity retains every counted ID and refuses new enrollment instead of forgetting deduplication", () => {
  const full = sanitizeRatingLedger({
    version: 1,
    history: Array.from({ length: MAX_RATING_HISTORY }, (_, i) =>
      historyEntry(`id-${i}`),
    ),
  });
  const next = enroll("over-capacity", full);
  assert.equal(next.game.rating, undefined);
  assert.equal(next.ledger.history.length, MAX_RATING_HISTORY);
  assert.deepEqual(
    sanitizeRatingLedger({
      version: 1,
      history: Array(MAX_RATING_HISTORY + 1).fill(historyEntry("oversized")),
    }),
    emptyRatingLedger(),
  );
  assert.equal(
    recordRatedResult(full, { ...newSession(), id: "id-0" }).reason,
    "already-recorded",
  );
});

test("pending enrollments are bounded, deduplicated, and cannot overlap completed IDs", () => {
  let ledger = emptyRatingLedger();
  for (let i = 0; i < MAX_RATING_PENDING + 3; i++)
    ledger = enroll(`pending-${i}`, ledger).ledger;
  assert.equal(ledger.pending.length, MAX_RATING_PENDING);
  assert.equal(ledger.pending[0].gameId, "pending-3");
  const pending = ledger.pending[0];
  const validated = sanitizeRatingLedger({
    version: 1,
    history: [historyEntry(pending.gameId)],
    pending: [
      pending,
      { ...pending, gameId: "different" },
      { ...pending, gameId: "duplicate-ticket" },
    ],
  });
  assert.deepEqual(
    validated.pending.map((item) => item.gameId),
    ["different"],
  );
});

test("backup restore preserves old formats, merges unique outcomes and cannot count conflicting IDs twice", () => {
  const a = sanitizeRatingLedger({
    version: 1,
    history: [historyEntry("a", 1, { finishedAt: DATE + 20 })],
  });
  const backup = sanitizeRatingLedger({
    version: 1,
    history: [
      historyEntry("b", 0, { finishedAt: DATE + 10 }),
      historyEntry("a", 0, { finishedAt: DATE + 20 }),
    ],
  });
  assert.deepEqual(
    mergeRatingLedgers(a, undefined),
    a,
    "a version1 backup without ratings does not erase current progress",
  );
  assert.deepEqual(mergeRatingLedgers(a, { version: 999, rating: 5000 }), a);
  const merged = mergeRatingLedgers(a, JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(
    merged.history.map((entry) => entry.gameId),
    ["b", "a"],
  );
  assert.equal(
    merged.history[1].score,
    1,
    "current outcome wins a conflicting imported duplicate",
  );
  assert.equal(merged.totalRatedGames, 2);
  assert.equal(merged.wins, 1);
  assert.equal(merged.losses, 1);
  assert.deepEqual(
    mergeRatingLedgers(merged, backup),
    merged,
    "restoring the same backup is idempotent",
  );
  assert.deepEqual(mergeRatingLedgers(merged, merged), merged);
});

test("a valid in-progress enrollment can be backed up/restored alongside its game and then completed once", () => {
  const initial = enroll("restore-pending");
  const current = markRatingEngine(
    play(initial.game, ["e2e4", "e7e5"]),
    "stockfish",
  );
  const backup = JSON.parse(
    JSON.stringify({ version: 1, games: [current], ratings: initial.ledger }),
  );
  const restoredGame = validateSavedGame(backup.games[0]);
  const restoredLedger = mergeRatingLedgers(
    emptyRatingLedger(),
    backup.ratings,
  );
  assert.equal(
    recordRatedResult(restoredLedger, play(restoredGame, winMoves.slice(2)))
      .reason,
    "recorded",
  );
});

test("storage write failure is observable and cannot silently persist a changed estimate", () => {
  const before = emptyRatingLedger();
  writeStore("ratings", before);
  const { ledger, game } = completed();
  const updated = recordRatedResult(ledger, game).ledger;
  globalThis.localStorage.setItem = () => {
    throw new Error("Quota exhausted");
  };
  assert.equal(writeStore("ratings", updated), false);
  assert.deepEqual(sanitizeRatingLedger(readStore("ratings", null)), before);
});

test("a completed game paused during reload records its pending result once", () => {
  const { game, ledger } = completed("completed-before-reload");
  writeStore("ratings", ledger);
  writeStore("current", game);
  const loaded = validateSavedGame(readStore("current", null));
  const paused = { ...loaded, started: false };
  const result = recordRatedResult(
    sanitizeRatingLedger(readStore("ratings", null)),
    paused,
    DATE + 100,
  );
  assert.equal(result.reason, "recorded");
  assert.equal(result.entry.delta, 20);
  writeStore("ratings", result.ledger);
  const afterAnotherReload = recordRatedResult(
    sanitizeRatingLedger(readStore("ratings", null)),
    paused,
  );
  assert.equal(afterAnotherReload.reason, "already-recorded");
  assert.equal(afterAnotherReload.ledger.totalRatedGames, 1);
});

test("backup pending tickets cannot displace a current enrollment by using another game ID", () => {
  const { ledger } = enroll("current-pending");
  const conflicting = {
    ...emptyRatingLedger(),
    pending: [{ ...ledger.pending[0], gameId: "conflicting-backup" }],
  };
  const merged = mergeRatingLedgers(ledger, conflicting);
  assert.deepEqual(merged.pending, ledger.pending);
  assert.deepEqual(mergeRatingLedgers(merged, conflicting), merged);
});
