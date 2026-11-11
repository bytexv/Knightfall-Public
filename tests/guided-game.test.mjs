import test from 'node:test';
import assert from 'node:assert/strict';
import { guidedOpening, learningPosition, learningGoal, explainLearningMove } from '../src/data/guided-game.ts';
test('guided opening contains six legal teaching turns and both sides castle',()=>{
 const board=learningPosition([]);
 for(const step of guidedOpening){assert.equal(board.turn(),'w');assert.ok(board.move(step.move));assert.ok(board.move(step.reply));}
 assert.equal(board.history().length,12);assert.equal(board.get('g1').type,'k');assert.equal(board.get('g8').type,'k');assert.equal(board.isGameOver(),false);
});
test('practice reconstructs repetition history and explains checkmate',()=>{
 const drawn=learningPosition(['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8']);
 assert.equal(drawn.isThreefoldRepetition(),true);assert.match(learningGoal(drawn),/drawn/);
 const mate=learningPosition(['f3','e5','g4','Qh4#']);assert.match(learningGoal(mate),/bot delivered checkmate/);
 assert.match(explainLearningMove(mate.history({verbose:true}).at(-1),'The bot'),/checkmate/);
});
