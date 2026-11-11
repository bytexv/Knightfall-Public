import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalEngine } from '../src/lib/engine.ts';
import { Chess } from 'chess.js';

const START = new Chess().fen();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function mockFactory({ searchDelay = 2, silent = false } = {}) {
  const workers = [];
  const factory = () => {
    const worker = { onmessage: null, onerror: null, terminated: false, commands: [], timer: null,
      emit(data) { this.onmessage?.({ data }); },
      postMessage(message) {
        this.commands.push(message);
        if (silent) return;
        if (message === 'uci') queueMicrotask(() => this.emit('uciok'));
        if (message === 'isready') queueMicrotask(() => this.emit('readyok'));
        if (message.startsWith('go ')) this.timer = setTimeout(() => { this.emit('info depth 8 score cp 21 pv e2e4 e7e5'); this.emit('bestmove e2e4'); }, searchDelay);
        if (message === 'stop') { clearTimeout(this.timer); queueMicrotask(() => this.emit('bestmove e2e4')); }
      },
      terminate() { this.terminated = true; clearTimeout(this.timer); },
    };
    workers.push(worker);
    return worker;
  };
  return { factory, workers };
}

test('an idle worker releases memory and lazily restarts with bounded Hash', async () => {
  const { factory, workers } = mockFactory();
  const engine = new LocalEngine({ workerFactory: factory, idleTimeoutMs: 15 });
  try {
    await engine.analyze(START);
    assert.ok(workers[0].commands.includes('setoption name Hash value 16'));
    await wait(30);
    assert.equal(engine.status, 'idle');
    assert.equal(workers[0].terminated, true);
    const result = await engine.analyze(START);
    assert.equal(result.bestMove, 'e2e4');
    assert.equal(workers.length, 2);
  } finally { engine.destroy(); }
  assert.equal(workers.every(worker => worker.terminated), true);
});

test('an idle timer never interrupts an active or queued search', async () => {
  const { factory, workers } = mockFactory({ searchDelay: 35 });
  const engine = new LocalEngine({ workerFactory: factory, idleTimeoutMs: 5 });
  try {
    const results = await Promise.all([engine.analyze(START), engine.analyze(START)]);
    assert.equal(results.length, 2);
    assert.equal(workers.length, 1);
    assert.equal(workers[0].terminated, false);
    await wait(15);
    assert.equal(workers[0].terminated, true);
  } finally { engine.destroy(); }
});

test('a third engine evicts an idle warm worker without invalidating its reusable instance', async () => {
  const { factory, workers } = mockFactory();
  const engines = Array.from({ length: 3 }, () => new LocalEngine({ workerFactory: factory, idleTimeoutMs: 0 }));
  try {
    for (const engine of engines) await engine.analyze(START);
    assert.equal(workers.filter(worker => !worker.terminated).length, 2);
    assert.equal(engines[0].status, 'idle');
    assert.equal((await engines[0].analyze(START)).bestMove, 'e2e4');
    assert.equal(workers.filter(worker => !worker.terminated).length, 2);
  } finally { for (const engine of engines) engine.destroy(); }
});

test('old worker messages cannot complete a new search after an idle restart', async () => {
  const { factory, workers } = mockFactory({ searchDelay: 20 });
  const engine = new LocalEngine({ workerFactory: factory, idleTimeoutMs: 10 });
  try {
    await engine.analyze(START);
    const staleHandler = workers[0].onmessage;
    await wait(20);
    const pending = engine.analyze(START);
    await wait(1);
    staleHandler({ data: 'info depth 99 score cp 9999 pv a2a4' });
    staleHandler({ data: 'bestmove a2a4' });
    const result = await pending;
    assert.equal(result.bestMove, 'e2e4');
    assert.equal(result.score, 21);
    assert.equal(result.depth, 8);
  } finally { engine.destroy(); }
});

test('destroy during readiness rejects waiting callers and releases the worker exactly once', async () => {
  const { factory, workers } = mockFactory({ silent: true });
  const engine = new LocalEngine({ workerFactory: factory, initializationTimeout: 1000 });
  const ready = engine.initialize();
  const search = engine.analyze(START);
  const settled = Promise.allSettled([ready, search]);
  engine.destroy(); engine.destroy();
  const results = await settled;
  assert.equal(results.every(result => result.status === 'rejected' && result.reason.name === 'AbortError'), true);
  assert.equal(workers[0].terminated, true);
  assert.equal(engine.status, 'destroyed');
});

test('repeated startup, cancel and destroy leaves no live mock workers or unresolved requests', async () => {
  const { factory, workers } = mockFactory({ searchDelay: 20 });
  for (let i = 0; i < 25; i++) {
    const engine = new LocalEngine({ workerFactory: factory, idleTimeoutMs: 10 });
    await engine.initialize();
    const result = engine.analyze(START);
    const settled = Promise.allSettled([result]);
    await wait(1);
    engine.cancel();
    engine.destroy();
    assert.equal((await settled)[0].status, 'rejected');
  }
  assert.equal(workers.length, 25);
  assert.equal(workers.every(worker => worker.terminated), true);
});

test('a fallback instance can go idle and restart without retrying unsupported WASM', async () => {
  let starts = 0;
  const engine = new LocalEngine({ workerFactory: () => { starts++; throw new Error('WASM unsupported'); }, idleTimeoutMs: 10 });
  const mate = '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1';
  try {
    assert.equal((await engine.analyze(mate, { movetime: 100 })).engine, 'Knightfall Lite');
    await wait(20);
    assert.equal(engine.status, 'idle');
    assert.equal((await engine.analyze(mate, { movetime: 100 })).mate, 1);
    assert.equal(starts, 1);
  } finally { engine.destroy(); }
});

test('full engine uses single-thread NNUE without isolation and bounded multi-core with isolation',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crossOriginIsolated');
 try{
  for(const isolated of [false,true]){
   Object.defineProperty(globalThis,'crossOriginIsolated',{value:isolated,configurable:true});
   const {factory,workers}=mockFactory();let url;
   const engine=new LocalEngine({mode:'full',threads:100,workerFactory:u=>{url=u;return factory();}});
   try{await engine.initialize();assert.match(url,isolated?/8e4d048/:/single-a496a04/);assert.ok(workers[0].commands.includes('setoption name Hash value 32'));
    const threads=Number(workers[0].commands.find(s=>s.startsWith('setoption name Threads')).split(' ').at(-1));assert.ok(threads>=1&&threads<=4);if(!isolated)assert.equal(threads,1);
   }finally{engine.destroy();}
  }
 }finally{if(original)Object.defineProperty(globalThis,'crossOriginIsolated',original);else delete globalThis.crossOriginIsolated;}
});
