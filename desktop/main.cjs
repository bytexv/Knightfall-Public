/* Knightfall desktop — the renderer stays sandboxed; only LAN hosting crosses IPC. */
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const os = require('node:os');
const acceptanceTest = process.argv.includes('--acceptance-test');
const accessibilityTest = process.argv.includes('--a11y-test');
const smokeTest = process.argv.includes('--smoke-test') || acceptanceTest || accessibilityTest;
if (smokeTest) app.setPath('userData', path.join(os.tmpdir(), `knightfall-desktop-smoke-${process.pid}`));
const viewportMatch = smokeTest && process.argv.find(argument=>argument.startsWith('--smoke-viewport='))?.match(/^--smoke-viewport=(\d{3,4})x(\d{3,4})$/);
const smokeViewport = viewportMatch ? {width:Math.max(320,Math.min(3840,Number(viewportMatch[1]))),height:Math.max(280,Math.min(2160,Number(viewportMatch[2])))} : null;

if (process.platform === 'win32') app.setAppUserModelId('studio.knightfall.chess');

let mainWindow;
let localServer;
let lanServer;
let localOrigin;
let shuttingDown = false;

const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) app.quit();

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function trustedSender(event) {
  try {
    return event.sender === mainWindow?.webContents && new URL(event.senderFrame.url).origin === localOrigin;
  } catch { return false; }
}

async function start() {
  const { startLanServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.mjs')).href);
  const staticDir = path.join(__dirname, '..', 'dist');
  // Keep a stable origin so local games and preferences survive relaunches.
  const portFile = path.join(app.getPath('userData'), 'local-port.json');
  let preferredPort = 8786;
  try {
    const stored = JSON.parse(await fs.readFile(portFile, 'utf8')).port;
    if (Number.isInteger(stored) && stored >= 1024 && stored <= 65535) preferredPort = stored;
  } catch { /* First launch uses the default local port. */ }
  try { localServer = await startLanServer({ port: preferredPort, host: '127.0.0.1', staticDir }); }
  catch (error) {
    if (error?.code !== 'EADDRINUSE') throw error;
    localServer = await startLanServer({ port: 0, host: '127.0.0.1', staticDir });
  }
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(portFile, JSON.stringify({port: localServer.port}));
  localOrigin = `http://127.0.0.1:${localServer.port}`;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(localOrigin + '/')) return callback({responseHeaders: details.responseHeaders});
    const headers = {...details.responseHeaders};
    headers['Content-Security-Policy'] = [
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    ];
    callback({responseHeaders: headers});
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  ipcMain.handle('knightfall:host-lan', async (event) => {
    if (!trustedSender(event)) throw new Error('Untrusted application origin');
    if (!lanServer) {
      try { lanServer = await startLanServer({ port: 8787, host: '0.0.0.0', staticDir }); }
      catch (error) {
        if (error?.code !== 'EADDRINUSE') throw error;
        lanServer = await startLanServer({ port: 0, host: '0.0.0.0', staticDir });
      }
    }
    return { port: lanServer.port, urls: lanServer.urls };
  });

  ipcMain.handle('knightfall:version', (event) => {
    if (!trustedSender(event)) throw new Error('Untrusted application origin');
    return app.getVersion();
  });

  mainWindow = new BrowserWindow({
    width: smokeViewport?.width || 1440, height: smokeViewport?.height || 980, minWidth: Math.min(smokeViewport?.width || 880,880), minHeight: Math.min(smokeViewport?.height || 660,660),
    backgroundColor: '#24272b', title: 'Knightfall',
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      spellcheck: false, backgroundThrottling: !smokeTest,
    },
  });
  mainWindow.removeMenu();
  if (smokeTest) mainWindow.webContents.on('console-message', event => {
    if (event.level === 'error' || event.level === 3) console.error('RENDERER: ' + event.message);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(url);
    } catch { /* Invalid links stay closed. */ }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    try {
      if (new URL(target).origin !== localOrigin) {
        event.preventDefault();
        const parsed = new URL(target);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(target);
      }
    } catch { event.preventDefault(); }
  });
  mainWindow.once('ready-to-show', () => { if (!smokeTest) mainWindow.show(); });
  await mainWindow.loadURL(localOrigin);
  if (smokeTest) {
    const report = await require('./smoke.cjs').runSmoke(mainWindow);
    console.log('KNIGHTFALL_DESKTOP_SMOKE ' + JSON.stringify(report));
    if (acceptanceTest) {
      if (app.isPackaged) throw new Error('The detailed acceptance suite runs from the source checkout.');
      const outputArg = process.argv.find(argument=>argument.startsWith('--acceptance-output='));
      const outputDir = path.resolve(outputArg ? outputArg.slice('--acceptance-output='.length) : 'artifacts/qa/acceptance');
      await fs.mkdir(outputDir,{recursive:true});
      const result = await require('../scripts/native-acceptance.cjs').runAcceptance({window:mainWindow,app,outputDir});
      console.log('KNIGHTFALL_NATIVE_ACCEPTANCE ' + JSON.stringify(result));
    }
    if (accessibilityTest) {
      if (app.isPackaged) throw new Error('The accessibility suite runs from the source checkout.');
      const outputArg = process.argv.find(argument=>argument.startsWith('--a11y-output='));
      const outputDir = path.resolve(outputArg ? outputArg.slice('--a11y-output='.length) : 'artifacts/qa/a11y');
      await fs.mkdir(outputDir,{recursive:true});
      const result = await require('../scripts/native-a11y.cjs').runAccessibility({window:mainWindow,app,outputDir});
      console.log('KNIGHTFALL_NATIVE_A11Y ' + JSON.stringify(result));
    }
    app.quit();
  }
}

if (ownsLock) {
  app.whenReady().then(start).catch((error) => {
    if (smokeTest) { console.error(error); app.exit(1); return; }
    dialog.showErrorBox('Knightfall could not start', `The local app server could not start.\n\n${error.message}`);
    app.quit();
  });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (shuttingDown || (!localServer && !lanServer)) return;
  event.preventDefault();
  shuttingDown = true;
  Promise.allSettled([localServer?.close(), lanServer?.close()]).finally(() => app.quit());
});
