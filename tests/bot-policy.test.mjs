import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { chooseBotMove, seededBotRandom } from '../src/lib/bot-policy.ts';

const start = new Chess().fen();
function play(fen, uci) {
  assert.ok(uci);
  const board = new Chess(fen);
  board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return board;
}
const sequence = (...values) => { let index = 0; return () => values[index++ % values.length]; };

test('advanced bot policies preserve exactly the engine move and reject illegal engine output', () => {
  for (const id of ['sage', 'rook', 'nova', 'stockfish', 'constructor', 'future-bot']) {
    assert.equal(chooseBotMove(start, id, { bestMove: 'e2e4' }, () => 0.99), 'e2e4');
    assert.equal(chooseBotMove(start, id, { bestMove: 'e2e5' }), null);
  }
});

test('Sprout and Scout can use the engine move or choose legal weaker alternatives', () => {
  for (const id of ['sprout', 'scout']) {
    assert.equal(chooseBotMove(start, id, { bestMove: 'e2e4' }, () => 0), 'e2e4');
    const choices = new Set();
    const random = seededBotRandom(913);
    for (let i = 0; i < 48; i++) {
      const move = chooseBotMove(start, id, { bestMove: 'e2e4' }, random);
      play(start, move);
      choices.add(move);
    }
    assert.ok(choices.size >= 5, `${id} should show meaningful move variety`);
    assert.ok(choices.has('e2e4'));
  }
});

test('even beginner play answers checks legally and cannot expose its own king', () => {
  const checked = '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1';
  const random = seededBotRandom(27);
  for (let i = 0; i < 30; i++) {
    const move = chooseBotMove(checked, i % 2 ? 'sprout' : 'scout', { bestMove: 'e1e2' }, random);
    const board = play(checked, move);
    const whiteKing = board.board().flat().find(piece => piece?.color === 'w' && piece.type === 'k');
    assert.equal(board.isAttacked(whiteKing.square, 'b'), false);
  }
});

test('both beginner policies recognize mate in one for either color', () => {
  for (const fen of ['7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', '7K/5k2/6q1/8/8/8/8/8 b - - 0 1']) {
    for (const id of ['sprout', 'scout']) {
      const move = chooseBotMove(fen, id, { bestMove: null }, () => 0.99);
      assert.equal(play(fen, move).isCheckmate(), true);
    }
  }
});

test('one-ply ideas spot a hanging queen from both sides without sign inversion', () => {
  assert.equal(chooseBotMove('3q2k1/8/8/8/8/8/8/3R2K1 w - - 0 1', 'sprout', { bestMove: 'd1d8' }, sequence(0.9, 0)), 'd1d8');
  assert.equal(chooseBotMove('3r2k1/8/8/8/8/8/8/3Q2K1 b - - 0 1', 'scout', { bestMove: 'd8d1' }, sequence(0.9, 0)), 'd8d1');
});

test('promotions keep their UCI suffix and terminal or invalid positions produce no move', () => {
  const fen = '8/1P6/8/8/8/4K3/7k/8 w - - 0 1';
  const move = chooseBotMove(fen, 'scout', { bestMove: 'b7b8q' }, sequence(0.9, 0));
  assert.match(move, /^b7b8[qrbn]$/);
  play(fen, move);
  assert.equal(chooseBotMove('7k/5KQ1/8/8/8/8/8/8 b - - 0 1', 'sprout', { bestMove: null }), null);
  assert.equal(chooseBotMove('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'sprout', { bestMove: 'e1e2' }), null);
  assert.equal(chooseBotMove('invalid fen', 'sprout', { bestMove: null }), null);
});

test('injected random seeds are reproducible and out-of-range samples stay safe', () => {
  const a = seededBotRandom(1234), b = seededBotRandom(1234);
  assert.deepEqual(Array.from({ length: 20 }, a), Array.from({ length: 20 }, b));
  for (const value of [-3, 1, 12, NaN, Infinity]) {
    const move = chooseBotMove(start, 'sprout', { bestMove: 'e2e4' }, () => value);
    play(start, move);
  }
});
