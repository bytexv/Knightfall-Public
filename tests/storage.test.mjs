import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyMove, newSession, START_FEN } from '../src/lib/game.ts';
import { puzzles } from '../src/data/puzzles.ts';

// Exercise the real Capacitor proxy contract without a device: native calls still
// go through registerPlugin and its promise-based native bridge.
let nativeCalls = [];
let nativeBehavior = async () => ({ saved: true, filename: 'game.pgn' });
globalThis.Capacitor = {
  PluginHeaders: [{ name: 'KnightfallFiles', methods: [{ name: 'save', rtype: 'promise' }] }],
  nativePromise: async (plugin, method, args) => {
    nativeCalls.push({ plugin, method, args });
    return nativeBehavior(args);
  },
};
globalThis.androidBridge = {};
const { defaultSettings, sanitizeSettings, sanitizeSolved, validateSavedGame, readStore, writeStore, savedGames, saveGame, downloadFile } = await import('../src/lib/storage.ts');
delete globalThis.androidBridge;

let dom;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  nativeCalls = [];
  nativeBehavior = async args => ({ saved: true, filename: args.filename });
  delete globalThis.androidBridge;
});
afterEach(() => {
  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.androidBridge;
});
const sample = (id = 'saved-game') => applyMove(newSession({ id, mode: 'local', title: 'A local game' }), 'e2', 'e4');

test('settings only retain valid known runtime values', () => {
  for (const invalid of [null, undefined, 5, 'settings', [], true]) assert.deepEqual(sanitizeSettings(invalid), defaultSettings);
  assert.deepEqual(sanitizeSettings({ name: null, boardTheme: 'unknown', sound: 'false', coordinates: 0, legalMoves: {}, extra: true }), defaultSettings);
  assert.deepEqual(sanitizeSettings({ name: '  Ava\u0000  ', boardTheme: 'ocean', sound: false, coordinates: false, legalMoves: false, extra: true }), {
    name: 'Ava', boardTheme: 'ocean', sound: false, coordinates: false, legalMoves: false,
  });
  assert.equal(sanitizeSettings({ name: 'x'.repeat(1000) }).name.length, 24);
  assert.equal(sanitizeSettings({ name: '   ' }).name, 'You');
});

test('solved progress is deduplicated and limited to actual puzzle IDs', () => {
  assert.deepEqual(sanitizeSolved({ length: 9000 }), []);
  assert.deepEqual(sanitizeSolved([puzzles[0].id, 'unknown', null, {}, puzzles[0].id, puzzles[1].id]), [puzzles[0].id, puzzles[1].id]);
});

test('saved sessions reconstruct chess records instead of trusting stored FEN/SAN', () => {
  const game = sample();
  const raw = structuredClone(game);
  raw.fen = 'not a FEN';
  Object.assign(raw.moves[0], { fen: 'bad', before: 'bad', san: 'Qh4#', color: 'b', captured: 'q' });
  const restored = validateSavedGame(raw);
  assert.ok(restored);
  assert.equal(restored.fen, game.fen);
  assert.equal(restored.startFen, START_FEN);
  assert.deepEqual(restored.moves, game.moves);
  assert.equal(raw.fen, 'not a FEN', 'input is not mutated');
});

test('saved sessions reject missing identity, invalid setup, impossible moves, and excessive histories', () => {
  const game = sample();
  for (const raw of [null, [], {}, { ...game, id: '' }, { ...game, id: 3 }, { ...game, id: 'x'.repeat(129) },
    { ...game, startFen: 'invalid' }, { ...game, startFen: '8/8/8/8/8/8/4k3/4K3 w - - 0 1' },
    { ...game, startFen: '7k/8/8/8/8/8/8/4K3 w K - 0 1' }, { ...game, moves: null },
    { ...game, moves: [{ from: 'e2', to: 'e5' }] }, { ...game, moves: [{ from: 'z2', to: 'e4' }] },
    { ...game, moves: [{ from: 'e2', to: 'e4', promotion: 'k' }] },
    { ...game, moves: Array(1001).fill({ from: 'e2', to: 'e4' }) }]) assert.equal(validateSavedGame(raw), null);
});

test('saved session metadata is normalized to safe finite values', () => {
  const restored = validateSavedGame({ ...sample(), title: {}, mode: [], playerColor: {}, botId: 'missing', started: 'yes', createdAt: Infinity,
    clocks: { w: NaN, b: -4 }, time: { base: Infinity, increment: -100 }, result: { winner: 'somebody', reason: null } });
  assert.ok(restored);
  assert.equal(restored.title, 'Saved game');
  assert.equal(restored.mode, 'analysis');
  assert.equal(restored.playerColor, 'w');
  assert.equal(restored.botId, 'scout');
  assert.equal(restored.started, false);
  assert.ok(Number.isFinite(restored.createdAt));
  assert.doesNotThrow(() => new Date(restored.createdAt).toISOString());
  assert.deepEqual(restored.time, { base: 600, increment: 0 });
  assert.deepEqual(restored.clocks, { w: 600000, b: 600000 });
  assert.equal(restored.result, null);
  const untimed = validateSavedGame({ ...sample(), time: { base: 0, increment: 0 }, clocks: { w: 999999, b: 999999 } });
  assert.deepEqual(untimed.clocks, { w: 0, b: 0 });
});

test('chess-derived terminal results override inconsistent stored claims', () => {
  let game = newSession({ mode: 'local' });
  for (const uci of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) game = applyMove(game, uci.slice(0, 2), uci.slice(2, 4));
  const restored = validateSavedGame({ ...game, result: { winner: 'w', reason: 'Incorrect result' } });
  assert.deepEqual(restored.result, { winner: 'b', reason: 'Checkmate' });
  const resigned = validateSavedGame({ ...sample(), result: { winner: 'w', reason: 'Resignation' } });
  assert.deepEqual(resigned.result, { winner: 'w', reason: 'Resignation' });
});

test('saved move and initial comments survive with bounded PGN-safe text', () => {
  const raw = sample();
  raw.whiteName = '  Alice \"The player\"  ';
  raw.blackName = 'Bob'.repeat(50);
  raw.initialComment = '  Plan\r\n{protect} \u0000the king  ';
  raw.moves[0].comment = 'x'.repeat(3000);
  const restored = validateSavedGame(raw);
  assert.equal(restored.initialComment, 'Plan\n[protect] the king');
  assert.equal(restored.whiteName, 'Alice The player');
  assert.equal(restored.blackName.length, 80);
  assert.equal(restored.moves[0].comment.length, 2000);
  assert.equal(validateSavedGame({ ...raw, initialComment: { text: 'bad' }, moves: [{ ...raw.moves[0], comment: 5 }] }).initialComment, undefined);
});

test('malformed storage is harmless and valid archive entries are deduplicated', () => {
  localStorage.setItem('knightfall:games', '{broken');
  assert.deepEqual(savedGames(), []);
  const game = sample();
  writeStore('games', [{ fen: 'bad', moves: [] }, game, { ...game, title: 'Duplicate' }, { ...sample('other'), title: null }]);
  const archive = savedGames();
  assert.deepEqual(archive.map(g => g.id), ['saved-game', 'other']);
  assert.equal(archive[1].title, 'Saved game');
  archive.pop();
  assert.equal(savedGames().length, 2, 'caller cannot mutate the cached array');
  writeStore('games', [sample('third')]);
  assert.equal(savedGames()[0].id, 'third', 'external/imported snapshots invalidate the cache');
  writeStore('games', null);
  assert.deepEqual(savedGames(), []);
});

test('saving updates an existing game, preserves order, and caps archive size', () => {
  const game = sample();
  assert.equal(saveGame(game), true);
  const second = applyMove(game, 'e7', 'e5');
  assert.equal(saveGame(second), true);
  assert.equal(savedGames().length, 1);
  assert.equal(savedGames()[0].moves.length, 2);
  writeStore('games', Array.from({ length: 205 }, (_, i) => ({ ...game, id: `game-${i}` })));
  assert.equal(savedGames().length, 200);
  assert.equal(saveGame({ ...second, id: 'latest' }), true);
  assert.equal(savedGames().length, 200);
  assert.equal(savedGames()[0].id, 'latest');
  assert.equal(saveGame(newSession()), false, 'empty games are not archived');
});

test('a zero-move analysis study preserves its custom FEN and initial note', () => {
  const fen = '7k/8/8/8/8/8/P7/KR6 w - - 0 37';
  const study = newSession({ id: 'noted-study', mode: 'analysis', startFen: fen, title: 'Pawn ending', initialComment: 'Bring the king toward the pawn.' });
  assert.equal(saveGame(study), true);
  const stored = savedGames()[0];
  assert.equal(stored.startFen, fen);
  assert.equal(stored.fen, fen);
  assert.equal(stored.moves.length, 0);
  assert.equal(stored.initialComment, 'Bring the king toward the pawn.');
  assert.equal(saveGame(newSession({ mode: 'analysis', id: 'bare-position', startFen: fen })), true);
});

test('quota errors return failure without pretending the archive changed', t => {
  saveGame(sample());
  t.mock.method(dom.window.Storage.prototype, 'setItem', () => { throw new dom.window.DOMException('Quota exceeded', 'QuotaExceededError'); });
  assert.equal(writeStore('settings', defaultSettings), false);
  assert.equal(saveGame(sample('cannot-save')), false);
  assert.deepEqual(savedGames().map(game => game.id), ['saved-game']);
  assert.equal(readStore('nonexistent', 'fallback'), 'fallback');
});

test('web export creates one typed download and revokes its object URL', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let blob;
  const revoked = [];
  t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:knightfall-test'; });
  t.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
  const clicks = [];
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function() { clicks.push({ name: this.download, href: this.href, attached: this.isConnected }); });
  assert.equal(await downloadFile('my-game.pgn', '1. e4 *', 'application/x-chess-pgn'), true);
  assert.deepEqual(clicks, [{ name: 'my-game.pgn', href: 'blob:knightfall-test', attached: true }]);
  assert.equal(blob.type, 'application/x-chess-pgn');
  assert.equal(await blob.text(), '1. e4 *');
  assert.equal(document.querySelectorAll('a').length, 0);
  assert.equal(nativeCalls.length, 0);
  t.mock.timers.tick(5000);
  assert.deepEqual(revoked, ['blob:knightfall-test']);
});

test('Android export sends exact filename and contents to the native document picker', async () => {
  globalThis.androidBridge = {};
  assert.equal(await downloadFile('game.pgn', '1. e4 e5 *', 'application/x-chess-pgn'), true);
  assert.deepEqual(nativeCalls, [{ plugin: 'KnightfallFiles', method: 'save', args: { filename: 'game.pgn', data: '1. e4 e5 *' } }]);
  assert.equal(document.querySelectorAll('a').length, 0);
});

test('Android cancellation returns false while real save errors remain observable', async () => {
  globalThis.androidBridge = {};
  nativeBehavior = async () => { throw Object.assign(new Error('Save cancelled'), { code: 'USER_CANCELLED' }); };
  assert.equal(await downloadFile('backup.json', '{}'), false);
  nativeBehavior = async () => { throw Object.assign(new Error('Disk full'), { code: 'SAVE_FAILED' }); };
  await assert.rejects(downloadFile('backup.json', '{}'), /Disk full/);
});
