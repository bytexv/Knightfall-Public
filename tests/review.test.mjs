import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluationSummary, formatEvaluation, moveReference, reviewMove } from '../src/lib/review.ts';
import { applyMove, newSession } from '../src/lib/game.ts';

const played = applyMove(newSession(), 'e2', 'e4').moves[0];
const evaluation = (score, extra = {}) => ({ score, bestMove: 'd2d4', depth: 12, lines: [], engine: 'Test engine', ...extra });

test('mate zero is displayed as terminal checkmate with the correct winning side', () => {
  assert.equal(formatEvaluation(evaluation(10000, { mate: 0 })), '+M0');
  assert.equal(formatEvaluation(evaluation(-10000, { mate: 0 })), '−M0');
  assert.equal(evaluationSummary(evaluation(10000, { mate: 0 })), 'White wins by checkmate');
  assert.equal(evaluationSummary(evaluation(-10000, { mate: 0 })), 'Black wins by checkmate');
  assert.equal(formatEvaluation(evaluation(-10000, { mate: -3 })), '−M3');
  assert.equal(formatEvaluation(evaluation(56)), '+0.56');
  assert.equal(formatEvaluation(evaluation(-12)), '-0.12');
});

test('a continuing forced mate and terminal mate do not incur artificial evaluation loss', () => {
  const before = evaluation(10000, { mate: 4 });
  for (const mate of [2, 7, 0]) {
    const review = reviewMove(0, played, before, evaluation(10000, { mate }));
    assert.equal(review.loss, 0);
    assert.equal(review.label, 'Good');
  }
  const losing = reviewMove(0, played, evaluation(-10000, { mate: -3 }), evaluation(-10000, { mate: -1 }));
  assert.equal(losing.loss, 0);
});

test('missing a forced mate and allowing a new forced mate are identified', () => {
  const missed = reviewMove(0, played, evaluation(10000, { mate: 2 }), evaluation(500));
  assert.ok(missed.loss >= 100);
  assert.match(missed.note, /forced mate was available/);
  const allowed = reviewMove(0, played, evaluation(-1400), evaluation(-10000, { mate: -3 }));
  assert.ok(allowed.loss >= 300);
  assert.equal(allowed.label, 'Blunder');
  assert.match(allowed.note, /allows a forced mate/);
});

test('White and Black evaluation losses use their own perspective', () => {
  const white = reviewMove(0, played, evaluation(50), evaluation(-100));
  assert.equal(white.loss, 150);
  assert.equal(white.label, 'Mistake');
  const session = applyMove(applyMove(newSession(), 'e2', 'e4'), 'e7', 'e5');
  const black = reviewMove(1, session.moves[1], evaluation(-50), evaluation(100));
  assert.equal(black.loss, 150);
  assert.equal(black.label, 'Mistake');
  const improving = reviewMove(0, played, evaluation(50), evaluation(150));
  assert.equal(improving.loss, 0);
});

test('the preferred move is not penalized by shallow-search inconsistency', () => {
  const best = reviewMove(0, played, evaluation(200, { bestMove: 'e2e4' }), evaluation(-200));
  assert.equal(best.label, 'Best');
  assert.equal(best.loss, 0);
});

test('custom-FEN move numbering uses the actual starting fullmove and color', () => {
  assert.equal(moveReference({ before: '8/8/8/8/8/8/8/8 b - - 0 37', color: 'b' }, 0), '37…');
  assert.equal(moveReference({ before: '8/8/8/8/8/8/8/8 w - - 0 38', color: 'w' }, 1), '38.');
});
