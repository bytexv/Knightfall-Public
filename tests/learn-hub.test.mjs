import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const cssHook = registerHooks({
  load(url, context, next) {
    return url.endsWith(".css")
      ? { format: "module", source: "", shortCircuit: true }
      : next(url, context);
  },
});
const { default: LearnHub } = await import("../src/components/LearnHub.tsx");
cssHook.deregister();
let dom, host, root, bubbledKeys;

beforeEach(() => {
  dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost/" },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  host = document.getElementById("root");
  root = createRoot(host);
  bubbledKeys = [];
  window.addEventListener("keydown", (event) => bubbledKeys.push(event.key));
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "localStorage",
    "IS_REACT_ACT_ENVIRONMENT",
  ])
    delete globalThis[key];
});
async function mount() {
  await act(async () =>
    root.render(createElement(LearnHub, { onExplore() {}, onPuzzle() {} })),
  );
}
const tabs = () => [...host.querySelectorAll('.lh-tabs [role="tab"]')];
function assertSelected(index, focused = true) {
  const choices = tabs();
  assert.deepEqual(
    choices.map((tab) => tab.tabIndex),
    index === 0 ? [0, -1] : [-1, 0],
    "Exactly the active tab is in the Tab sequence",
  );
  assert.deepEqual(
    choices.map((tab) => tab.getAttribute("aria-selected")),
    index === 0 ? ["true", "false"] : ["false", "true"],
  );
  if (focused) assert.equal(document.activeElement, choices[index]);
  const panel = host.querySelector('[role="tabpanel"]');
  assert.equal(panel.id, choices[index].getAttribute("aria-controls"));
  assert.equal(panel.getAttribute("aria-labelledby"), choices[index].id);
}
async function press(key) {
  const event = new dom.window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => document.activeElement.dispatchEvent(event));
  return event;
}

test("learning tabs provide one tab stop and arrows wrap with automatic activation", async () => {
  await mount();
  tabs()[0].focus();
  assertSelected(0);
  assert.equal((await press("ArrowRight")).defaultPrevented, true);
  assertSelected(1);
  await press("ArrowRight");
  assertSelected(0);
  await press("ArrowLeft");
  assertSelected(1);
  await press("ArrowLeft");
  assertSelected(0);
  assert.deepEqual(
    bubbledKeys,
    [],
    "Tab arrows must not reach the app move-replay shortcuts",
  );
});

test("Home and End move focus and selection, while unrelated keys remain untouched", async () => {
  await mount();
  tabs()[0].focus();
  await press("End");
  assertSelected(1);
  await press("Home");
  assertSelected(0);
  assert.deepEqual(bubbledKeys, []);
  assert.equal((await press("a")).defaultPrevented, false);
  assert.deepEqual(bubbledKeys, ["a"]);
  assertSelected(0);
});

test("mouse selection updates the single keyboard entry point", async () => {
  await mount();
  await act(async () =>
    tabs()[1].dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    ),
  );
  assertSelected(1, false);
  tabs()[1].focus();
  await press("ArrowRight");
  assertSelected(0);
});
