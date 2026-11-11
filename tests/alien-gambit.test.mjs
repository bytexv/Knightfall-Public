import test from 'node:test';
import assert from 'node:assert/strict';
import {alienLine,playedAlienGambit} from '../src/lib/alien-gambit.ts';
import {newSession,applyMove,undoMoves,START_FEN} from '../src/lib/game.ts';
import {gambits} from '../src/data/gambits.ts';
const play=(game,line)=>line.reduce((g,u)=>{const next=applyMove(g,u.slice(0,2),u.slice(2,4));assert.ok(next);return next;},game);
test('Alien Gambit activates on the knight sacrifice and survives later moves and undo',()=>{
 const before=play(newSession({mode:'local'}),alienLine.slice(0,-1));assert.equal(before.alienGambit,false);
 const after=play(before,alienLine.slice(-1));assert.equal(after.alienGambit,true);assert.equal(playedAlienGambit(START_FEN,after.moves),true);
 assert.equal(play(after,['e8f7']).alienGambit,true);assert.equal(undoMoves(after).alienGambit,true);
 assert.notEqual(newSession().alienGambit,true);
});
test('a black-side player does not trigger the user Easter egg from a white bot',()=>{
 const black=play(newSession({mode:'bot',playerColor:'b'}),alienLine);assert.equal(black.alienGambit,false);
 const white=play(newSession({mode:'bot',playerColor:'w'}),alienLine);assert.equal(white.alienGambit,true);
});
test('unrelated lines and imported starting positions cannot trigger it',()=>{
 assert.equal(playedAlienGambit(START_FEN,[]),false);
 const game=play(newSession({mode:'local'}),alienLine);
 assert.equal(playedAlienGambit(START_FEN.replace('0 1','0 2'),game.moves),false);
 assert.equal(playedAlienGambit(START_FEN,[{from:'d2',to:'d4'},...game.moves.slice(1)]),false);
 assert.ok(gambits.find(g=>g.id==='alien'&&/Wittythealien/.test(g.creator)));
});
