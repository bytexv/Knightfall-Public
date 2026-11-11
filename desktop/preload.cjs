const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('knightfall', Object.freeze({
  platform: 'desktop',
  hostLan: () => ipcRenderer.invoke('knightfall:host-lan'),
  version: () => ipcRenderer.invoke('knightfall:version'),
  getUpdateStatus: () => ipcRenderer.invoke('knightfall:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('knightfall:check-updates'),
  openUpdate: () => ipcRenderer.invoke('knightfall:open-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Expected an update status callback');
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('knightfall:update-status-changed', listener);
    return () => ipcRenderer.removeListener('knightfall:update-status-changed', listener);
  },
}));
