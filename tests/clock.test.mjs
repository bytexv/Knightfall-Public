import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceClock, canSideMate, isTimedLocal, timeoutResult } from '../src/lib/clock.ts';
import { applyMove, newSession, undoMoves } from '../src/lib/game.ts';

function timed(options = {}) {
  return newSession({ mode: 'local', started: true, time: { base: 60, increment: 0 }, clocks: { w: 60_000, b: 60_000 }, ...options });
}

test('only started, unfinished, timed local and bot games tick', () => {
  for (const mode of ['local', 'bot']) assert.equal(isTimedLocal(timed({ mode })), true);
  for (const mode of ['analysis', 'gambit', 'puzzle', 'lan']) {
    const game = timed({ mode });
    assert.equal(isTimedLocal(game), false);
    assert.equal(advanceClock(game, 1000), game);
  }
  for (const options of [
    { started: false }, { result: { winner: 'w', reason: 'Checkmate' } },
    { time: { base: 0, increment: 5 } }, { time: { base: -1, increment: 0 } }, { time: { base: Infinity, increment: 0 } },
  ]) {
    const game = timed(options);
    assert.equal(isTimedLocal(game), false);
    assert.equal(advanceClock(game, 1000), game);
  }
});

test('elapsed milliseconds debit only the moving side without mutating the game', () => {
  const game = timed();
  const next = advanceClock(game, 125.75);
  assert.notEqual(next, game);
  assert.notEqual(next.clocks, game.clocks);
  assert.equal(next.clocks.w, 59_874.25);
  assert.equal(next.clocks.b, 60_000);
  assert.equal(game.clocks.w, 60_000);
  assert.equal(next.moves, game.moves);
  const afterMove = applyMove(next, 'e2', 'e4');
  const afterBlackTime = advanceClock(afterMove, 40.25);
  assert.equal(afterBlackTime.clocks.w, 59_874.25);
  assert.equal(afterBlackTime.clocks.b, 59_959.75);
});

test('invalid elapsed values cannot charge time or rewind a clock', () => {
  const game = timed();
  for (const elapsed of [-1, NaN, Infinity, -Infinity]) assert.equal(advanceClock(game, elapsed), game);
  assert.equal(advanceClock(game, 0), game);
  const broken = timed({ fen: 'invalid fen' });
  assert.equal(advanceClock(broken, 100), broken);
});

test('time expires at exactly zero, clamps long delays, and stops future ticking', () => {
  const game = timed({ clocks: { w: 100, b: 50_000 } });
  const exact = advanceClock(game, 100);
  assert.equal(exact.clocks.w, 0);
  assert.deepEqual(exact.result, { winner: 'b', reason: 'Time expired' });
  assert.equal(advanceClock(exact, 10_000), exact);
  const delayed = advanceClock(game, 40_000);
  assert.equal(delayed.clocks.w, 0);
  assert.equal(delayed.clocks.b, 50_000);
  assert.deepEqual(delayed.result, exact.result);
  const alreadyZero = advanceClock(timed({ clocks: { w: 0, b: 100 } }), 0);
  assert.equal(alreadyZero.result.winner, 'b');
});

test('a bare king cannot win on time against a rook', () => {
  const fen = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
  assert.equal(canSideMate(fen, 'b'), false);
  assert.equal(canSideMate(fen, 'w'), true);
  assert.deepEqual(timeoutResult(fen, 'w'), { winner: null, reason: 'Time expired · insufficient mating material' });
  assert.deepEqual(timeoutResult(fen, 'b'), { winner: 'w', reason: 'Time expired' });
  const expired = advanceClock(timed({ startFen: fen, fen, clocks: { w: 5, b: 1000 } }), 6);
  assert.equal(expired.result.winner, null);
});

test('timeout material matches the LAN treatment of minor pieces and opposing material', () => {
  assert.equal(canSideMate('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w'), false);
  assert.equal(canSideMate('4k3/8/8/8/8/8/8/2N1K3 w - - 0 1', 'w'), false);
  assert.equal(canSideMate('r3k3/8/8/8/8/8/8/2N1K3 w - - 0 1', 'w'), true);
  assert.equal(canSideMate('4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1', 'w'), true, 'Two knights can mate with cooperation even though they cannot force mate');
  assert.equal(canSideMate('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'b'), false);
});

test('settling before a move charges each side its actual fraction of a timer interval', () => {
  const start = timed({ clocks: { w: 1000, b: 1000 } });
  const settledWhite = advanceClock(start, 150); // Player moves at t=150, before the t=200 display tick.
  const blackToMove = applyMove(settledWhite, 'e2', 'e4');
  const displayTick = advanceClock(blackToMove, 50);
  assert.deepEqual(displayTick.clocks, { w: 850, b: 950 });
  assert.equal(displayTick.clocks.w + displayTick.clocks.b, 1800);
});

test('increment is applied by the move exactly once, after the clock is settled', () => {
  const game = timed({ time: { base: 60, increment: 2 }, clocks: { w: 10_000, b: 10_000 } });
  const beforeMove = advanceClock(game, 375);
  const afterMove = applyMove(beforeMove, 'e2', 'e4');
  assert.equal(afterMove.clocks.w, 11_625);
  assert.equal(advanceClock(afterMove, 200).clocks.w, 11_625);
  const flagged = advanceClock(timed({ clocks: { w: 10, b: 1000 }, time: { base: 60, increment: 2 } }), 11);
  assert.equal(applyMove(flagged, 'e2', 'e4'), null, 'A move cannot rescue a clock that expired before the move');
});

test('settling before a takeback preserves spent time and restarts the correct side', () => {
  let game = applyMove(advanceClock(timed(), 100), 'e2', 'e4');
  game = advanceClock(game, 80);
  const undone = undoMoves(game, 1);
  assert.deepEqual(undone.clocks, { w: 59_900, b: 59_920 });
  const next = advanceClock(undone, 25);
  assert.deepEqual(next.clocks, { w: 59_875, b: 59_920 });
});
