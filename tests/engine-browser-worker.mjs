/**
 * Executes the actual browser branch of Stockfish.js in a Node worker sandbox.
 * This is a protocol/asset-loading integration test, not a browser UI test.
 */
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';

const location = new URL(workerData.url);
let wasmMemory = null;
const observe = result => {
  const instance = result.instance || result;
  wasmMemory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory) || wasmMemory;
  return result;
};
const observedWebAssembly = Object.create(WebAssembly);
Object.defineProperties(observedWebAssembly, {
  instantiate: { value: async (...args) => observe(await WebAssembly.instantiate(...args)) },
  instantiateStreaming: { value: async (...args) => observe(await WebAssembly.instantiateStreaming(...args)) },
});
const scope = {
  location,
  onmessage: null,
  console,
  WebAssembly: workerData.captureMemory ? observedWebAssembly : WebAssembly,
  SharedArrayBuffer: undefined,
  Atomics: undefined,
  TextDecoder,
  TextEncoder,
  URL,
  Blob,
  performance,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  atob,
  btoa,
  importScripts() { throw new Error('Unexpected dependency requested by the single-thread engine'); },
  async fetch(url) {
    const requested = new URL(url, location);
    if (requested.protocol !== location.protocol || requested.host !== location.host || requested.pathname !== location.pathname.replace(/\.js$/, '.wasm')) throw new Error(`Unexpected engine asset: ${requested.href}`);
    const bytes = await readFile(new URL('../public/engine/stockfish.wasm', import.meta.url));
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/wasm' } });
  },
  postMessage(data) { parentPort.postMessage(data); },
};
scope.self = scope;
const context = vm.createContext(scope);
const pending = [];
parentPort.on('message', data => {
  if (data && typeof data === 'object' && data.benchmark === 'memory') {
    parentPort.postMessage({ benchmark: 'memory', request: data.request, wasmBytes: wasmMemory?.buffer.byteLength ?? null, ...process.memoryUsage() });
    return;
  }
  if (typeof scope.onmessage === 'function') scope.onmessage({ data });
  else pending.push(data);
});
const source = await readFile(new URL('../public/engine/stockfish.js', import.meta.url), 'utf8');
new vm.Script(source, { filename: 'stockfish.js' }).runInContext(context);
for (const data of pending.splice(0)) scope.onmessage({ data });
