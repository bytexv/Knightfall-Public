import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { gambits, openingPreview } from '../src/data/gambits.ts';
import { lessons } from '../src/data/lessons.ts';

test('every opening primer contains a legal, nonterminal main line', () => {
  assert.ok(gambits.length >= 20);
  assert.equal(new Set(gambits.map(g => g.id)).size, gambits.length, 'Opening IDs must be unique');
  for (const gambit of gambits) {
    const chess = new Chess();
    assert.ok(gambit.moves.length >= 4, `${gambit.id} needs a meaningful line`);
    for (const san of gambit.moves) {
      assert.equal(chess.isGameOver(), false, `${gambit.id} continues after game over`);
      const move = chess.move(san);
      assert.ok(move, `${gambit.id}: ${san} must be legal`);
      assert.equal(move.san, san, `${gambit.id}: use canonical SAN for ${san}`);
    }
    assert.ok(gambit.description && gambit.idea && gambit.risk, `${gambit.id} must explain the idea and the cost`);
  }
});

test('meme openings are clearly identified and their instructional positions demonstrate the warning', () => {
  const botez = gambits.find(g => g.id === 'botez');
  assert.match(botez.description, /not an established opening/i);
  assert.match(botez.risk, /loses a queen/i);
  const queenBlunder = new Chess();
  for (const move of botez.moves) queenBlunder.move(move);
  assert.equal(queenBlunder.board().flat().filter(p => p?.type === 'q' && p.color === 'w').length, 0);
  const bongcloud = gambits.find(g => g.id === 'bongcloud');
  assert.match(bongcloud.description, /joke opening/i);
  const exposedKing = new Chess();
  for (const move of bongcloud.moves) exposedKing.move(move);
  assert.equal(exposedKing.get('e2')?.type, 'k');
  assert.equal(exposedKing.getCastlingRights('w').k, false);
  assert.equal(exposedKing.getCastlingRights('w').q, false);
});

test('major gambit positions preserve their defining investment and structure', () => {
  function position(id) {
    const chess = new Chess();
    for (const san of gambits.find(g => g.id === id).moves) chess.move(san);
    return chess;
  }
  const stafford = position('stafford');
  assert.equal(stafford.get('c6')?.type, 'p');
  assert.equal(stafford.get('c6')?.color, 'b');
  assert.equal(stafford.get('c5')?.type, 'b');
  const danish = position('danish');
  assert.equal(danish.get('b2')?.type, 'b');
  assert.equal(danish.get('c4')?.type, 'b');
  assert.equal(danish.board().flat().filter(p => p?.type === 'p' && p.color === 'w').length, 5);
  assert.equal(danish.board().flat().filter(p => p?.type === 'p' && p.color === 'b').length, 7);
  const halloween = position('halloween');
  assert.equal(halloween.board().flat().filter(p => p?.type === 'n' && p.color === 'w').length, 1);
  assert.equal(halloween.get('d5')?.type, 'p');
});

test('opening previews keep move numbers and are bounded for cards', () => {
  assert.equal(openingPreview(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4']), '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5');
  assert.equal(openingPreview(['d4', 'd5', 'c4'], 2), '1. d4 d5 2. c4');
  assert.equal(openingPreview([], 3), '');
});

test('lessons cover rules, practical play and engine limitations with actionable exercises', () => {
  assert.ok(lessons.length >= 8);
  assert.equal(new Set(lessons.map(l => l.id)).size, lessons.length);
  for (const lesson of lessons) {
    assert.ok(lesson.sections.length >= 3, lesson.id);
    assert.ok(lesson.minutes > 0 && lesson.minutes <= 10, lesson.id);
    assert.ok(lesson.challenge.length > 40, lesson.id);
  }
  const review = lessons.find(l => l.id === 'review-games');
  assert.match(review.sections.map(s => s.body).join(' '), /may miss deep tactics/i);
  const rules = lessons.find(l => l.id === 'special-moves');
  assert.match(rules.sections.map(s => s.body).join(' '), /only on the very next move/i);
});
