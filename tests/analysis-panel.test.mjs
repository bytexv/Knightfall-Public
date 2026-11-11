import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
// DOM assertions cover interactions; the native/browser checks exercise styles.
const cssHook = registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const { default: AnalysisPanel } = await import('../src/components/AnalysisPanel.tsx');
cssHook.deregister();
import { LocalEngine } from '../src/lib/engine.ts';
import { applyMove, newSession } from '../src/lib/game.ts';

let dom, root, host, jobs, engines, destroyed, evaluations, selections, arrows, previews, retries;
const originals = { analyze: LocalEngine.prototype.analyze, cancel: LocalEngine.prototype.cancel, destroy: LocalEngine.prototype.destroy };
const result = (score = 0, extra = {}) => ({ score, bestMove: 'e2e4', lines: [], depth: 14, engine: 'Test local engine', ...extra });
const abort = () => new DOMException('Cancelled in test', 'AbortError');

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jobs = []; engines = new Set(); destroyed = new Set(); evaluations = [];
  selections = []; arrows = []; previews = []; retries = [];
  LocalEngine.prototype.analyze = function(fen, options) {
    engines.add(this);
    return new Promise((resolve, reject) => {
      jobs.push({ engine: this, fen, options, settled: false, resolve(value) { if (!this.settled) { this.settled = true; resolve(value); } }, reject(reason) { if (!this.settled) { this.settled = true; reject(reason); } } });
    });
  };
  LocalEngine.prototype.cancel = function() { for (const job of jobs) if (job.engine === this && !job.ignoreCancel) job.reject(abort()); };
  LocalEngine.prototype.destroy = function() { this.cancel(); destroyed.add(this); };
  host = document.getElementById('root');
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  LocalEngine.prototype.analyze = originals.analyze;
  LocalEngine.prototype.cancel = originals.cancel;
  LocalEngine.prototype.destroy = originals.destroy;
  dom.window.close();
  delete globalThis.window; delete globalThis.document; delete globalThis.HTMLElement;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

function props(game, fen = game.fen, overrides = {}) {
  return {
    game, fen,
    onEvaluation: value => evaluations.push(value),
    onArrow: (from, to) => arrows.push([from, to]),
    onImport() {},
    onReviewSelect: index => selections.push(index),
    onPreviewLine: (beforeIndex, line) => previews.push({ beforeIndex, line }),
    onRetryMove: index => retries.push(index),
    ...overrides,
  };
}
async function render(game, fen, overrides) { await act(async () => root.render(createElement(AnalysisPanel, props(game, fen, overrides)))); }
async function clickButton(button) {
  assert.ok(button, 'Expected an enabled button');
  assert.equal(button.disabled, false, `Button should be enabled: ${button.textContent}`);
  await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
}
async function selectTab(name) {
  const tab = [...host.querySelectorAll('[role="tab"]')].find(element => element.textContent.trim() === name);
  assert.ok(tab, `Missing tab: ${name}`);
  await clickButton(tab);
}
async function clickLabel(label) {
  await clickButton([...host.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label));
}
async function click(text) {
  const button = [...host.querySelectorAll('button')].find(element => element.textContent.includes(text));
  assert.ok(button, `Missing button: ${text}`);
  await clickButton(button);
}
async function settle(job, value) { assert.ok(job, 'Expected an engine job'); await act(async () => job.resolve(value)); }
async function waitLive() { await act(async () => new Promise(resolve => setTimeout(resolve, 180))); }
const pending = () => jobs.filter(job => !job.settled);
function sampleGame() {
  let game = newSession({ id: 'review-game', mode: 'analysis' });
  game = applyMove(game, 'e2', 'e4');
  return applyMove(game, 'e7', 'e5');
}
async function completeReview(game) {
  await click('Review this game');
  await settle(pending().at(-1), result(20, { bestMove: game.moves[0].from + game.moves[0].to }));
  for (let index = 0; index < game.moves.length; index++) {
    const next = game.moves[index + 1];
    await settle(pending().at(-1), result(index ? -160 : 40, { bestMove: next ? next.from + next.to : 'g1f3' }));
  }
}

test('starting review cancels live search without cancelling the separate review engine', async () => {
  const game = sampleGame();
  await render(game);
  await selectTab('Live analysis');
  await waitLive();
  const liveJob = pending()[0];
  assert.ok(liveJob);
  await selectTab('Review');
  await click('Review this game');
  const reviewJob = pending().at(-1);
  assert.notEqual(reviewJob.engine, liveJob.engine);
  assert.equal(liveJob.settled, true, 'Live search should be cancelled while reviewing');
  assert.equal(reviewJob.settled, false, 'Review must survive the live effect cleanup');
  assert.ok(host.textContent.includes('Stop · 0/2 moves'));
  await settle(reviewJob, result(20));
  await settle(pending().at(-1), result(40, { bestMove: 'e7e5' }));
  await settle(pending().at(-1), result(0));
  assert.equal(host.querySelectorAll('.eval-chart button').length, 2);
  assert.equal(host.querySelector('[role="progressbar"]'), null);
  assert.match(host.textContent, /quality/i);
});

test('stop preserves partial progress and prevents any queued continuation', async () => {
  const game = sampleGame();
  await render(game);
  await click('Review this game');
  await settle(pending().at(-1), result());
  await settle(pending().at(-1), result(20));
  const unfinished = pending().at(-1);
  await click('Stop ·');
  assert.equal(unfinished.settled, true);
  assert.ok(host.textContent.includes('Review stopped. 1 of 2 moves analyzed.'));
  assert.equal(host.querySelectorAll('.eval-chart button').length, 1);
  assert.ok(host.textContent.includes('Restart game review'));
});

test('changing game ID cancels an active review and clears its progress', async () => {
  const game = sampleGame();
  await render(game);
  await click('Review this game');
  await settle(pending().at(-1), result());
  await settle(pending().at(-1), result());
  const oldJob = pending().at(-1);
  oldJob.ignoreCancel = true; // Simulate an engine result already crossing the cancellation boundary.
  await render({ ...game, id: 'different-game' });
  assert.equal(oldJob.settled, false);
  assert.equal(host.querySelectorAll('.eval-chart button').length, 0);
  assert.equal(host.querySelector('[role="progressbar"]'), null);
  assert.ok(!host.textContent.includes('Stop ·'));
  await settle(oldJob, result(-10000, { mate: -1 }));
  assert.equal(host.querySelectorAll('.eval-chart button').length, 0, 'Old result cannot repopulate the new game review');
});

test('replaying a position retains review, but a same-length branch invalidates it', async () => {
  const game = sampleGame();
  await render(game);
  await completeReview(game);
  await render(game, game.startFen);
  assert.equal(host.querySelectorAll('.eval-chart button').length, 2, 'Board navigation must preserve game review');
  const firstMove = applyMove(newSession({ id: game.id, mode: 'analysis' }), 'e2', 'e4');
  const branch = applyMove(firstMove, 'c7', 'c5');
  assert.equal(branch.moves.length, game.moves.length);
  await render(branch);
  assert.equal(host.querySelectorAll('.eval-chart button').length, 0, 'Replaced moves must not retain old review labels');
});

test('a FEN change immediately removes the old evaluation and principal variation', async () => {
  const game = newSession({ mode: 'analysis' });
  await render(game);
  await selectTab('Live analysis');
  await waitLive();
  await settle(pending().at(-1), result(120, { lines: [{ multipv: 1, score: 120, depth: 14, pv: ['e2e4', 'e7e5'] }] }));
  assert.ok(host.textContent.includes('+1.20'));
  assert.equal(host.querySelectorAll('.engine-line').length, 1);
  const next = applyMove(game, 'e2', 'e4');
  await render(next);
  assert.ok(!host.textContent.includes('+1.20'));
  assert.equal(host.querySelectorAll('.engine-line').length, 0);
  assert.equal(evaluations.at(-1), 0);
  await waitLive();
  await settle(pending().at(-1), result(-80, { bestMove: 'e7e5', lines: [{ multipv: 1, score: -80, depth: 14, pv: ['e7e5'] }] }));
  assert.ok(host.textContent.includes('-0.80'));
  assert.equal(host.querySelector('.engine-line').textContent.includes('e5'), true);
});

test('a late live result cannot populate a different position after cancellation', async () => {
  const game = newSession({ mode: 'analysis' });
  await render(game);
  await selectTab('Live analysis');
  await waitLive();
  const oldJob = pending().at(-1);
  oldJob.ignoreCancel = true;
  await render(applyMove(game, 'd2', 'd4'));
  await settle(oldJob, result(1500, { lines: [{ multipv: 1, score: 1500, depth: 14, pv: ['e2e4'] }] }));
  assert.ok(!host.textContent.includes('+15.00'));
  assert.equal(host.querySelectorAll('.engine-line').length, 0);
  assert.equal(evaluations.at(-1), 0);
});

test('terminal mate zero is rendered as checkmate rather than an ordinary evaluation', async () => {
  const game = newSession({ mode: 'analysis', startFen: '7k/5KQ1/8/8/8/8/8/8 b - - 0 1' });
  await render(game);
  await selectTab('Live analysis');
  await waitLive();
  await settle(pending().at(-1), result(10000, { mate: 0, bestMove: null }));
  assert.ok(host.textContent.includes('+M0'));
  assert.ok(host.textContent.includes('White wins by checkmate'));
  assert.ok(!host.textContent.includes('+100.00'));
});

function guidedGame() {
  const startFen = sampleGame().fen;
  let game = newSession({ id: 'guided-review', mode: 'analysis', startFen });
  for (const [from, to] of [['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['d2', 'd3'], ['f8', 'c5']])
    game = applyMove(game, from, to);
  return game;
}
async function completeGuidedReview(game) {
  await click('Review this game');
  const scores = [20, -160, -160, -160, 160, 160, 160];
  const bestMoves = ['f1c4', 'b8c6', 'd2d4', 'd7d6', 'd2d3', 'd7d6', 'c1g5'];
  for (let index = 0; index <= game.moves.length; index++) {
    const job = pending().at(-1);
    assert.equal(job.options.multiPV, 3, 'Each review position compares three candidate moves');
    const pv = index === 0 ? ['f1c4', 'g8f6', 'd2d3'] : [bestMoves[index]];
    await settle(job, result(scores[index], {
      engine: 'Stockfish 17.1 Lite', bestMove: bestMoves[index],
      lines: [{ multipv: 1, score: scores[index], depth: 14, pv }],
    }));
  }
}

test('guided review links chart, filters, navigation and move feedback to the recorded line', async () => {
  const game = guidedGame();
  const activeReviews = [];
  const callbacks = { activeIndex: 0, onActiveReview: item => activeReviews.push(item) };
  await render(game, game.moves[0].fen, callbacks);
  await completeGuidedReview(game);
  assert.equal(selections.at(-1), 0, 'Completion selects the first key move');
  assert.match(host.querySelector('.review-focus').textContent, /2\. Nf3/);
  assert.match(host.querySelector('.review-focus .review-quality').textContent, /Mistake/);
  assert.equal(activeReviews.at(-1).index, 0);
  assert.equal(host.querySelectorAll('.review-item').length, 2, 'Mistakes filter includes the two significant losses');
  await click('All moves');
  assert.equal(host.querySelectorAll('.review-item').length, 6);
  await clickButton(host.querySelectorAll('.eval-chart button')[3]);
  assert.equal(selections.at(-1), 3);
  await clickLabel('Previous move');
  assert.equal(selections.at(-1), -1, 'Previous from the first recorded move reaches the custom starting position');
  await clickLabel('Next move');
  assert.equal(selections.at(-1), 1);
  await clickLabel('Next key move');
  assert.equal(selections.at(-1), 3, 'Skip quiet moves and reach the next substantial error');
  await render(game, game.moves[3].fen, { ...callbacks, activeIndex: 3 });
  assert.match(host.querySelector('.review-focus .review-quality').textContent, /Blunder/);
  assert.equal(host.querySelector('.eval-chart button[aria-current="step"]'), host.querySelectorAll('.eval-chart button')[3]);
  assert.equal(host.querySelector('[aria-label="Next key move"]').disabled, true);
  await render(game, game.startFen, { ...callbacks, activeIndex: -1 });
  assert.equal(activeReviews.at(-1), null);
  assert.equal(host.querySelector('[aria-label="Previous move"]').disabled, true);
});

test('review alternatives use the position before the move and preserve the complete PV', async () => {
  const game = guidedGame();
  await render(game, game.moves[0].fen, { activeIndex: 0 });
  await completeGuidedReview(game);
  await click('Show best move');
  assert.deepEqual(arrows.at(-1), ['f1', 'c4']);
  assert.deepEqual(previews.at(-1), { beforeIndex: -1, line: [] });
  assert.equal(selections.at(-1), 0, 'The original reviewed move remains selected while its alternative is previewed');
  await click('Explore line');
  assert.deepEqual(previews.at(-1), { beforeIndex: -1, line: ['f1c4', 'g8f6', 'd2d3'] });
  await click('Retry move');
  assert.deepEqual(retries, [0]);
  assert.equal(game.moves[0].san, 'Nf3', 'Exploration does not mutate the recorded game');
});

test('revisiting live positions uses a depth-specific cache and rejects a late result after hiding the tab', async () => {
  const game = sampleGame();
  await render(game, game.startFen);
  await selectTab('Live analysis');
  await waitLive();
  await settle(pending().at(-1), result(50, { lines: [{ multipv: 1, score: 50, depth: 14, pv: ['e2e4'] }] }));
  await render(game, game.moves[0].fen);
  await waitLive();
  await settle(pending().at(-1), result(-60, { bestMove: 'e7e5', lines: [{ multipv: 1, score: -60, depth: 14, pv: ['e7e5'] }] }));
  const jobCount = jobs.length;
  await render(game, game.startFen);
  await waitLive();
  assert.equal(jobs.length, jobCount, 'Previously searched position needs no new worker job');
  assert.match(host.textContent, /\+0\.50/);
  const select = host.querySelector('[aria-label="Analysis depth"]');
  await act(async () => { select.value = '20'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.ok(!host.textContent.includes('+0.50'), 'A deeper search must not display the older depth result');
  await waitLive();
  const deepJob = pending().at(-1);
  assert.equal(deepJob.options.depth, 20);
  deepJob.ignoreCancel = true;
  await selectTab('Review');
  await settle(deepJob, result(1900, { lines: [{ multipv: 1, score: 1900, depth: 20, pv: ['e2e4'] }] }));
  assert.equal(host.querySelectorAll('.engine-line').length, 0);
  assert.ok(!host.textContent.includes('+19.00'));
  await selectTab('Live analysis');
  await waitLive();
  assert.ok(!host.textContent.includes('+19.00'), 'Hidden-tab output must not enter the position cache');
  assert.equal(pending().at(-1).options.depth, 20);
});

test('review restart reuses completed searches and cannot consume a late cancelled position', async () => {
  const game = guidedGame();
  await render(game);
  await click('Review this game');
  await settle(pending().at(-1), result(20, { bestMove: 'f1c4' }));
  await settle(pending().at(-1), result(-160, { bestMove: 'b8c6' }));
  const oldJob = pending().at(-1);
  oldJob.ignoreCancel = true;
  await click('Stop ·');
  const jobCount = jobs.length;
  await click('Restart game review');
  assert.equal(jobs.length, jobCount + 1, 'Only the first unfinished position is searched again');
  assert.equal(pending().at(-1).fen, oldJob.fen);
  await settle(oldJob, result(10000, { mate: 1 }));
  assert.equal(host.querySelectorAll('.eval-chart button').length, 1);
  assert.ok(!host.textContent.includes('+M1'), 'Cancelled review cannot overwrite restarted review');
});


test('completed review opens totals once and lets the player enter step-by-step review', async () => {
  const game = sampleGame(); await render(game); await completeReview(game);
  const dialog = host.querySelector('[role="dialog"]'); assert.ok(dialog);
  const counts = [...dialog.querySelectorAll('tbody td')].map(cell => Number(cell.textContent));
  assert.equal(counts.reduce((a,b)=>a+b,0), game.moves.length);
  assert.equal(dialog.querySelectorAll('tbody tr').length, 10);
  await click('Review step by step'); assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(selections.at(-1), 0);
  await render(game, game.startFen, {activeIndex:-1}); assert.equal(host.querySelector('[role="dialog"]'), null);
  await click('Summary'); assert.ok(host.querySelector('[role="dialog"]'));
  await render({...game,id:'another-game'}); assert.equal(host.querySelector('[role="dialog"]'),null);
});
