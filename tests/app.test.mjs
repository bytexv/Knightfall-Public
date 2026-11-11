import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Chess } from "chess.js";
import { LocalEngine } from "../src/lib/engine.ts";
import { newSession, applyMove } from "../src/lib/game.ts";
registerHooks({
  load(url, context, next) {
    if (url.endsWith(".css"))
      return {
        format: "module",
        source: "export default {}",
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { default: App } = await import("../src/App.tsx");
let dom, host, root, engineJobs;
const originals = {
  analyze: LocalEngine.prototype.analyze,
  cancel: LocalEngine.prototype.cancel,
  destroy: LocalEngine.prototype.destroy,
};
beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  host = document.getElementById("root");
  root = createRoot(host);
  engineJobs = [];
  LocalEngine.prototype.analyze = function (fen, options) {
    return new Promise((resolve, reject) =>
      engineJobs.push({
        engine: this,
        fen,
        options,
        resolve,
        reject,
        settled: false,
      }),
    );
  };
  LocalEngine.prototype.cancel = function () {
    for (const job of engineJobs) {
      if (job.engine === this && !job.settled) {
        job.settled = true;
        job.reject(new DOMException("Cancelled", "AbortError"));
      }
    }
  };
  LocalEngine.prototype.destroy = function () {
    this.cancel();
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  Object.assign(LocalEngine.prototype, originals);
  dom.window.close();
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "localStorage",
    "sessionStorage",
    "IS_REACT_ACT_ENVIRONMENT",
  ])
    delete globalThis[key];
});
const render = () => act(async () => root.render(createElement(App)));
const all = (selector) => [...host.querySelectorAll(selector)];
async function clickText(text) {
  const element =
    all("button").find((b) => b.textContent.trim() === text) ||
    all("button").find((b) => b.textContent.includes(text));
  assert.ok(element, `Button missing: ${text}`);
  assert.equal(element.disabled, false, `Button disabled: ${text}`);
  await act(async () =>
    element.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    ),
  );
  return element;
}
async function clickLabel(label) {
  const element = host.querySelector(`[aria-label="${label}"]`);
  assert.ok(element, `Missing label ${label}`);
  await act(async () =>
    element.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    ),
  );
}
async function move(from, to) {
  for (const square of [from, to]) {
    const button = host.querySelector(`[data-square="${square}"]`);
    assert.ok(button);
    await act(async () =>
      button.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
  }
}
const piece = (square) =>
  host.querySelector(`[data-square="${square}"] img`)?.getAttribute("src");
const wait = (ms) => act(async () => new Promise((r) => setTimeout(r, ms)));
function settled(job, bestMove) {
  job.settled = true;
  return act(async () =>
    job.resolve({
      score: 0,
      bestMove,
      lines: [],
      depth: 12,
      engine: "Test engine",
    }),
  );
}

test("shared-screen game validates moves, records history and supports undo", async () => {
  await render();
  assert.equal(host.querySelectorAll("[data-square]").length, 64);
  await clickText("Pass & play");
  await clickText("Start local game");
  await move("e2", "e5");
  assert.ok(piece("e2")?.endsWith("wP.svg"));
  assert.equal(piece("e5"), undefined);
  await move("e2", "e4");
  assert.ok(piece("e4")?.endsWith("wP.svg"));
  assert.match(host.querySelector(".move-list").textContent, /e4/);
  await move("e7", "e5");
  assert.ok(piece("e5")?.endsWith("bP.svg"));
  await clickLabel("Take back move");
  assert.ok(piece("e7")?.endsWith("bP.svg"));
  assert.equal(piece("e5"), undefined);
  const stored = JSON.parse(localStorage.getItem("knightfall:current"));
  assert.equal(stored.moves.length, 1);
});

test("bot makes legal response and stale result from replaced game cannot move new board", async () => {
  await render();
  await clickText("Stockfish");
  await clickText("Play with Stockfish");
  await move("e2", "e4");
  await wait(330);
  const job = engineJobs.at(-1);
  assert.ok(job);
  assert.equal(new Chess(job.fen).turn(), "b");
  await settled(job, "e7e5");
  assert.ok(piece("e5")?.endsWith("bP.svg"));
  await move("g1", "f3");
  await wait(330);
  const stale = engineJobs.at(-1);
  assert.notEqual(stale, job);
  await clickText("New game");
  await clickText("Pass & play");
  await clickText("Start local game");
  await settled(stale, "b8c6");
  assert.equal(piece("c6"), undefined);
  assert.ok(piece("b8")?.endsWith("bN.svg"));
  assert.equal(
    host.querySelector(".move-list").textContent.includes("Nc6"),
    false,
  );
});

test("finished games can branch from earlier positions during analysis without waking bot", async () => {
  let game = newSession({ mode: "bot", started: true });
  for (const [a, b] of [
    ["f2", "f3"],
    ["e7", "e5"],
    ["g2", "g4"],
    ["d8", "h4"],
  ])
    game = applyMove(game, a, b);
  assert.equal(game.result.reason, "Checkmate");
  localStorage.setItem("knightfall:current", JSON.stringify(game));
  await render();
  await clickText("Analysis");
  await clickLabel("First position");
  await move("e2", "e4");
  assert.ok(piece("e4")?.endsWith("wP.svg"));
  const gameStore = JSON.parse(localStorage.getItem("knightfall:current"));
  assert.equal(gameStore.mode, "analysis");
  assert.equal(gameStore.result, null);
  assert.equal(gameStore.moves.length, 1);
  await wait(340);
  assert.equal(host.textContent.includes("Scout is thinking"), false);
});

test("switching from puzzles to play starts a separate game and cannot corrupt puzzle state", async () => {
  await render();
  await clickText("Puzzles");
  const puzzleFen = host
    .querySelector(".chessboard")
    ?.getAttribute("aria-label");
  assert.ok(puzzleFen);
  assert.ok(host.textContent.includes("DAILY PRACTICE"));
  await clickText("Play chess");
  assert.ok(host.textContent.includes("Play with Scout"));
  assert.ok(piece("e2")?.endsWith("wP.svg"));
  assert.ok(piece("e7")?.endsWith("bP.svg"));
  await clickText("Puzzles");
  assert.ok(host.textContent.includes("DAILY PRACTICE"));
  assert.equal(
    host.querySelector(".puzzle-progress>span").textContent.startsWith("0 /"),
    true,
  );
});

test("reloaded casual game is paused with a working resume control", async () => {
  const game = applyMove(
    newSession({ mode: "local", started: true }),
    "e2",
    "e4",
  );
  localStorage.setItem("knightfall:current", JSON.stringify(game));
  await render();
  assert.ok(host.textContent.includes("Resume saved game"));
  assert.ok(piece("e4")?.endsWith("wP.svg"));
  await clickText("Resume saved game");
  await move("e7", "e5");
  assert.ok(piece("e5")?.endsWith("bP.svg"));
});

test("analysis hint result is ignored after replay changes position", async () => {
  let game = applyMove(
    newSession({ mode: "local", started: true }),
    "e2",
    "e4",
  );
  game = applyMove(game, "e7", "e5");
  localStorage.setItem("knightfall:current", JSON.stringify(game));
  await render();
  await clickText("Analysis");
  await clickText("Hint");
  const job = engineJobs.find((j) => j.options?.movetime === 700);
  assert.ok(job);
  await clickLabel("First position");
  await settled(job, "g1f3");
  assert.equal(host.querySelectorAll(".board-arrows line").length, 0);
});

test("clock ticks preserve a completed bot move while React delays committing the render", async () => {
  await render();
  await clickText("Stockfish");
  await clickText("Play with Stockfish");
  await move("e2", "e4");
  await wait(330);
  const job = engineJobs.at(-1);
  assert.ok(job);
  // Keep the React commit pending across two clock ticks. The clock must
  // operate on the newly committed game model, even before its UI renders.
  await act(async () => {
    job.settled = true;
    job.resolve({
      score: 0,
      bestMove: "e7e5",
      lines: [],
      depth: 12,
      engine: "Test engine",
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  assert.ok(piece("e5")?.endsWith("bP.svg"));
  assert.equal(piece("e7"), undefined);
  const stored = JSON.parse(localStorage.getItem("knightfall:current"));
  assert.deepEqual(
    stored.moves.map((move) => move.san),
    ["e4", "e5"],
  );
  assert.equal(new Chess(stored.fen).turn(), "w");
  assert.equal(stored.started, true);
});

test("a queued bot result cannot resume a game paused by navigation", async () => {
  await render();
  await clickText("Stockfish");
  await clickText("Play with Stockfish");
  await move("e2", "e4");
  await wait(330);
  const job = engineJobs.at(-1);
  assert.ok(job);
  const openingLab = all("button").find(
    (button) => button.textContent.trim() === "Opening lab",
  );
  assert.ok(openingLab);
  // Resolve before React can run the bot effect cleanup. Cancellation alone
  // cannot protect an already-queued promise callback from restarting play.
  await act(async () => {
    openingLab.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
    job.settled = true;
    job.resolve({
      score: 0,
      bestMove: "e7e5",
      lines: [],
      depth: 12,
      engine: "Test engine",
    });
    await Promise.resolve();
  });
  const stored = JSON.parse(localStorage.getItem("knightfall:current"));
  assert.equal(stored.started, false);
  assert.deepEqual(
    stored.moves.map((move) => move.san),
    ["e4"],
  );
  await clickText("Play chess");
  assert.ok(host.textContent.includes("Resume saved game"));
  assert.ok(piece("e7")?.endsWith("bP.svg"));
  assert.equal(piece("e5"), undefined);
});

test("entering analysis settles both clocks and archives the paused game", async (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  await render();
  await clickText("Pass & play");
  await clickText("Start local game");
  now = 1250;
  await move("e2", "e4");
  now = 2000;
  await clickText("Analysis");
  const current = JSON.parse(localStorage.getItem("knightfall:current"));
  assert.equal(current.mode, "analysis");
  assert.deepEqual(current.clocks, { w: 599750, b: 599250 });
  const archived = JSON.parse(localStorage.getItem("knightfall:games")).find(
    (game) => game.id === current.id,
  );
  assert.ok(archived);
  assert.equal(archived.mode, "local");
  assert.equal(archived.started, false);
  assert.deepEqual(archived.clocks, { w: 599750, b: 599250 });
  assert.deepEqual(
    archived.moves.map((move) => move.san),
    ["e4"],
  );
});
