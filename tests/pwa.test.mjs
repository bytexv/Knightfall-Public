import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const swCode = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function harness() {
  const handlers = {};
  const stores = new Map();
  let online = true;
  let status = 200;
  let requested = [];
  const cacheObject = (name) => ({
    addAll: async (requests) => {
      const entries = await Promise.all(requests.map(async request => [request.url, await fetcher(request)]));
      for (const [url, response] of entries) stores.get(name).set(url, response);
    },
    put: async (request,response) => {stores.get(name).set(typeof request==='string'?request:request.url,response);},
    match: async request => stores.get(name).get(typeof request==='string'?request:request.url)?.clone(),
    keys: async () => [...stores.get(name).keys()].map(url => new Request(url)),
  });
  const caches = {
    open: async (name) => {if (!stores.has(name)) stores.set(name,new Map());return cacheObject(name);},
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    match: async (request, options) => {
      const url = new URL(typeof request === 'string' ? request : request.url);
      if (options?.ignoreSearch) url.search='';
      for (const entries of stores.values()) if(entries.has(url.href)) return entries.get(url.href).clone();
      return undefined;
    },
  };
  const fetcher = async request => {
    const url = typeof request === 'string' ? request : request.url;
    requested.push(url);
    if (!online) throw new Error('offline');
    return new Response(url.endsWith('index.html') ? '<main>Knightfall</main>' : 'asset', {status});
  };
  const self = {
    __KNIGHTFALL_BUILD__: 'test-build',
    __KNIGHTFALL_ASSETS__: ['./index.html','./assets/app.js','./engine/stockfish.wasm'],
    registration:{scope:'https://knightfall.test/app/'},
    clients:{claim:async()=>{}},
    addEventListener: (event, callback) => {handlers[event]=callback;},
    skipWaiting: ()=>{},
  };
  vm.runInNewContext(swCode,{self,caches,fetch:fetcher,URL,Request,Response,importScripts:()=>{}});
  async function lifecycle(name) {let promise;handlers[name]({waitUntil:value=>{promise=value;}});await promise;}
  async function request(url, mode='cors', destination='') {
    let result;
    handlers.fetch({request:{url,method:'GET',mode,destination},respondWith:value=>{result=value;}});
    return result === undefined ? undefined : await result;
  }
  return {self,stores,caches,lifecycle,request,setOnline:value=>{online=value;},setStatus:value=>{status=value;},requested};
}

test('PWA precaches the complete shell and engine, then survives an offline navigation',async()=>{
  const h=harness();
  await h.lifecycle('install');
  h.setOnline(false);
  const shell=await h.request('https://knightfall.test/app/','navigate');
  assert.match(await shell.text(),/Knightfall/);
  const engine=await h.request('https://knightfall.test/app/engine/stockfish.wasm');
  assert.equal(await engine.text(),'asset');
  const app=await h.request('https://knightfall.test/app/assets/app.js?v=1');
  assert.equal(await app.text(),'asset');
});

test('PWA never serves cached multiplayer API/health requests or external origins',async()=>{
  const h=harness();await h.lifecycle('install');h.setOnline(false);
  assert.equal(await h.request('https://knightfall.test/app/api/lan-info'),undefined);
  assert.equal(await h.request('https://knightfall.test/app/health'),undefined);
  assert.equal(await h.request('https://knightfall.test/app/ws'),undefined);
  assert.equal(await h.request('https://external.test/app/assets/app.js'),undefined);
});

test('PWA activation removes old Knightfall assets without clearing other caches',async()=>{
  const h=harness();
  await h.caches.open('knightfall-shell-obsolete');await h.caches.open('unrelated-app');
  await h.lifecycle('install');await h.lifecycle('activate');
  assert.deepEqual([...h.stores.keys()].sort(),['knightfall-shell-test-build','unrelated-app']);
});

test('An interrupted first offline download does not count as a successful install',async()=>{
  const h=harness();h.setOnline(false);
  await assert.rejects(h.lifecycle('install'),/offline/);
});

test('PWA uses the cached shell for server outages while preserving access-denied responses',async()=>{
  const h=harness();await h.lifecycle('install');h.setStatus(503);
  const fallback=await h.request('https://knightfall.test/app/','navigate');
  assert.equal(fallback.status,200);assert.match(await fallback.text(),/Knightfall/);
  h.setStatus(403);
  const denied=await h.request('https://knightfall.test/app/','navigate');
  assert.equal(denied.status,403);
});

test('optional full-engine files cache on first use and work offline, without overriding worker fragment URLs',async()=>{
 const h=harness();await h.lifecycle('install');
 const js='https://knightfall.test/app/engine/full/full.js';
 const wasm='https://knightfall.test/app/engine/full/full-part-0.wasm';
 assert.equal(await (await h.request(js,'same-origin','worker')).text(),'asset');
 assert.equal(await (await h.request(wasm)).text(),'asset');
 h.setOnline(false);
 const cached=h.stores.get('knightfall-shell-test-build').get(js);
 const originalClone=cached.clone.bind(cached);
 cached.clone=()=>{const result=originalClone();Object.defineProperty(result,'url',{value:js+'#main-engine'});return result;};
 const response=await h.request(js,'same-origin','worker');
 assert.equal(response.url,'','Do not replace a pthread #...,worker URL with the cached main-engine URL');
 assert.equal(await response.text(),'asset');
 assert.equal(await (await h.request(wasm)).text(),'asset');
});
