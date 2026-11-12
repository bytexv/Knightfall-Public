import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Chess } from 'chess.js';
import { quizQuestions, quizChoices, quizTopics } from '../src/data/quiz.ts';
import { startQuiz, answerQuiz, advanceQuiz, quizScore, readQuizRun, readQuizProgress, completeQuiz, saveQuizRun, saveQuizProgress } from '../src/lib/quiz.ts';
let dom;
beforeEach(() => { dom = new JSDOM('', { url: 'http://localhost/' }); globalThis.localStorage = dom.window.localStorage; });
afterEach(() => { dom.window.close(); delete globalThis.localStorage; });

test('all 40 quizzes have one valid answer, a useful explanation, stable varied answer order and valid topics', () => {
  assert.equal(quizQuestions.length, 40);
  assert.equal(new Set(quizQuestions.map(q => q.id)).size, 40);
  const positions = new Set();
  for (const q of quizQuestions) {
    assert.ok(quizTopics.includes(q.topic));
    assert.equal(new Set(q.choices).size, 4, q.id);
    assert.ok(q.choices.includes(q.answer), q.id);
    assert.ok(q.explanation.length > 30, q.id);
    const order = quizChoices(q);
    assert.deepEqual(new Set(order), new Set(q.choices));
    assert.deepEqual(order, quizChoices(q));
    positions.add(order.indexOf(q.answer));
  }
  assert.ok(positions.size >= 3);
});

test('all tactical answers are checkmates; every distractor is legal and is not another checkmate', () => {
  const tactical = quizQuestions.filter(q => q.fen);
  assert.equal(tactical.length, 9);
  for (const q of tactical) {
    for (const choice of q.choices) {
      assert.ok(!/[+#]/.test(choice), "Answer notation must not give away checkmate");
      const chess = new Chess(q.fen);
      const move = chess.move(choice);
      assert.ok(move, `${q.id}: ${choice}`);
      assert.equal(chess.isCheckmate(), choice === q.answer, `${q.id}: ${choice}`);
      if (choice === q.answer) assert.equal(move.from + move.to + (move.promotion || ''), q.move);
    }
  }
});

test('quiz sessions sample unique questions, respect topic and missed pools, and reject changing an answer', () => {
  const run = startQuiz('Rules', 5, undefined, () => 0.4);
  assert.equal(new Set(run.ids).size, 5);
  assert.ok(run.ids.every(id => quizQuestions.find(q => q.id === id).topic === 'Rules'));
  assert.equal(advanceQuiz(run), run);
  assert.equal(answerQuiz(run, 'bad answer'), run);
  const q = quizQuestions.find(q => q.id === run.ids[0]);
  const answered = answerQuiz(run, q.answer);
  assert.equal(quizScore(answered), 1);
  assert.equal(answerQuiz(answered, q.choices.find(c => c !== q.answer)), answered);
  assert.equal(advanceQuiz(answered).index, 1);
  assert.equal(startQuiz('All topics', 10, []), null);
});

test('completed sessions count once and practicing a missed question clears it only after a correct answer', () => {
  localStorage.setItem('knightfall:ratings', 'untouched');
  let run = startQuiz('All topics', 1);
  const q = quizQuestions.find(q => q.id === run.ids[0]);
  run = advanceQuiz(answerQuiz(run, q.choices.find(c => c !== q.answer)));
  assert.equal(run.finished, true);
  const progress = completeQuiz(run, { mistakes: [], results: [] });
  assert.deepEqual(progress.mistakes, [q.id]);
  assert.equal(progress.results[0].correct, 0);
  assert.equal(completeQuiz(run, progress), progress);
  saveQuizProgress(progress);
  assert.deepEqual(readQuizProgress(), progress);
  let retry = startQuiz('All topics', 10, progress.mistakes);
  assert.deepEqual(retry.ids, [q.id]);
  retry = advanceQuiz(answerQuiz(retry, q.answer));
  const done = completeQuiz(retry, progress);
  assert.deepEqual(done.mistakes, []);
  assert.equal(done.results.length, 2);
  assert.equal(localStorage.getItem('knightfall:ratings'), 'untouched');
});

test('unfinished answers survive a restart; corrupt or impossible saved progress is ignored', () => {
  const run = startQuiz('All topics', 5);
  const q = quizQuestions.find(q => q.id === run.ids[0]);
  const answered = answerQuiz(run, q.answer);
  saveQuizRun(answered); assert.deepEqual(readQuizRun(), answered);
  for (const invalid of [null, {}, { ...run, index: 4 }, { ...run, finished: true }, { ...run, ids: ['missing'] }, { ...run, answers: ['invalid', null, null, null, null] }]) {
    saveQuizRun(invalid); assert.equal(readQuizRun(), null);
  }
  localStorage.setItem('knightfall:quiz-progress-v1', JSON.stringify({ mistakes: ['unknown', q.id, q.id], results: [null, { id: 'bad', correct: 11, total: 5 }] }));
  assert.deepEqual(readQuizProgress(), { mistakes: [q.id], results: [] });
});
