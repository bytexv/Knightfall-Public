import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { beforeEach, afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  applyMove,
  newSession,
  importPgn,
  START_FEN,
  undoMoves,
} from "../src/lib/game.ts";

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
const { default: HallScoresheet } = await import(
  "../src/components/HallScoresheet.tsx"
);
let host, dom, root, copies;
beforeEach(() => {
  dom = new JSDOM('<div id="app"></div>', { url: "http://localhost/" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  host = document.getElementById("app");
  root = createRoot(host);
  copies = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "IS_REACT_ACT_ENVIRONMENT",
  ])
    delete globalThis[key];
});
const settings = {
  boardTheme: "ocean",
  coordinates: false,
  alienEasterEgg: true,
};
async function render(game) {
  await act(async () =>
    root.render(
      createElement(HallScoresheet, {
        game,
        orientation: "b",
        settings,
        onCopy: (text) => copies.push(text),
      }),
    ),
  );
}
async function click(selector) {
  const button = host.querySelector(selector);
  assert.ok(button, selector);
  await act(async () => button.click());
}
async function copy() {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Copy moves",
  );
  await act(async () => button.click());
}
const square = (name) =>
  host.querySelector(`.hall-replay [data-square="${name}"]`);

test("selecting a move opens a read-only themed replay, pins it across new moves, and copies only to that position", async () => {
  const game = importPgn("1. e4 e5 2. Nf3");
  await render(game);
  assert.equal(host.querySelector(".hall-replay"), null);
  await click('[data-ply="0"]');
  assert.equal(
    host.querySelector(".hall-replay [data-square]").dataset.square,
    "h1",
  );
  assert.ok(host.querySelector(".hall-replay .theme-ocean"));
  assert.equal(host.querySelector(".hall-replay .coordinate"), null);
  assert.equal(square("e7").getAttribute("aria-label"), "e7, black pawn");
  assert.equal(square("e4").getAttribute("aria-disabled"), "true");
  const next = applyMove(game, "b8", "c6");
  await render(next);
  assert.match(host.querySelector("figcaption").textContent, /1\. e4/);
  assert.equal(square("b8").getAttribute("aria-label"), "b8, black knight");
  await copy();
  assert.deepEqual(copies, ["1. e4"]);
  await click('[aria-label="Close replay"]');
  assert.equal(host.querySelector(".hall-replay"), null);
  assert.equal(host.querySelector("[aria-current=step]").textContent, "Nc6");
  await copy();
  assert.equal(copies.at(-1), "1. e4 e5 2. Nf3 Nc6");
});

test("black-to-move starts and takebacks preserve numbering and clear removed selections", async () => {
  const startFen = START_FEN.replace(" w ", " b ").replace("0 1", "0 23");
  let game = newSession({ startFen });
  game = applyMove(game, "e7", "e5");
  game = applyMove(game, "e2", "e4");
  await render(game);
  await click('[aria-label="Open replay"]');
  await copy();
  assert.equal(copies.at(-1), "23... e5 24. e4");
  await render(undoMoves(game));
  assert.equal(host.querySelector(".hall-replay"), null);
  assert.equal(host.querySelector("[aria-current=step]").textContent, "e5");
  await click('[aria-label="First position"]');
  assert.equal(square("e7").getAttribute("aria-label"), "e7, black pawn");
  assert.match(
    host.querySelector("figcaption").textContent,
    /Starting position/,
  );
  assert.ok(
    [...host.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Copy moves",
    ).disabled,
  );
  await render(newSession({ startFen }));
  assert.equal(host.querySelector(".hall-replay"), null);
  assert.equal(host.querySelector('[aria-label="Open replay"]').disabled, true);
});

test("arrow navigation inside the scoresheet prevents global game shortcuts and Escape restores focus", async () => {
  await render(importPgn("1. e4 e5"));
  let prevented = false;
  window.addEventListener("keydown", (ev) => {
    prevented = ev.defaultPrevented;
  });
  const key = async (k) =>
    act(async () =>
      host
        .querySelector("[aria-expanded]")
        .dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: k,
            bubbles: true,
            cancelable: true,
          }),
        ),
    );
  await key("ArrowLeft");
  assert.equal(prevented, true);
  assert.match(host.querySelector("figcaption").textContent, /1\. e4/);
  await key("Escape");
  assert.equal(host.querySelector(".hall-replay"), null);
  assert.equal(document.activeElement.textContent.trim(), "Open replay");
});
