import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseVersion, compareVersions, normalizeConfig, isAllowedUpdateUrl, requestLatestRelease, createUpdateManager } = require('../desktop/update.cjs');
const config = { owner: 'example-owner', repo: 'knightfall', visibility: 'public' };
const base = 'https://github.com/example-owner/knightfall/releases';
function release(version = '1.3.0', extra = {}) {
  return { draft: false, prerelease: false, tag_name: `v${version}`, html_url: `${base}/tag/v${version}`,
    published_at: '2026-11-11T12:00:00Z', assets: [{ name: `Knightfall-${version}-Windows-x64.exe`,
      size: 113780148, state: 'uploaded', browser_download_url: `${base}/download/v${version}/Knightfall-${version}-Windows-x64.exe` }], ...extra };
}
function response(body, init = {}) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });
}
function request(fetchImpl, extra = {}) {
  return requestLatestRelease({ config, currentVersion: '1.2.0', fetchImpl, ...extra });
}

test('strict semantic versions reject malformed input and compare numeric precedence', () => {
  for (const value of ['1.2', 'v1.2.0', '01.2.0', '1.2.3-01', '1.2.3-', '1.2.3+']) assert.equal(parseVersion(value), null, value);
  assert.equal(compareVersions('1.10.0', '1.9.99'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0-rc.1'), 1);
  assert.equal(compareVersions('1.2.0-rc.10', '1.2.0-rc.2'), 1);
  assert.equal(compareVersions('1.2.0-alpha', '1.2.0-alpha.1'), -1);
  assert.equal(compareVersions('1.2.0-1', '1.2.0-alpha'), -1);
  assert.equal(compareVersions('1.2.0+build.1', '1.2.0+build.2'), 0);
  assert.equal(compareVersions('9007199254740994.0.0', '9007199254740993.0.0'), 1);
});

test('repository configuration cannot inject a host, path or credentials', () => {
  assert.equal(normalizeConfig({ owner: '', repo: '' }), null);
  for (const owner of ['../evil', 'owner@evil.test', '-owner', 'owner/', '']) assert.equal(normalizeConfig({ owner, repo: 'knightfall' }), null);
  for (const repo of ['..', '.', 'knightfall/other', 'knightfall?x=1', '']) assert.equal(normalizeConfig({ owner: 'example-owner', repo }), null);
  assert.deepEqual(normalizeConfig(config), config);
});

test('public latest release uses an unauthenticated bounded GitHub API request', async () => {
  let observed;
  const latest = await request(async (url, options) => { observed = { url, options }; return response(release()); });
  assert.equal(observed.url, 'https://api.github.com/repos/example-owner/knightfall/releases/latest');
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.credentials, 'omit');
  assert.equal(Object.keys(observed.options.headers).some(key => key.toLowerCase() === 'authorization'), false);
  assert.equal(latest.version, '1.3.0');
  assert.equal(latest.downloadUrl, `${base}/download/v1.3.0/Knightfall-1.3.0-Windows-x64.exe`);
});

test('release and asset URLs stay on the exact configured GitHub repository', async () => {
  const filename = 'Knightfall-1.3.0-Windows-x64.exe';
  const valid = `${base}/download/v1.3.0/${filename}`;
  assert.equal(isAllowedUpdateUrl(valid, config, 'v1.3.0', filename), true);
  for (const invalid of [valid.replace('https:', 'http:'), valid.replace('github.com/', 'github.com.evil.test/'),
    valid.replace('example-owner/', 'another-owner/'), `${valid}?redirect=evil`, `${valid}#fragment`,
    valid.replace('github.com/', 'user@github.com/'), valid.replace('knightfall/', 'knightfall-old/')]) {
    assert.equal(isAllowedUpdateUrl(invalid, config, 'v1.3.0', filename), false, invalid);
    const data = release(); data.assets[0].browser_download_url = invalid;
    await assert.rejects(request(async () => response(data)), error => error.code === 'invalid');
  }
  await assert.rejects(request(async () => response(release('1.3.0', { html_url: 'https://github.com/another-owner/knightfall/releases/tag/v1.3.0' }))), error => error.code === 'invalid');
});

test('draft, prerelease, malformed tags and mismatched payloads are rejected', async () => {
  for (const data of [release('1.3.0', { draft: true }), release('1.3.0', { prerelease: true }),
    release('1.3.0-rc.1'), release('01.3.0'), release('1.3.0', { assets: 'not an array' }), null]) {
    await assert.rejects(request(async () => response(data)), error => error.code === 'invalid');
  }
});

test('response limits apply both to declared size and streaming bytes', async () => {
  await assert.rejects(request(async () => response(release(), { headers: { 'content-type': 'application/json', 'content-length': '2000000' } })), error => error.code === 'size');
  await assert.rejects(request(async () => response(release()), { maxBytes: 64 }), error => error.code === 'size');
  await assert.rejects(request(async () => new Response('<html>not JSON</html>', { headers: { 'content-type': 'text/html' } })), error => error.code === 'invalid');
});

test('timeouts abort the request even when a transport never resolves', async () => {
  let signal;
  await assert.rejects(request((_url, options) => { signal = options.signal; return new Promise(() => {}); }, { timeoutMs: 15 }), error => error.code === 'timeout');
  assert.equal(signal.aborted, true);
});

test('unconfigured and private builds do not make authenticated or public API calls', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('must not fetch'); };
  const absent = createUpdateManager({ config: null, currentVersion: '1.2.0', fetchImpl });
  assert.equal((await absent.check()).status, 'unconfigured');
  assert.equal(absent.getOpenUrl(), null);
  const privateBuild = createUpdateManager({ config: { ...config, visibility: 'private' }, currentVersion: '1.2.0', fetchImpl });
  const state = await privateBuild.check();
  assert.equal(state.status, 'unavailable');
  assert.match(state.message, /private repository/);
  assert.equal(privateBuild.getOpenUrl(), base);
  assert.equal(calls, 0);
});

test('manager deduplicates checks, caches status and exposes a validated manual download', async () => {
  let calls = 0, complete;
  const statuses = [];
  const manager = createUpdateManager({ config, currentVersion: '1.2.0', now: () => 100000,
    onStatus: state => statuses.push(state.status), fetchImpl: () => { calls++; return new Promise(resolve => { complete = resolve; }); } });
  const a = manager.check(), b = manager.check();
  assert.equal(a, b);
  complete(response(release()));
  const state = await a;
  assert.equal(state.status, 'available');
  assert.deepEqual(statuses, ['checking', 'available']);
  state.downloadUrl = 'https://evil.test/';
  assert.equal(manager.getOpenUrl(), `${base}/download/v1.3.0/Knightfall-1.3.0-Windows-x64.exe`);
  await manager.check();
  assert.equal(calls, 1);
});

test('equal and older stable releases never expose a downgrade download', async () => {
  for (const version of ['1.2.0', '1.1.9']) {
    const manager = createUpdateManager({ config, currentVersion: '1.2.0', fetchImpl: async () => response(release(version)) });
    const state = await manager.check();
    assert.equal(state.status, 'up-to-date');
    assert.equal(state.downloadUrl, undefined);
    assert.equal(manager.getOpenUrl(), base);
  }
});

test('missing Windows asset and other platforms open only the validated release page', async () => {
  for (const options of [{ platform: 'linux' }, { data: release('1.3.0', { assets: [] }) }]) {
    const manager = createUpdateManager({ config, currentVersion: '1.2.0', platform: options.platform,
      fetchImpl: async () => response(options.data || release()) });
    const state = await manager.check();
    assert.equal(state.status, 'available');
    assert.equal(state.downloadUrl, undefined);
    assert.equal(manager.getOpenUrl(), `${base}/tag/v1.3.0`);
  }
});

test('API failures become clear status messages without exposing raw transport errors', async () => {
  for (const [code, text] of [[404, /private|published/], [429, /limited/]]) {
    const manager = createUpdateManager({ config, currentVersion: '1.2.0', fetchImpl: async () => response({}, { status: code }) });
    assert.match((await manager.check()).message, text);
    assert.equal(manager.getStatus().status, 'unavailable');
  }
  const manager = createUpdateManager({ config, currentVersion: '1.2.0', fetchImpl: async () => { throw new Error('SECRET_PROXY_CREDENTIAL'); } });
  assert.doesNotMatch((await manager.check()).message, /SECRET_PROXY/);
});
