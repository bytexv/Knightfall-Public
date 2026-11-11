import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Styles are exercised by the production build; this DOM test checks behavior.
const cssHook = registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const { default: EndgameSchool } = await import('../src/components/EndgameSchool.tsx');
cssHook.deregister();
let dom, host, root, started;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.getElementById('root'); root = createRoot(host); started = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  for (const key of ['window', 'document', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});
async function mount() { await act(async () => root.render(createElement(EndgameSchool, { onPractice: drill => started.push(drill) }))); }
async function click(button) { assert.ok(button); await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); }
const buttonWith = text => [...host.querySelectorAll('button')].find(button => button.textContent.includes(text));
const cardWith = text => [...host.querySelectorAll('.eg-card')].find(card => card.querySelector('h3').textContent.includes(text));

test('all verified drills render and category filters select the correct positions', async () => {
  await mount();
  assert.equal(host.querySelectorAll('.eg-card').length, 15);
  await click(buttonWith('Rook endings'));
  assert.equal(host.querySelectorAll('.eg-card').length, 2);
  assert.ok(host.textContent.includes('Lucena'));
  assert.ok(host.textContent.includes('Philidor'));
  await click(buttonWith('Checkmate technique'));
  assert.equal(host.querySelectorAll('.eg-card').length, 5);
  assert.ok(!host.querySelector('.eg-card').textContent.includes('Lucena'));
});

test('reading a defensive lesson preserves the target and starts the correct side', async () => {
  await mount();
  const card = cardWith('Take the opposition');
  await click(card.querySelector('button'));
  const dialog = host.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.ok(dialog.textContent.includes('Hold the draw as Black.'));
  assert.ok(dialog.textContent.includes('Black to move · Untimed'));
  assert.equal(document.body.style.overflow, 'hidden');
  await click(buttonWith('Show a first-move hint'));
  assert.ok(dialog.querySelector('.eg-hint').textContent.includes('Ke6'));
  await click(buttonWith('Defend as Black'));
  assert.equal(started.length, 1);
  assert.equal(started[0].id, 'opposition-draw');
  assert.equal(started[0].playerColor, 'b');
  assert.equal(started[0].objective, 'draw');
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(document.body.style.overflow, '');
  assert.deepEqual(JSON.parse(localStorage.getItem('knightfall.endgamesPracticed')), ['opposition-draw']);
});

test('Escape closes the lesson and restores focus without starting a game', async () => {
  await mount();
  const opener = cardWith('queen').querySelector('button');
  opener.focus();
  await click(opener);
  const dialog = host.querySelector('[role="dialog"]');
  assert.equal(document.activeElement, dialog);
  await act(async () => dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(host.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, opener);
  assert.equal(started.length, 0);
});

test('invalid stored practice IDs do not inflate progress or crash the school', async () => {
  localStorage.setItem('knightfall.endgamesPracticed', JSON.stringify([{}, null, 'missing', 'queen-box', 'queen-box']));
  await mount();
  assert.equal(host.querySelector('.eg-progress-summary>span').textContent, '1 / 15');
  assert.equal(host.querySelectorAll('.eg-tried').length, 1);
});
