import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Chess } from "chess.js";
registerHooks({
  load(url, context, next) {
    return url.endsWith(".css")
      ? { format: "module", source: "export default {}", shortCircuit: true }
      : next(url, context);
  },
});
const { default: ChessBoard } = await import(
  "../src/components/ChessBoard.tsx"
);
let dom, host, root, props, animations, media;
const rect = (left = 0, top = 0, width = 640, height = 640) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON() {
    return this;
  },
});
beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  animations = [];
  media = {
    matches: false,
    listener: null,
    addEventListener(type, fn) {
      this.listener = fn;
    },
    removeEventListener() {
      this.listener = null;
    },
  };
  dom.window.matchMedia = () => media;
  dom.window.HTMLElement.prototype.animate = function (frames, options) {
    const animation = {
      element: this,
      frames,
      options,
      onfinish: null,
      cancelled: false,
      cancel() {
        this.cancelled = true;
      },
      finish() {
        this.onfinish?.();
      },
    };
    animations.push(animation);
    return animation;
  };
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("board-motion-piece"))
      return rect(
        parseFloat(this.style.left) * 6.4,
        parseFloat(this.style.top) * 6.4,
        80,
        80,
      );
    return rect();
  };
  host = document.getElementById("root");
  root = createRoot(host);
  props = { fen: new Chess().fen(), onMove() {} };
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
const render = () =>
  act(async () => root.render(createElement(ChessBoard, props)));
const square = (s) => host.querySelector(`[data-square="${s}"]`);
const visual = (s) => host.querySelector(`[data-motion-square="${s}"]`);
const click = (e) =>
  act(async () =>
    e.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })),
  );
const pointer = (element, type, x, y) =>
  act(async () =>
    element.dispatchEvent(
      new dom.window.MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
      }),
    ),
  );
const play = async (san) => {
  const game = new Chess(props.fen);
  game.move(san);
  props.fen = game.fen();
  await render();
};

test("a committed move animates one piece without blocking updated square labels or input", async () => {
  await render();
  await play("e4");
  assert.equal(square("e4").getAttribute("aria-label"), "e4, white pawn");
  assert.equal(square("e2").getAttribute("aria-label"), "e2, empty");
  assert.equal(square("e4").querySelector("img").style.visibility, "hidden");
  assert.equal(visual("e4").style.left, "50%");
  assert.deepEqual(animations[0].frames, [
    { transform: "translate(0%, 200%)" },
    { transform: "translate(0%, 0%)" },
  ]);
  await click(square("e7"));
  assert.equal(square("e6").querySelectorAll(".legal-dot").length, 1);
  animations[0].finish();
  assert.equal(visual("e4"), null);
  assert.equal(square("e4").querySelector("img").style.visibility, "");
});

test("rapid replay reverses from the current visual location and cancels the superseded animation", async () => {
  await render();
  const start = props.fen;
  await play("e4");
  visual("e4").getBoundingClientRect = () => rect(320, 400, 80, 80); // halfway from e2 to e4
  props.fen = start;
  await render();
  assert.equal(animations[0].cancelled, true);
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 1);
  assert.equal(visual("e2").style.top, "75%");
  assert.equal(animations.at(-1).frames[0].transform, "translate(0%, -100%)");
  assert.equal(square("e2").querySelector("img").style.visibility, "hidden");
});

test("a fast bot reply continues the first piece from its visible location", async () => {
  await render();
  await play("e4");
  visual("e4").getBoundingClientRect = () => rect(320, 400, 80, 80);
  await play("e5");
  assert.ok(visual("e4"));
  assert.ok(visual("e5"));
  const continuation = animations.findLast((a) => a.element === visual("e4"));
  assert.equal(continuation.frames[0].transform, "translate(0%, 100%)");
});

test("orientation flips and unrelated loads remove all ghosts and restore images", async () => {
  await render();
  await play("e4");
  props.orientation = "b";
  await render();
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 0);
  assert.equal(square("e4").querySelector("img").style.visibility, "");
  await play("e5");
  assert.ok(visual("e5"));
  props.fen = "8/P7/8/8/8/6k1/8/6K1 w - - 0 1";
  await render();
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 0);
  assert.equal(host.querySelectorAll('.square img[style*="hidden"]').length, 0);
});

test("castling animates king and rook; a capture fades only the captured piece", async () => {
  props.fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  await render();
  await play("O-O");
  assert.ok(visual("g1"));
  assert.ok(visual("f1"));
  assert.equal(host.querySelectorAll(".is-travelling").length, 2);
  props.fen = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
  await render();
  await play("exd5");
  assert.ok(visual("d5"));
  assert.equal(host.querySelectorAll(".is-capture").length, 1);
  assert.match(host.querySelector(".is-capture img").src, /bP.svg$/);
});

test("promotion travels as a pawn while crossfading into the chosen piece", async () => {
  props.fen = "8/P7/8/8/8/6k1/8/6K1 w - - 0 1";
  await render();
  await play("a8=N");
  const images = visual("a8").querySelectorAll("img");
  assert.equal(images.length, 2);
  assert.match(images[0].src, /wP.svg$/);
  assert.match(images[1].src, /wN.svg$/);
  assert.equal(
    animations.filter((a) => a.frames.some((f) => "opacity" in f)).length,
    2,
  );
  animations[0].finish();
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 0);
  assert.match(square("a8").querySelector("img").src, /wN.svg$/);
});

test("reduced motion disables automatic travel and an updated preference cancels active motion", async () => {
  media.matches = true;
  await render();
  await play("e4");
  assert.equal(animations.length, 0);
  media.matches = false;
  await play("e5");
  assert.ok(visual("e5"));
  media.matches = true;
  media.listener();
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 0);
  assert.equal(square("e5").querySelector("img").style.visibility, "");
});

test("dragging tracks the pointer and the accepted move starts at the drop position, without snapback", async () => {
  props.onMove = (from, to) => {
    const game = new Chess(props.fen);
    game.move({ from, to });
    props.fen = game.fen();
    root.render(createElement(ChessBoard, props));
  };
  await render();
  document.elementFromPoint = () => square("e4");
  await pointer(square("e2"), "pointerdown", 360, 520);
  await pointer(square("e2"), "pointermove", 360, 360);
  assert.equal(host.querySelector(".is-dragging").style.top, "50%");
  assert.equal(square("e2").querySelector("img").style.visibility, "hidden");
  await pointer(square("e2"), "pointerup", 360, 360);
  assert.equal(host.querySelectorAll(".is-dragging").length, 0);
  assert.ok(visual("e4"));
  assert.equal(animations.at(-1).frames[0].transform, "translate(0%, 0%)");
});

test("invalid drag returns to its legal square and pointer cancellation cleans up", async () => {
  await render();
  document.elementFromPoint = () => square("e5");
  await pointer(square("e2"), "pointerdown", 360, 520);
  await pointer(square("e2"), "pointermove", 360, 280);
  await pointer(square("e2"), "pointerup", 360, 280);
  assert.equal(square("e2").getAttribute("aria-label"), "e2, white pawn");
  assert.equal(animations.at(-1).frames[0].transform, "translate(0%, -300%)");
  animations.at(-1).finish();
  await pointer(square("d2"), "pointerdown", 280, 520);
  await pointer(square("d2"), "pointermove", 280, 360);
  await pointer(square("d2"), "pointercancel", 280, 360);
  assert.equal(host.querySelectorAll(".is-dragging").length, 0);
  assert.equal(square("d2").querySelector("img").style.visibility, "");
});

test("a missing Web Animations API leaves legal board rendering functional", async () => {
  delete dom.window.HTMLElement.prototype.animate;
  await render();
  await play("e4");
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 0);
  assert.match(square("e4").querySelector("img").src, /wP.svg$/);
});

test("an animation API failure restores static pieces and removes half-created overlays", async () => {
  dom.window.HTMLElement.prototype.animate = function () {
    throw new Error("Unsupported animation");
  };
  await render();
  await play("e4");
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 0);
  assert.equal(square("e4").querySelector("img").style.visibility, "");
});

test("a delayed authoritative move keeps the dropped piece at its destination and then consumes it once", async () => {
  let proposed;
  props.onMove = (from, to) => {
    proposed = { from, to };
  };
  await render();
  document.elementFromPoint = () => square("e4");
  await pointer(square("e2"), "pointerdown", 360, 520);
  await pointer(square("e2"), "pointermove", 360, 360);
  await pointer(square("e2"), "pointerup", 360, 360);
  assert.deepEqual(proposed, { from: "e2", to: "e4" });
  assert.equal(host.querySelectorAll(".is-dragging").length, 1);
  assert.equal(square("e2").querySelector("img").style.visibility, "hidden");
  await play("e4");
  assert.equal(host.querySelectorAll(".is-dragging").length, 0);
  assert.equal(host.querySelectorAll(".board-motion-piece").length, 1);
  assert.equal(animations.at(-1).frames[0].transform, "translate(0%, 0%)");
});
