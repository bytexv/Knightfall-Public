import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {beginnerExercises,tryBeginnerMove} from '../src/data/beginner-course.ts';
for(const exercise of beginnerExercises) test(`beginner exercise ${exercise.id}: legal hint completes the task`,()=>{
 const result=tryBeginnerMove(exercise,exercise.hint.from,exercise.hint.to,exercise.goal==='promotion'?'q':undefined);
 assert.equal(result.correct,true); assert.notEqual(result.fen,exercise.fen);
 assert.equal(result.feedback,exercise.success);
});
test('wrong legal moves give feedback without moving the exercise board',()=>{
 const exercise=beginnerExercises[0];const result=tryBeginnerMove(exercise,'e2','e3');
 assert.equal(result.correct,false);assert.equal(result.fen,exercise.fen);assert.match(result.feedback,/legal/);
});
test('mate task accepts alternatives and explains stalemate',()=>{
 const exercise=beginnerExercises.at(-1);
 for(const move of new Chess(exercise.fen).moves({verbose:true})){
  const board=new Chess(exercise.fen);board.move(move);
  const result=tryBeginnerMove(exercise,move.from,move.to);
  assert.equal(result.correct,board.isCheckmate());
  if(board.isStalemate())assert.match(result.feedback,/stalemate/i);
 }
});
test('promotion requires the requested queen, and illegal moves remain safe',()=>{
 const e=beginnerExercises.find(e=>e.id==='promotion');
 assert.equal(tryBeginnerMove(e,'a7','a8','n').correct,false);
 assert.equal(tryBeginnerMove(e,'a7','b6').fen,e.fen);
});
