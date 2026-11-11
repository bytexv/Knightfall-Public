/** Small compatibility shims for older Android system WebViews. No remote polyfill service. */
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, "at", {
    configurable: true,
    writable: true,
    value: function <T>(this: T[], index: number) {
      const number = Number(index);
      const offset = Number.isNaN(number) ? 0 : Math.trunc(number);
      const position = offset < 0 ? this.length + offset : offset;
      return this[position];
    },
  });
}
if (typeof AbortSignal !== "undefined" && !AbortSignal.timeout) {
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    writable: true,
    value: (ms: number) => {
      const controller = new AbortController();
      setTimeout(
        () =>
          controller.abort(
            new DOMException("The operation timed out", "TimeoutError"),
          ),
        Math.max(0, ms),
      );
      return controller.signal;
    },
  });
}
export {};

if (typeof document !== "undefined" && document.body) {
  const test = document.createElement("div");
  test.style.cssText =
    "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
  test.append(document.createElement("div"), document.createElement("div"));
  document.body.appendChild(test);
  document.documentElement.classList.toggle(
    "no-flex-gap",
    test.scrollHeight !== 1,
  );
  test.remove();
}
