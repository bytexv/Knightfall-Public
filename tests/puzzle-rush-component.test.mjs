import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess } from 'chess.js';
import { rushCourse } from '../src/lib/puzzle-rush.ts';
registerHooks({ load(url, context, next) { if (url.endsWith('.css')) return { format: 'module', source: 'export default {}', shortCircuit: true }; return next(url, context); } });
const { default: PuzzleRush } = await import('../src/components/PuzzleRush.tsx');
let dom, host, root, studied;
beforeEach(t => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.setItem('knightfall:settings', JSON.stringify({ sound: false }));
  localStorage.setItem('knightfall:current', 'current-game-is-untouched');
  host = document.getElementById('root'); root = createRoot(host); studied = [];
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
});
afterEach(async () => {
  await act(async () => root.unmount()); dom.window.close();
  for (const key of ['window', 'document', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});
const render = () => act(async () => root.render(createElement(PuzzleRush, { onStudyPuzzle: id => studied.push(id) })));
async function click(text) {
  const buttons = [...host.querySelectorAll('button')];
  const button = buttons.find(b => b.textContent.trim() === text) || buttons.find(b => b.textContent.includes(text));
  assert.ok(button, `Missing button: ${text}`);
  await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
}
async function move(uci) {
  for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
    const button = host.querySelector(`[data-square="${square}"]`); assert.ok(button);
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  }
  if (uci.length === 5) {
    const names = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
    const button = host.querySelector(`[aria-label="Promote to ${names[uci[4]]}"]`); assert.ok(button);
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  }
}
const tick = (t, amount) => act(async () => t.mock.timers.tick(amount));
const score = () => Number(host.querySelector('.rush-score>strong').textContent);
const piece = square => host.querySelector(`[data-square="${square}"] img`)?.getAttribute('src');
async function reachMultiPly(t) {
  await render(); await click('Start 3-minute run');
  const index = rushCourse.findIndex(p => p.solution.length > 1);
  for (let i = 0; i < index; i++) { await move(rushCourse[i].solution[0]); await tick(t, 700); }
  return { puzzle: rushCourse[index], index };
}

test('mode selection, scoring, result recap, study navigation, and local record work together', async t => {
  await render();
  assert.equal(host.querySelectorAll('[data-square]').length, 64);
  await click('5 minutes'); await click('Start 5-minute run');
  assert.equal(host.querySelector('[aria-label="Time remaining"]').textContent, '5:00');
  assert.equal(host.textContent.includes('A queen-and-bishop battery'), false, 'active challenge does not reveal title/theme hints');
  await move(rushCourse[0].solution[0]); assert.equal(score(), 1);
  await tick(t, 700); await click('Finish run'); await click('Finish');
  assert.ok(host.textContent.includes('RUN COMPLETE'));
  assert.deepEqual(JSON.parse(localStorage.getItem('knightfall:rush-bests-v1')), { three: 0, five: 1, survival: 0 });
  assert.equal(localStorage.getItem('knightfall:current'), 'current-game-is-untouched');
  const study = host.querySelector(`[aria-label="Study ${rushCourse[0].title}"]`); assert.ok(study);
  await act(async () => study.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  assert.deepEqual(studied, [rushCourse[0].id]);
});

test('multi-ply challenge locks opponent turn and scores only the complete sequence', async t => {
  const { puzzle, index } = await reachMultiPly(t);
  assert.equal(score(), index);
  await move(puzzle.solution[0]);
  assert.equal(score(), index);
  assert.match(host.querySelector('[role="status"]').textContent, /opponent responds/);
  await move(puzzle.solution[1]);
  assert.equal(score(), index, 'manual opponent input cannot score');
  await tick(t, 400);
  assert.match(host.querySelector('.rush-sequence>strong').textContent, /2 \/ 3/);
  await move(puzzle.solution[2]);
  assert.equal(score(), index + 1);
  assert.match(host.querySelector('[role="status"]').textContent, /One point earned/);
});

test('suspended interval cannot grant a late point after the absolute deadline', async t => {
  await render(); await click('Start 3-minute run');
  t.mock.timers.setTime(181001); // Resume after suspension without running the interval first.
  await move(rushCourse[0].solution[0]);
  assert.equal(score(), 0);
  assert.ok(host.textContent.includes('RUN COMPLETE'));
  assert.ok(host.textContent.includes('Time is up.'));
  assert.equal(host.querySelector('[aria-label="Time remaining"]').textContent, '0:00');
  assert.equal(host.querySelectorAll('.rush-recap-icon.unfinished').length, 1);
});

test('three wrong legal moves consume exactly three lives and populate missed recap', async t => {
  await render(); await click('Survival'); await click('Start survival');
  for (let i = 0; i < 3; i++) {
    const puzzle = rushCourse[i];
    const wrong = new Chess(puzzle.fen).moves({ verbose: true }).find(m => m.from + m.to + (m.promotion || '') !== puzzle.solution[0]);
    await move(wrong.from + wrong.to + (wrong.promotion || ''));
    assert.equal(score(), 0);
    assert.ok(host.querySelector(`[aria-label="${2 - i} lives remaining"]`));
    if (i < 2) await click('Next position');
  }
  assert.ok(host.textContent.includes('RUN COMPLETE'));
  assert.equal(host.querySelectorAll('.rush-recap-icon.missed').length, 3);
  assert.equal(host.querySelectorAll('.rush-recap-icon.unfinished').length, 0);
});

test('finishing and restarting during an automatic reply cancels the old continuation', async t => {
  const { puzzle } = await reachMultiPly(t);
  await move(puzzle.solution[0]);
  await click('Finish run'); await click('Finish'); await click('Try again');
  assert.equal(score(), 0);
  assert.ok(piece('e4')?.endsWith('wQ.svg'));
  await tick(t, 500);
  assert.equal(score(), 0);
  assert.ok(piece('e4')?.endsWith('wQ.svg'));
  assert.match(host.querySelector('.rush-sequence>strong').textContent, /^0 \/ 1$/);
});

test('malformed personal records are ignored and a lower new run cannot erase the best', async t => {
  localStorage.setItem('knightfall:rush-bests-v1', JSON.stringify({ three: 'bad', five: 9999, survival: -1 }));
  await render(); await click('Start 3-minute run'); await move(rushCourse[0].solution[0]);
  await click('Finish run'); await click('Finish');
  assert.equal(JSON.parse(localStorage.getItem('knightfall:rush-bests-v1')).three, 1);
  await click('Try again'); await click('Finish run'); await click('Finish');
  assert.equal(score(), 0);
  assert.equal(JSON.parse(localStorage.getItem('knightfall:rush-bests-v1')).three, 1);
});


test('visibility resume finishes an expired run even without a move or interval callback', async t => {
  await render(); await click('Start 3-minute run');
  t.mock.timers.setTime(250000);
  await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')));
  assert.ok(host.textContent.includes('RUN COMPLETE'));
  assert.ok(host.textContent.includes('Time is up.'));
  assert.equal(score(), 0);
});

test('another tab’s higher personal best is preserved when this run ends', async t => {
  await render(); await click('Start 3-minute run'); await move(rushCourse[0].solution[0]);
  localStorage.setItem('knightfall:rush-bests-v1', JSON.stringify({ three: 20, five: 7, survival: 8 }));
  await click('Finish run'); await click('Finish');
  assert.deepEqual(JSON.parse(localStorage.getItem('knightfall:rush-bests-v1')), { three: 20, five: 7, survival: 8 });
  assert.equal(host.textContent.includes('A new personal best.'), false);
});
