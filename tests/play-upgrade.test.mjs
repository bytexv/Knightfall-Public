import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { premoveTargets, legalPremove } from '../src/lib/premove.ts';
import { resolveBot, botSearchOptions, bots } from '../src/lib/bots.ts';
import { chooseBotMove, seededBotRandom } from '../src/lib/bot-policy.ts';
import { randomGamePosition, randomWinningEndgame, findDeserterPosition } from '../src/lib/deserter.ts';
import { validatedPosition } from '../src/lib/engine-position.ts';
import { newSession, applyMove } from '../src/lib/game.ts';
import { emptyRatingLedger, beginRatedGame } from '../src/lib/ratings.ts';
import { botVoices, botDialogue } from '../src/lib/bot-dialogue.ts';
import { sanitizeSettings, validateSavedGame } from '../src/lib/storage.ts';

test('premoves are conditional geometry; only a legal move for the owning side can execute', () => {
 const game=new Chess();game.move('e4');
 assert.ok(premoveTargets(game.fen(),'g1','w').includes('f3'));
 assert.deepEqual(premoveTargets(game.fen(),'g8','w'),[]);
 assert.equal(legalPremove(game.fen(),'w',{from:'g1',to:'f3'}),null);
 game.move('e5');assert.deepEqual(legalPremove(game.fen(),'w',{from:'g1',to:'f3'}),{from:'g1',to:'f3'});
 assert.equal(legalPremove(game.fen(),'w',{from:'f1',to:'h3'}),null,'premove cannot pass through a blocked path');
 assert.equal(legalPremove(game.fen(),'w',{from:'e7',to:'e6'}),null);
});

test('premove execution handles capture, en passant, castling through check and underpromotion', () => {
 const ep=new Chess('7k/3p4/8/4P3/8/8/8/7K b - - 0 1');
 assert.ok(premoveTargets(ep.fen(),'e5','w').includes('d6'));ep.move('d5');
 assert.deepEqual(legalPremove(ep.fen(),'w',{from:'e5',to:'d6'}),{from:'e5',to:'d6'});
 const castle=new Chess('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
 assert.ok(premoveTargets(castle.fen(),'e1','w').includes('g1'));castle.move('Rxh1+');
 assert.equal(legalPremove(castle.fen(),'w',{from:'e1',to:'g1'}),null);
 const promotion=new Chess('7k/P7/8/8/8/8/8/7K b - - 0 1');promotion.move('Kg8');
 assert.deepEqual(legalPremove(promotion.fen(),'w',{from:'a7',to:'a8',promotion:'n'}),{from:'a7',to:'a8',promotion:'n'});
 const captured=new Chess('7k/8/8/8/8/5b2/6N1/7K b - - 0 1');captured.move('Bxg2+');
 assert.equal(legalPremove(captured.fen(),'w',{from:'g2',to:'e3'}),null);
});

test('adjustable strength persists, reaches the engine and stays separate from the rated fixed roster', () => {
 for (const elo of [100,350,800,1250,1400,2150,2950,3000]) {
  const bot=resolveBot('adaptive',elo);assert.equal(bot.elo,elo);assert.equal(bot.id,'adaptive');
  const options=botSearchOptions(bot);assert.equal(options.elo,elo>=1400?elo:undefined);
  const game=applyMove(newSession({mode:'bot',botId:'adaptive',customBotElo:elo,started:true}),'e2','e4');
  assert.equal(validateSavedGame(game).customBotElo,elo);assert.equal(validateSavedGame(game).botId,'adaptive');
  const move=chooseBotMove(game.fen,'adaptive',{bestMove:'e7e5'},seededBotRandom(9),elo);
  assert.ok(new Chess(game.fen).move({from:move.slice(0,2),to:move.slice(2,4),promotion:move[4]}));
 }
 assert.equal(resolveBot('adaptive',Infinity).elo,1200);
 assert.equal(resolveBot('adaptive',9999).elo,3000);
 assert.equal(beginRatedGame(newSession({botId:'adaptive',customBotElo:2000}),emptyRatingLedger()).game.rating,undefined);
 assert.equal(bots.length,30);
});

test('every named bot has a distinct catchphrase and only reacts to visible moves/results', () => {
 assert.equal(new Set(bots.map(bot=>botVoices[bot.id].tag)).size,30);
 for(const bot of bots) {
  const game=newSession({botId:bot.id,playerColor:'w'});
  assert.equal(botDialogue(game),botVoices[bot.id].tag);
  assert.equal(botDialogue({...game,result:{winner:'w',reason:'Checkmate'}}),botVoices[bot.id].lose);
  assert.equal(botDialogue({...game,result:{winner:'b',reason:'Checkmate'}}),botVoices[bot.id].win);
 }
});

test('random Deserter positions are legal, varied and unfinished; fallback gives the advantaged side the move', async () => {
 const random=new Set(),endgames=new Set();
 for(let seed=1;seed<=24;seed++) {
  const fen=await randomGamePosition(seededBotRandom(seed));assert.equal(validatedPosition(fen).isGameOver(),false);random.add(fen);
  const end=randomWinningEndgame(seededBotRandom(seed));const board=validatedPosition(end.fen);
  assert.equal(board.turn(),end.color);assert.equal(board.isGameOver(),false);
  const pieces=board.board().flat().filter(Boolean);assert.equal(pieces.length,3);
  const queen=pieces.find(p=>p.type==='q');assert.equal(queen.color,end.color);assert.equal(board.isAttacked(queen.square,end.color==='w'?'b':'w'),false);endgames.add(end.fen);
 }
 assert.equal(random.size,24);assert.ok(endgames.size>=20);
});

test('Deserter uses the side-to-move evaluation, rejects insufficient search and honors cancellation', async () => {
 let calls=0;
 const result=await findDeserterPosition({analyze:async fen=>{calls++;return {score:new Chess(fen).turn()==='w'?250:-250,depth:14,engine:'Stockfish 17.1',bestMove:'',lines:[]};}},{rng:seededBotRandom(77)});
 assert.equal(result.checked,true);assert.equal(calls,1);
 const fallback=await findDeserterPosition({analyze:async()=>({score:999,depth:4,engine:'Local fallback',bestMove:'',lines:[]})},{rng:seededBotRandom(3)});
 assert.equal(fallback.source,'random-endgame');assert.equal(fallback.checked,false);
 const controller=new AbortController();controller.abort();
 await assert.rejects(findDeserterPosition({analyze:()=>assert.fail('cancelled request searched')},{signal:controller.signal}),{name:'AbortError'});
});

test('theme, board size and dialogue settings validate unknown input without losing older preferences', () => {
 const settings=sanitizeSettings({appearance:'dark',boardSize:'large',premoves:false,botChat:false,botVoice:true,boardTheme:'walnut'});
 assert.equal(settings.appearance,'dark');assert.equal(settings.boardSize,'large');assert.equal(settings.premoves,false);assert.equal(settings.botChat,false);assert.equal(settings.botVoice,true);assert.equal(settings.boardTheme,'walnut');
 const invalid=sanitizeSettings({appearance:'transparent',boardSize:999,botVoice:'true'});
 assert.equal(invalid.appearance,'system');assert.equal(invalid.boardSize,'auto');assert.equal(invalid.botVoice,false);
});
