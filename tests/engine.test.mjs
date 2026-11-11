import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { LocalEngine, parseUciInfo } from '../src/lib/engine.ts';
import { evaluatePosition, searchPosition } from '../src/lib/engine-fallback.ts';
import { validatedPosition } from '../src/lib/engine-position.ts';

const START = new Chess().fen();
const MATE_IN_ONE = '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1';
let engineDirectory;

before(async () => {
  engineDirectory = await mkdtemp(path.join(tmpdir(), 'knightfall-engine-'));
  await Promise.all([
    copyFile(new URL('../public/engine/stockfish.js', import.meta.url), path.join(engineDirectory, 'stockfish.cjs')),
    copyFile(new URL('../public/engine/stockfish.wasm', import.meta.url), path.join(engineDirectory, 'stockfish.wasm')),
  ]);
});
after(async () => { await rm(engineDirectory, { recursive: true, force: true }); });

function nativeWorker() {
  const process = spawn(globalThis.process.execPath, [path.join(engineDirectory, 'stockfish.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage(message) { process.stdin.write(`${message}\n`); },
    terminate() { process.kill(); },
  };
  let buffer = '';
  process.stdout.on('data', chunk => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      worker.onmessage?.({ data: buffer.slice(0, end) });
      buffer = buffer.slice(end + 1);
    }
  });
  process.on('error', error => worker.onerror?.(error));
  process.stdin.on('error', () => {});
  return worker;
}

test('UCI scores and mate signs are normalized to White, including Black-to-move positions', () => {
  const black = START.replace(' w ', ' b ');
  assert.deepEqual(parseUciInfo('info depth 14 multipv 2 score cp 86 nodes 200 pv e2e4 e7e5', START), { multipv: 2, score: 86, depth: 14, pv: ['e2e4', 'e7e5'] });
  assert.equal(parseUciInfo('info depth 9 score cp 235 pv e7e5', black).score, -235);
  assert.equal(parseUciInfo('info depth 9 score mate 3 pv e7e5', black).mate, -3);
  assert.equal(parseUciInfo('info depth 9 score mate -2 pv e7e5', black).mate, 2);
  assert.equal(parseUciInfo('info depth 9 score cp 12 lowerbound pv e2e4', START), null);
  assert.equal(parseUciInfo('info string NNUE evaluation using network', START), null);
});

test('fallback evaluation is symmetric and values a material advantage', () => {
  assert.equal(evaluatePosition(new Chess()), 0);
  assert.ok(evaluatePosition(new Chess('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1')) > 800);
  assert.ok(evaluatePosition(new Chess('4k3/4q3/8/8/8/8/8/4K3 b - - 0 1')) < -800);
});

test('fallback finds mate in one and returns a legal principal variation', () => {
  const result = searchPosition(MATE_IN_ONE, { depth: 3, movetime: 1200, multiPV: 3 });
  const game = new Chess(MATE_IN_ONE);
  assert.ok(result.bestMove);
  game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4), promotion: result.bestMove[4] });
  assert.ok(game.isCheckmate());
  assert.equal(result.mate, 1);
  assert.equal(result.engine, 'Knightfall Lite');
  for (const line of result.lines) {
    const position = new Chess(MATE_IN_ONE);
    for (const move of line.pv) assert.ok(position.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }));
  }
});

test('fallback respects terminal positions and reports invalid FEN', () => {
  const result = searchPosition('7k/5K2/8/8/8/8/8/8 b - - 0 1');
  assert.equal(result.bestMove, null);
  assert.equal(result.score, 0);
  const mate = searchPosition('7k/5KQ1/8/8/8/8/8/8 b - - 0 1');
  assert.equal(mate.bestMove, null);
  assert.equal(mate.mate, 0);
  assert.ok(mate.score > 0);
  assert.throws(() => searchPosition('broken position'));
});

test('fallback handles Black mating, a hanging queen, and promotion notation', () => {
  const blackMate = searchPosition('7K/5k2/6q1/8/8/8/8/8 b - - 0 1', { depth: 2, movetime: 250 });
  assert.equal(blackMate.mate, -1);
  assert.equal(blackMate.score, -10_000);
  const capture = searchPosition('3q2k1/8/8/8/8/8/8/3R2K1 w - - 0 1', { depth: 2, movetime: 350 });
  assert.equal(capture.bestMove, 'd1d8');
  const promotion = searchPosition('8/1P6/8/8/8/4K3/7k/8 w - - 0 1', { depth: 2, movetime: 350 });
  assert.equal(promotion.bestMove, 'b7b8q');
});

test('fallback search stays bounded and picks legal moves on both sides', () => {
  for (const fen of [START, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1']) {
    const start = performance.now();
    const result = searchPosition(fen, { depth: 5, movetime: 100, skill: 2 });
    assert.ok(performance.now() - start < 1500);
    const game = new Chess(fen);
    assert.ok(game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4), promotion: result.bestMove[4] }));
  }
});

test('bundled Stockfish starts, returns real analysis, and solves mate', { timeout: 15_000 }, async () => {
  const states = [];
  const engine = new LocalEngine({ workerFactory: nativeWorker, onStatus: status => states.push(status) });
  try {
    const result = await engine.analyze(MATE_IN_ONE, { depth: 12, movetime: 200, multiPV: 3 });
    assert.equal(result.engine, 'Stockfish 17.1 Lite');
    assert.ok(result.depth > 0);
    const game = new Chess(MATE_IN_ONE);
    game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4), promotion: result.bestMove[4] });
    assert.ok(game.isCheckmate());
    assert.equal(result.mate, 1);
    assert.ok(states.includes('ready'));
  } finally { engine.destroy(); }
});

test('queued Stockfish searches cannot leak scores or moves between positions', { timeout: 15_000 }, async () => {
  const engine = new LocalEngine({ workerFactory: nativeWorker });
  try {
    const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const results = await Promise.all([
      engine.analyze(START, { depth: 7, movetime: 100, multiPV: 2 }),
      engine.analyze(black, { depth: 7, movetime: 100, multiPV: 1 }),
    ]);
    results.forEach((result, i) => {
      const game = new Chess(i === 0 ? START : black);
      assert.ok(game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4), promotion: result.bestMove[4] }));
      assert.ok(result.lines.length >= 1);
    });
    assert.equal(results[1].lines.length, 1);
  } finally { engine.destroy(); }
});

test('cancel rejects active and queued work, then a fresh search succeeds', { timeout: 15_000 }, async () => {
  const engine = new LocalEngine({ workerFactory: nativeWorker });
  try {
    await engine.initialize();
    const first = engine.analyze(START, { depth: 25, movetime: 3000 });
    const queued = engine.analyze(START, { depth: 20, movetime: 2000 });
    const settled = Promise.allSettled([first, queued]);
    await new Promise(resolve => setTimeout(resolve, 30));
    engine.cancel();
    const cancelled = await settled;
    for (const item of cancelled) { assert.equal(item.status, 'rejected'); assert.equal(item.reason.name, 'AbortError'); }
    const result = await engine.analyze(MATE_IN_ONE, { movetime: 100 });
    assert.equal(result.mate, 1);
    assert.equal(result.engine, 'Stockfish 17.1 Lite');
  } finally { engine.destroy(); }
});

test('startup failure uses the local fallback and names it honestly', { timeout: 10_000 }, async () => {
  const engine = new LocalEngine({ workerFactory: () => { throw new Error('WASM unavailable'); } });
  try {
    const result = await engine.analyze(MATE_IN_ONE, { depth: 2, movetime: 150 });
    assert.equal(result.engine, 'Knightfall Lite');
    assert.equal(engine.status, 'fallback');
    assert.equal(result.mate, 1);
  } finally { engine.destroy(); }
});

test('Stockfish client respects rule-based draws without suggesting another move', { timeout: 15_000 }, async () => {
  const engine = new LocalEngine({ workerFactory: nativeWorker });
  try {
    for (const fen of [
      '7k/5K2/8/8/8/8/8/8 b - - 0 1', // insufficient material
      '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1', // stalemate
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 100 51', // fifty-move rule
    ]) {
      const result = await engine.analyze(fen);
      assert.equal(result.bestMove, null);
      assert.equal(result.score, 0);
      assert.equal(result.mate, undefined);
    }
  } finally { engine.destroy(); }
});

test('startup timeout, cancellation before readiness, and late messages cannot revive old work', { timeout: 10_000 }, async () => {
  const silentWorker = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
  const engine = new LocalEngine({ workerFactory: () => silentWorker, initializationTimeout: 30 });
  const job = engine.analyze(START, { depth: 2, movetime: 100 });
  const assertion = assert.rejects(job, error => error.name === 'AbortError');
  engine.cancel();
  await assertion;
  try {
    const next = await engine.analyze(MATE_IN_ONE, { depth: 2, movetime: 100 });
    assert.equal(next.engine, 'Knightfall Lite');
    assert.equal(next.mate, 1);
    silentWorker.onmessage?.({ data: 'info depth 99 score cp 9999 pv a2a4' });
    silentWorker.onmessage?.({ data: 'bestmove a2a4' });
    assert.equal(engine.status, 'fallback');
  } finally { engine.destroy(); }
  silentWorker.onmessage?.({ data: 'readyok' });
  assert.equal(engine.status, 'destroyed');
});

test('invalid positions are rejected without starting workers; destroyed engines reject new jobs', async () => {
  let started = false;
  const engine = new LocalEngine({ workerFactory: () => { started = true; return nativeWorker(); } });
  await assert.rejects(engine.analyze('invalid'), /invalid chess position/);
  await assert.rejects(engine.analyze('8/8/8/8/8/8/4k3/4K3 w - - 0 1'), /cannot be in check/);
  assert.equal(started, false);
  engine.destroy();
  await assert.rejects(engine.analyze(START), /closed/);
});

test('FEN validation rejects impossible king, castling and en-passant states while allowing legal checks', () => {
  assert.throws(() => validatedPosition('8/8/8/8/8/8/4k3/4K3 w - - 0 1'), /cannot be in check/);
  assert.throws(() => validatedPosition('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1'), /Castling right/);
  assert.throws(() => validatedPosition('4k3/8/8/8/8/8/8/4K3 w - d6 0 1'), /en-passant/);
  assert.doesNotThrow(() => validatedPosition('4k3/8/8/3p4/8/8/8/4K3 w - d6 0 1'));
  assert.doesNotThrow(() => validatedPosition('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'));
});
