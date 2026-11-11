import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {applyMove,importFen,importPgn,MAX_COMMENT_LENGTH,MAX_GAME_PLIES,MAX_PGN_LENGTH,newSession,sanitizeComment,sanitizePlayerName,sessionPgn,START_FEN} from '../src/lib/game.ts';

function annotatedGame(){
 let game=newSession({mode:'analysis',started:true,initialComment:'A fresh start: fight for the center.'});
 for(const [from,to]of [['e2','e4'],['e7','e5'],['g1','f3']])game=applyMove(game,from,to);
 return {...game,moves:game.moves.map((move,index)=>({...move,...(index===0?{comment:'Claim space and free the bishop. !'}:index===2?{comment:'Develop with a threat to e5.'}:{})}))};
}

test('PGN roundtrip retains starting, middle and final position comments',()=>{
 const game=annotatedGame();const pgn=sessionPgn(game);const imported=importPgn(pgn);
 assert.equal(imported.initialComment,game.initialComment);assert.equal(imported.moves[0].comment,game.moves[0].comment);assert.equal(imported.moves[1].comment,undefined);assert.equal(imported.moves[2].comment,game.moves[2].comment);assert.equal(imported.fen,game.fen);assert.deepEqual(imported.moves.map(m=>m.san),['e4','e5','Nf3']);
 const raw=new Chess();raw.loadPgn(pgn);assert.equal(raw.getComments().length,3);
});

test('black-to-move custom-FEN imports attach comments to the correct plies',()=>{
 const fen=START_FEN.replace(' w ',' b ').replace('0 1','0 23');
 const pgn=`[SetUp "1"]\n[FEN "${fen}"]\n\n{Black starts this study.} 23... e5 {Claim the center.} 24. Nf3 {Attack e5.} Nc6 {Defend while developing.} *`;
 const game=importPgn(pgn);assert.equal(game.initialComment,'Black starts this study.');assert.equal(game.moves[0].color,'b');assert.equal(game.moves[0].before.split(' ')[5],'23');assert.deepEqual(game.moves.map(m=>m.comment),['Claim the center.','Attack e5.','Defend while developing.']);
 const exported=sessionPgn(game);assert.match(exported,/23\. \.\.\. e5/);const restored=importPgn(exported);assert.equal(restored.startFen,fen);assert.deepEqual(restored.moves.map(m=>m.comment),game.moves.map(m=>m.comment));
});

test('comments on a zero-move FEN study survive PGN export and import',()=>{
 const game={...importFen('6k1/8/8/8/8/8/4Q3/4K3 w - - 8 25'),initialComment:'Practice coordinating the king and queen.'};
 const restored=importPgn(sessionPgn(game));assert.equal(restored.moves.length,0);assert.equal(restored.startFen,game.startFen);assert.equal(restored.initialComment,game.initialComment);
});

test('all braces and controls are normalized without corrupting PGN or mutating the source note',()=>{
 const raw='  Compare {idea one} with {idea two}.\0\r\nKeep\tcalculating.  ';
 const clean='Compare [idea one] with [idea two].\nKeep\tcalculating.';
 assert.equal(sanitizeComment(raw),clean);const game=annotatedGame();game.moves[0].comment=raw;const pgn=sessionPgn(game);assert.equal(game.moves[0].comment,raw);
 const chess=new Chess();assert.doesNotThrow(()=>chess.loadPgn(pgn));const restored=importPgn(pgn);assert.equal(restored.moves[0].comment,clean.replace('\n',' '));assert.equal(sanitizeComment(null),'');assert.equal(sanitizeComment({text:'bad'}),'');
});

test('imported and exported notes stay within 2,000 characters and remain plain text',()=>{
 const game=annotatedGame();game.initialComment='x'.repeat(2500);game.moves[0].comment='<script>alert("text only")</script> !!';
 const restored=importPgn(sessionPgn(game));assert.equal(restored.initialComment.length,MAX_COMMENT_LENGTH);assert.equal(restored.moves[0].comment,game.moves[0].comment);
 const imported=importPgn(`{${'y'.repeat(2500)}} 1. e4 {${'z'.repeat(2500)}} *`);assert.equal(imported.initialComment.length,MAX_COMMENT_LENGTH);assert.equal(imported.moves[0].comment.length,MAX_COMMENT_LENGTH);
});

test('annotated PGNs above the old 200 KB limit remain importable within the bounded new limit',()=>{
 const chess=new Chess();for(let ply=0;ply<104;ply++){chess.move(['Nf3','Nf6','Ng1','Ng8'][ply%4]);chess.setComment('A'.repeat(MAX_COMMENT_LENGTH));}
 const pgn=chess.pgn();assert.ok(pgn.length>200000);assert.ok(pgn.length<MAX_PGN_LENGTH);const imported=importPgn(pgn);assert.equal(imported.moves.length,104);assert.equal(imported.moves.at(-1).comment.length,MAX_COMMENT_LENGTH);
});

test('PGN size and half-move bounds remain enforced',()=>{
 assert.throws(()=>importPgn(' '.repeat(MAX_PGN_LENGTH+1)),/under 3 MB/);
 const chess=new Chess();for(let ply=0;ply<MAX_GAME_PLIES+1;ply++)chess.move(['Nf3','Nf6','Ng1','Ng8'][ply%4]);assert.throws(()=>importPgn(chess.pgn()),/at most 1,000 half-moves/);
});


test('imported player names survive editing and export with safe PGN header text',()=>{
 const game=importPgn('[White "Ada Lovelace"]\n[Black "Alan Turing"]\n\n1. e4 e5 *');assert.equal(game.whiteName,'Ada Lovelace');assert.equal(game.blackName,'Alan Turing');
 game.moves[0].comment='Open the center.';const restored=importPgn(sessionPgn(game));assert.equal(restored.whiteName,'Ada Lovelace');assert.equal(restored.blackName,'Alan Turing');assert.equal(restored.moves[0].comment,'Open the center.');
 game.whiteName='Alice "GM" \\ Player\n';const pgn=sessionPgn(game);const chess=new Chess();assert.doesNotThrow(()=>chess.loadPgn(pgn));assert.equal(chess.getHeaders().White,'Alice GM Player');assert.equal(sanitizePlayerName('x'.repeat(100)).length,80);assert.equal(sanitizePlayerName(null),'');
});
