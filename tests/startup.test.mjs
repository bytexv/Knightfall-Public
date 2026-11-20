import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const guard = await readFile(new URL("../public/startup-guard.js", import.meta.url), "utf8");

test("a failed app script exposes the reload action before React mounts", () => {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/chess/#coach" });
  try {
    const { document, Event } = dom.window;
    const screen = document.querySelector("#knightfall-launch");
    dom.window.eval(guard);
    screen.querySelector("img").dispatchEvent(new Event("error"));
    assert.equal(screen.dataset.state, undefined);

    document.querySelector('script[type="module"]').dispatchEvent(new Event("error"));
    assert.equal(screen.dataset.state, "failed");
    assert.match(screen.querySelector('[role="status"]').textContent, /could not open/i);
    assert.match(screen.querySelector("a[href]").textContent, /Reload/);
  } finally {
    dom.window.close();
  }
});

test("startup handling retires once the app commits", () => {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  try {
    const { document, ErrorEvent, Event } = dom.window;
    const screen = document.querySelector("#knightfall-launch");
    dom.window.eval(guard);
    screen.remove();
    dom.window.dispatchEvent(new Event("knightfall:mounted"));
    dom.window.dispatchEvent(new ErrorEvent("error", { message: "A later UI error" }));
    assert.equal(screen.dataset.state, undefined);
    assert.equal(document.querySelector("#knightfall-launch"), null);
  } finally {
    dom.window.close();
  }
});
