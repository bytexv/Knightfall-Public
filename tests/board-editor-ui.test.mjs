import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { Chess } from 'chess.js';

// CSS is tested by the Vite build; these tests exercise interaction and semantics.
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const { default: BoardEditor } = await import('../src/components/BoardEditor.tsx');
let dom, host, root, analyzed, closed, navigatorDescriptor;

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  const { createRoot } = await import('react-dom/client');
  host = document.getElementById('root');
  root = createRoot(host);
  analyzed = []; closed = 0;
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  delete globalThis.window; delete globalThis.document; delete globalThis.HTMLElement; delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  else delete globalThis.navigator;
});

async function render(initialFen) { await act(async () => root.render(createElement(BoardEditor, { initialFen, onAnalyze: fen => analyzed.push(fen), onClose: () => closed++ }))); }
const button = text => [...host.querySelectorAll('button')].find(element => element.textContent.trim() === text || element.getAttribute('aria-label') === text);
const square = name => host.querySelector(`[data-editor-square="${name}"]`);
const field = label => [...host.querySelectorAll('label')].find(element => element.textContent.startsWith(label))?.querySelector('select,input,textarea');
const fen = () => host.querySelector('.be-fen').value;
async function click(element) { assert.ok(element); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); }
async function key(element, name) { await act(async () => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))); }
async function select(element, value) { await act(async () => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); }
async function number(element, value) { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); }

test('the editor initializes from a position and sends a validated FEN to analysis', async () => {
  const initialFen = '6k1/8/8/8/8/8/4Q3/4K3 w - - 8 25';
  await render(initialFen);
  assert.equal(host.querySelectorAll('[role="gridcell"]').length, 64);
  assert.equal(host.querySelectorAll('[role="row"]').length, 8);
  assert.equal(fen(), initialFen);
  assert.equal(square('e2').getAttribute('aria-label'), 'e2, white queen');
  assert.equal(button('Analyze position').disabled, false);
  await click(button('Analyze position'));
  assert.deepEqual(analyzed, [initialFen]);
  await click(button('Cancel'));
  assert.equal(closed, 1);
});

test('clearing, painting, erasing and relocating kings supports touch/click composition', async () => {
  await render();
  await click(button('Clear'));
  assert.equal(button('Analyze position').disabled, true);
  assert.match(host.textContent, /Place a white king/);
  await click(square('e1')); // Clear selects the white king.
  await click(button('Black king'));
  await click(square('e8'));
  assert.equal(button('Analyze position').disabled, false);
  await click(button('White queen'));
  await click(square('a2'));
  assert.equal(square('a2').getAttribute('aria-label'), 'a2, white queen');
  await click(button('Erase pieces'));
  await click(square('a2'));
  assert.equal(square('a2').getAttribute('aria-label'), 'a2, empty');
  await click(button('White king'));
  await click(square('d1'));
  assert.equal(square('e1').getAttribute('aria-label'), 'e1, empty');
  assert.equal(square('d1').getAttribute('aria-label'), 'd1, white king');
  assert.equal(button('Analyze position').disabled, false);
});

test('keyboard navigation uses one tab stop, places pieces, erases, and respects a flipped board', async () => {
  await render('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(host.querySelectorAll('[data-editor-square][tabindex="0"]').length, 1);
  await act(async () => square('e2').focus());
  await key(square('e2'), 'ArrowLeft');
  assert.equal(document.activeElement.dataset.editorSquare, 'd2');
  await click(button('White knight'));
  await key(square('d2'), 'Enter');
  assert.equal(square('d2').getAttribute('aria-label'), 'd2, white knight');
  await key(square('d2'), 'Delete');
  assert.equal(square('d2').getAttribute('aria-label'), 'd2, empty');
  await click(button('Flip board'));
  assert.equal(host.querySelector('[data-editor-square]').dataset.editorSquare, 'h1');
  await key(square('d2'), 'ArrowRight');
  assert.equal(document.activeElement.dataset.editorSquare, 'c2');
  await key(square('c2'), ' ');
  assert.equal(square('c2').getAttribute('aria-label'), 'c2, white knight');
});

test('invalid king placement blocks analysis and provides an actionable correction', async () => {
  await render('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  await click(button('Black king'));
  await click(square('e2'));
  assert.match(host.querySelector('.be-validation').textContent, /Kings cannot touch/);
  assert.equal(button('Analyze position').disabled, true);
  await click(button('Analyze position'));
  assert.equal(analyzed.length, 0);
  await click(square('e8'));
  assert.equal(button('Analyze position').disabled, false);
});

test('turn, castling, en-passant and move counters update the exported position', async () => {
  await render();
  await select(field('Side to move'), 'b');
  const whiteKingside = [...host.querySelectorAll('.be-castling label')].find(label => label.textContent === 'White kingside').querySelector('input');
  await click(whiteKingside);
  await number(field('Halfmove clock'), '12');
  await number(field('Move number'), '19');
  assert.equal(fen(), new Chess().fen().replace(' w KQkq - 0 1', ' b Qkq - 12 19'));
  await select(field('En-passant square'), 'd6');
  assert.equal(button('Analyze position').disabled, true);
  assert.match(host.querySelector('.be-validation').textContent, /target belongs on rank 3/);
  await select(field('En-passant square'), '-');
  assert.equal(button('Analyze position').disabled, false);
  await click(button('Starting position'));
  assert.equal(fen(), new Chess().fen());
});

test('copy uses the clipboard when available and selects the FEN as a fallback', async () => {
  await render();
  const copied = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => copied.push(text) } });
  await click(button('Copy FEN'));
  assert.equal(copied[0], new Chess().fen());
  assert.match(host.textContent, /FEN copied/);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  await click(button('Copy FEN'));
  assert.equal(document.activeElement, host.querySelector('.be-fen'));
  assert.equal(document.activeElement.selectionStart, 0);
  assert.equal(document.activeElement.selectionEnd, fen().length);
  assert.match(host.textContent, /FEN selected/);
});
