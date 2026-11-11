'use strict';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 1024 * 1024;

class UpdateError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 128) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) return null;
  const prerelease = match[4] ? match[4].split('.') : [];
  if (prerelease.some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === '0')) return null;
  return { value, core: match.slice(1, 4).map(BigInt), prerelease };
}

function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  if (!a || !b) throw new TypeError('Expected strict semantic versions');
  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const x = a.prerelease[index], y = b.prerelease[index];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

function normalizeConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { owner, repo } = value;
  if (typeof owner !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) return null;
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return null;
  return Object.freeze({ owner, repo, visibility: ['public', 'private'].includes(value.visibility) ? value.visibility : 'unknown' });
}

function releasesUrl(config) {
  return `https://github.com/${config.owner}/${config.repo}/releases`;
}

function tagVersion(tag) {
  if (typeof tag !== 'string') return null;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const parsed = parseVersion(version);
  return parsed && !parsed.prerelease.length ? parsed.value : null;
}

function isAllowedUpdateUrl(value, config, tag, filename) {
  if (typeof value !== 'string' || !normalizeConfig(config)) return false;
  if (tag === undefined) return value === releasesUrl(config);
  if (!tagVersion(tag)) return false;
  const base = releasesUrl(config);
  const expected = filename === undefined
    ? `${base}/tag/${encodeURIComponent(tag)}`
    : `${base}/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
  return value === expected;
}

function cancelBody(response) {
  try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch { /* already locked */ }
}

async function readBoundedJson(response, maxBytes) {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    cancelBody(response);
    throw new UpdateError('size');
  }
  const contentType = response.headers.get('content-type') || '';
  if (!/^application\/(?:json|vnd\.github\+json)(?:;|$)/i.test(contentType) || !response.body?.getReader) {
    cancelBody(response);
    throw new UpdateError('invalid');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new UpdateError('size');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)));
  } catch (error) {
    Promise.resolve(reader.cancel()).catch(() => {});
    throw error instanceof UpdateError ? error : new UpdateError('invalid');
  } finally {
    reader.releaseLock();
  }
}

async function requestLatestRelease({ config, currentVersion, platform = 'win32', fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES }) {
  const checkedConfig = normalizeConfig(config);
  if (!checkedConfig || !parseVersion(currentVersion)) throw new UpdateError('configuration');
  if (checkedConfig.visibility === 'private') throw new UpdateError('private');
  const endpoint = `https://api.github.com/repos/${checkedConfig.owner}/${checkedConfig.repo}/releases/latest`;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new UpdateError('timeout')); }, timeoutMs);
  });
  const request = (async () => {
    const response = await fetchImpl(endpoint, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': `Knightfall/${currentVersion}` },
    });
    if (response.status !== 200) {
      cancelBody(response);
      if (response.status === 401 || response.status === 404) throw new UpdateError('unavailable');
      if (response.status === 403 || response.status === 429) throw new UpdateError('rate-limit');
      throw new UpdateError('network');
    }
    if (response.url && response.url !== endpoint) throw new UpdateError('invalid');
    const release = await readBoundedJson(response, maxBytes);
    if (!release || typeof release !== 'object' || Array.isArray(release)
      || release.draft !== false || release.prerelease !== false
      || !Array.isArray(release.assets) || release.assets.length > 200) throw new UpdateError('invalid');
    const version = tagVersion(release.tag_name);
    if (!version || !isAllowedUpdateUrl(release.html_url, checkedConfig, release.tag_name)) throw new UpdateError('invalid');
    const result = { version, releaseUrl: release.html_url };
    if (typeof release.published_at === 'string' && release.published_at.length < 64 && Number.isFinite(Date.parse(release.published_at))) {
      result.publishedAt = new Date(release.published_at).toISOString();
    }
    if (platform === 'win32') {
      const filename = `Knightfall-${version}-Windows-x64.exe`;
      const matches = release.assets.filter(asset => asset && asset.name === filename);
      if (matches.length > 1) throw new UpdateError('invalid');
      if (matches.length === 1) {
        const asset = matches[0];
        if (asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2 * 1024 ** 3
          || !isAllowedUpdateUrl(asset.browser_download_url, checkedConfig, release.tag_name, filename)) throw new UpdateError('invalid');
        result.downloadUrl = asset.browser_download_url;
      }
    }
    return result;
  })();
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    throw error instanceof UpdateError ? error : new UpdateError('network');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const errorMessages = {
  private: 'Automatic checks are unavailable for this private repository. Open its releases on GitHub while signed in.',
  unavailable: 'No public stable release is available. The repository may be private or have no published release yet.',
  'rate-limit': 'GitHub temporarily limited update checks. Try again later.',
  timeout: 'The update check timed out. Your local games and engine still work offline.',
  size: 'The release response was too large to validate. Open the configured GitHub releases page instead.',
  invalid: 'The release information could not be validated. No download was selected.',
  configuration: 'Update checks are not configured for this build.',
  network: 'Could not reach GitHub. Check your connection and try again later.',
};

function createUpdateManager({ config, currentVersion, platform = 'win32', fetchImpl,
  onStatus = () => {}, now = Date.now, minIntervalMs = 60000, timeoutMs, maxBytes }) {
  const checkedConfig = normalizeConfig(config);
  let status = Object.freeze({ status: checkedConfig ? 'idle' : 'unconfigured', currentVersion,
    ...(checkedConfig ? { releaseUrl: releasesUrl(checkedConfig) } : {}),
    message: checkedConfig ? 'Check GitHub for a newer stable release.' : errorMessages.configuration });
  let inFlight = null;
  let lastStarted = null;
  function publish(value) {
    status = Object.freeze(value);
    try { onStatus({ ...status }); } catch { /* A closed window must not break the check. */ }
    return { ...status };
  }
  function getStatus() { return { ...status }; }
  function check() {
    if (!checkedConfig) return Promise.resolve(getStatus());
    if (inFlight) return inFlight;
    if (lastStarted !== null && now() >= lastStarted && now() - lastStarted < minIntervalMs) return Promise.resolve(getStatus());
    lastStarted = now();
    publish({ status: 'checking', currentVersion, releaseUrl: releasesUrl(checkedConfig), message: 'Checking GitHub for updates…' });
    inFlight = (async () => {
      const checkedAt = new Date(now()).toISOString();
      try {
        const latest = await requestLatestRelease({ config: checkedConfig, currentVersion, platform, fetchImpl, timeoutMs, maxBytes });
        const newer = compareVersions(latest.version, currentVersion) > 0;
        return publish({ status: newer ? 'available' : 'up-to-date', currentVersion,
          latestVersion: latest.version, checkedAt, publishedAt: latest.publishedAt,
          releaseUrl: newer ? latest.releaseUrl : releasesUrl(checkedConfig),
          ...(newer && latest.downloadUrl ? { downloadUrl: latest.downloadUrl } : {}),
          message: newer ? `Version ${latest.version} is available. Download it when you are ready; it will not run automatically.`
            : 'You already have this stable release or a newer version.' });
      } catch (error) {
        return publish({ status: 'unavailable', currentVersion, checkedAt,
          releaseUrl: releasesUrl(checkedConfig), message: errorMessages[error.code] || errorMessages.network });
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  function getOpenUrl() {
    if (!checkedConfig) return null;
    if (status.status === 'available') return status.downloadUrl || status.releaseUrl;
    return releasesUrl(checkedConfig);
  }
  return Object.freeze({ getStatus, check, getOpenUrl });
}

module.exports = { parseVersion, compareVersions, normalizeConfig, isAllowedUpdateUrl, requestLatestRelease, createUpdateManager };
