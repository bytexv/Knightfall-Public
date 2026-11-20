import test from 'node:test';
import assert from 'node:assert/strict';
import {moveClassifications, playedConsequence, reviewMove} from '../src/lib/review.ts';
import {ratings} from '../src/components/RatingLegend.tsx';
import {newSession, applyMove} from '../src/lib/game.ts';

test('every grade has a unique mark and a readable explanation', () => {
  assert.deepEqual(Object.keys(ratings), [...moveClassifications, 'Unrated']);
  assert.equal(new Set(Object.values(ratings).map(([symbol]) => symbol)).size, 11);
  for (const [, color, explanation] of Object.values(ratings)) {
    assert.match(color, /^#[0-9a-f]{6}$/);
    assert.ok(explanation.length >= 30);
  }
});

test('the played reply and the recommended mate are described from the correct side', () => {
  let game = newSession({mode:'analysis'});
  for (const [from,to] of [['f2','f3'],['e7','e5'],['g2','g4'],['b8','c6']]) game = applyMove(game,from,to);
  const score = (cp, moves) => ({engine:'Stockfish 19 Lite',score:cp,depth:16,bestMove:moves[0],lines:[{score:cp,depth:16,multipv:1,pv:moves}]});
  const review = reviewMove(2,game.moves[2],score(-60,['e2e4','g8f6']),{...score(-10000,['d8h4','b1c3']),mate:-1},game);
  assert.equal(review.label,'Blunder');
  assert.deepEqual(review.pv,['e2e4','g8f6']);
  assert.deepEqual(review.replyPV,['d8h4']);
  assert.deepEqual(playedConsequence(game.moves[2],review,game.moves[3]),['Game reply · Nc6','Best reply found · Qh4# delivers checkmate']);
});
