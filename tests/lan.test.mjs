import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {WebSocket} from 'ws';
import {Chess} from 'chess.js';
import {startLanServer} from '../server/index.mjs';

let host, directory;
const sockets=new Set();
async function client(server=host,options={}) {
  const ws=new WebSocket(`ws://127.0.0.1:${server.port}/ws`,options);
  sockets.add(ws);
  const queue=[],waiters=[];
  ws.on('message',raw=>{
    const value=JSON.parse(raw);
    const pending=waiters.find(item=>item.filter(value));
    if(pending){clearTimeout(pending.timeout);waiters.splice(waiters.indexOf(pending),1);pending.resolve(value);}
    else queue.push(value);
  });
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  return {ws,send:data=>ws.send(JSON.stringify(data)),wait(filter,timeoutMs=2500){
    const index=queue.findIndex(filter);
    if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);
    return new Promise((resolve,reject)=>{const pending={filter,resolve,timeout:setTimeout(()=>{waiters.splice(waiters.indexOf(pending),1);reject(new Error('Timed out waiting for message; queue='+JSON.stringify(queue)));},timeoutMs)};waiters.push(pending);});
  },close:()=>new Promise(resolve=>{if(ws.readyState===WebSocket.CLOSED)return resolve();ws.once('close',resolve);ws.close();})};
}
async function pair(server=host,options={}) {
  const white=await client(server),black=await client(server);
  white.send({type:'create',name:'White player',color:'w',timeMinutes:10,incrementSeconds:0,...options});
  const joined=await white.wait(m=>m.type==='joined');
  black.send({type:'join',name:'Black player',code:joined.code});
  const blackJoin=await black.wait(m=>m.type==='joined');
  await Promise.all([white.wait(m=>m.type==='snapshot'&&m.snapshot.status==='playing'),black.wait(m=>m.type==='snapshot'&&m.snapshot.status==='playing')]);
  return {white,black,code:joined.code,whiteToken:joined.token,blackToken:blackJoin.token};
}
async function move(player,from,to,ply,promotion) {
  player.send({type:'move',from,to,...(promotion?{promotion}:{})});
  return (await player.wait(m=>m.type==='snapshot'&&m.snapshot.history.length===ply)).snapshot;
}
before(async()=>{
  directory=await mkdtemp(path.join(os.tmpdir(),'knightfall-lan-'));
  await writeFile(path.join(directory,'index.html'),'<html>Knightfall test</html>');
  await writeFile(path.join(directory,'piece.svg'),'<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await writeFile(path.join(directory,'test.wasm'),Buffer.from([0,97,115,109]));
  host=await startLanServer({port:0,host:'127.0.0.1',staticDir:directory});
});
after(async()=>{for(const ws of sockets)ws.terminate();await host.close();await host.close();await rm(directory,{recursive:true,force:true});});

test('serves health, host address and static files with safe MIME types',async()=>{
  const origin=`http://127.0.0.1:${host.port}`;
  const health=await (await fetch(origin+'/health')).json();assert.equal(health.service,'knightfall-lan');
  const info=await (await fetch(origin+'/api/lan-info')).json();assert.equal(info.port,host.port);assert.ok(info.urls.includes(origin));
  assert.match(await (await fetch(origin+'/')).text(),/Knightfall test/);
  assert.equal((await fetch(origin+'/piece.svg')).headers.get('cache-control'),'no-cache');
  assert.equal((await fetch(origin+'/test.wasm')).headers.get('content-type'),'application/wasm');
  assert.equal((await fetch(origin+'/health',{method:'POST'})).status,405);
  assert.equal(await new Promise((resolve,reject)=>http.get(origin+'/health',{headers:{host:`attacker.example:${host.port}`}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject)),403);
  assert.equal((await fetch(origin+'/%2eenv')).status,403);
  assert.equal((await fetch(origin+'/missing.js')).status,404);
  await symlink('/etc/passwd',path.join(directory,'unsafe.txt'));
  assert.equal((await fetch(origin+'/unsafe.txt')).status,403);
});

test('two clients share authoritative moves; illegal, out-of-turn and state forgery fail',async()=>{
  const {white,black}=await pair();
  black.send({type:'move',from:'e7',to:'e5'});
  assert.equal((await black.wait(m=>m.type==='error')).code,'not_your_turn');
  white.send({type:'move',from:'e2',to:'e5'});
  assert.equal((await white.wait(m=>m.type==='error')).code,'illegal_move');
  white.send({type:'move',from:'e2',to:'e4',fen:'8/8/8/8/8/8/8/8 w - - 0 1',result:{winner:'w'}});
  const state=(await black.wait(m=>m.type==='snapshot'&&m.snapshot.history.length===1)).snapshot;
  assert.equal(state.history[0],'e4');assert.equal(state.result,null);assert.equal(state.turn,'b');assert.equal(state.yourColor,'b');
  const next=await move(black,'e7','e5',2);assert.deepEqual(next.history,['e4','e5']);assert.match(next.pgn,/\[White "White player"\]/);
  white.send({type:'move',from:'g1',to:'f3',promotion:'k'});assert.equal((await white.wait(m=>m.type==='error')).code,'invalid_move');
});

test('checkmate ends game and PGN carries the correct result',async()=>{
  const {white,black}=await pair();
  await move(white,'f2','f3',1);await move(black,'e7','e5',2);await move(white,'g2','g4',3);
  const state=await move(black,'d8','h4',4);
  assert.equal(state.status,'finished');assert.deepEqual(state.result,{winner:'b',reason:'Checkmate'});assert.equal(state.clocks.running,null);assert.match(state.pgn,/\[Result "0-1"\]/);
  white.send({type:'move',from:'e2',to:'e3'});assert.equal((await white.wait(m=>m.type==='error')).code,'game_not_active');
});

test('special moves include castling, en passant and chosen underpromotion',async()=>{
  let {white,black}=await pair();
  for(const [ply,from,to] of [[1,'e2','e4'],[2,'e7','e5'],[3,'g1','f3'],[4,'b8','c6'],[5,'f1','c4'],[6,'g8','f6']]) await move(ply%2?white:black,from,to,ply);
  let state=await move(white,'e1','g1',7);assert.equal(state.history.at(-1),'O-O');assert.match(state.fen,/RNBQ1RK1/);
  ({white,black}=await pair());
  for(const [ply,from,to] of [[1,'e2','e4'],[2,'a7','a6'],[3,'e4','e5'],[4,'d7','d5']]) await move(ply%2?white:black,from,to,ply);
  state=await move(white,'e5','d6',5);assert.equal(state.history.at(-1),'exd6');assert.equal(state.fen.split(' ')[0].split('/')[3],'8');
  ({white,black}=await pair());
  for(const [ply,from,to] of [[1,'a2','a4'],[2,'h7','h5'],[3,'a4','a5'],[4,'h5','h4'],[5,'a5','a6'],[6,'h4','h3'],[7,'a6','b7'],[8,'h3','g2']]) await move(ply%2?white:black,from,to,ply);
  state=await move(white,'b7','a8',9,'n');assert.equal(state.lastMove.promotion,'n');assert.match(state.history.at(-1),/=N/);assert.ok(state.fen.startsWith('Nnbqkbnr'));
});

test('draw agreement and rematch require both players; colors swap',async()=>{
  const {white,black}=await pair();
  white.send({type:'offer_draw'});await black.wait(m=>m.type==='snapshot'&&m.snapshot.drawOffer==='w');
  white.send({type:'accept_draw'});assert.equal((await white.wait(m=>m.type==='error')).code,'no_draw_offer');
  black.send({type:'accept_draw'});const result=(await white.wait(m=>m.type==='snapshot'&&m.snapshot.status==='finished')).snapshot;assert.deepEqual(result.result,{winner:null,reason:'Draw by agreement'});assert.match(result.gameId,/^[a-f0-9]{24}$/);assert.equal(result.round,1);
  white.send({type:'rematch'});const pending=(await white.wait(m=>m.type==='snapshot'&&m.snapshot.rematchVotes.length===1)).snapshot;assert.equal(pending.status,'finished');
  black.send({type:'rematch'});const fresh=(await white.wait(m=>m.type==='snapshot'&&m.snapshot.status==='playing'&&m.snapshot.yourColor==='b')).snapshot;assert.equal(fresh.history.length,0);assert.equal(fresh.players.b.name,'White player');assert.equal(fresh.result,null);assert.notEqual(fresh.gameId,result.gameId);assert.equal(fresh.round,2);assert.ok(fresh.createdAt>=result.createdAt);
});

test('disconnects preserve seats and a token restores the same position',async()=>{
  const {white,black,code,whiteToken}=await pair();
  await move(white,'d2','d4',1);await white.close();
  await black.wait(m=>m.type==='snapshot'&&!m.snapshot.players.w.connected);
  const intruder=await client();intruder.send({type:'join',code,name:'Intruder'});assert.equal((await intruder.wait(m=>m.type==='error')).code,'room_full');
  intruder.send({type:'join',code,name:'Intruder',token:'ü'.repeat(64)});assert.equal((await intruder.wait(m=>m.type==='error')).code,'invalid_token');
  const resumed=await client();resumed.send({type:'join',code,token:whiteToken,name:'Changed name'});
  const state=(await resumed.wait(m=>m.type==='snapshot')).snapshot;assert.equal(state.yourColor,'w');assert.deepEqual(state.history,['d4']);assert.equal(state.players.w.name,'White player');assert.equal(state.players.w.connected,true);
});

test('resignation, leaving and draw declines are authoritative',async()=>{
  const {white,black}=await pair();
  black.send({type:'offer_draw'});await white.wait(m=>m.type==='snapshot'&&m.snapshot.drawOffer==='b');
  white.send({type:'decline_draw'});await black.wait(m=>m.type==='snapshot'&&m.snapshot.drawOffer===null);
  white.send({type:'resign'});const state=(await black.wait(m=>m.type==='snapshot'&&m.snapshot.status==='finished')).snapshot;assert.deepEqual(state.result,{winner:'b',reason:'Resignation'});
  const other=await pair();other.black.send({type:'leave'});const left=(await other.white.wait(m=>m.type==='snapshot'&&m.snapshot.status==='finished')).snapshot;assert.equal(left.result.winner,'w');assert.match(left.result.reason,/left/);
});

test('untimed games have no running clock',async()=>{
  const {white}=await pair(host,{timeMinutes:0});
  const state=await move(white,'e2','e4',1);assert.equal(state.clocks.enabled,false);assert.equal(state.clocks.running,null);assert.equal(state.clocks.w,0);
});

test('host owns elapsed time and increments and adjudicates flag fall',async()=>{
  let fakeNow=1000;
  const timed=await startLanServer({port:0,host:'127.0.0.1',staticDir:directory,now:()=>fakeNow,tickInterval:10});
  try {
    const {white,black}=await pair(timed,{timeMinutes:1,incrementSeconds:2});
    fakeNow+=5000;
    const state=await move(white,'e2','e4',1);assert.equal(state.clocks.w,57000);assert.equal(state.clocks.b,60000);assert.equal(state.clocks.running,'b');
    fakeNow+=61000;
    const final=(await black.wait(m=>m.type==='snapshot'&&m.snapshot.status==='finished')).snapshot;assert.equal(final.result.winner,'w');assert.equal(final.result.reason,'Time expired');assert.equal(final.clocks.b,0);
  } finally {await timed.close();}
});

test('rejects unrelated browser origins and accepts native localhost origins',async()=>{
  const denied=new WebSocket(`ws://127.0.0.1:${host.port}/ws`,{origin:'https://unrelated.example'});
  await new Promise(resolve=>{denied.once('error',error=>{assert.match(error.message,/403/);resolve();});});
  for(const origin of ['null','https://localhost.attacker.example','file:///']) {
    const rejected=new WebSocket(`ws://127.0.0.1:${host.port}/ws`,{origin});
    await new Promise(resolve=>rejected.once('error',error=>{assert.match(error.message,/403/);resolve();}));
  }
  const rebound=new WebSocket(`ws://127.0.0.1:${host.port}/ws`,{origin:`http://attacker.example:${host.port}`,headers:{host:`attacker.example:${host.port}`}});
  await new Promise(resolve=>rebound.once('error',error=>{assert.match(error.message,/403/);resolve();}));
  const mobile=await client(host,{origin:'https://localhost'});mobile.send({type:'ping'});assert.equal((await mobile.wait(m=>m.type==='pong')).type,'pong');
});

test('malformed commands are errors, not host crashes',async()=>{
  const peer=await client();peer.ws.send('not json');assert.equal((await peer.wait(m=>m.type==='error')).code,'invalid_json');
  peer.send(null);assert.equal((await peer.wait(m=>m.type==='error')).code,'invalid_message');
  peer.send({type:'join',code:'bad'});assert.equal((await peer.wait(m=>m.type==='error')).code,'invalid_code');
  peer.send({type:'ping'});assert.equal((await peer.wait(m=>m.type==='pong')).type,'pong');
});


test('oversized messages and rapid command floods close only the abusive connection',async()=>{
  const oversized=await client();const sizeClosed=new Promise(resolve=>oversized.ws.once('close',code=>resolve(code)));oversized.ws.send('x'.repeat(9000));assert.equal(await sizeClosed,1009);
  const flood=await client();const rateClosed=new Promise(resolve=>flood.ws.once('close',code=>resolve(code)));for(let i=0;i<65;i++)flood.send({type:'ping'});assert.equal(await rateClosed,4008);
  const healthy=await client();healthy.send({type:'ping'});assert.equal((await healthy.wait(m=>m.type==='pong')).type,'pong');
});


test('quoted player names remain readable without breaking PGN snapshots',async()=>{
 const name='Alice "GM" \\ Player';const {white}=await pair(host,{name});const state=await move(white,'e2','e4',1);const chess=new Chess();assert.doesNotThrow(()=>chess.loadPgn(state.pgn));assert.equal(chess.getHeaders().White,'Alice GM Player');assert.equal(state.players.w.name,name);assert.deepEqual(chess.history(),['e4']);
});
