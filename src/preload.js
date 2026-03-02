/*
 * Preload script for Electron
 * Exposes safe IPC methods to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    
    startServer: (settings) => ipcRenderer.send('start-server', settings),
    
    selectPath: (isFile = false) => ipcRenderer.invoke('select-path', isFile)
});
