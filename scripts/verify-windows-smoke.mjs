import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { mkdir, writeFile, readFile, access, mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
if (process.platform !== 'win32') throw new Error('Run this smoke check on Windows.');
const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts', 'qa', 'windows');
await mkdir(output, { recursive: true });
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const installation = await mkdtemp(path.join(os.tmpdir(), 'knightfall-install-check-'));
const setup = path.join(root, 'artifacts', 'windows', `Knightfall-${version}-Windows-Setup.exe`);
await run(setup, ['/S', `/D=${installation}`], { timeout: 180000, windowsVerbatimArguments: true });
const installed = path.join(installation, 'Knightfall.exe');
await access(installed);
assert.ok((await readFile(path.join(installation, 'resources', 'app.asar'))).equals(await readFile(path.join(root, 'artifacts', 'windows', 'win-unpacked', 'resources', 'app.asar'))));
const result = await run(installed, ['--smoke-test', '--smoke-game', `--smoke-screenshot=${path.join(output, 'app.png')}`],
  { cwd: root, timeout: 90000, maxBuffer: 4 * 1024 * 1024, windowsHide: false });
await writeFile(path.join(output, 'smoke.log'), result.stdout + '\n' + result.stderr);
assert.match(result.stdout, /KNIGHTFALL_DESKTOP_SMOKE /, 'Native Windows renderer/engine check did not complete');
const sentinel = path.join(installation, 'unrelated-user-file.txt');
await writeFile(sentinel, 'preserve this');
await run(path.join(installation, 'Uninstall Knightfall.exe'), ['/S'], {timeout: 90000});
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  if (!(await access(installed).then(() => true, () => false))) break;
  await new Promise(resolve => setTimeout(resolve, 200));
}
assert.equal(await access(installed).then(() => true, () => false), false, 'Uninstaller did not remove the app');
assert.equal(await readFile(sentinel, 'utf8'), 'preserve this', 'Uninstaller removed unrelated user files');
await rm(installation, {recursive:true,force:true});
console.log('Windows installer, actual installed renderer/Stockfish/IPC, and safe uninstall passed.');
