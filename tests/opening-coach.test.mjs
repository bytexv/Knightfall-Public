import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { openingLesson,italianLesson,previousPlayerTurn } from '../src/data/opening-coach.ts';
import { gambits } from '../src/data/gambits.ts';
import { ALIEN_PIECE_DIRECTORY } from '../src/lib/piece-assets.ts';
for(const gambit of gambits)test(`coach lesson: ${gambit.name} has legal moves and side-specific instructions`,()=>{
 const lesson=openingLesson(gambit),board=new Chess();
 assert.equal(lesson.plies.length,gambit.moves.length);
 for(const ply of lesson.plies){assert.equal(ply.color,board.turn());const move=board.move(ply.san);assert.ok(ply.goal.includes(move.from)&&ply.goal.includes(move.to));assert.ok(ply.why.length>10);}
});
test('Italian coaching keeps the six original teaching turns',()=>{
 assert.equal(italianLesson.plies.length,12);assert.equal(italianLesson.plies[0].san,'e4');assert.equal(italianLesson.plies[9].san,'O-O');
});
test('takeback returns to the player turn for either side, including a pending reply',()=>{
 assert.deepEqual(previousPlayerTurn(['e4'],'w'),[]);
 assert.deepEqual(previousPlayerTurn(['e4','e5'],'w'),[]);
 assert.deepEqual(previousPlayerTurn(['e4'],'b'),['e4']);
 assert.deepEqual(previousPlayerTurn(['e4','e5'],'b'),['e4']);
 assert.deepEqual(previousPlayerTurn(['e4','e5','Nf3'],'b'),['e4']);
 assert.deepEqual(previousPlayerTurn(['e4','e5','Nf3','Nc6','Bc4'],'b'),['e4','e5','Nf3']);
});
test('alien eyes use a new URL and retain normal piece outlines, never token circles or letters',()=>{
 assert.equal(ALIEN_PIECE_DIRECTORY,'pieces/alien/eyes-v1');
 for(const color of ['w','b'])for(const type of ['P','N','B','R','Q','K']){
  const normal=fs.readFileSync(`public/pieces/${color}${type}.svg`,'utf8');
  const eyes=fs.readFileSync(`public/${ALIEN_PIECE_DIRECTORY}/${color}${type}.svg`,'utf8');
  assert.match(eyes,/class="alien-eyes"/);assert.doesNotMatch(eyes,/<text\b/);
  const paths=[...normal.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].slice(0,2).map(m=>m[1]);
  for(const outline of paths)assert.ok(eyes.includes(outline),`${color}${type}: body outline changed`);
 }
});
