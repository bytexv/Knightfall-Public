import {readFile, readdir, mkdtemp, rm, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const {getCurrentFuseWire, FuseV1Options} = require('@electron/fuses');
const root = path.resolve(import.meta.dirname,'..');
const windowsDir = path.resolve(root, process.argv[2] || 'artifacts/windows');
const unpacked = path.join(windowsDir,'win-unpacked');
const archive = path.join(unpacked,'resources','app.asar');
const entries = new Set(asar.listPackage(archive));
const essentials = ['/LICENSE','/docs/THIRD-PARTY.md','/dist/licenses/SOFTWARE-NOTICES.txt','/dist/licenses/KNIGHTFALL-GPL-3.0.txt','/desktop/main.cjs','/desktop/preload.cjs','/desktop/smoke.cjs','/server/index.mjs','/dist/index.html','/dist/sw.js','/dist/sw-manifest.js','/dist/manifest.webmanifest','/dist/engine/stockfish-source.tgz','/dist/engine/COPYING.txt','/dist/engine/SOURCE.txt','/node_modules/ws/package.json','/node_modules/chess.js/package.json'];
for (const entry of essentials) assert.ok(entries.has(entry), `Missing packaged file ${entry}`);
for (const relative of ['desktop/main.cjs','desktop/preload.cjs','desktop/smoke.cjs','server/index.mjs']) {
  assert.ok(asar.extractFile(archive,relative).equals(await readFile(path.join(root,relative))),`Stale packaged runtime ${relative}`);
}
for (const entry of entries) assert.ok(!/(^|\/)\.env($|\.)|local\.properties$|\.keystore$|\.jks$/.test(entry), `Unexpected private build file ${entry}`);

const nativeExe = await readFile(path.join(unpacked,'Knightfall.exe'));
const peOffset = nativeExe.readUInt32LE(0x3c);
assert.equal(nativeExe.subarray(0,2).toString(),'MZ');
assert.equal(nativeExe.subarray(peOffset,peOffset+4).toString(),'PE\0\0');
assert.equal(nativeExe.readUInt16LE(peOffset+4),0x8664,'Windows app payload must be x64');
const wire = await getCurrentFuseWire(path.join(unpacked,'Knightfall.exe'));
for(const key of ['RunAsNode','EnableNodeOptionsEnvironmentVariable','EnableNodeCliInspectArguments','GrantFileProtocolExtraPrivileges']) assert.equal(wire[FuseV1Options[key]],48,`Unsafe packaged Electron fuse ${key}`);
for(const key of ['EnableEmbeddedAsarIntegrityValidation','OnlyLoadAppFromAsar']) assert.equal(wire[FuseV1Options[key]],49,`Missing packaged integrity fuse ${key}`);
const portable = (await readdir(windowsDir)).find(file => file.endsWith('.exe'));
assert.ok(portable,'Missing portable .exe');
assert.ok((await stat(path.join(windowsDir,portable))).size > 30_000_000,'Portable .exe unexpectedly small');

const temp = await mkdtemp(path.join(tmpdir(),'knightfall-package-check-'));
let server;
try {
  asar.extractAll(archive,temp);
  const manifestContext = {self:{}};
  vm.runInNewContext(await readFile(path.join(temp,'dist','sw-manifest.js'),'utf8'),manifestContext);
  const assets = manifestContext.self.__KNIGHTFALL_ASSETS__;
  assert.ok(Array.isArray(assets) && assets.length > 10,'Offline asset manifest was not generated');
  const engineAssets = assets.filter(asset=>asset.endsWith('.wasm'));
  assert.ok(engineAssets.length,'Local Stockfish WASM missing from offline cache');
  for (const asset of assets) {
    const packaged = await readFile(path.join(temp,'dist',asset));
    const original = await readFile(path.join(root,'dist',asset));
    assert.ok(packaged.equals(original),`Stale packaged asset ${asset}`);
  }
  const {startLanServer} = await import(pathToFileURL(path.join(temp,'server','index.mjs')).href);
  server = await startLanServer({host:'127.0.0.1',port:0,staticDir:path.join(temp,'dist')});
  const base = `http://127.0.0.1:${server.port}`;
  const health = await fetch(base+'/health');
  assert.equal(health.status,200);
  assert.equal((await health.json()).service,'knightfall-lan');
  const html = await fetch(base+'/');
  assert.equal(html.status,200);
  assert.match(await html.text(),/Knightfall/);
  const wasm = await fetch(new URL(engineAssets[0],base+'/'));
  assert.equal(wasm.status,200);
  assert.match(wasm.headers.get('content-type'),/application\/wasm/);
  assert.ok((await wasm.arrayBuffer()).byteLength>1_000_000);
  console.log(`Verified Windows x64 payload, ${assets.length} current offline assets, WASM MIME, and isolated bundled HTTP server.`);
  console.log(`Portable executable: ${portable}`);
} finally {
  await server?.close();
  await rm(temp,{recursive:true,force:true});
}

// Electron's virtual ASAR filesystem is different from an ordinary extracted tree.
// Exercise it using the installed host-platform Electron runtime in Node mode.
const electronBinary = require('electron');
const asarCheck = `
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const archive = process.argv[1];
const {startLanServer} = await import(pathToFileURL(path.join(archive,'server','index.mjs')));
const host = await startLanServer({port:0,host:'127.0.0.1',staticDir:path.join(archive,'dist')});
try {
  const base = 'http://127.0.0.1:' + host.port;
  const html = await fetch(base + '/');
  if(html.status !== 200 || !(await html.text()).includes('Knightfall')) throw new Error('ASAR UI not served');
  const manifest = await fetch(base + '/sw-manifest.js');
  if(manifest.status !== 200) throw new Error('ASAR offline manifest not served');
  const context = {self:{}};
  vm.runInNewContext(await manifest.text(),context);
  const wasmPath = context.self.__KNIGHTFALL_ASSETS__.find(asset=>asset.endsWith('.wasm'));
  const wasm = await fetch(new URL(wasmPath,base+'/'));
  if(wasm.status !== 200 || (await wasm.arrayBuffer()).byteLength < 1000000) throw new Error('ASAR engine WASM not served');
  console.log('Electron ASAR filesystem: packaged server, ESM dependencies, UI and engine WASM passed.');
} finally { await host.close(); }
`;
process.stdout.write(execFileSync(electronBinary,['--input-type=module','-e',asarCheck,archive],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:20000}));
