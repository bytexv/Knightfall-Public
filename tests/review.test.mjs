import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import {
  bookOpeningFor,
  evaluationSummary,
  formatEvaluation,
  moveClassifications,
  moveReference,
  reviewMove,
  summarizeReview,
} from "../src/lib/review.ts";
import { soundSacrifice } from "../src/lib/review-sacrifice.ts";
import { applyMove, newSession } from "../src/lib/game.ts";

const played = applyMove(newSession(), "e2", "e4").moves[0];
const evaluation = (score, extra = {}) => ({
  score,
  bestMove: "d2d4",
  depth: 12,
  lines: [],
  engine: "Test engine",
  ...extra,
});

test("mate zero is displayed as terminal checkmate with the correct winning side", () => {
  assert.equal(formatEvaluation(evaluation(10000, { mate: 0 })), "+M0");
  assert.equal(formatEvaluation(evaluation(-10000, { mate: 0 })), "−M0");
  assert.equal(
    evaluationSummary(evaluation(10000, { mate: 0 })),
    "White wins by checkmate",
  );
  assert.equal(
    evaluationSummary(evaluation(-10000, { mate: 0 })),
    "Black wins by checkmate",
  );
  assert.equal(formatEvaluation(evaluation(-10000, { mate: -3 })), "−M3");
  assert.equal(formatEvaluation(evaluation(56)), "+0.56");
  assert.equal(formatEvaluation(evaluation(-12)), "-0.12");
});

test("a continuing forced mate and terminal mate do not incur artificial evaluation loss", () => {
  const before = evaluation(10000, { mate: 4 });
  for (const mate of [2, 7, 0]) {
    const review = reviewMove(0, played, before, evaluation(10000, { mate }));
    assert.equal(review.loss, 0);
    assert.equal(review.label, "Excellent");
  }
  const losing = reviewMove(
    0,
    played,
    evaluation(-10000, { mate: -3 }),
    evaluation(-10000, { mate: -1 }),
  );
  assert.equal(losing.loss, 0);
});

test("missing a forced mate and allowing a new forced mate are identified", () => {
  const missed = reviewMove(
    0,
    played,
    evaluation(10000, { mate: 2 }),
    evaluation(500),
  );
  assert.ok(missed.loss >= 100);
  assert.match(missed.note, /forced mate was available/);
  const allowed = reviewMove(
    0,
    played,
    evaluation(-1400),
    evaluation(-10000, { mate: -3 }),
  );
  assert.ok(allowed.loss >= 300);
  assert.equal(allowed.label, "Blunder");
  assert.match(allowed.note, /allows a forced mate/);
});

test("White and Black evaluation losses use their own perspective", () => {
  const white = reviewMove(0, played, evaluation(50), evaluation(-100));
  assert.equal(white.loss, 150);
  assert.equal(white.label, "Mistake");
  const session = applyMove(applyMove(newSession(), "e2", "e4"), "e7", "e5");
  const black = reviewMove(
    1,
    session.moves[1],
    evaluation(-50),
    evaluation(100),
  );
  assert.equal(black.loss, 150);
  assert.equal(black.label, "Mistake");
  const improving = reviewMove(0, played, evaluation(50), evaluation(150));
  assert.equal(improving.loss, 0);
});

test("the preferred move is not penalized by shallow-search inconsistency", () => {
  const best = reviewMove(
    0,
    played,
    evaluation(200, { bestMove: "e2e4" }),
    evaluation(-200),
  );
  assert.equal(best.label, "Best");
  assert.equal(best.loss, 0);
});

test("custom-FEN move numbering uses the actual starting fullmove and color", () => {
  assert.equal(
    moveReference({ before: "8/8/8/8/8/8/8/8 b - - 0 37", color: "b" }, 0),
    "37…",
  );
  assert.equal(
    moveReference({ before: "8/8/8/8/8/8/8/8 w - - 0 38", color: "w" }, 1),
    "38.",
  );
});

const fixtures = JSON.parse(
  readFileSync(
    new URL("./fixtures/review-stockfish.json", import.meta.url),
    "utf8",
  ),
).fixtures;
const fixture = (id) => fixtures.find((item) => item.id === id);
const record = (fen, uci) =>
  applyMove(
    newSession({ startFen: fen }),
    uci.slice(0, 2),
    uci.slice(2, 4),
    uci[4],
  ).moves[0];
const nativeEvaluation = (score, extra = {}) =>
  evaluation(score, { engine: "Stockfish 17.1 Lite", depth: 18, ...extra });

test("all ten public classifications have distinct meaning and stable names", () => {
  assert.deepEqual(moveClassifications, [
    "Brilliant",
    "Great",
    "Best",
    "Excellent",
    "Good",
    "Book",
    "Inaccuracy",
    "Mistake",
    "Miss",
    "Blunder",
  ]);
  const labels = [0, 25, 70, 150, 250].map(
    (loss) =>
      reviewMove(0, played, nativeEvaluation(0), nativeEvaluation(-loss)).label,
  );
  assert.deepEqual(labels, [
    "Excellent",
    "Good",
    "Inaccuracy",
    "Mistake",
    "Blunder",
  ]);
});

test("deep recorded searches recognize sound queen, rook and bishop sacrifices for both colors", () => {
  for (const id of ["lichess-05Kk4", "lichess-0815n", "lichess-09qMn"]) {
    const f = fixture(id),
      move = record(f.fen, f.move);
    const result = reviewMove(0, move, f.before, f.after);
    assert.equal(result.label, "Brilliant", id);
    assert.equal(result.confidence, "strong");
    assert.equal(result.critical, true);
    assert.equal(result.loss, 0);
    assert.equal(result.playedSAN, move.san);
    assert.equal(result.bestSAN, move.san);
    assert.match(result.reason, /sound material sacrifice/);
    assert.ok(soundSacrifice(move, f.after).materialLoss >= 200);
  }
});

test("the sound exchange sacrifice below the material threshold earns Great through uniqueness", () => {
  const f = fixture("lichess-0Av17"),
    move = record(f.fen, f.move);
  assert.equal(soundSacrifice(move, f.after), null);
  const reviewed = reviewMove(0, move, f.before, f.after);
  assert.equal(reviewed.label, "Great");
  assert.equal(reviewed.bestSAN, "Rxf8+");
  assert.match(reviewed.reason, /uniquely strong/i);
});

test("Great uses mover-relative MultiPV scores for White and Black", () => {
  const white = reviewMove(
    0,
    played,
    nativeEvaluation(200, {
      bestMove: "e2e4",
      lines: [
        { multipv: 1, score: 200, depth: 18, pv: ["e2e4"] },
        { multipv: 2, score: 0, depth: 18, pv: ["d2d4"] },
      ],
    }),
    nativeEvaluation(190),
  );
  assert.equal(white.label, "Great");
  const blackSession = applyMove(
    applyMove(newSession(), "e2", "e4"),
    "e7",
    "e5",
  );
  const black = reviewMove(
    1,
    blackSession.moves[1],
    nativeEvaluation(-200, {
      bestMove: "e7e5",
      lines: [
        { multipv: 1, score: -200, depth: 18, pv: ["e7e5"] },
        { multipv: 2, score: 0, depth: 18, pv: ["c7c5"] },
      ],
    }),
    nativeEvaluation(-190),
  );
  assert.equal(black.label, "Great");
  assert.equal(black.color, "b");
});

test("closely matched winning alternatives, missing candidates and stale depths do not earn Great", () => {
  for (const lines of [
    [],
    [{ multipv: 1, score: 300, depth: 18, pv: ["e2e4"] }],
    [
      { multipv: 1, score: 300, depth: 18, pv: ["e2e4"] },
      { multipv: 2, score: 290, depth: 18, pv: ["d2d4"] },
    ],
    [
      { multipv: 1, score: 300, depth: 18, pv: ["e2e4"] },
      { multipv: 2, score: 0, depth: 12, pv: ["d2d4"] },
    ],
    [
      { multipv: 1, score: 900, depth: 18, pv: ["e2e4"] },
      { multipv: 2, score: 600, depth: 18, pv: ["d2d4"] },
    ],
  ]) {
    const result = reviewMove(
      0,
      played,
      nativeEvaluation(300, { bestMove: "e2e4", lines }),
      nativeEvaluation(300),
    );
    assert.equal(result.label, "Best");
  }
});

test("shallow searches and the local fallback never award Brilliant or Great", () => {
  const f = fixture("lichess-05Kk4"),
    move = record(f.fen, f.move);
  for (const patch of [{ depth: 9 }, { engine: "Knightfall Lite" }]) {
    const result = reviewMove(
      0,
      move,
      { ...f.before, ...patch },
      { ...f.after, ...patch },
    );
    assert.equal(result.label, "Best");
    assert.equal(result.confidence, "limited");
    assert.match(result.reason, /cautiously/);
  }
  assert.equal(
    reviewMove(0, move, { ...f.before, lines: [] }, f.after).label,
    "Best",
  );
});

test("equal-value queen trades, unsound gifts, short PVs and illegal PVs are not sacrifices", () => {
  const fen = "8/8/4k3/3q4/8/8/3Q4/6K1 w - - 0 1";
  const move = record(fen, "d2d5");
  const trade = nativeEvaluation(0, {
    bestMove: "e6d5",
    lines: [
      { multipv: 1, score: 0, depth: 18, pv: ["e6d5", "g1f2", "d5e5", "f2e3"] },
    ],
  });
  assert.equal(soundSacrifice(move, trade), null);
  const f = fixture("lichess-09qMn"),
    sacrifice = record(f.fen, f.move);
  assert.equal(soundSacrifice(sacrifice, { ...f.after, score: -300 }), null);
  assert.equal(
    soundSacrifice(sacrifice, {
      ...f.after,
      lines: [{ ...f.after.lines[0], pv: f.after.lines[0].pv.slice(0, 1) }],
    }),
    null,
  );
  assert.equal(
    soundSacrifice(sacrifice, {
      ...f.after,
      lines: [{ ...f.after.lines[0], pv: [f.after.bestMove, "a1a8"] }],
    }),
    null,
  );
});

test("a forced only-legal queen sacrifice is Best and excluded from performance evidence", () => {
  const fen = "8/8/8/8/8/4k3/5nPP/5QRK w - - 0 1",
    move = record(fen, "f1f2");
  assert.equal(new Chess(fen).moves().length, 1);
  const before = nativeEvaluation(500, {
    bestMove: "f1f2",
    lines: [{ multipv: 1, score: 500, depth: 18, pv: ["f1f2", "e3f2"] }],
  });
  const after = nativeEvaluation(500, {
    bestMove: "e3f2",
    lines: [
      {
        multipv: 1,
        score: 500,
        depth: 18,
        pv: ["e3f2", "h2h3", "f2e3", "h1h2"],
      },
    ],
  });
  const reviewed = reviewMove(0, move, before, after);
  assert.equal(reviewed.label, "Best");
  assert.equal(reviewed.forced, true);
  assert.equal(soundSacrifice(move, after), null);
  const summary = summarizeReview(
    Array.from({ length: 20 }, (_, index) => ({ ...reviewed, index })),
    { opponentElo: 1200, playerColor: "w" },
  );
  assert.equal(summary.w.evaluatedMoves, 0);
  assert.equal(summary.w.performanceElo, null);
});

test("Miss distinguishes a lost forced mate or deep winning advantage from an ordinary mistake", () => {
  const missedMate = reviewMove(
    0,
    played,
    nativeEvaluation(10000, { mate: 3 }),
    nativeEvaluation(500),
  );
  assert.equal(missedMate.label, "Miss");
  assert.match(missedMate.reason, /forced mate/);
  const missedWin = reviewMove(
    0,
    played,
    nativeEvaluation(350),
    nativeEvaluation(20),
  );
  assert.equal(missedWin.label, "Miss");
  assert.equal(missedWin.critical, true);
  const shallow = reviewMove(
    0,
    played,
    nativeEvaluation(350, { depth: 7 }),
    nativeEvaluation(20, { depth: 7 }),
  );
  assert.equal(shallow.label, "Blunder");
  const blackGame = applyMove(applyMove(newSession(), "e2", "e4"), "e7", "e5");
  assert.equal(
    reviewMove(
      1,
      blackGame.moves[1],
      nativeEvaluation(-350, { bestMove: "c7c5" }),
      nativeEvaluation(-20),
    ).label,
    "Miss",
  );
});

test("Book requires an actual known prefix from the normal starting position", () => {
  let game = newSession();
  for (const [from, to] of [
    ["e2", "e4"],
    ["e7", "e5"],
    ["g1", "f3"],
    ["g8", "f6"],
  ])
    game = applyMove(game, from, to);
  const context = { startFen: game.startFen, moves: game.moves };
  assert.ok(bookOpeningFor(context, 3));
  const move = game.moves[3];
  assert.equal(
    reviewMove(
      3,
      move,
      nativeEvaluation(0, { bestMove: "g8f6" }),
      nativeEvaluation(0),
      context,
    ).label,
    "Book",
  );
  assert.equal(
    bookOpeningFor({ ...context, startFen: game.moves[0].fen }, 3),
    null,
  );
  assert.equal(
    reviewMove(0, played, nativeEvaluation(0), nativeEvaluation(0)).label,
    "Excellent",
  );
  assert.equal(
    reviewMove(0, played, nativeEvaluation(0), nativeEvaluation(0), {
      ...context,
      moves: [game.moves[1]],
    }).label,
    "Excellent",
  );
  const deviation = applyMove(newSession(), "a2", "a3");
  assert.equal(
    bookOpeningFor({ startFen: deviation.startFen, moves: deviation.moves }, 0),
    null,
  );
});

test("meme queen-loss examples are not mislabeled as Book", () => {
  let game = newSession();
  const chess = new Chess();
  for (const san of ["e4", "e5", "Qh5", "Nc6", "Qxe5+"]) {
    const move = chess.move(san);
    game = applyMove(game, move.from, move.to, move.promotion);
  }
  const context = { startFen: game.startFen, moves: game.moves };
  assert.equal(bookOpeningFor(context, 4), null);
  const reviewed = reviewMove(
    4,
    game.moves[4],
    nativeEvaluation(0, { bestMove: "h5f3" }),
    nativeEvaluation(-800),
    context,
  );
  assert.equal(reviewed.label, "Blunder");
});

test("SAN and PV details preserve legal prefixes without inventing moves", () => {
  const result = reviewMove(
    0,
    played,
    nativeEvaluation(0, {
      bestMove: "e2e4",
      lines: [
        {
          multipv: 1,
          score: 0,
          depth: 18,
          pv: ["e2e4", "e7e5", "g1f3", "a8a1"],
        },
      ],
    }),
    nativeEvaluation(5),
  );
  assert.deepEqual(result.pv, ["e2e4", "e7e5", "g1f3"]);
  assert.deepEqual(result.pvSAN, ["e4", "e5", "Nf3"]);
  assert.equal(result.bestSAN, "e4");
  assert.equal(result.playedSAN, "e4");
  assert.deepEqual(result.before, {
    score: 0,
    depth: 18,
    engine: "Stockfish 17.1 Lite",
  });
  assert.equal(result.after.score, 5);
  const invalid = reviewMove(
    0,
    played,
    nativeEvaluation(0, { bestMove: "a1a8" }),
    nativeEvaluation(0),
  );
  assert.equal(invalid.bestSAN, "");
  assert.deepEqual(invalid.pv, []);
});

function sample(count, color = "w", loss = 20) {
  const reviewed = reviewMove(
    0,
    played,
    nativeEvaluation(0),
    nativeEvaluation(-loss),
  );
  return Array.from({ length: count }, (_, index) => ({
    ...reviewed,
    index,
    color,
  }));
}
test("summaries separate colors, expose all category counts and bound training quality", () => {
  const reviews = [...sample(10, "w", 0), ...sample(9, "b", 200)];
  const summary = summarizeReview(reviews);
  assert.equal(summary.reviewedPlies, 19);
  assert.equal(summary.w.moves, 10);
  assert.equal(summary.b.moves, 9);
  assert.equal(summary.w.quality, 100);
  assert.ok(summary.b.quality < 40);
  assert.equal(summary.w.counts.Excellent, 10);
  assert.equal(summary.w.counts.Brilliant, 0);
  assert.equal(summary.w.performance.band, "Very precise");
  assert.equal(summary.b.performance.band, "Developing");
  assert.equal(summary.w.performanceElo, null);
  assert.equal(summary.b.performanceElo, null);
  assert.equal(summarizeReview([]).quality, null);
});

test("performance needs enough independent reliable moves, and an Elo range needs known opponent context", () => {
  assert.equal(summarizeReview(sample(7)).w.performance, null);
  assert.ok(summarizeReview(sample(8)).w.performance);
  assert.equal(
    summarizeReview(sample(11), { opponentElo: 1200, playerColor: "w" }).w
      .performanceElo,
    null,
  );
  const full = summarizeReview(sample(12), {
    opponentElo: 1200,
    playerColor: "w",
  });
  assert.ok(full.w.performanceElo);
  assert.equal(full.w.performanceElo.sampleSize, 12);
  assert.equal(
    full.w.performanceElo.range[1] - full.w.performanceElo.range[0],
    600,
  );
  assert.match(full.w.performanceElo.basis, /uncalibrated/);
  assert.equal(full.b.performanceElo, null);
  for (const patch of [
    { label: "Book" },
    { forced: true },
    { confidence: "limited" },
    {
      before: {
        score: 10000,
        mate: 4,
        depth: 18,
        engine: "Stockfish 17.1 Lite",
      },
    },
  ]) {
    const skipped = summarizeReview(
      sample(20).map((move) => ({ ...move, ...patch })),
      { opponentElo: 1200, playerColor: "w" },
    );
    assert.equal(skipped.w.evaluatedMoves, 0);
    assert.equal(skipped.w.performanceElo, null);
  }
  for (const opponentElo of [undefined, NaN, Infinity, -1, 5000])
    assert.equal(
      summarizeReview(sample(20), { opponentElo, playerColor: "w" }).w
        .performanceElo,
      null,
    );
  assert.equal(
    summarizeReview(sample(20), { opponentElo: 1200, playerColor: "b" }).w
      .performanceElo,
    null,
  );
});

test("poor play against the strongest bot cannot produce an expert performance estimate", () => {
  const poor = summarizeReview(sample(15, "w", 320), {
    opponentElo: 3000,
    playerColor: "w",
  });
  assert.equal(poor.w.quality, 20);
  assert.equal(poor.w.performanceElo.estimate, 650);
  assert.deepEqual(poor.w.performanceElo.range, [350, 950]);
  const strong = summarizeReview(sample(15, "w", 20), {
    opponentElo: 1200,
    playerColor: "w",
  });
  assert.equal(strong.w.performanceElo.estimate, 1375);
});

test("moves in already hopeless or overwhelming positions cannot inflate performance samples", () => {
  for (const color of ["w", "b"]) {
    const direction = color === "w" ? 1 : -1;
    for (const score of [-500, -900, 1000, 1400]) {
      const moves = sample(20, color, 0).map((move) => ({
        ...move,
        before: { ...move.before, score: score * direction },
      }));
      const result = summarizeReview(moves, {
        opponentElo: 3000,
        playerColor: color,
      })[color];
      assert.equal(result.evaluatedMoves, 0);
      assert.equal(result.performanceElo, null);
      assert.equal(result.counts.Excellent, 20);
    }
    const stillInformative = sample(12, color, 0).map((move) => ({
      ...move,
      before: { ...move.before, score: -499 * direction },
    }));
    assert.equal(summarizeReview(stillInformative)[color].evaluatedMoves, 12);
  }
});

test('performance Elo is available symmetrically only with enough independent decisions', async()=>{
 const {estimatePerformanceElo}=await import('../src/lib/review.ts');
 const summary=summarizeReview([...sample(12,'w',20),...sample(12,'b',120)]);
 const white=estimatePerformanceElo(summary.w),black=estimatePerformanceElo(summary.b);
 assert.ok(white && black);assert.ok(white.estimate>black.estimate);
 assert.equal(estimatePerformanceElo(summarizeReview(sample(11)).w),null);
 assert.equal(estimatePerformanceElo(summarizeReview(sample(15).map(m=>({...m,label:'Book'}))).w),null);
 assert.ok(white.range[0]>=100 && white.range[1]<=3200);
});
test('phase summaries handle early imported endgames and never count a move twice', async()=>{
 const {summarizeGamePhases}=await import('../src/lib/review.ts');
 const start=new Chess().fen();
 const moves=[{before:start},{before:start.replace('0 1','0 11')},{before:'7k/8/8/8/8/8/P7/7K w - - 0 12'},{before:start.replace('0 1','0 13')}];
 const phases=summarizeGamePhases(sample(4),moves);
 assert.deepEqual(phases.map(p=>p.summary.reviewedPlies),[1,1,2]);
 assert.equal(phases.reduce((n,p)=>n+p.summary.w.moves+p.summary.b.moves,0),4);
 const imported=summarizeGamePhases(sample(1),[{before:'7k/8/8/8/8/8/P7/7K w - - 0 1'}]);
 assert.deepEqual(imported.map(p=>p.summary.reviewedPlies),[0,0,1]);
});
