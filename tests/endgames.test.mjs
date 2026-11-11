import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { endgames, endgameVerification } from '../src/data/endgames.ts';

const drill = id => endgames.find(item => item.id === id);

test('endgame school contains varied, legal, nonterminal positions with verified outcomes', () => {
  assert.equal(endgames.length, 15);
  assert.equal(new Set(endgames.map(item => item.id)).size, endgames.length);
  assert.equal(new Set(endgames.map(item => item.fen)).size, endgames.length);
  assert.equal(new Set(endgames.map(item => item.category)).size, 3);
  assert.equal(endgames.filter(item => item.objective === 'draw').length, 4);
  for (const item of endgames) {
    const game = new Chess(item.fen);
    assert.equal(game.isGameOver(), false, `${item.id}: drill must be playable`);
    assert.equal(game.turn(), item.playerColor, `${item.id}: learner should move first`);
    assert.ok(game.board().flat().filter(Boolean).length <= 7, `${item.id}: within the verified tablebase material limit`);
    const opponent = new Chess(item.fen.replace(/ [wb] /, game.turn() === 'w' ? ' b ' : ' w '));
    assert.equal(opponent.isCheck(), false, `${item.id}: the side that just moved cannot have left its king in check`);
    assert.equal(item.verification.category, item.objective, item.id);
    assert.ok(item.verification.sourceUrl.startsWith('https://tablebase.lichess.ovh/standard?fen='));
    assert.equal(new URL(item.verification.sourceUrl).searchParams.get('fen'), item.fen);
    assert.ok(item.verification.preservingMoves.includes(item.verification.bestMove), item.id);
    for (const move of item.verification.preservingMoves) {
      const position = new Chess(item.fen);
      assert.ok(position.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }), `${item.id}: ${move} is legal`);
    }
    if (item.objective === 'draw') assert.equal(item.verification.dtz, 0);
    else assert.ok(item.verification.dtz > 0);
    assert.equal(item.plan.length, 3);
    assert.ok(item.lesson.length > 100 && item.commonMistake.length > 40, item.id);
  }
  assert.match(endgameVerification.note, /does not use these tablebases/);
});

test('the opposition exercise really singles out the stated defensive move', () => {
  const item = drill('opposition-draw');
  assert.deepEqual(item.verification.preservingMoves, ['d6e6']);
  const game = new Chess(item.fen);
  assert.equal(game.move({ from: 'd6', to: 'e6' }).san, 'Ke6');
  assert.equal(game.get('e4').type, 'k');
  assert.equal(game.get('e6').type, 'k');
});

test('the rule-of-the-square exercise requires the pawn tempo described in the lesson', () => {
  assert.deepEqual(drill('square-rule').verification.preservingMoves, ['h4h5']);
  assert.match(drill('square-rule').lesson, /h5 preserves the win/);
});

test('wrong-bishop and bishop-knight corner lessons use the correct square colors', () => {
  const squareColor = square => ((square.charCodeAt(0) - 96) + Number(square[1])) % 2;
  const wrong = new Chess(drill('wrong-bishop').fen);
  assert.equal(wrong.get('b4').type, 'b');
  assert.equal(wrong.get('a6').type, 'p');
  assert.equal(wrong.get('a8').color, 'b');
  assert.notEqual(squareColor('b4'), squareColor('a8'));
  const bishopKnight = new Chess(drill('bishop-knight').fen);
  assert.equal(bishopKnight.get('g6').type, 'b');
  assert.equal(squareColor('g6'), squareColor('a8'));
  assert.equal(squareColor('g6'), squareColor('h1'));
  assert.notEqual(squareColor('g6'), squareColor('h8'));
});

test('Lucena and Philidor plans preserve the verified result from their exact positions', () => {
  const lucena = drill('lucena-bridge');
  const white = new Chess(lucena.fen);
  assert.equal(white.get('d8').type, 'k');
  assert.equal(white.get('d7').type, 'p');
  assert.ok(lucena.verification.preservingMoves.includes('e1e4'), 'The suggested bridge lift Re4 must retain the win');
  const philidor = drill('philidor-defense');
  assert.equal(philidor.objective, 'draw');
  for (const move of ['h6b6', 'h6c6', 'h6g6']) assert.ok(philidor.verification.preservingMoves.includes(move), `${move} must hold the draw`);
  for (const move of ['h6d6', 'h6e6', 'h6f6']) assert.ok(!philidor.verification.preservingMoves.includes(move), `${move} would put the rook in danger`);
});
