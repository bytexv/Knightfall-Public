import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { validateInstaller, createAutomaticUpdateManager } = createRequire(import.meta.url)('../desktop/auto-update.cjs');
const config = { owner: 'bytexv', repo: 'Knightfall-Public', visibility: 'public' };
const sha512 = Buffer.alloc(64, 42).toString('base64');
const info = () => ({ version: '1.4.0', files: [{ url: 'Knightfall-1.4.0-Windows-Setup.exe', sha512, size: 120000000 }], path: 'Knightfall-1.4.0-Windows-Setup.exe', sha512 });
class FakeUpdater extends EventEmitter {
  checks = 0; downloads = 0; installs = 0;
  setFeedURL(value) { this.feed = value; }
  async checkForUpdates() { this.checks++; }
  async downloadUpdate() { this.downloads++; }
  quitAndInstall() { this.installs++; }
}
function setup(extra = {}) { const updater = new FakeUpdater(); const manager = createAutomaticUpdateManager({ updater, config, currentVersion: '1.3.0', ...extra }); return { updater, manager }; }

test('automatic updater pins public GitHub feed and prohibits downgrade/prerelease/web installers', () => {
  const { updater, manager } = setup();
  assert.equal(updater.feed.url, 'https://github.com/bytexv/Knightfall-Public/releases/latest/download/');
  assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false); assert.equal(updater.allowPrerelease, false); assert.equal(updater.disableWebInstaller, true);
  assert.equal(manager.getStatus().automatic, true);
  assert.throws(() => setup({ config: { ...config, visibility: 'private' } }));
});
test('only a newer, bounded, checksum-bearing installer with the exact filename is accepted', () => {
  assert.equal(validateInstaller(info(), '1.3.0'), true);
  for (const version of ['1.2.0', '1.3.0', '1.4.0-beta.1', 'v1.4.0', '01.4.0']) assert.equal(validateInstaller({ ...info(), version }, '1.3.0'), false);
  for (const url of ['https://evil.test/setup.exe', '../setup.exe', 'Knightfall-1.4.0-Windows-x64.exe', 'Knightfall-1.4.0-Windows-Setup.exe?x=1']) {
    const data = info(); data.files[0].url = url; assert.equal(validateInstaller(data, '1.3.0'), false);
  }
  for (const change of [{ sha512: 'bad' }, { size: 0 }, { size: 2**31 }, { size: 1.5 }]) {
    const data = info(); Object.assign(data.files[0], change); assert.equal(validateInstaller(data, '1.3.0'), false);
  }
  assert.equal(validateInstaller({ ...info(), path: 'other.exe' }, '1.3.0'), false);
  assert.equal(validateInstaller({ ...info(), files: [...info().files, ...info().files] }, '1.3.0'), false);
});
test('validated update automatically downloads and can install only after verified completion', async () => {
  const { updater, manager } = setup();
  assert.equal(manager.install(), false);
  updater.emit('update-available', info());
  assert.equal(updater.downloads, 1); assert.equal(manager.getStatus().status, 'downloading');
  assert.equal(manager.install(), false); assert.equal(updater.autoInstallOnAppQuit, false);
  updater.emit('download-progress', { percent: 42.9 }); assert.equal(manager.getStatus().progress, 42.9);
  updater.emit('update-downloaded', info());
  assert.equal(manager.getStatus().status, 'ready'); assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(manager.install(), true); assert.equal(updater.installs, 1);
  await manager.check(); assert.equal(updater.checks, 0);
});
test('invalid release never downloads or arms automatic installation', () => {
  const { updater, manager } = setup(); updater.emit('update-available', { ...info(), sha512: 'mismatch' });
  assert.equal(updater.downloads, 0); assert.equal(manager.getStatus().status, 'unavailable'); assert.equal(manager.install(), false);
});
test('checksum/download errors leave the current application in place and disarm install', async () => {
  const { updater, manager } = setup(); updater.downloadUpdate = async () => { throw new Error('checksum mismatch'); };
  updater.emit('update-available', info()); await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.getStatus().status, 'unavailable'); assert.equal(updater.autoInstallOnAppQuit, false); assert.equal(manager.install(), false);
  updater.emit('update-downloaded', info()); assert.equal(manager.install(), false);
});
test('completion for a different payload cannot authorize installation', () => {
  const { updater, manager } = setup(); updater.emit('update-available', info());
  const wrong = info(); wrong.files[0].sha512 = Buffer.alloc(64, 15).toString('base64'); wrong.sha512 = wrong.files[0].sha512;
  updater.emit('update-downloaded', wrong); assert.equal(updater.autoInstallOnAppQuit, false); assert.equal(manager.install(), false);
});
test('checks deduplicate and throttle; retries work after the cooldown', async () => {
  let clock = 100; const { updater, manager } = setup({ now: () => clock });
  await Promise.all([manager.check(), manager.check()]); assert.equal(updater.checks, 1);
  updater.emit('update-not-available'); assert.equal(manager.getStatus().status, 'up-to-date');
  await manager.check(); assert.equal(updater.checks, 1);
  clock += 60001; await manager.check(); assert.equal(updater.checks, 2);
});
test('an offline check fails safely and does not expose raw transport details', async () => {
  const { updater, manager } = setup(); updater.checkForUpdates = async () => { throw new Error('private transport details'); };
  const result = await manager.check(); assert.equal(result.status, 'unavailable'); assert.doesNotMatch(result.message, /private transport/);
});
