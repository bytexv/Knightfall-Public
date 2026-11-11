'use strict';
const { normalizeConfig, parseVersion, compareVersions } = require('./update.cjs');

// Only a locally configured public GitHub release may supply the installer.
function validateInstaller(info, currentVersion) {
  const parsed = parseVersion(info?.version);
  if (!parsed || parsed.prerelease.length || compareVersions(info.version, currentVersion) <= 0) return false;
  const name = `Knightfall-${info.version}-Windows-Setup.exe`;
  const digest = value => typeof value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value) && Buffer.from(value, 'base64').length === 64;
  if (!Array.isArray(info.files) || info.files.length !== 1) return false;
  const file = info.files[0];
  return file?.url === name && digest(file.sha512)
    && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 512 * 1024 ** 2
    && (info.path === undefined || info.path === name)
    && (info.sha512 === undefined || info.sha512 === file.sha512);
}

function createAutomaticUpdateManager({ updater, config, currentVersion, onStatus = () => {}, now = Date.now, minIntervalMs = 60000 }) {
  const checked = normalizeConfig(config);
  if (!checked || checked.visibility !== 'public' || !parseVersion(currentVersion)) throw new Error('A public release source and valid app version are required.');
  const releaseUrl = `https://github.com/${checked.owner}/${checked.repo}/releases`;
  updater.setFeedURL({ provider: 'generic', url: `${releaseUrl}/latest/download/` });
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableDifferentialDownload = true;
  updater.disableWebInstaller = true;
  let state = { status: 'idle', currentVersion, automatic: true, releaseUrl, message: 'Updates download automatically and install when you close the app.' };
  let inFlight = null, lastStarted = null, pending = null;
  const getStatus = () => ({ ...state });
  const publish = (status, message, extra = {}) => {
    state = { currentVersion, automatic: true, releaseUrl, status, message, ...extra };
    try { onStatus(getStatus()); } catch { /* Window may have closed. */ }
    return getStatus();
  };
  const failed = () => {
    if (state.status === 'ready') return;
    pending = null;
    updater.autoInstallOnAppQuit = false;
    publish('unavailable', 'Could not verify or download an update. Your current app still works; try again later.');
  };
  updater.on('error', failed);
  updater.on('update-not-available', () => publish('up-to-date', 'You have the latest stable version.', { checkedAt: new Date(now()).toISOString() }));
  updater.on('update-available', info => {
    if (!validateInstaller(info, currentVersion)) { failed(); return; }
    pending = { version: info.version, sha512: info.files[0].sha512 };
    publish('downloading', `Downloading version ${info.version} in the background…`, { latestVersion: info.version, progress: 0 });
    // electron-updater verifies the SHA-512 before emitting update-downloaded.
    try { Promise.resolve(updater.downloadUpdate()).catch(failed); } catch { failed(); }
  });
  updater.on('download-progress', progress => {
    if (!pending || state.status !== 'downloading') return;
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    publish('downloading', `Downloading version ${pending.version}… ${Math.floor(percent)}%`, { latestVersion: pending.version, progress: percent });
  });
  updater.on('update-downloaded', info => {
    if (!pending || !validateInstaller(info, currentVersion) || info.version !== pending.version || info.files[0].sha512 !== pending.sha512) { failed(); return; }
    updater.autoInstallOnAppQuit = true;
    publish('ready', `Version ${pending.version} is ready. It installs when you close the app, or you can restart now.`, { latestVersion: pending.version, progress: 100 });
  });
  async function check() {
    if (inFlight) return inFlight;
    if (['downloading', 'ready'].includes(state.status)) return getStatus();
    if (lastStarted !== null && now() - lastStarted >= 0 && now() - lastStarted < minIntervalMs) return getStatus();
    lastStarted = now();
    publish('checking', 'Checking for updates…');
    inFlight = (async () => {
      try { await updater.checkForUpdates(); } catch { failed(); }
      return getStatus();
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  function install() {
    if (state.status !== 'ready' || !pending) return false;
    updater.quitAndInstall(false, true);
    return true;
  }
  return Object.freeze({ getStatus, check, install, getOpenUrl: () => releaseUrl });
}
module.exports = { validateInstaller, createAutomaticUpdateManager };
