import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { newSession, applyMove } from '../src/lib/game.ts';
import { reviewMove, summarizeReview } from '../src/lib/review.ts';
import { readStore, writeStore, saveGame, savedGames } from '../src/lib/storage.ts';
import { storeReview, readSavedReview, summaryForGame, readReviewSummaries, removeStoredReview, REVIEW_SUMMARIES_KEY } from '../src/lib/review-store.ts';

let dom;
beforeEach(() => {
  dom = new JSDOM('', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, localStorage: dom.window.localStorage });
});
afterEach(() => { dom.window.close(); delete globalThis.window; delete globalThis.localStorage; });
function fixture(id = 'review-fixture') {
  let game = newSession({ id, mode: 'local', time: { base: 300, increment: 2 }, started: true });
  for (const [from, to] of [['g1','h3'], ['g8','h6'], ['e2','e4'], ['d7','d5']]) game = applyMove(game, from, to);
  const evaluations = [0, -140, -30, -10, 100].map(score => ({ score, bestMove: '', lines: [], depth: 18, engine: 'Stockfish 17.1' }));
  const list = game.moves.map((move, index) => reviewMove(index, move, evaluations[index], evaluations[index + 1], { startFen: game.startFen, moves: game.moves }));
  return { game, list };
}

test('complete reviews persist both scores and details using the existing accuracy calculation', () => {
  const { game, list } = fixture();
  let events = 0; window.addEventListener('knightfall:reviews-changed', () => events++);
  assert.deepEqual(storeReview(game, list, 18), { summarySaved: true, detailsSaved: true });
  const summary = summaryForGame(game), expected = summarizeReview(list);
  assert.equal(summary.white, expected.w.quality);
  assert.equal(summary.black, expected.b.quality);
  assert.notEqual(summary.white, summary.black);
  assert.deepEqual(readSavedReview(game).list, list);
  assert.equal(events, 1);
});

test('partial, malformed and stale reviews cannot appear as completed game accuracy', () => {
  const { game, list } = fixture();
  assert.deepEqual(storeReview(game, list.slice(0, 2), 18), { summarySaved: false, detailsSaved: false });
  assert.equal(summaryForGame(game), null);
  storeReview(game, list, 18);
  assert.equal(summaryForGame(applyMove(game, 'f1', 'e2')), null);
  let edited = newSession({ id: game.id });
  for (const [from, to] of [['d2','d4'],['d7','d5'],['c2','c4'],['e7','e6']]) edited = applyMove(edited, from, to);
  assert.equal(edited.moves.length, game.moves.length);
  assert.equal(summaryForGame(edited), null);
  assert.equal(readSavedReview(edited), null);
  const detail = readStore('review-details-v1', []);
  detail[0].list[0].before = null;
  writeStore('review-details-v1', detail);
  assert.equal(readSavedReview(game), null);
  for (const value of [null, {}, [null, {}, { version: 1, white: Infinity }]]) {
    writeStore(REVIEW_SUMMARIES_KEY, value);
    assert.deepEqual(readReviewSummaries(), []);
  }
});

test('book-only and limited-depth reviews retain an unavailable score instead of inventing accuracy', () => {
  const { game, list } = fixture();
  for (const changes of [{ label: 'Book' }, { confidence: 'limited' }]) {
    storeReview(game, list.map(item => ({ ...item, ...changes })), 18);
    assert.equal(summaryForGame(game).white, null);
    assert.equal(summaryForGame(game).black, null);
  }
});

test('old summaries remain after detailed reviews are evicted and deleting a game removes its review', () => {
  for (let i = 0; i < 15; i++) {
    const { game, list } = fixture(`review-${i}`); storeReview(game, list, 18);
  }
  assert.equal(readReviewSummaries().length, 15);
  assert.equal(readStore('review-details-v1', []).length, 12);
  assert.ok(summaryForGame(fixture('review-0').game));
  assert.equal(readSavedReview(fixture('review-0').game), null);
  removeStoredReview('review-14');
  assert.equal(summaryForGame(fixture('review-14').game), null);
  assert.equal(readSavedReview(fixture('review-14').game), null);
});

test('storage failure is reported without turning a completed review into an exception', () => {
  const { game, list } = fixture();
  globalThis.localStorage = { getItem() { return null; }, setItem() { throw new DOMException('Full', 'QuotaExceededError'); } };
  assert.deepEqual(storeReview(game, list, 18), { summarySaved: false, detailsSaved: false });
});

test('reviewing preserves the original game mode and clocks; changing the line creates an analysis record', () => {
  const { game } = fixture();
  assert.equal(saveGame(game), true);
  saveGame({ ...game, mode: 'analysis', started: true, time: { base: 0, increment: 0 }, clocks: { w: 0, b: 0 }, initialComment: 'Reviewed' });
  const original = savedGames()[0];
  assert.equal(original.mode, 'local');
  assert.deepEqual(original.time, game.time);
  assert.deepEqual(original.clocks, game.clocks);
  assert.equal(original.initialComment, 'Reviewed');
  saveGame(applyMove({ ...game, mode: 'analysis' }, 'f1', 'e2'));
  assert.equal(savedGames()[0].mode, 'analysis');
});
