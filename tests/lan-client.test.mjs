import test, {after,before} from 'node:test';
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';
import {startLanServer} from '../server/index.mjs';
import {WebSocketServer} from 'ws';
const {LanClient,isLanSnapshot}=await tsImport('../src/lib/lan.ts',import.meta.url);
const store=new Map();
Object.defineProperty(globalThis,'sessionStorage',{value:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},configurable:true});
let host;
const clients=[];
function makeClient(){const client=new LanClient(`http://127.0.0.1:${host.port}`);clients.push(client);return client;}
function event(client,name,predicate=()=>true,timeout=4000){return new Promise((resolve,reject)=>{const off=client.on(name,value=>{if(predicate(value)){clearTimeout(timer);off();resolve(value);}});const timer=setTimeout(()=>{off();reject(new Error(`Timed out waiting for ${name}`));},timeout);});}
before(async()=>{host=await startLanServer({port:0,host:'127.0.0.1'});});
after(async()=>{for(const client of clients)client.disconnect();await host.close();});
test('browser client creates, joins, moves, and resumes a saved seat',async()=>{
  const white=makeClient();await white.connect();assert.equal(white.connection,'connected');
  const created=event(white,'snapshot');white.create({name:'Client White',color:'w',timeMinutes:0});const waiting=await created;assert.equal(waiting.status,'waiting');assert.ok(white.hostUrls.includes(`http://127.0.0.1:${host.port}`));assert.equal(white.savedRoom(),waiting.code);const creatorStorage=[...store.entries()][0];
  const black=makeClient();await black.connect();const joined=event(black,'snapshot',s=>s.status==='playing');black.join(waiting.code,'Client Black');await joined;
  const moved=event(black,'snapshot',s=>s.history.length===1);white.move('e2','e4');assert.equal((await moved).history[0],'e4');
  white.disconnect();assert.equal(white.connection,'disconnected');
  // Model the creator's separate browser sessionStorage on its own device.
  store.set(...creatorStorage);
  await white.connect();const resumed=event(white,'snapshot');
  assert.equal(white.resumeSaved(),true);const state=await resumed;assert.equal(state.code,waiting.code);
  assert.equal(state.history[0],'e4');assert.equal(state.yourColor,'w');
  const offered=event(black,'snapshot',s=>s.drawOffer==='w');white.offerDraw();await offered;
  const finished=event(white,'snapshot',s=>s.status==='finished');black.acceptDraw();const done=await finished;assert.equal(done.result.winner,null);assert.ok(isLanSnapshot(done));
  const voted=event(white,'snapshot',s=>s.rematchVotes.includes('w'));white.rematch();await voted;
  const newGame=event(white,'snapshot',s=>s.status==='playing');black.rematch();const fresh=await newGame;assert.notEqual(fresh.gameId,done.gameId);assert.equal(fresh.yourColor,'b');
});
test('client rejects unsafe server URL schemes and reports disconnected moves',async()=>{
  assert.throws(()=>new LanClient('javascript:alert(1)'));
  assert.throws(()=>new LanClient('https://user:secret@example.com'));
  const client=makeClient();const error=event(client,'error');assert.equal(client.move('e2','e4'),false);assert.match(await error,/not connected/);
});
test('unexpected socket loss reconnects automatically and preserves a seat',async()=>{
  const transport=[];const track=socket=>transport.push(socket);host.server.on('connection',track);
  const white=makeClient();await white.connect();const created=event(white,'snapshot');white.create({name:'Reconnect',color:'w',timeMinutes:10});const state=await created;
  const socket=transport[0];assert.ok(socket);
  const reconnecting=event(white,'connection',s=>s==='reconnecting');const resumed=event(white,'snapshot',s=>s.code===state.code);
  socket.destroy();await reconnecting;const resumedState=await resumed;assert.equal(resumedState.yourColor,'w');assert.equal(white.connection,'connected');
  host.server.off('connection',track);
});


test('client requires the Knightfall protocol handshake',async()=>{
  const fake=new WebSocketServer({host:'127.0.0.1',port:0});
  await new Promise(resolve=>fake.once('listening',resolve));
  fake.on('connection',socket=>socket.send(JSON.stringify({type:'hello',service:'unrelated-service',version:1,urls:[]})));
  const client=new LanClient(`http://127.0.0.1:${fake.address().port}`);clients.push(client);
  try {await assert.rejects(client.connect(),/not a compatible Knightfall host/);} finally {client.disconnect();for(const socket of fake.clients)socket.terminate();await new Promise(resolve=>fake.close(resolve));}
});

test('invalid remote board states never reach application subscribers',async()=>{
  const validClient=makeClient();await validClient.connect();const waiting=event(validClient,'snapshot');validClient.create({name:'Validation',color:'w'});const valid=await waiting;
  assert.ok(isLanSnapshot(valid));assert.equal(isLanSnapshot({...valid,fen:'not a FEN'}),false);assert.equal(isLanSnapshot({...valid,clocks:{...valid.clocks,w:-1}}),false);assert.equal(isLanSnapshot({...valid,turn:'b'}),false);
  const fake=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>fake.once('listening',resolve));
  fake.on('connection',socket=>{socket.send(JSON.stringify({type:'hello',service:'knightfall-lan',version:1,urls:[]}));socket.on('message',()=>socket.send(JSON.stringify({type:'snapshot',snapshot:{...valid,fen:'broken'}})));});
  const client=new LanClient(`http://127.0.0.1:${fake.address().port}`);clients.push(client);let received=false;client.on('snapshot',()=>{received=true;});
  try {await client.connect();const error=event(client,'error');client.create({name:'Test'});assert.match(await error,/invalid board state/);assert.equal(received,false);assert.equal(client.snapshot,null);} finally {client.disconnect();for(const socket of fake.clients)socket.terminate();await new Promise(resolve=>fake.close(resolve));}
});

test('leaving an older room cannot erase the new room seat saved on the same host',async()=>{
 const oldClient=makeClient();await oldClient.connect();const oldReady=event(oldClient,'snapshot');oldClient.create({name:'Old room'});await oldReady;
 const current=makeClient();await current.connect();const currentReady=event(current,'snapshot');current.create({name:'Current room'});const fresh=await currentReady;
 oldClient.leave();assert.equal(current.savedRoom(),fresh.code);
 const resumed=makeClient();await resumed.connect();const restored=event(resumed,'snapshot');assert.equal(resumed.resumeSaved(),true);assert.equal((await restored).gameId,fresh.gameId);
});
