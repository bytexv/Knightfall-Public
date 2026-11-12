import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAndroidRelease, validReleaseConfig, newerVersion } from '../src/lib/app-updates.ts';
const config = { owner: 'bytexv', repo: 'Knightfall-Public', visibility: 'public' };
const base = 'https://github.com/bytexv/Knightfall-Public/releases';
function release(version = '1.4.0') { return { tag_name: `v${version}`, html_url: `${base}/tag/v${version}`, draft: false, prerelease: false, assets: [{ name: `Knightfall-${version}-Android.apk`, state: 'uploaded', size: 17000000, browser_download_url: `${base}/download/v${version}/Knightfall-${version}-Android.apk` }] }; }
const response = value => new Response(JSON.stringify(value));
test('mobile update source and numeric stable versions reject redirects and malformed versions', () => {
  assert.ok(validReleaseConfig(config)); assert.ok(!validReleaseConfig({ visibility: "public" })); assert.ok(!validReleaseConfig({ ...config, repo: '..' })); assert.ok(!validReleaseConfig({ ...config, owner: 'evil.test/x' }));
  assert.ok(newerVersion('1.10.0', '1.9.0')); assert.ok(!newerVersion('1.4.0-beta', '1.3.0')); assert.ok(!newerVersion('1.3.0', '1.3.0'));
});
test('Android selects only the validated APK and sends no credentials', async () => {
  let options;
  const result = await fetchAndroidRelease(config, '1.3.0', async (url, opts) => { options = opts; assert.equal(url, 'https://api.github.com/repos/bytexv/Knightfall-Public/releases/latest'); return response(release()); });
  assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  assert.equal(result.status, 'available'); assert.equal(result.downloadUrl, `${base}/download/v1.4.0/Knightfall-1.4.0-Android.apk`);
});
test('Android never proposes downgrades or reinstalls the current version', async () => {
  for (const version of ['1.2.0', '1.3.0']) { const result = await fetchAndroidRelease(config, '1.3.0', async () => response(release(version))); assert.equal(result.status, 'up-to-date'); assert.equal(result.downloadUrl, undefined); }
});
test('Android rejects draft, prerelease, wrong repository and missing/duplicate APK assets', async () => {
  const values = [{ ...release(), draft: true }, { ...release(), prerelease: true }, { ...release(), html_url: 'https://evil.test/' }, { ...release(), assets: [] }, { ...release(), assets: [...release().assets, ...release().assets] }];
  const external = release(); external.assets[0].browser_download_url = 'https://evil.test/malware.apk'; values.push(external);
  for (const value of values) await assert.rejects(fetchAndroidRelease(config, '1.3.0', async () => response(value)));
});
test('Android bounds streamed release responses and rejects HTTP errors', async () => {
  await assert.rejects(fetchAndroidRelease(config, '1.3.0', async () => new Response('x'.repeat(1024 * 1024 + 1))));
  await assert.rejects(fetchAndroidRelease(config, '1.3.0', async () => new Response('', {status: 403})));
});
test('Android aborts a stalled request without blocking local play', async () => {
  let signal;
  await assert.rejects(fetchAndroidRelease(config, '1.3.0', (_url, options) => { signal = options.signal; return new Promise(() => {}); }, 10), /timed out/);
  assert.equal(signal.aborted, true);
});
test('a newer Windows-only release does not hide the latest compatible Android APK', async () => {
  const urls = [];
  const result = await fetchAndroidRelease(config, '1.3.1', async url => {
    urls.push(url);
    return response(url.endsWith('/latest') ? {...release('1.6.0'), assets: []} : [
      {...release('1.6.0'), assets: []}, release('1.4.0'), {...release('9.0.0'), prerelease: true}, release('1.5.2')]);
  });
  assert.equal(result.status, 'available'); assert.equal(result.latestVersion, '1.5.2');
  assert.equal(urls.length, 2); assert.ok(urls[1].endsWith('?per_page=30'));
});
test('missing Android publication has an actionable message and no unsafe download', async () => {
  const result = await fetchAndroidRelease(config, '1.3.1', async url => response(url.endsWith('/latest') ? {...release('1.5.2'), assets: []} : [{...release('1.5.2'), assets: []}, release('1.2.0')]));
  assert.equal(result.status, 'unavailable'); assert.match(result.message, /does not include an Android update/); assert.equal(result.downloadUrl, undefined);
});
test('fallback rejects a tampered Android download and bounds the release list', async () => {
  const malicious = release('1.5.2'); malicious.assets[0].browser_download_url='https://evil.test/update.apk';
  for (const list of [[malicious], Array.from({length:31},()=>release())])
    await assert.rejects(fetchAndroidRelease(config, '1.3.1', async url => response(url.endsWith('/latest') ? {...release('1.6.0'), assets: []} : list)));
});
test('rate limits are distinguished from a missing package', async () => {
  for (const status of [403,429]) await assert.rejects(fetchAndroidRelease(config, '1.3.1', async () => new Response('',{status})), /GitHub is limiting update checks/);
});
