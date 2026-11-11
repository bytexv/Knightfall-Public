/* Run after publishing a release. Uses the real updater/download/checksum path
   with an isolated old-version app adapter. Never installs or launches a file. */
const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { NsisUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { createAutomaticUpdateManager } = require('../desktop/auto-update.cjs');
const config = require('../public/update-config.json');
const version = require('../package.json').version;
app.whenReady().then(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'knightfall-real-update-'));
  const reportPath = path.join(__dirname, '..', 'artifacts', 'qa', 'v1.3', 'real-update-download.json');
  const adapter = { version:'1.2.0', name:'Knightfall Update Test', isPackaged:true, userDataPath:temp, baseCachePath:temp,
    appUpdateConfigPath:path.join(__dirname,'..','artifacts','windows','win-unpacked','resources','app-update.yml'),
    whenReady:()=>app.whenReady(), onQuit:()=>{}, quit:()=>{throw new Error('Test must not quit-and-install');} };
  const updater = new NsisUpdater(undefined, adapter);
  updater.httpExecutor = new ElectronHttpExecutor();
  updater._testOnlyOptions = { platform: 'win32' };
  if (process.env.HTTPS_PROXY) await require('electron-updater/out/electronHttpExecutor').getNetSession().setProxy({ proxyRules: process.env.HTTPS_PROXY });
  updater.logger = {info:()=>{},warn:()=>{},error:()=>{},debug:()=>{}};
  // Guard the side effect independently of manager state and onQuit registration.
  updater.doInstall = () => { throw new Error('Installer execution is forbidden in download verification'); };
  const observed = [];
  let manager;
  try {
    const completed = new Promise((resolve,reject) => {
      updater.on('error',reject);
      updater.on('update-downloaded', resolve);
    });
    manager = createAutomaticUpdateManager({updater,config,currentVersion:adapter.version,onStatus:s=>observed.push(s.status)});
    let timer;
    try {
      await manager.check();
      await Promise.race([completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Download verification timed out')),240000);})]);
    } finally { clearTimeout(timer); }
    assert.equal(manager.getStatus().status,'ready');
    assert.equal(manager.getStatus().latestVersion,version);
    updater.autoInstallOnAppQuit = false;
    const downloaded = await fs.readFile(updater.installerPath);
    const original = await fs.readFile(path.join(__dirname,'..','artifacts','windows',`Knightfall-${version}-Windows-Setup.exe`));
    assert.ok(downloaded.equals(original),'Published installer differs from verified local installer');
    const result={status:'passed',version,source:config,startingVersion:adapter.version,downloadedBytes:downloaded.length,
      sha256:crypto.createHash('sha256').update(downloaded).digest('hex'),observedStates:[...new Set(observed)],
      verifiedBy:'real electron-updater SHA-512 download plus byte-for-byte local artifact comparison',installerExecuted:false};
    await fs.writeFile(reportPath,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally { updater.autoInstallOnAppQuit=false; await fs.rm(temp,{recursive:true,force:true}); }
  app.exit(0);
}).catch(error=>{ console.error(error.message);app.exit(1); });
