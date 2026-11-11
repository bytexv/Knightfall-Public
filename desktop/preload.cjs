const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('knightfall', Object.freeze({
  platform: 'desktop',
  hostLan: () => ipcRenderer.invoke('knightfall:host-lan'),
  version: () => ipcRenderer.invoke('knightfall:version'),
}));
