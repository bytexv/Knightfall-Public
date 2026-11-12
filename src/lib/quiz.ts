import { quizQuestions } from "../data/quiz";
import { readStore, writeStore } from "./storage";
export interface QuizRun {
  id: string;
  ids: string[];
  answers: (string | null)[];
  index: number;
  finished: boolean;
}
export interface QuizProgress {
  mistakes: string[];
  results: { id: string; correct: number; total: number; at: number }[];
}
const question = (id: string) => quizQuestions.find((q) => q.id === id);
export function startQuiz(
  topic: string,
  count: number,
  onlyIds?: string[],
  rng = Math.random,
): QuizRun | null {
  const pool = quizQuestions
    .filter(
      (q) =>
        (topic === "All topics" || q.topic === topic) &&
        (!onlyIds || onlyIds.includes(q.id)),
    )
    .map((q) => q.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const sample = rng();
    const j = Math.floor(
      Math.max(0, Math.min(0.999999, Number.isFinite(sample) ? sample : 0.5)) *
        (i + 1),
    );
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ids = pool.slice(0, Math.max(1, Math.min(10, Math.round(count) || 5)));
  return ids.length
    ? {
        id:
          globalThis.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ids,
        answers: ids.map(() => null),
        index: 0,
        finished: false,
      }
    : null;
}
export function answerQuiz(run: QuizRun, answer: string): QuizRun {
  const q = question(run.ids[run.index]);
  if (
    run.finished ||
    run.answers[run.index] !== null ||
    !q?.choices.includes(answer)
  )
    return run;
  return {
    ...run,
    answers: run.answers.map((value, index) =>
      index === run.index ? answer : value,
    ),
  };
}
export function advanceQuiz(run: QuizRun): QuizRun {
  if (run.finished || run.answers[run.index] === null) return run;
  return run.index === run.ids.length - 1
    ? { ...run, finished: true }
    : { ...run, index: run.index + 1 };
}
export function quizScore(run: QuizRun) {
  return run.ids.reduce(
    (score, id, index) =>
      score + (run.answers[index] === question(id)?.answer ? 1 : 0),
    0,
  );
}
export function readQuizRun(): QuizRun | null {
  const r = readStore<QuizRun | null>("quiz-run-v1", null);
  if (
    !r ||
    typeof r.id !== "string" ||
    r.id.length > 128 ||
    !Array.isArray(r.ids) ||
    !r.ids.length ||
    r.ids.length > 10 ||
    new Set(r.ids).size !== r.ids.length ||
    r.ids.some((id) => !question(id)) ||
    !Array.isArray(r.answers) ||
    r.answers.length !== r.ids.length ||
    !Number.isInteger(r.index) ||
    r.index < 0 ||
    r.index >= r.ids.length ||
    typeof r.finished !== "boolean"
  )
    return null;
  if (
    r.answers.some(
      (a, i) => a !== null && !question(r.ids[i])!.choices.includes(a),
    )
  )
    return null;
  if (
    r.answers.some(
      (a, i) => (i < r.index && a === null) || (i > r.index && a !== null),
    ) ||
    (r.finished &&
      (r.index !== r.ids.length - 1 || r.answers.some((a) => a === null)))
  )
    return null;
  return r;
}
export function readQuizProgress(): QuizProgress {
  const value = readStore<QuizProgress | null>("quiz-progress-v1", null);
  return {
    mistakes: Array.isArray(value?.mistakes)
      ? [...new Set(value.mistakes)]
          .filter((id) => !!question(id))
          .slice(0, quizQuestions.length)
      : [],
    results: Array.isArray(value?.results)
      ? value.results
          .filter(
            (r) =>
              r &&
              typeof r.id === "string" &&
              r.id.length <= 128 &&
              Number.isInteger(r.total) &&
              r.total > 0 &&
              r.total <= 10 &&
              Number.isInteger(r.correct) &&
              r.correct >= 0 &&
              r.correct <= r.total &&
              Number.isFinite(r.at),
          )
          .slice(-100)
      : [],
  };
}
export function completeQuiz(
  run: QuizRun,
  progress: QuizProgress,
): QuizProgress {
  if (!run.finished || progress.results.some((r) => r.id === run.id))
    return progress;
  const mistakes = new Set(progress.mistakes);
  run.ids.forEach((id, i) =>
    run.answers[i] === question(id)!.answer
      ? mistakes.delete(id)
      : mistakes.add(id),
  );
  return {
    mistakes: [...mistakes],
    results: [
      ...progress.results,
      {
        id: run.id,
        correct: quizScore(run),
        total: run.ids.length,
        at: Date.now(),
      },
    ].slice(-100),
  };
}
export function saveQuizRun(run: QuizRun | null) {
  return writeStore("quiz-run-v1", run);
}
export function saveQuizProgress(progress: QuizProgress) {
  return writeStore("quiz-progress-v1", progress);
}
