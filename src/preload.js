/*
 * Preload script for Electron
 * Exposes safe IPC methods to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    
    startServer: (settings) => {
        ipcRenderer.send('start-server', settings);
    },
    
    selectPath: (isFile = false) => ipcRenderer.invoke('select-path', isFile),
    
    // Listen for status updates from main process
    onStatusUpdate: (callback) => {
        ipcRenderer.on('status-update', (event, message) => {
            if (callback) callback(message);
        });
    },

    // Console log window
    getLogHistory: () => ipcRenderer.invoke('get-log-history'),
    onLogEntry: (callback) => {
        ipcRenderer.on('log-entry', (event, entry) => {
            if (callback) callback(entry);
        });
    },
    openLogWindow: () => ipcRenderer.send('open-log-window'),

    // Retrieve and clear the last startup error (shown on settings page after a failed start)
    getStartupError: () => ipcRenderer.invoke('get-startup-error'),
});
