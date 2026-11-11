import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import AnalysisPanel from '../src/components/AnalysisPanel.tsx';
import { LocalEngine } from '../src/lib/engine.ts';
import { applyMove, newSession } from '../src/lib/game.ts';

let dom, root, host, jobs, engines, destroyed, evaluations;
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

function props(game, fen = game.fen) {
  return { game, fen, onEvaluation: value => evaluations.push(value), onArrow() {}, onImport() {}, onReviewSelect() {} };
}
async function render(game, fen) { await act(async () => root.render(createElement(AnalysisPanel, props(game, fen)))); }
async function click(text) {
  const button = [...host.querySelectorAll('button')].find(element => element.textContent.includes(text));
  assert.ok(button, `Missing button: ${text}`);
  await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
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
  await waitLive();
  const liveJob = pending()[0];
  assert.ok(liveJob);
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
  assert.ok(host.textContent.includes('quality'));
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
  await waitLive();
  await settle(pending().at(-1), result(10000, { mate: 0, bestMove: null }));
  assert.ok(host.textContent.includes('+M0'));
  assert.ok(host.textContent.includes('White wins by checkmate'));
  assert.ok(!host.textContent.includes('+100.00'));
});
