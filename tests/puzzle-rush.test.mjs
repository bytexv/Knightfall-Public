import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { puzzles } from '../src/data/puzzles.ts';
import { advanceRush, finishRush, playRushMove, playRushReply, rushCourse, rushElapsed, rushPuzzle, rushStamp, rushTimeLeft, sanitizeRushBests, startRush, tickRush } from '../src/lib/puzzle-rush.ts';

const mate1 = puzzles.find(p => p.id === 'lichess-00GRa');
const mate2 = puzzles.find(p => p.id === 'lichess-04noT');
const course = [mate2, mate1];
function wrongMove(state, customCourse = course) {
  const wanted = rushPuzzle(state, customCourse).solution[state.ply];
  return new Chess(state.fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')).find(uci => uci !== wanted);
}

test('progressive course includes every puzzle once in nondecreasing source rating', () => {
  assert.equal(rushCourse.length, puzzles.length);
  assert.equal(new Set(rushCourse.map(p => p.id)).size, puzzles.length);
  for (let i = 1; i < rushCourse.length; i++) assert.ok(rushCourse[i].rating >= rushCourse[i - 1].rating);
});

test('mode clocks use absolute deadlines and survival has no deadline', () => {
  assert.equal(startRush('three', 100).deadline, 180100);
  assert.equal(startRush('five', 100).deadline, 300100);
  const survival = startRush('survival', 100);
  assert.equal(survival.deadline, null);
  assert.equal(tickRush(survival, 10000000).phase, 'playing');
  assert.equal(rushTimeLeft(survival, 300), null);
  assert.equal(rushElapsed(survival, 300), 200);
});

test('a complete multi-ply line earns one point, only after its final solver move', () => {
  let state = startRush('three', 1000, 'run', course);
  state = playRushMove(state, mate2.solution[0], 2000, course);
  assert.equal(state.score, 0);
  assert.equal(state.phase, 'reply');
  assert.equal(state.ply, 1);
  const stamp = rushStamp(state, course);
  assert.equal(playRushMove(state, mate2.solution[1], 2100, course), state, 'user cannot make opponent reply');
  state = playRushReply(state, stamp, 2400, course);
  assert.equal(state.phase, 'playing');
  assert.equal(state.ply, 2);
  state = playRushMove(state, mate2.solution[2], 3000, course);
  assert.equal(state.score, 1);
  assert.equal(state.phase, 'solved');
  assert.equal(state.lives, 3);
  assert.equal(state.attempts[0].outcome, 'solved');
  assert.equal(new Chess(state.fen).isCheckmate(), true);
  assert.equal(playRushMove(state, mate2.solution[2], 3010, course), state, 'cannot score the same solution twice');
  state = advanceRush(state, 3700, rushStamp(state, course), course);
  assert.equal(state.index, 1);
  assert.equal(state.ply, 0);
  assert.equal(state.fen, mate1.fen);
});

test('illegal moves cost no life; one legal wrong move costs exactly one life', () => {
  let state = startRush('survival', 1000, 'run', course);
  assert.equal(playRushMove(state, 'a1a8', 1200, course), state);
  assert.equal(playRushMove(state, 'garbage', 1200, course), state);
  const wrong = wrongMove(state);
  state = playRushMove(state, wrong, 1500, course);
  assert.equal(state.phase, 'mistake');
  assert.equal(state.lives, 2);
  assert.equal(state.score, 0);
  assert.equal(state.fen, mate2.fen, 'wrong move does not corrupt the training position');
  assert.equal(state.attempts[0].attemptedMove, wrong);
  assert.equal(playRushMove(state, wrong, 1600, course), state, 'repeated click during feedback cannot remove another life');
  state = advanceRush(state, 2000, undefined, course);
  assert.equal(state.index, 1);
  assert.equal(state.lives, 2);
});

test('three misses finish the run without a duplicate unfinished entry', () => {
  const custom = rushCourse.slice(0, 5);
  let state = startRush('survival', 0, 'run', custom);
  for (let i = 0; i < 3; i++) {
    state = playRushMove(state, wrongMove(state, custom), 1000 + i * 100, custom);
    if (i < 2) state = advanceRush(state, 1050 + i * 100, undefined, custom);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.finishReason, 'lives');
  assert.equal(state.lives, 0);
  assert.equal(state.attempts.length, 3);
  assert.ok(state.attempts.every(a => a.outcome === 'missed'));
  assert.equal(advanceRush(state, 5000, undefined, custom), state);
});

test('hidden-tab time jumps and a move arriving at the deadline cannot add a point', () => {
  let state = startRush('three', 1000, 'run', [mate1]);
  state = playRushMove(state, mate1.solution[0], 181000, [mate1]);
  assert.equal(state.phase, 'finished');
  assert.equal(state.finishReason, 'time');
  assert.equal(state.score, 0);
  assert.equal(state.endedAt, 181000);
  assert.equal(rushTimeLeft(state, 999999), 0);
  assert.equal(rushElapsed(state, 999999), 180000);
  assert.equal(state.attempts[0].outcome, 'unfinished');
  assert.equal(tickRush(state, 999999, [mate1]), state);
});

test('the clock also expires during a queued reply or mistake feedback', () => {
  let replying = startRush('three', 0, 'run', course);
  replying = playRushMove(replying, mate2.solution[0], 179900, course);
  replying = playRushReply(replying, rushStamp(replying, course), 180500, course);
  assert.equal(replying.phase, 'finished');
  assert.equal(replying.score, 0);
  assert.equal(replying.ply, 1);
  let failed = startRush('three', 0, 'other', course);
  failed = playRushMove(failed, wrongMove(failed), 179900, course);
  failed = advanceRush(failed, 180100, undefined, course);
  assert.equal(failed.finishReason, 'time');
  assert.equal(failed.attempts.length, 1, 'failed puzzle is not duplicated as unfinished');
});

test('stale run, puzzle, and ply stamps cannot inject delayed moves', () => {
  let old = startRush('three', 0, 'old', course);
  old = playRushMove(old, mate2.solution[0], 100, course);
  const stale = rushStamp(old, course);
  let replacement = startRush('three', 200, 'new', course);
  replacement = playRushMove(replacement, mate2.solution[0], 300, course);
  assert.equal(playRushReply(replacement, stale, 400, course), replacement);
  assert.equal(playRushReply(replacement, { ...rushStamp(replacement, course), puzzleId: 'different' }, 400, course), replacement);
  assert.equal(playRushReply(replacement, { ...rushStamp(replacement, course), ply: 99 }, 400, course), replacement);
  const actual = rushStamp(replacement, course);
  const answered = playRushReply(replacement, actual, 400, course);
  assert.equal(playRushReply(answered, actual, 401, course), answered, 'same reply cannot apply twice');
});

test('clearing the full course finishes and keeps the final solved position', () => {
  let state = startRush('survival', 0, 'run', [mate1]);
  state = playRushMove(state, mate1.solution[0], 100, [mate1]);
  state = advanceRush(state, 800, undefined, [mate1]);
  assert.equal(state.phase, 'finished');
  assert.equal(state.finishReason, 'completed');
  assert.equal(state.score, 1);
  assert.equal(state.index, 0);
  assert.equal(state.attempts.length, 1);
});

test('manual finish freezes elapsed time and does not award an unfinished tactic', () => {
  let state = startRush('survival', 1000, 'run', course);
  state = finishRush(state, 'stopped', 3500, course);
  assert.equal(state.score, 0);
  assert.equal(rushElapsed(state, 999999), 2500);
  assert.equal(state.attempts[0].outcome, 'unfinished');
});

test('stored personal bests accept only bounded integer scores for known modes', () => {
  assert.deepEqual(sanitizeRushBests(null), { three: 0, five: 0, survival: 0 });
  assert.deepEqual(sanitizeRushBests({ three: -1, five: '30', survival: Infinity }), { three: 0, five: 0, survival: 0 });
  assert.deepEqual(sanitizeRushBests({ three: 4, five: 12.5, survival: rushCourse.length + 1 }), { three: 4, five: 0, survival: 0 });
});


test('promotion requires the chosen UCI piece and preserves it through the scoring line', () => {
  const promotion = puzzles.find(p => p.id === 'lichess-02wKw');
  const custom = [promotion];
  let state = startRush('survival', 0, 'promotion', custom);
  state = playRushMove(state, promotion.solution[0], 100, custom);
  state = playRushReply(state, rushStamp(state, custom), 500, custom);
  assert.equal(playRushMove(state, promotion.solution[2].slice(0, 4), 600, custom), state, 'missing promotion choice is not a legal move');
  state = playRushMove(state, promotion.solution[2], 700, custom);
  assert.equal(state.score, 1);
  assert.equal(new Chess(state.fen).get('g8').type, 'q');
});
