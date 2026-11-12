import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { bots, botBands, botBand, defaultBot, matchingBots, recommendedBot, botSearchOptions } from '../src/lib/bots.ts';
import { newSession } from '../src/lib/game.ts';
import { validateSavedGame } from '../src/lib/storage.ts';
import { beginRatedGame, emptyRatingLedger, sanitizeGameRating } from '../src/lib/ratings.ts';
import { chooseBotMove, seededBotRandom } from '../src/lib/bot-policy.ts';

test('30 distinct opponents cover every 100-point step and retain the original rated identities', () => {
  assert.equal(bots.length,30); assert.equal(new Set(bots.map(b=>b.id)).size,30);
  assert.deepEqual(bots.map(b=>b.elo),Array.from({length:30},(_,i)=>(i+1)*100));
  for(const [id,elo] of Object.entries({sprout:400,scout:800,sage:1200,rook:1600,nova:2000,stockfish:3000})) assert.equal(bots.find(b=>b.id===id)?.elo,elo);
  assert.equal(defaultBot.id,'scout');
  for(const band of botBands) assert.equal(matchingBots(band.id,'').length,6);
  for(const bot of bots) {
    const game=newSession({botId:bot.id,started:true});
    assert.equal(validateSavedGame(game).botId,bot.id);
    const enrollment=beginRatedGame(game,emptyRatingLedger());
    assert.equal(sanitizeGameRating(enrollment.game.rating,enrollment.game)?.opponentRating,bot.elo);
  }
});
test('matching by name, Elo or practice focus spans groups; recommendations handle limits', () => {
  assert.equal(matchingBots('beginner','nEmEsIs')[0].elo,2900);
  assert.equal(matchingBots('casual','1500')[0].id,'flint');
  assert.equal(matchingBots('club','free pieces')[0].id,'pip');
  assert.equal(matchingBots('all','not-a-bot').length,0);
  assert.equal(matchingBots('all',' ').length,30);
  assert.equal(recommendedBot(1670).id,'iris');
  assert.equal(recommendedBot(-100).elo,100);assert.equal(recommendedBot(9999).elo,3000);
  assert.equal(recommendedBot(NaN).id,'scout');assert.equal(botBand(recommendedBot(2600)),'master');
});
test('every opponent has distinct search limits; maximum remains unrestricted', () => {
  const settings=bots.map(b=>botSearchOptions(b));
  assert.equal(new Set(settings.map(s=>JSON.stringify(s))).size,30);
  for(const bot of bots) {
    const s=botSearchOptions(bot);
    if(bot.elo>=1400 && bot.id!=='stockfish')assert.equal(s.elo,bot.elo);
    else assert.equal(s.elo,undefined);
    assert.ok(s.skill>=0 && s.skill<=20 && s.movetime>=50 && s.depth<=30);
  }
  assert.equal(botSearchOptions(bots.at(-1),4000).movetime,4000);
});
test('all bot policies play legal moves from both sides, in check, and at promotion', () => {
  const positions=[new Chess().fen(),new Chess('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1').fen(), '8/1P6/8/8/8/4K3/7k/8 w - - 0 1','6k1/8/8/8/8/8/P7/6K1 b - - 0 1'];
  for(const bot of bots)for(const fen of positions){
    const position=new Chess(fen),first=position.moves({verbose:true})[0];
    const uci=chooseBotMove(fen,bot.id,{bestMove:first.from+first.to+(first.promotion||'')},seededBotRandom(41));
    assert.ok(uci,bot.id);assert.ok(position.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]}));
  }
});
test('learners increasingly retain the engine choice instead of just changing their name', () => {
  const fen=new Chess().fen();
  const counts=['pebble','sprout','scout','hazel'].map(id=>{
    const random=seededBotRandom(333);let count=0;
    for(let i=0;i<120;i++) if(chooseBotMove(fen,id,{bestMove:'e2e4'},random)==='e2e4')count++;
    return count;
  });
  for(let i=1;i<counts.length;i++)assert.ok(counts[i]>counts[i-1],`Expected increasing engine preference; observed ${counts}`);
  assert.ok(counts.at(-1)>100);
});
