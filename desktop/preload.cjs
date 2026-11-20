const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('knightfall', Object.freeze({
  platform: 'desktop',
  ...(process.argv.includes('--knightfall-stockfish-native') ? {
    openStockfish(onLine, onError) {
      const id = globalThis.crypto.randomUUID();
      const listener = (_event, session, line) => {
        if (session === id) typeof line === 'string' ? onLine(line) : onError();
      };
      ipcRenderer.on('knightfall:engine-output', listener);
      ipcRenderer.send('knightfall:engine', id, 'open');
      return {
        postMessage: command => ipcRenderer.send('knightfall:engine', id, 'command', command),
        terminate() {
          ipcRenderer.removeListener('knightfall:engine-output', listener);
          ipcRenderer.send('knightfall:engine', id, 'close');
        },
      };
    },
  } : {}),
  hostLan: () => ipcRenderer.invoke('knightfall:host-lan'),
  version: () => ipcRenderer.invoke('knightfall:version'),
  getUpdateStatus: () => ipcRenderer.invoke('knightfall:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('knightfall:check-updates'),
  installUpdate: () => ipcRenderer.invoke('knightfall:install-update'),
  openUpdate: () => ipcRenderer.invoke('knightfall:open-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected an update status callback');
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('knightfall:update-status-changed', listener);
    return () => ipcRenderer.removeListener('knightfall:update-status-changed', listener);
  },
}));
