/*
 * Preload script for Electron
 * Exposes safe IPC methods to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    
    startServer: (settings) => {
        console.log('Preload: startServer called with:', settings);
        ipcRenderer.send('start-server', settings);
    },
    
    selectPath: (isFile = false) => ipcRenderer.invoke('select-path', isFile),
    
    // Listen for status updates from main process
    onStatusUpdate: (callback) => {
        ipcRenderer.on('status-update', (event, message) => {
            console.log('[Main Process]', message);
            if (callback) callback(message);
        });
    }
});

console.log('electronAPI exposed to renderer');
