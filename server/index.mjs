import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.mp3':'audio/mpeg','.wav':'audio/wav'};
const opposite = color => color === 'w' ? 'b' : 'w';
const textName = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g,'').replace(/\s+/g,' ').trim().slice(0,24) || 'Player' : 'Player';
const pgnName = value => value.replace(/["\\]/g,' ').replace(/\s+/g,' ').trim();
const safeEqual = (a,b) => { if(typeof a!=='string' || typeof b!=='string') return false; const aa=Buffer.from(a),bb=Buffer.from(b); return aa.length===bb.length && timingSafeEqual(aa,bb); };
const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

/** Start an in-memory, server-authoritative local chess host. No internet service is used. */
export async function startLanServer({port=8787, host='0.0.0.0', staticDir=path.join(ROOT,'dist'), now=()=>performance.now(), tickInterval=100}={}) {
  const rooms = new Map();
  const clients = new Set();
  let closing = false;
  let closePromise;
  let boundPort = port;
  let urls = [];
  const allowedHosts = new Set(['localhost','127.0.0.1','[::1]',os.hostname().toLowerCase(),`${os.hostname().toLowerCase()}.local`]);
  if(!['0.0.0.0','::'].includes(host)) allowedHosts.add(host.toLowerCase());
  for(const list of Object.values(os.networkInterfaces())) for(const address of list || []) allowedHosts.add(address.family==='IPv6'?`[${address.address.toLowerCase()}]`:address.address);
  const trustedHost = header => {
    try { const url=new URL('http://'+header); return !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash && allowedHosts.has(url.hostname) && Number(url.port || 80)===boundPort; } catch { return false; }
  };
  const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const fail = (ws, code, message) => send(ws,{type:'error',code,message});
  const colorOf = (room,ws) => ['w','b'].find(c=>room.players[c]?.token === ws.context?.token) || null;
  const active = room => room.status === 'playing' && room.timeControl.baseSeconds > 0;
  const remaining = (room,color,at=now()) => Math.max(0, room.remaining[color] - (active(room) && room.chess.turn() === color ? Math.max(0,at-room.turnStartedAt) : 0));
  const touchClock = (room,at=now()) => {
    if(active(room)) room.remaining[room.chess.turn()] = remaining(room,room.chess.turn(),at);
    room.turnStartedAt = at;
  };
  const snapshot = (room,ws) => {
    const at = now();
    return {
      code:room.code, gameId:room.gameId, round:room.round, createdAt:room.createdAt, fen:room.chess.fen(), pgn:room.chess.pgn(), history:room.chess.history(),
      turn:room.chess.turn(), status:room.status, result:room.result, lastMove:room.lastMove,
      players:Object.fromEntries(['w','b'].map(c=>[c,room.players[c] ? {name:room.players[c].name,connected:room.players[c].ws?.readyState===WebSocket.OPEN} : null])),
      clocks:{w:Math.round(remaining(room,'w',at)),b:Math.round(remaining(room,'b',at)),increment:room.timeControl.incrementSeconds*1000,running:active(room)?room.chess.turn():null,serverNow:Date.now(),enabled:room.timeControl.baseSeconds>0},
      timeControl:room.timeControl, yourColor:colorOf(room,ws), drawOffer:room.drawOffer,rematchVotes:[...room.rematchVotes],
    };
  };
  const broadcast = room => {
    for(const player of Object.values(room.players)) if(player?.ws) send(player.ws,{type:'snapshot',snapshot:snapshot(room,player.ws)});
  };
  const setHeaders = room => room.chess.header('Event','Knightfall Wi-Fi game','Site','Local network','Date',new Date(room.createdAt).toISOString().slice(0,10).replaceAll('-','.'),'White',pgnName(room.players.w?.name || 'Waiting for White'),'Black',pgnName(room.players.b?.name || 'Waiting for Black'),'TimeControl',room.timeControl.baseSeconds ? `${room.timeControl.baseSeconds}+${room.timeControl.incrementSeconds}` : '-','Result','*');
  const finish = (room,winner,reason) => {
    touchClock(room);
    room.status='finished'; room.result={winner,reason}; room.drawOffer=null; room.updatedAt=now();
    room.chess.header('Result',winner==='w'?'1-0':winner==='b'?'0-1':'1/2-1/2','Termination',reason);
  };
  const canMate = (room,color) => {
    if(room.chess.isInsufficientMaterial()) return false;
    const mine=room.chess.board().flat().filter(p=>p && p.color===color && p.type!=='k');
    if(!mine.length) return false;
    const theirs=room.chess.board().flat().filter(p=>p && p.color!==color && p.type!=='k');
    if(mine.length===1 && ['b','n'].includes(mine[0].type) && !theirs.length) return false;
    return true;
  };
  const checkTimeout = room => {
    if(!active(room) || remaining(room,room.chess.turn()) > 0) return false;
    const loser=room.chess.turn(), winner=opposite(loser);
    finish(room,canMate(room,winner)?winner:null,canMate(room,winner)?'Time expired':'Time expired · insufficient mating material');
    return true;
  };
  const checkGameOver = room => {
    if(room.chess.isCheckmate()) finish(room,opposite(room.chess.turn()),'Checkmate');
    else if(room.chess.isStalemate()) finish(room,null,'Stalemate');
    else if(room.chess.isThreefoldRepetition()) finish(room,null,'Threefold repetition');
    else if(room.chess.isInsufficientMaterial()) finish(room,null,'Insufficient material');
    else if(room.chess.isDrawByFiftyMoves()) finish(room,null,'Fifty-move rule');
  };
  const detach = (ws,explicit=false) => {
    const room=rooms.get(ws.context?.room);
    if(!room) { ws.context=null; return; }
    const color=colorOf(room,ws), player=color && room.players[color];
    if(player?.ws === ws) {
      player.ws=null;
      if(explicit && room.status==='playing') finish(room,opposite(color),'Opponent left the room');
      if(explicit && room.status==='waiting') room.players[color]=null;
      room.updatedAt=now();
      broadcast(room);
    }
    ws.context=null;
  };
  const joinSeat = (room,ws,color,name,token) => {
    const old=room.players[color];
    if(old?.ws && old.ws!==ws) { old.ws.context=null; old.ws.close(4001,'Session resumed on another connection'); }
    const player={name:old?.name || textName(name),token:token || randomBytes(32).toString('hex'),ws};
    room.players[color]=player; ws.context={room:room.code,token:player.token}; room.updatedAt=now();
    if(room.status!=='finished') setHeaders(room);
    send(ws,{type:'joined',code:room.code,token:player.token,color});
    if(room.status==='waiting' && room.players.w && room.players.b) {room.status='playing';room.turnStartedAt=now();}
    broadcast(room);
  };
  const message = (ws,data) => {
    if(!data || typeof data!=='object' || Array.isArray(data) || typeof data.type!=='string') return fail(ws,'invalid_message','Send a valid chess room command.');
    if(data.type==='ping') return send(ws,{type:'pong',serverNow:Date.now()});
    if(data.type==='create') {
      if(ws.context) return fail(ws,'already_joined','Leave your current room before creating another.');
      if(rooms.size>=100) return fail(ws,'host_full','This host has too many rooms. Try again later.');
      let code; do {code=Array.from({length:6},()=>ALPHABET[randomInt(ALPHABET.length)]).join('');} while(rooms.has(code));
      const baseSeconds=Math.round(bounded(data.timeMinutes,10,0,180)*60);
      if(baseSeconds > 0 && baseSeconds<60) return fail(ws,'invalid_time','Timed games must have at least one minute.');
      const incrementSeconds=Math.round(bounded(data.incrementSeconds,0,0,60));
      const color=['w','b'].includes(data.color)?data.color:randomInt(2)?'w':'b';
      const room={code,gameId:randomBytes(12).toString('hex'),round:1,createdAt:Date.now(),chess:new Chess(),status:'waiting',result:null,lastMove:null,players:{w:null,b:null},timeControl:{baseSeconds,incrementSeconds},remaining:{w:baseSeconds*1000,b:baseSeconds*1000},turnStartedAt:now(),updatedAt:now(),drawOffer:null,rematchVotes:new Set()};
      rooms.set(code,room);joinSeat(room,ws,color,data.name);return;
    }
    if(data.type==='join') {
      if(ws.context) return fail(ws,'already_joined','Leave your current room before joining another.');
      const code=String(data.code || '').trim().toUpperCase();
      if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return fail(ws,'invalid_code','Enter the six-character room code.');
      const room=rooms.get(code);
      if(!room) return fail(ws,'room_not_found','That room was not found on this host. Check the address and code.');
      if(typeof data.token==='string') {
        const color=['w','b'].find(c=>safeEqual(room.players[c]?.token,data.token));
        if(!color) return fail(ws,'invalid_token','This saved seat is no longer available. Join a new room.');
        joinSeat(room,ws,color,data.name,data.token);return;
      }
      const color=['w','b'].find(c=>!room.players[c]);
      if(!color || room.status!=='waiting') return fail(ws,'room_full','This room already has two players.');
      joinSeat(room,ws,color,data.name);return;
    }
    if(data.type==='leave') {detach(ws,true);send(ws,{type:'left'});return;}
    const room=rooms.get(ws.context?.room), color=room && colorOf(room,ws);
    if(!room || !color || room.players[color]?.ws!==ws) return fail(ws,'not_joined','Join a room first.');
    room.updatedAt=now();
    if(checkTimeout(room)) broadcast(room);
    if(data.type==='sync') return send(ws,{type:'snapshot',snapshot:snapshot(room,ws)});
    if(data.type==='rematch') {
      if(room.status!=='finished') return fail(ws,'game_active','Finish this game before requesting a rematch.');
      room.rematchVotes.add(color);
      if(room.rematchVotes.size===2) {
        [room.players.w,room.players.b]=[room.players.b,room.players.w];room.gameId=randomBytes(12).toString('hex');room.round++;room.createdAt=Date.now();room.chess=new Chess();room.status='playing';room.result=null;room.lastMove=null;room.drawOffer=null;room.rematchVotes.clear();room.remaining={w:room.timeControl.baseSeconds*1000,b:room.timeControl.baseSeconds*1000};room.turnStartedAt=now();setHeaders(room);
      }
      broadcast(room);return;
    }
    if(room.status!=='playing') return fail(ws,'game_not_active',room.status==='waiting'?'Waiting for the second player.':'This game has finished.');
    if(data.type==='resign') {finish(room,opposite(color),'Resignation');broadcast(room);return;}
    if(data.type==='offer_draw') {
      if(room.drawOffer && room.drawOffer!==color) return fail(ws,'draw_pending','Your opponent has offered a draw. Accept or decline it.');
      room.drawOffer=color;broadcast(room);return;
    }
    if(data.type==='accept_draw') {
      if(!room.drawOffer || room.drawOffer===color) return fail(ws,'no_draw_offer','There is no opponent draw offer to accept.');
      finish(room,null,'Draw by agreement');broadcast(room);return;
    }
    if(data.type==='decline_draw') {if(room.drawOffer && room.drawOffer!==color) room.drawOffer=null;broadcast(room);return;}
    if(data.type==='move') {
      if(room.chess.turn()!==color) return fail(ws,'not_your_turn','Wait for your opponent’s move.');
      if(!/^[a-h][1-8]$/.test(data.from || '') || !/^[a-h][1-8]$/.test(data.to || '') || (data.promotion && !['q','r','b','n'].includes(data.promotion))) return fail(ws,'invalid_move','That move is not valid.');
      let move;
      touchClock(room);
      try { move=room.chess.move({from:data.from,to:data.to,promotion:data.promotion || 'q'}); } catch { return fail(ws,'illegal_move','That move is not legal in this position.'); }
      if(room.timeControl.baseSeconds>0) room.remaining[color]+=room.timeControl.incrementSeconds*1000;
      room.turnStartedAt=now();room.lastMove={from:move.from,to:move.to,san:move.san,...(move.promotion?{promotion:move.promotion}:{})};
      if(room.drawOffer && room.drawOffer!==color) room.drawOffer=null;
      checkGameOver(room);broadcast(room);return;
    }
    fail(ws,'unknown_command','That room command is not supported.');
  };

  const server = http.createServer(async(req,res)=>{
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    if(!trustedHost(req.headers.host)) return json(403,{error:'Use this computer’s local address to connect.'});
    if(!['GET','HEAD'].includes(req.method || '')) {res.setHeader('Allow','GET, HEAD');return json(405,{error:'Method not allowed'});}
    let pathname;
    try {pathname=decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);} catch {return json(400,{error:'Invalid URL'});}
    if(pathname==='/health') return json(200,{service:'knightfall-lan',version:'1.0.0',rooms:rooms.size});
    if(pathname==='/api/lan-info') return json(200,{urls,port:boundPort});
    if(pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(p=>p.startsWith('.'))) return json(403,{error:'Forbidden path'});
    try {
      const root=await realpath(staticDir);
      const requested=path.resolve(root,'.'+pathname);
      if(requested!==root && !requested.startsWith(root+path.sep)) return json(403,{error:'Forbidden path'});
      let file=requested;
      try {if((await stat(file)).isDirectory()) file=path.join(file,'index.html');} catch {if(path.extname(pathname)) return json(404,{error:'Not found'});file=path.join(root,'index.html');}
      const resolved=await realpath(file);
      if(resolved!==root && !resolved.startsWith(root+path.sep)) return json(403,{error:'Forbidden path'});
      const bytes=await readFile(resolved);
      res.writeHead(200,{'Content-Type':MIME[path.extname(resolved)] || 'application/octet-stream','Content-Length':bytes.length,'Cache-Control':path.extname(resolved)==='.html' || ['sw.js','sw-manifest.js','manifest.webmanifest'].includes(path.basename(resolved))?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
      res.end(req.method==='HEAD'?undefined:bytes);
    } catch(error) {
      if(error.code==='ENOENT') return json(404,{error:'Knightfall web build is missing. Run npm run build before starting the host.'});
      json(500,{error:'Unable to load this file.'});
    }
  });
  const wss = new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    let requestPath;try{requestPath=new URL(req.url,'http://localhost').pathname;}catch{socket.destroy();return;}
    if(requestPath!=='/ws' || !trustedHost(req.headers.host) || clients.size>=100 || closing) {socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    if(req.headers.origin) {
      let allowed=false;
      try {
        const origin=new URL(req.headers.origin), target=new URL('http://'+req.headers.host);
        const loopback=h=>['localhost','127.0.0.1','[::1]'].includes(h);
        allowed=(['http:','https:'].includes(origin.protocol) && (origin.host===target.host || (loopback(origin.hostname) && loopback(target.hostname)))) || (['http:','https:','capacitor:'].includes(origin.protocol) && origin.hostname==='localhost' && !origin.port);
      } catch { /* reject malformed origins */ }
      if(!allowed) {socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',ws=>{
    clients.add(ws);ws.context=null;ws.alive=true;ws.rate={count:0,since:now()};
    send(ws,{type:'hello',service:'knightfall-lan',version:1,urls});
    ws.on('pong',()=>{ws.alive=true;});
    ws.on('error',()=>{});
    ws.on('message',(raw,isBinary)=>{
      if(isBinary) return fail(ws,'invalid_message','Text commands only.');
      if(now()-ws.rate.since>5000) ws.rate={count:0,since:now()};
      if(++ws.rate.count>60) {ws.close(4008,'Too many requests');return;}
      let data;try {data=JSON.parse(raw.toString());} catch {return fail(ws,'invalid_json','Send valid JSON.');}
      try {message(ws,data);} catch {fail(ws,'server_error','The host could not process that command. Reconnect and try again.');}
    });
    ws.on('close',()=>{detach(ws);clients.delete(ws);});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});
  boundPort=server.address().port;
  urls=[`http://127.0.0.1:${boundPort}`];
  if(host==='0.0.0.0' || host==='::') {
    for(const list of Object.values(os.networkInterfaces())) for(const address of list || []) if(address.family==='IPv4' && !address.internal) urls.push(`http://${address.address}:${boundPort}`);
  } else if(host!=='127.0.0.1' && host!=='localhost' && host!=='::1') urls.push(`http://${host.includes(':')?'['+host+']':host}:${boundPort}`);
  urls=[...new Set(urls)];
  let lastSync=now();
  const ticker=setInterval(()=>{
    const at=now(),sync=at-lastSync>=1000;
    for(const room of rooms.values()) {
      const changed=checkTimeout(room);
      if(changed || (sync && room.status==='playing')) broadcast(room);
      const hasConnected=Object.values(room.players).some(p=>p?.ws?.readyState===WebSocket.OPEN);
      if(!hasConnected && at-room.updatedAt>2*60*60*1000) rooms.delete(room.code);
    }
    if(sync) lastSync=at;
  },tickInterval);ticker.unref();
  const heartbeat=setInterval(()=>{for(const ws of clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},30000);heartbeat.unref();
  const close=()=>{
    if(closePromise) return closePromise;
    closing=true;clearInterval(ticker);clearInterval(heartbeat);
    closePromise=new Promise(resolve=>{for(const ws of clients)ws.terminate();wss.close(()=>{});server.close(()=>resolve());server.closeIdleConnections?.();});
    return closePromise;
  };
  return {port:boundPort,urls,close,server};
}

const isCli = process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isCli) {
  const port=Number(process.env.KNIGHTFALL_PORT || 8787);
  startLanServer({port}).then(app=>{
    process.stdout.write('\nKnightfall · same-Wi-Fi chess\n\nOpen on this computer: '+app.urls[0]+'\n');
    for(const url of app.urls.slice(1)) process.stdout.write('Open on another device: '+url+'\n');
    process.stdout.write('\nKeep this window open while you play. Both devices must be on the same network.\n');
    for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>app.close().then(()=>process.exit(0)));
  }).catch(error=>{process.stderr.write('Cannot start Knightfall host: '+error.message+'\n');process.exitCode=1;});
}
