import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { newSession, applyMove } from '../src/lib/game.ts';
import { reviewLine, REVIEW_SUMMARIES_KEY } from '../src/lib/review-store.ts';
import { writeStore } from '../src/lib/storage.ts';
import { readQuizRun, readQuizProgress, startQuiz, saveQuizRun } from '../src/lib/quiz.ts';
import { quizQuestions } from '../src/data/quiz.ts';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
dom.window.scrollTo = () => {};
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });
const { default: ReviewLibrary } = await import('../src/components/ReviewLibrary.tsx');
const { default: QuizHub } = await import('../src/components/QuizHub.tsx');
let root, host;
beforeEach(() => { localStorage.clear(); host = document.getElementById('root'); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); });
const render = (Component, props = {}) => act(async () => root.render(createElement(Component, props)));
const click = selector => act(async () => { const b = host.querySelector(selector); assert.ok(b, selector); assert.equal(b.disabled, false); b.click(); });
const textClick = text => act(async () => { const b = [...host.querySelectorAll('button')].find(b => b.textContent.includes(text)); assert.ok(b, text); assert.equal(b.disabled, false); b.click(); });
const fill = (selector, value) => act(async () => {
  const el = host.querySelector(selector);
  const prototype = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
  el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});

test('the review library exposes every saved game, separate side accuracy, search, filters and review/resume actions', async () => {
  const games = Array.from({ length: 23 }, (_, i) => applyMove(newSession({ id: `game-${i}`, title: `Match ${i}`, createdAt: 10000+i, mode: 'local', whiteName: `Player ${i}`, blackName: 'Scout' }), 'e2', 'e4'));
  writeStore(REVIEW_SUMMARIES_KEY, [{ version: 1, gameId: games[22].id, line: reviewLine(games[22]), reviewedAt: Date.now(), plies: 1, depth: 18, white: 86, black: null, limited: false }]);
  let review, resume, deleted, exported;
  await render(ReviewLibrary, { games, onReview: g => review=g, onResume: g => resume=g, onDelete: g=>deleted=g, onExport: g=>exported=g, onImport() {}, onPlay() {} });
  assert.equal(host.querySelectorAll('[data-review-game]').length, 20);
  assert.equal(host.querySelector('[data-review-game="game-22"] .accuracy-white').textContent, '86%');
  assert.equal(host.querySelector('[data-review-game="game-22"] .accuracy-black').textContent, '—');
  assert.equal(host.querySelector('[data-review-game="game-21"] .accuracy-pair'), null);
  await click('[aria-label="Next games page"]');
  assert.equal(host.querySelectorAll('[data-review-game]').length, 3);
  assert.ok(host.querySelector('[data-review-game="game-0"]'));
  await fill('[aria-label="Search games"]', 'Player 22');
  assert.equal(host.querySelectorAll('[data-review-game]').length, 1);
  await textClick('Open review'); assert.equal(review.id, 'game-22');
  await click('[aria-label="Resume Match 22"]'); assert.equal(resume.id, 'game-22');
  await click('[aria-label="Export Match 22"]'); assert.equal(exported.id, 'game-22');
  await click('[aria-label="Delete Match 22"]'); assert.equal(deleted.id, 'game-22');
  await fill('[aria-label="Search games"]', '');
  await fill('[aria-label="Filter games"]', 'reviewed');
  assert.equal(host.querySelectorAll('[data-review-game]').length, 1);
  await fill('[aria-label="Filter games"]', 'unreviewed');
  assert.equal(host.querySelectorAll('.accuracy-pair').length, 0);
  await fill('[aria-label="Search games"]', 'missing player');
  assert.match(host.textContent, /No games match/);
  await textClick('Show all games'); assert.equal(host.querySelectorAll('[data-review-game]').length, 20);
});

test('a quiz locks its first answer, resumes after remount, shows explanations and retries missed questions', async () => {
  localStorage.setItem('knightfall:current', 'active chess game unchanged');
  await render(QuizHub, { onPuzzles() {} });
  await textClick('Quick five');
  const initial = readQuizRun(), first = quizQuestions.find(q => q.id === initial.ids[0]);
  await textClick(first.choices.find(c => c !== first.answer));
  assert.ok(host.textContent.includes(first.explanation));
  assert.ok([...host.querySelectorAll('.quiz-choices button')].every(b => b.disabled));
  await textClick('Save & leave quiz'); assert.ok(host.textContent.includes('Your quiz is saved'));
  await textClick('Resume quiz');
  await act(async () => root.unmount()); root = createRoot(host);
  await render(QuizHub, { onPuzzles() {} });
  assert.equal(readQuizRun().id, initial.id);
  assert.ok(host.querySelector('.quiz-feedback.quiz-wrong'));
  await textClick('Next question');
  for (let index=1; index<5; index++) {
    const q=quizQuestions.find(q => q.id === readQuizRun().ids[index]);
    await textClick(q.answer);
    await textClick(index === 4 ? 'See my results' : 'Next question');
  }
  assert.match(host.querySelector('.quiz-final-score').textContent, /4.*5/);
  assert.equal(host.querySelectorAll('.quiz-answer-review details').length, 5);
  assert.deepEqual(readQuizProgress().mistakes, [first.id]);
  await textClick('Practice mistakes');
  assert.deepEqual(readQuizRun().ids, [first.id]);
  await textClick(first.answer); await textClick('See my results');
  assert.deepEqual(readQuizProgress().mistakes, []);
  assert.equal(readQuizProgress().results.length, 2);
  assert.equal(localStorage.getItem('knightfall:current'), 'active chess game unchanged');
});

test('tactical quiz boards reveal and reset the actual checkmating move after an answer', async () => {
  const run = startQuiz('Tactics', 1), q = quizQuestions.find(q => q.id === run.ids[0]);
  saveQuizRun(run);
  await render(QuizHub, { onPuzzles() {} });
  const from = () => host.querySelector(`[data-square="${q.move.slice(0,2)}"] img`);
  assert.ok(from());
  await textClick(q.answer);
  await textClick('Show the checkmate');
  assert.equal(from(), null);
  await textClick('Reset position'); assert.ok(from());
});
