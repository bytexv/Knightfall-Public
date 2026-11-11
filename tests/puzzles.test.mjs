import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, validateFen } from 'chess.js';
import { puzzles, puzzleSource } from '../src/data/puzzles.ts';

function playUci(chess, uci) {
  assert.match(uci, /^[a-h][1-8][a-h][1-8][qrbn]?$/);
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

test('puzzle collection is substantial, varied, and traceable', () => {
  assert.ok(puzzles.length >= 60);
  assert.equal(new Set(puzzles.map(p => p.id)).size, puzzles.length);
  assert.equal(new Set(puzzles.map(p => p.fen)).size, puzzles.length);
  assert.ok(new Set(puzzles.map(p => p.theme)).size >= 15);
  assert.ok(puzzles.some(p => p.fen.split(' ')[1] === 'w'));
  assert.ok(puzzles.some(p => p.fen.split(' ')[1] === 'b'));
  assert.equal(puzzleSource.license, 'CC0 1.0');
  for (const p of puzzles) {
    assert.match(p.sourceUrl, /^https:\/\/lichess\.org\/training\/[A-Za-z0-9]{5}$/);
    assert.ok(p.rating >= 400 && p.rating <= 2200);
    assert.ok(p.explanation.length > 60);
  }
});

for (const puzzle of puzzles) {
  test(`${puzzle.id}: valid start and legal complete solution`, () => {
    assert.equal(validateFen(puzzle.fen).ok, true, puzzle.title);
    const game = new Chess(puzzle.fen);
    assert.equal(game.isGameOver(), false, 'solver starts in an active position');
    assert.ok(puzzle.solution.length > 0 && puzzle.solution.length % 2 === 1,
      'solution starts and ends with solver, alternating opponent replies');
    const solver = game.turn();
    for (const [index, uci] of puzzle.solution.entries()) {
      assert.equal(game.turn(), index % 2 === 0 ? solver : solver === 'w' ? 'b' : 'w');
      const move = playUci(game, uci);
      if (puzzle.solutionSan) assert.equal(move.san, puzzle.solutionSan[index]);
    }
    if (puzzle.tags?.includes('mate')) assert.equal(game.isCheckmate(), true);
    if (puzzle.tags?.includes('mateIn1')) assert.equal(puzzle.solution.length, 1);
    if (puzzle.tags?.includes('mateIn2')) assert.equal(puzzle.solution.length, 3);
    if (puzzle.tags?.includes('mateIn3')) assert.equal(puzzle.solution.length, 5);
  });
  if (puzzle.tags?.includes('mate')) {
    test(`${puzzle.id}: final mating move is unambiguous`, () => {
      const game = new Chess(puzzle.fen);
      for (const uci of puzzle.solution.slice(0, -1)) playUci(game, uci);
      const mates = game.moves({ verbose: true }).filter(move => move.san.endsWith('#'));
      assert.equal(mates.length, 1);
      const final = puzzle.solution.at(-1);
      assert.equal(mates[0].from + mates[0].to + (mates[0].promotion || ''), final);
    });
  }
}
