import test from "node:test";
import assert from "node:assert/strict";
import { applyMove, newSession } from "../src/lib/game.ts";
import {
  explorePosition,
  explorationFen,
  playExplorationMove,
} from "../src/lib/exploration.ts";

function game() {
  let g = newSession({ mode: "analysis" });
  for (const move of ["e2e4", "e7e5", "g1f3", "b8c6"])
    g = applyMove(g, move.slice(0, 2), move.slice(2));
  return g;
}
test("preview lines are legal, bounded, and cannot overwrite the recorded game", () => {
  const original = game(),
    snapshot = JSON.stringify(original);
  const preview = explorePosition(
    original,
    0,
    ["c7c5", "g1f3", "a1a8", "d7d6"],
    "line",
  );
  assert.equal(preview.line.startFen, original.moves[0].fen);
  assert.deepEqual(
    preview.line.moves.map((m) => m.san),
    ["c5", "Nf3"],
  );
  assert.equal(preview.playing, false, "A line opens paused so its starting position never races the controls");
  assert.equal(explorationFen(preview), original.moves[0].fen);
  assert.equal(JSON.stringify(original), snapshot);
});
test("trying another move branches only the disposable line and preserves review history", () => {
  const original = game();
  const preview = explorePosition(original, 0, ["c7c5", "g1f3"], "line");
  const alternative = playExplorationMove(preview, "e7", "e6");
  assert.deepEqual(
    alternative.line.moves.map((m) => m.san),
    ["e6"],
  );
  assert.equal(alternative.playing, false);
  assert.equal(original.moves.length, 4);
  assert.equal(preview.line.moves.length, 2);
  assert.equal(playExplorationMove(preview, "a1", "a8"), null);
});
test("retry reports a preferred move without claiming every alternative is wrong", () => {
  const preview = explorePosition(game(), -1, [], "retry", "d2d4");
  assert.match(
    playExplorationMove(preview, "d2", "d4").feedback,
    /preferred move/,
  );
  assert.match(playExplorationMove(preview, "e2", "e4").feedback, /Compare/);
  assert.equal(preview.line.moves.length, 0);
});
