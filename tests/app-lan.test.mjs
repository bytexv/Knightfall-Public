import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {WebSocket} from 'ws';
import {startLanServer} from '../server/index.mjs';
import {LanClient} from '../src/lib/lan.ts';
import {LocalEngine} from '../src/lib/engine.ts';

// Only stylesheet loading is stubbed. HTTP, room protocol, clients, chess rules and App are real.
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context);}});
const originalFetch=globalThis.fetch, originalWebSocket=globalThis.WebSocket;
const originalConnect=LanClient.prototype.connect;
const engineOriginals={analyze:LocalEngine.prototype.analyze,cancel:LocalEngine.prototype.cancel,destroy:LocalEngine.prototype.destroy};
let dom,host,root,App,lan,origin,fakeNow,peers,appClients,engineJobs,copies,navigatorDescriptor;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

beforeEach(async()=>{
 fakeNow=10000;peers=[];appClients=new Set();engineJobs=[];copies=[];
 lan=await startLanServer({port:0,host:'0.0.0.0',now:()=>fakeNow,tickInterval:10});origin=`http://127.0.0.1:${lan.port}`;
 dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:origin+'/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true,WebSocket});
 navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
 globalThis.fetch=(input,options)=>originalFetch(typeof input==='string'?new URL(input,origin).href:input,options);
 window.knightfall={hostLan:async()=>({urls:lan.urls,port:lan.port})};
 document.execCommand=command=>{if(command==='copy'){copies.push(document.querySelector('body>textarea')?.value);return true;}return false;};
 LocalEngine.prototype.analyze=function(fen,options){return new Promise((resolve,reject)=>engineJobs.push({engine:this,fen,options,resolve,reject,settled:false}));};
 LocalEngine.prototype.cancel=function(){for(const job of engineJobs)if(job.engine===this&&!job.settled){job.settled=true;job.reject(new DOMException('Cancelled','AbortError'));}};
 LocalEngine.prototype.destroy=function(){this.cancel();};
 LanClient.prototype.connect=function(...args){appClients.add(this);return originalConnect.apply(this,args);};
 const appModule=await import('../src/App.tsx');App=appModule.default;const {createRoot}=await import('react-dom/client');host=document.getElementById('root');root=createRoot(host);
 localStorage.setItem('knightfall:settings',JSON.stringify({sound:false}));
 await act(async()=>root.render(createElement(App)));
});
afterEach(async()=>{
 await act(async()=>{root.unmount();for(const client of appClients)client.disconnect();for(const peer of peers)peer.close();await lan.close();await delay(5);});
 LanClient.prototype.connect=originalConnect;Object.assign(LocalEngine.prototype,engineOriginals);globalThis.fetch=originalFetch;globalThis.WebSocket=originalWebSocket;
 dom.window.close();for(const key of ['window','document','HTMLElement','localStorage','sessionStorage','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[key];
 if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
});

const all=selector=>[...host.querySelectorAll(selector)];
const exactButton=text=>all('button').find(button=>button.textContent.trim()===text);
async function click(element){assert.ok(element,'Expected an interactive element');assert.equal(element.disabled,false,'Element must be enabled');await act(async()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));}
const clickText=text=>click(exactButton(text));
const clickLabel=label=>click(host.querySelector(`button[aria-label="${label}"]`));
const field=label=>all('.network-label').find(element=>element.textContent.startsWith(label))?.querySelector('input,select');
async function setField(element,value){assert.ok(element);await act(async()=>{if(element.tagName==='SELECT'){element.value=value;element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));}else{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));}});}
async function waitFor(predicate,message='Expected app state',timeout=4000){const end=Date.now()+timeout;while(Date.now()<end){await act(async()=>{await delay(15);});const value=predicate();if(value)return value;}assert.fail(message+'\n'+host.textContent.slice(-1800));}
const piece=square=>host.querySelector(`[data-square="${square}"] img`)?.getAttribute('src');
const firstSquare=()=>host.querySelector('[data-square]')?.getAttribute('data-square');
const archive=()=>JSON.parse(localStorage.getItem('knightfall:games')||'[]');
const seat=()=>JSON.parse(sessionStorage.getItem(`knightfall.lan.${origin}`)||'null');
const currentClient=()=>[...appClients].at(-1);

test('Wi-Fi tabs support arrow, Home and End navigation with a single tab stop and named panel',async()=>{
 await clickText('Play with friends');
 const tabs=all('.network-tabs [role="tab"]');assert.equal(tabs.length,2);assert.deepEqual(tabs.map(tab=>tab.tabIndex),[0,-1]);
 const key=async(value)=>{await act(async()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:value,bubbles:true})));};
 tabs[0].focus();await key('ArrowRight');assert.equal(document.activeElement,tabs[1]);assert.deepEqual(tabs.map(tab=>tab.tabIndex),[-1,0]);assert.equal(tabs[1].getAttribute('aria-selected'),'true');assert.ok(field('Room code'));assert.equal(host.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby'),tabs[1].id);
 await key('ArrowRight');assert.equal(document.activeElement,tabs[0]);assert.ok(field('Time control'));await key('End');assert.equal(document.activeElement,tabs[1]);await key('Home');assert.equal(document.activeElement,tabs[0]);await key('ArrowLeft');assert.equal(document.activeElement,tabs[1]);
});
async function boardMove(from,to){await click(host.querySelector(`[data-square="${from}"]`));await click(host.querySelector(`[data-square="${to}"]`));}
async function createRoom(name='Host',color='w'){
 await clickText('Play with friends');await waitFor(()=>field('Play as'),'Expected room setup');await setField(field('Your name'),name);await setField(field('Play as'),color);await clickText('Create Wi-Fi room');
 await waitFor(()=>host.querySelector('.room-code'),'Expected waiting room');return host.querySelector('.room-code').textContent.trim();
}
async function rawPeer(){
 const socket=new WebSocket(`${origin.replace('http:','ws:')}/ws`,{origin});const queue=[],waiters=[];
 const peer={socket,snapshot:null,send:message=>socket.send(JSON.stringify(message)),wait(predicate,timeout=4000){const index=queue.findIndex(predicate);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiting={predicate,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiting),1);reject(new Error('Peer message timeout: '+JSON.stringify(queue)));},timeout)};waiters.push(waiting);});},close(){for(const waiter of waiters)clearTimeout(waiter.timer);waiters.length=0;socket.terminate();}};
 socket.on('message',bytes=>{const message=JSON.parse(bytes);if(message.type==='snapshot')peer.snapshot=message.snapshot;const waiting=waiters.find(item=>item.predicate(message));if(waiting){clearTimeout(waiting.timer);waiters.splice(waiters.indexOf(waiting),1);waiting.resolve(message);}else queue.push(message);});socket.on('error',()=>{});peers.push(peer);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});return peer;
}
async function joinPeer(code,name='Visitor'){
 let peer;await act(async()=>{peer=await rawPeer();peer.send({type:'join',code,name});await peer.wait(message=>message.type==='snapshot'&&message.snapshot.status==='playing');});
 await waitFor(()=>host.querySelector('.status-message')?.textContent.includes('Host to move'),'Expected joined game');return peer;
}
async function peerAction(peer,command,predicate){let result;await act(async()=>{peer.send(command);result=await peer.wait(predicate);});return result;}
async function makeTwoMoves(peer){await boardMove('e2','e4');await waitFor(()=>peer.snapshot?.history.length===1);await peerAction(peer,{type:'move',from:'e7',to:'e5'},m=>m.type==='snapshot'&&m.snapshot.history.length===2);await waitFor(()=>piece('e5')?.endsWith('bP.svg'));}

test('hosting creates a shareable waiting room and a real second connection starts legal play',async()=>{
 const code=await createRoom();assert.match(code,/^[A-HJ-NP-Z2-9]{6}$/);assert.ok(host.textContent.includes('Waiting for a friend.'));assert.equal(exactButton('Resign'),undefined);assert.equal(exactButton('Draw'),undefined);assert.ok(exactButton('Leave room'));
 const expectedAddresses=lan.urls.filter(url=>!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname));assert.deepEqual(all('.lan-address-list button').map(button=>button.textContent),expectedAddresses);
 await click(host.querySelector('.room-code'));assert.deepEqual(copies,[code]);assert.equal(seat().code,code);
 const peer=await joinPeer(code);assert.ok(host.textContent.includes('Visitor'));assert.equal(firstSquare(),'a8');assert.equal(host.querySelector('[data-square="e2"]').getAttribute('aria-disabled'),'false');
 await boardMove('e2','e5');assert.ok(piece('e2')?.endsWith('wP.svg'));assert.equal(peer.snapshot.history.length,0);
 await makeTwoMoves(peer);assert.deepEqual(peer.snapshot.history,['e4','e5']);assert.match(host.querySelector('.move-list').textContent,/e4.*e5/);assert.equal(archive().length,1);assert.equal(engineJobs.length,0,'Live LAN play must not invoke a bot engine');
});

test('clock snapshots preserve flipped orientation and an earlier replay selection',async()=>{
 const peer=await joinPeer(await createRoom());await makeTwoMoves(peer);await clickLabel('Flip board');assert.equal(firstSquare(),'h1');
 await clickLabel('Move 1, White: e4');assert.ok(piece('e7')?.endsWith('bP.svg'));assert.equal(piece('e5'),undefined);assert.ok(host.querySelector('.history-notice'));
 fakeNow+=1500;await waitFor(()=>currentClient().snapshot.clocks.w===598500,'Expected server clock tick');
 assert.equal(firstSquare(),'h1');assert.ok(piece('e7')?.endsWith('bP.svg'));assert.equal(piece('e5'),undefined);assert.equal(host.querySelector('.replay-controls>span').textContent,'Move 1 · White');assert.ok(host.querySelector('.clock.active').textContent.includes('9:59'));
 await clickLabel('Latest position');assert.ok(piece('e5')?.endsWith('bP.svg'));assert.equal(firstSquare(),'h1');
});

test('a rematch changes game identity and colors without overwriting the finished archive',async()=>{
 const peer=await joinPeer(await createRoom());await makeTwoMoves(peer);const originalId=peer.snapshot.gameId;
 await peerAction(peer,{type:'resign'},m=>m.type==='snapshot'&&m.snapshot.status==='finished');await waitFor(()=>host.querySelector('.game-result'));
 assert.equal(archive().find(game=>game.id===`lan-${originalId}`).result.winner,'w');await clickText('Rematch');await waitFor(()=>peer.snapshot.rematchVotes.includes('w'));await peerAction(peer,{type:'rematch'},m=>m.type==='snapshot'&&m.snapshot.status==='playing'&&m.snapshot.gameId!==originalId);
 await waitFor(()=>firstSquare()==='h1'&&!host.querySelector('.game-result'));const rematchId=peer.snapshot.gameId;assert.notEqual(rematchId,originalId);assert.equal(peer.snapshot.yourColor,'w');
 await peerAction(peer,{type:'move',from:'e2',to:'e4'},m=>m.type==='snapshot'&&m.snapshot.gameId===rematchId&&m.snapshot.history.length===1);await waitFor(()=>archive().length===2);
 const games=archive();assert.equal(games.find(game=>game.id===`lan-${originalId}`).moves.length,2);assert.equal(games.find(game=>game.id===`lan-${originalId}`).result.reason,'Resignation');assert.equal(games.find(game=>game.id===`lan-${rematchId}`).playerColor,'b');assert.equal(games.find(game=>game.id===`lan-${rematchId}`).moves.length,1);
});

test('resuming the same room replaces the connection without clearing its saved seat',async()=>{
 const peer=await joinPeer(await createRoom());const saved=seat(),oldClient=currentClient();await clickText('Play with friends');await clickText('Join a room');await waitFor(()=>all('button').find(button=>button.textContent.includes('Resume saved seat')));
 await click(all('button').find(button=>button.textContent.includes('Resume saved seat')));await waitFor(()=>host.querySelector('.status-message')?.textContent.includes('Host to move'));
 assert.notEqual(currentClient(),oldClient);assert.equal(oldClient.connection,'disconnected');assert.deepEqual(seat(),saved);assert.equal(peer.snapshot.status,'playing');assert.equal(peer.snapshot.players.w.connected,true);
 await boardMove('e2','e4');await waitFor(()=>peer.snapshot.history.length===1);assert.ok(piece('e4')?.endsWith('wP.svg'));assert.ok(!host.textContent.includes('Disconnected.'));
});

test('switching to another room on the same host preserves the new seat and closes the old game',async()=>{
 const oldCode=await createRoom();const peer=await joinPeer(oldCode);await boardMove('e2','e4');await waitFor(()=>peer.snapshot.history.length===1);const oldId=peer.snapshot.gameId;
 const newCode=await createRoom('Host');assert.notEqual(newCode,oldCode);await waitFor(()=>peer.snapshot.status==='finished');assert.equal(peer.snapshot.result.winner,'b');assert.equal(seat().code,newCode);assert.equal(currentClient().snapshot.code,newCode);assert.equal(archive().find(game=>game.id===`lan-${oldId}`).result.winner,'b');
 await peerAction(peer,{type:'sync'},m=>m.type==='snapshot'&&m.snapshot.status==='finished');assert.ok(host.textContent.includes('Waiting for a friend.'));assert.equal(host.querySelector('.room-code').textContent.trim(),newCode);
});

test('leaving for puzzles requires confirmation and records the loss on both sides',async()=>{
 const peer=await joinPeer(await createRoom());await boardMove('e2','e4');await waitFor(()=>peer.snapshot.history.length===1);const gameId=peer.snapshot.gameId;
 await clickLabel('Puzzles');assert.ok(host.querySelector('[role="dialog"][aria-label="Leave your Wi-Fi game?"]'));assert.equal(peer.snapshot.status,'playing');await clickText('Keep playing');assert.equal(host.querySelector('[role="dialog"]'),null);assert.equal(peer.snapshot.status,'playing');
 await clickLabel('Puzzles');await clickText('Leave game');await waitFor(()=>host.textContent.includes('DAILY PRACTICE')&&peer.snapshot.status==='finished');assert.equal(peer.snapshot.result.winner,'b');assert.equal(archive().find(game=>game.id===`lan-${gameId}`).result.winner,'b');assert.equal(archive().find(game=>game.id===`lan-${gameId}`).result.reason,'Left game');assert.equal(seat(),null);
 await peerAction(peer,{type:'sync'},m=>m.type==='snapshot'&&m.snapshot.status==='finished');assert.ok(host.textContent.includes('DAILY PRACTICE'));assert.equal(host.querySelector('.room-code'),null);
});

test('importing a PGN during an active Wi-Fi game preserves the leave confirmation and cancel keeps the room',async()=>{
 const peer=await joinPeer(await createRoom());await makeTwoMoves(peer);const liveId=peer.snapshot.gameId,client=currentClient(),saved=seat();
 await clickLabel('Analysis');
 const importStudy=async()=>{await clickText('Import game');const textarea=host.querySelector('#import-text');assert.ok(textarea);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'1. d4 d5 2. c4 e6 *');textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await clickText('Analyze game');};
 await importStudy();assert.ok(host.querySelector('[role="dialog"][aria-label="Leave your Wi-Fi game?"]'),'Import must not dismiss the active-game leave confirmation');assert.equal(peer.snapshot.status,'playing');assert.equal(client.snapshot.gameId,liveId);assert.deepEqual(client.snapshot.history,['e4','e5']);
 await clickText('Keep playing');assert.equal(host.querySelector('[role="dialog"]'),null);assert.equal(peer.snapshot.status,'playing');assert.equal(currentClient(),client);assert.deepEqual(seat(),saved);assert.ok(piece('e4')?.endsWith('wP.svg'));assert.ok(piece('e5')?.endsWith('bP.svg'));
 await importStudy();await clickText('Leave game');await waitFor(()=>peer.snapshot.status==='finished'&&JSON.parse(localStorage.getItem('knightfall:current')).mode==='analysis','Expected confirmed import to finish room and load PGN');
 const imported=JSON.parse(localStorage.getItem('knightfall:current'));assert.deepEqual(imported.moves.map(move=>move.san),['d4','d5','c4','e6']);assert.equal(peer.snapshot.result.winner,'b');assert.equal(archive().find(game=>game.id===`lan-${liveId}`).result.reason,'Left game');assert.equal(seat(),null);assert.equal(client.connection,'disconnected');assert.equal(host.querySelector('[role="dialog"]'),null);assert.ok(piece('c4')?.endsWith('wP.svg'));assert.ok(piece('e6')?.endsWith('bP.svg'));
});

test('a dropped connection locks the board and automatically restores the same seat and clock',async()=>{
 const peer=await joinPeer(await createRoom());await makeTwoMoves(peer);await clickLabel('Flip board');const client=currentClient(),saved=seat();
 await act(async()=>{client.socket.terminate();await delay(20);});await waitFor(()=>host.querySelector('.inline-error')?.textContent.includes('Reconnecting'),'Expected reconnect status');assert.equal(host.querySelector('[data-square="e2"]').getAttribute('aria-disabled'),'true');
 fakeNow+=2500;await waitFor(()=>peer.snapshot.players.w.connected===false&&peer.snapshot.clocks.w===597500,'Disconnected clock continues at the host');
 await waitFor(()=>client.connection==='connected'&&!host.querySelector('.inline-error'),'Expected automatic reconnect',6000);assert.deepEqual(seat(),saved);assert.equal(currentClient(),client);assert.equal(firstSquare(),'h1');assert.ok(piece('e4')?.endsWith('wP.svg'));assert.ok(piece('e5')?.endsWith('bP.svg'));assert.equal(client.snapshot.clocks.w,597500);assert.ok(host.querySelector('.clock.active').textContent.includes('9:58'));assert.equal(host.querySelector('[data-square="g1"]').getAttribute('aria-disabled'),'false');
});

test('draw offers can be declined and accepted through the real room protocol',async()=>{
 const peer=await joinPeer(await createRoom());await makeTwoMoves(peer);
 await peerAction(peer,{type:'offer_draw'},message=>message.type==='snapshot'&&message.snapshot.drawOffer==='b');await waitFor(()=>host.querySelector('.draw-offer'));await clickText('Decline');await waitFor(()=>peer.snapshot.drawOffer===null&&!host.querySelector('.draw-offer'));
 await clickText('Draw');await waitFor(()=>peer.snapshot.drawOffer==='w');assert.equal(host.querySelector('.draw-offer'),null,'Own offer must not show an Accept control');await peerAction(peer,{type:'accept_draw'},message=>message.type==='snapshot'&&message.snapshot.status==='finished');await waitFor(()=>host.querySelector('.game-result h3')?.textContent==='Draw');assert.equal(archive()[0].result.winner,null);assert.equal(archive()[0].result.reason,'Draw by agreement');assert.equal(exactButton('Draw'),undefined);
});

test('a Black host waits for White and the waiting-room clock does not run',async()=>{
 const code=await createRoom('Host','b');assert.equal(firstSquare(),'h1');fakeNow+=120000;await act(async()=>{await delay(20);});assert.equal(currentClient().snapshot.clocks.b,600000);assert.equal(currentClient().snapshot.clocks.w,600000);
 let peer;await act(async()=>{peer=await rawPeer();peer.send({type:'join',code,name:'Visitor'});await peer.wait(message=>message.type==='snapshot'&&message.snapshot.status==='playing');});await waitFor(()=>host.querySelector('.status-message')?.textContent.includes('Visitor to move'));assert.equal(host.querySelector('[data-square="e7"]').getAttribute('aria-disabled'),'true');assert.equal(peer.snapshot.clocks.w,600000);
 await peerAction(peer,{type:'move',from:'e2',to:'e4'},message=>message.type==='snapshot'&&message.snapshot.history.length===1);await waitFor(()=>host.querySelector('[data-square="e7"]').getAttribute('aria-disabled')==='false');await boardMove('e7','e5');await waitFor(()=>peer.snapshot.history.length===2);assert.deepEqual(peer.snapshot.history,['e4','e5']);assert.equal(archive()[0].playerColor,'b');assert.equal(firstSquare(),'h1');
});
