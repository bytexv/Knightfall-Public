/**
 * Reproducible local-engine profiling; no browser or external analysis service.
 * node --import tsx --expose-gc scripts/benchmark-engine.mjs --mode=all
 * node --import tsx scripts/benchmark-engine.mjs --mode=matches --profile=production
 */
import { Worker } from 'node:worker_threads';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Chess } from 'chess.js';
import { LocalEngine } from '../src/lib/engine.ts';
import { chooseBotMove, seededBotRandom } from '../src/lib/bot-policy.ts';
import { bots } from '../src/lib/game.ts';

const options = Object.fromEntries(process.argv.slice(2).filter(arg => arg.startsWith('--')).map(arg => arg.slice(2).split('=')));
const mode = options.mode || 'all';
const profile = options.profile || 'fixed';
if (!['all', 'memory', 'matches'].includes(mode)) throw new Error('mode must be all, memory, or matches');
if (!['fixed', 'production'].includes(profile)) throw new Error('profile must be fixed or production');
if (options.hash && (!Number.isInteger(Number(options.hash)) || Number(options.hash) < 4 || Number(options.hash) > 64)) throw new Error('hash must be a whole number from 4 to 64 MiB');
const rounds = Math.max(1, Math.min(5, Math.trunc(Number(options.rounds) || 1)));
const maxPlies = Math.max(20, Math.min(500, Math.trunc(Number(options['max-plies']) || 240)));
const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : 20261111;
const started = performance.now();
const report = { timestamp: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`, configuration: { mode, profile, rounds, maxPlies, seed, hashMb: options.hash ? Number(options.hash) : 16, productionBots: bots.filter(bot => ['sprout', 'scout', 'sage'].includes(bot.id)).map(({ id, skill, time }) => ({ id, skill, movetimeMs: time })), fixedSearch: { depth: 8, movetimeMs: 2000, skill: 20 } }, note: 'Node sandbox of the actual browser Stockfish branch. WASM byte lengths are exact; RSS includes the entire Node process and is not a phone measurement.', memory: [], matches: [], lifecycle: null };
async function saveReport() {
  if (!options.output) return;
  const destination = path.resolve(options.output);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2));
  if (report.matches.length) {
    const pgnDirectory = path.join(path.dirname(destination), 'engine-pgns');
    await mkdir(pgnDirectory, { recursive: true });
    const game = report.matches.at(-1);
    await writeFile(path.join(pgnDirectory, `${game.profile}-r${game.round}-${game.white}-vs-${game.black}.pgn`), game.pgn + '\n');
  }
}

function harness() {
  const workers = [];
  const terminations = [];
  let request = 0;
  const factory = url => {
    const thread = new Worker(new URL('../tests/engine-browser-worker.mjs', import.meta.url), { workerData: { url, captureMemory: true }, execArgv: [] });
    const pending = new Map();
    const bridge = {
      onmessage: null, onerror: null, terminated: false,
      postMessage(data) { thread.postMessage(data); },
      terminate() { if (!this.terminated) { this.terminated = true; terminations.push(thread.terminate()); } },
      memory() {
        if (this.terminated) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
          const id = ++request;
          const timer = setTimeout(() => { pending.delete(id); reject(new Error('Memory probe timed out')); }, 5000);
          pending.set(id, value => { clearTimeout(timer); resolve(value); });
          thread.postMessage({ benchmark: 'memory', request: id });
        });
      },
    };
    thread.on('message', data => {
      if (data?.benchmark === 'memory') { pending.get(data.request)?.(data); pending.delete(data.request); }
      else bridge.onmessage?.({ data });
    });
    thread.on('error', error => bridge.onerror?.(error));
    workers.push(bridge);
    return bridge;
  };
  return { factory, workers, async settled() { await Promise.all(terminations); }, live: () => workers.filter(worker => !worker.terminated).length };
}
const engineOptions = factory => ({ workerUrl: 'https://knightfall.test/engine/stockfish.js', workerFactory: factory });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const MiB = bytes => Math.round(bytes / 1048576 * 100) / 100;

if (mode === 'all' || mode === 'memory') {
  for (const hashMb of options.hash ? [Number(options.hash)] : [8, 16, 32]) {
    const h = harness();
    globalThis.gc?.();
    const before = process.memoryUsage();
    const engine = new LocalEngine({ ...engineOptions(h.factory), hashMb, idleTimeoutMs: 0 });
    const began = performance.now();
    try {
      await engine.initialize();
      const initialized = await h.workers.at(-1).memory();
      const readyMs = performance.now() - began;
      const result = await engine.analyze(new Chess().fen(), { depth: 18, movetime: 300 });
      const searched = await h.workers.at(-1).memory();
      report.memory.push({ hashMb, readyMs: Math.round(readyMs), actualDepth: result.depth, wasmReadyMiB: MiB(initialized.wasmBytes), wasmAfterSearchMiB: MiB(searched.wasmBytes), rssBeforeMiB: MiB(before.rss), rssAfterSearchMiB: MiB(searched.rss), workerHeapMiB: MiB(searched.heapUsed), workerExternalMiB: MiB(searched.external) });
      console.log(JSON.stringify({ phase: 'memory', ...report.memory.at(-1) }));
    } finally { engine.destroy(); await h.settled(); }
  }
  if (!options.hash) {
  const h = harness();
  const engines = Array.from({ length: 4 }, () => new LocalEngine({ ...engineOptions(h.factory), idleTimeoutMs: 100 }));
  try {
    await Promise.all(engines.map(engine => engine.analyze(new Chess().fen(), { depth: 18, movetime: 200 })));
    const warmWorkers = h.live();
    await pause(160);
    const afterIdle = h.live();
    for (let i = 0; i < 12; i++) {
      const engine = engines[i % engines.length];
      await engine.initialize();
      const pending = engine.analyze(new Chess().fen(), { depth: 25, movetime: 500 });
      const cancelled = Promise.allSettled([pending]);
      await pause(5);
      engine.cancel();
      if ((await cancelled)[0].status !== 'rejected') throw new Error('Cancellation unexpectedly completed a search');
    }
    report.lifecycle = { peakRequestedInstances: 4, warmWorkersAfterSearches: warmWorkers, liveAfterIdleTimeout: afterIdle, cancelledSearches: 12 };
  } finally { for (const engine of engines) engine.destroy(); await h.settled(); }
  report.lifecycle.liveAfterDestroy = h.live();
  console.log(JSON.stringify({ phase: 'lifecycle', ...report.lifecycle }));
  }
}

if (mode === 'all' || mode === 'matches') {
  const pairs = [['sprout', 'scout'], ['sprout', 'sage'], ['scout', 'sage']];
  const openings = [['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5', 'c4', 'e6'], ['e4', 'c5', 'Nf3', 'd6']];
  for (let round = 0; round < rounds; round++) for (let pair = 0; pair < pairs.length; pair++) for (let reverse = 0; reverse < 2; reverse++) {
    const players = reverse ? [...pairs[pair]].reverse() : pairs[pair];
    const game = new Chess();
    for (const san of openings[(pair + round) % openings.length]) game.move(san);
    const randoms = [seededBotRandom(seed + round * 100 + pair * 10 + reverse), seededBotRandom(seed + 500 + round * 100 + pair * 10 + reverse)];
    const h = harness();
    const engine = new LocalEngine({ ...engineOptions(h.factory), idleTimeoutMs: 0 });
    const counts = { w: { moves: 0, engineChoices: 0, captures: 0, promotions: 0 }, b: { moves: 0, engineChoices: 0, captures: 0, promotions: 0 } };
    const began = performance.now();
    try {
      while (!game.isGameOver() && game.history().length < maxPlies) {
        const color = game.turn();
        const player = players[color === 'w' ? 0 : 1];
        const bot = bots.find(bot => bot.id === player);
        const analysis = await engine.analyze(game.fen(), profile === 'production' ? { depth: 20, movetime: bot.time, skill: bot.skill } : { depth: 8, movetime: 2000, skill: 20 });
        if (analysis.engine !== 'Stockfish 17.1 Lite') throw new Error('Match unexpectedly used fallback engine');
        const uci = chooseBotMove(game.fen(), player, analysis, randoms[color === 'w' ? 0 : 1]);
        if (!uci) throw new Error(`Missing move in non-terminal position: ${game.fen()}`);
        const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        counts[color].moves++;
        if (uci === analysis.bestMove) counts[color].engineChoices++;
        if (move.captured) counts[color].captures++;
        if (move.promotion) counts[color].promotions++;
        const pieces = game.board().flat().filter(Boolean);
        if (pieces.length > 32 || pieces.filter(piece => piece.type === 'k').length !== 2) throw new Error('Illegal material transition');
      }
      const winner = game.isCheckmate() ? (game.turn() === 'w' ? players[1] : players[0]) : null;
      const reason = game.isCheckmate() ? 'Checkmate' : game.isStalemate() ? 'Stalemate' : game.isInsufficientMaterial() ? 'Insufficient material' : game.isThreefoldRepetition() ? 'Threefold repetition' : game.isDrawByFiftyMoves() ? 'Fifty-move rule' : 'Ply limit (unfinished)';
      const materialValues = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
      const material = game.board().flat().filter(Boolean).reduce((sum, piece) => sum + materialValues[piece.type] * (piece.color === 'w' ? 1 : -1), 0);
      game.header('Event', `Knightfall ${profile} policy benchmark`, 'White', players[0], 'Black', players[1], 'Result', winner ? (winner === players[0] ? '1-0' : '0-1') : game.isGameOver() ? '1/2-1/2' : '*');
      const row = { profile, round: round + 1, white: players[0], black: players[1], plies: game.history().length, winner, reason, materialCpWhite: material, elapsedMs: Math.round(performance.now() - began), counts, finalFen: game.fen(), pgn: game.pgn() };
      report.matches.push(row);
      await saveReport();
      console.log(JSON.stringify({ phase: 'match', ...row, pgn: undefined }));
    } finally { engine.destroy(); await h.settled(); }
  }
}
report.elapsedMs = Math.round(performance.now() - started);
if (options.output) {
  await saveReport();
  console.log(`Report saved to ${path.resolve(options.output)}`);
}
console.log(JSON.stringify({ phase: 'complete', elapsedMs: report.elapsedMs, matches: report.matches.length, completedGames: report.matches.filter(game => !game.reason.startsWith('Ply limit')).length, wins: Object.fromEntries(['sprout', 'scout', 'sage'].map(id => [id, report.matches.filter(game => game.winner === id).length])) }));
