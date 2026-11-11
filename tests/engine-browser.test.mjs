import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { Chess } from 'chess.js';
import { LocalEngine } from '../src/lib/engine.ts';

function browserWorker(url) {
  const thread = new Worker(new URL('./engine-browser-worker.mjs', import.meta.url), { workerData: { url } });
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage(message) { thread.postMessage(message); },
    terminate() { void thread.terminate(); },
  };
  thread.on('message', data => worker.onmessage?.({ data }));
  thread.on('error', error => worker.onerror?.(error));
  return worker;
}

test('browser Stockfish branch loads its relative WASM and delivers UCI analysis without SharedArrayBuffer', { timeout: 15_000 }, async () => {
  const engine = new LocalEngine({ workerUrl: 'https://knightfall.test/engine/stockfish.js', workerFactory: browserWorker });
  try {
    const start = performance.now();
    const result = await engine.analyze(new Chess().fen(), { depth: 8, movetime: 180, multiPV: 3 });
    assert.equal(result.engine, 'Stockfish 17.1 Lite', 'the real browser branch must initialize, rather than silently falling back');
    assert.ok(result.bestMove);
    assert.ok(result.lines.length >= 2);
    assert.ok(result.depth >= 3);
    const game = new Chess();
    game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4), promotion: result.bestMove[4] });
    assert.ok(performance.now() - start < 10_000);
  } finally { engine.destroy(); }
});

test('browser worker cancellation drains an old search before analyzing the opposite side', { timeout: 15_000 }, async () => {
  const engine = new LocalEngine({ workerUrl: 'https://knightfall.test/engine/stockfish.js', workerFactory: browserWorker });
  try {
    await engine.initialize();
    const old = engine.analyze(new Chess().fen(), { depth: 28, movetime: 2000 });
    const cancelled = assert.rejects(old, error => error.name === 'AbortError');
    await new Promise(resolve => setTimeout(resolve, 30));
    engine.cancel();
    await cancelled;
    const blackFen = '6k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1';
    const result = await engine.analyze(blackFen, { depth: 9, movetime: 200 });
    assert.equal(result.engine, 'Stockfish 17.1 Lite');
    const game = new Chess(blackFen);
    game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4), promotion: result.bestMove[4] });
    assert.equal(game.turn(), 'w');
  } finally { engine.destroy(); }
});

test('the engine resolves WASM under subdirectories and Capacitor custom origins', { timeout: 15_000 }, async () => {
  for (const workerUrl of ['https://knightfall.test/apps/chess/engine/stockfish.js', 'capacitor://localhost/engine/stockfish.js']) {
    const engine = new LocalEngine({ workerUrl, workerFactory: browserWorker });
    try {
      const result = await engine.analyze('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', { depth: 6, movetime: 100 });
      assert.equal(result.engine, 'Stockfish 17.1 Lite', `failed to load assets for ${workerUrl}`);
      assert.equal(result.mate, 1);
    } finally { engine.destroy(); }
  }
});
