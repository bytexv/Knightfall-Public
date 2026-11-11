import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { getBoardTransition, squarePoint } from "../src/lib/board-motion.ts";

function transition(fen, san) {
  const game = new Chess(fen);
  const before = game.fen();
  game.move(san);
  return {
    before,
    after: game.fen(),
    result: getBoardTransition(before, game.fen()),
  };
}
const initial = new Chess().fen();

test("a legal pawn double push preserves its identity", () => {
  const { result } = transition(initial, "e4");
  assert.deepEqual(result, {
    kind: "move",
    moves: [
      {
        from: "e2",
        to: "e4",
        before: { color: "w", type: "p" },
        after: { color: "w", type: "p" },
      },
    ],
    removed: [],
    added: [],
  });
});

test("normal captures move the attacker and separately remove the victim", () => {
  const game = new Chess();
  game.move("e4");
  game.move("d5");
  const { result } = transition(game.fen(), "exd5");
  assert.equal(result.moves[0].from, "e4");
  assert.equal(result.moves[0].to, "d5");
  assert.deepEqual(result.removed, [
    { square: "d5", piece: { color: "b", type: "p" } },
  ]);
});

test("en passant fades the pawn on the passed square, including on reverse replay", () => {
  const game = new Chess();
  for (const san of ["e4", "a6", "e5", "d5"]) game.move(san);
  const { before, after, result } = transition(game.fen(), "exd6");
  assert.deepEqual(result.removed, [
    { square: "d5", piece: { color: "b", type: "p" } },
  ]);
  const reverse = getBoardTransition(after, before);
  assert.equal(reverse.kind, "reverse");
  assert.deepEqual(
    reverse.moves.map(({ from, to }) => [from, to]),
    [["d6", "e5"]],
  );
  assert.deepEqual(reverse.added, result.removed);
});

for (const [color, san, king, rook] of [
  ["w", "O-O", ["e1", "g1"], ["h1", "f1"]],
  ["w", "O-O-O", ["e1", "c1"], ["a1", "d1"]],
  ["b", "O-O", ["e8", "g8"], ["h8", "f8"]],
  ["b", "O-O-O", ["e8", "c8"], ["a8", "d8"]],
])
  test(`${color} ${san} moves the king and rook together, in both directions`, () => {
    const { before, after, result } = transition(
      `r3k2r/8/8/8/8/8/8/R3K2R ${color} KQkq - 0 1`,
      san,
    );
    assert.deepEqual(
      result.moves.map(({ from, to }) => [from, to]),
      [king, rook],
    );
    assert.deepEqual(
      result.moves.map((m) => m.after.type),
      ["k", "r"],
    );
    assert.equal(result.removed.length, 0);
    const reverse = getBoardTransition(after, before);
    assert.equal(reverse.kind, "reverse");
    assert.deepEqual(
      reverse.moves.map(({ from, to }) => [from, to]),
      [king.toReversed(), rook.toReversed()],
    );
  });

for (const promotion of ["q", "r", "b", "n"])
  test(`promotion to ${promotion} carries both piece identities through reverse replay`, () => {
    const { before, after, result } = transition(
      "8/P7/8/8/8/6k1/8/6K1 w - - 0 1",
      `a8=${promotion.toUpperCase()}`,
    );
    assert.deepEqual(result.moves[0], {
      from: "a7",
      to: "a8",
      before: { color: "w", type: "p" },
      after: { color: "w", type: promotion },
    });
    const reverse = getBoardTransition(after, before);
    assert.equal(reverse.kind, "reverse");
    assert.deepEqual(reverse.moves[0], {
      from: "a8",
      to: "a7",
      before: { color: "w", type: promotion },
      after: { color: "w", type: "p" },
    });
  });

test("capture promotion animates the pawn and captured rook independently", () => {
  const { result } = transition("1r5k/P7/8/8/8/8/8/6K1 w - - 0 1", "axb8=Q");
  assert.equal(result.moves[0].after.type, "q");
  assert.deepEqual(result.removed, [
    { square: "b8", piece: { color: "b", type: "r" } },
  ]);
});

test("metadata-only changes do not invent movement", () => {
  assert.equal(
    getBoardTransition(initial, initial.replace("0 1", "15 20")).kind,
    "none",
  );
  const { before, after } = transition(initial, "Nf3");
  assert.equal(
    getBoardTransition(before, after.replace("1 1", "21 19")).kind,
    "move",
  );
});

test("unrelated positions, multi-ply jumps, invalid FEN and side-only changes cut immediately", () => {
  const game = new Chess();
  game.move("e4");
  game.move("e5");
  assert.equal(getBoardTransition(initial, game.fen()).kind, "replace");
  assert.equal(
    getBoardTransition(initial, "8/P7/8/8/8/6k1/8/6K1 w - - 0 1").kind,
    "replace",
  );
  assert.equal(getBoardTransition(initial, "broken FEN").kind, "replace");
  assert.equal(
    getBoardTransition(initial, initial.replace(" w ", " b ")).kind,
    "replace",
  );
});

test("logical square coordinates are symmetric under board rotation", () => {
  assert.deepEqual(squarePoint("a8", "w"), { x: 0, y: 0 });
  assert.deepEqual(squarePoint("h1", "w"), { x: 7, y: 7 });
  assert.deepEqual(squarePoint("h1", "b"), { x: 0, y: 0 });
  assert.deepEqual(squarePoint("e4", "w"), { x: 4, y: 4 });
  assert.deepEqual(squarePoint("e4", "b"), { x: 3, y: 3 });
});
