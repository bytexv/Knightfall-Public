import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceContext } from '../src/lib/performance-context.ts';
import { importPgn, sessionPgn, newSession } from '../src/lib/game.ts';
import { validateSavedGame } from '../src/lib/storage.ts';
import { emptyRatingLedger } from '../src/lib/ratings.ts';
test('performance uses historical starting rating, never current viewer rating',()=>{
 const game=newSession({result:{winner:'w',reason:'Resignation'}});
 const ledger={...emptyRatingLedger(),rating:2400,history:[{gameId:game.id,playerColor:'w',before:800,opponentRating:400}]};
 assert.deepEqual(performanceContext(game,ledger).ratings,{w:800,b:400});
 assert.equal(performanceContext({...game,id:'unknown'},ledger).ratings.w,undefined);
});
test('PGN ratings round trip with saved games and reject missing or invalid values',()=>{
 const pgn='[WhiteElo "1350"]\n[BlackElo "1400"]\n[Result "1-0"]\n\n1. e4 e5 1-0';
 const game=importPgn(pgn);assert.equal(game.whiteElo,1350);assert.equal(game.blackElo,1400);
 const restored=validateSavedGame(game);assert.equal(restored.whiteElo,1350);
 assert.equal(importPgn(sessionPgn(restored)).blackElo,1400);
 assert.equal(performanceContext(game).eligible,true);
 for(const value of ['?','NaN','0','99999','1400.5'])assert.equal(importPgn(pgn.replace('1350',value)).whiteElo,undefined);
 assert.equal(validateSavedGame({...game,whiteElo:NaN}).whiteElo,undefined);
});
test('assisted, timeout, custom and unfinished games are not performance evidence',()=>{
 const game=newSession({result:{winner:'w',reason:'Checkmate'}});
 assert.equal(performanceContext({...game,result:null}).eligible,false);
 assert.equal(performanceContext({...game,result:{winner:'w',reason:'Time expired'}}).eligible,false);
 assert.equal(performanceContext({...game,startFen:game.startFen.replace('0 1','0 2')}).eligible,false);
 assert.equal(performanceContext({...game,rating:{assistance:['hint'],engine:'stockfish'}}).eligible,false);
 assert.equal(performanceContext({...game,rating:{assistance:[],engine:'fallback'}}).eligible,false);
});
