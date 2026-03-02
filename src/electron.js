/*
 * Copyright (c) 2019 ARTIC Network http://artic.network
 * https://github.com/artic-network/rampart
 *
 * This file is part of RAMPART. RAMPART is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. RAMPART is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details. You should have received a copy of the GNU General Public License
 * along with RAMPART. If not, see <http://www.gnu.org/licenses/>.
 *
 */

const electron = require('electron');
// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;
const { ipcMain, dialog } = electron;

const path = require('path');
const url = require('url');
const fs = require('fs');
const os = require('os');
const server = require("../server/server");
const { getInitialConfig } = require("../server/config/getInitialConfig");
const startUp = require("../server/startUp");
const { startBasecalledFilesWatcher } = require("../server/watchBasecalledFiles");
const Datastore = require("../server/datastore").default;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let serverPort = 3555; // Default port for Electron mode
let serverStarted = false;
let userSettings = null;

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'rampart-settings.json');

// Load settings from file
function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
    return null;
}

// Save settings to file
function saveSettings(settings) {
    try {
        const dir = path.dirname(settingsPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return true;
    } catch (err) {
        console.error('Error saving settings:', err);
        return false;
    }
}

// Create a temporary directory structure for RAMPART if not configured
function ensureRampartDirectories() {
    const rampartDir = path.join(os.homedir(), '.rampart');
    const basecalledDir = path.join(rampartDir, 'basecalled');
    const annotatedDir = path.join(rampartDir, 'annotations');
    
    [rampartDir, basecalledDir, annotatedDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    
    return { basecalledDir, annotatedDir };
}

async function startServer(settings) {
    // Set up config for Electron mode with user settings
    const args = {
        verbose: settings.verbose || false,
        devClient: false,
        ports: [serverPort, serverPort + 1],
        basecalledPath: settings.basecalledPath,
        annotatedPath: settings.annotatedPath || './annotations',
        protocol: settings.protocol,
        title: settings.title,
        referencesPath: settings.referencesPath,
        clearAnnotated: settings.clearAnnotated || false
    };
    
    try {
        const {config, pipelineRunners} = getInitialConfig(args);
        global.config = config;
        global.pipelineRunners = pipelineRunners;
        global.datastore = new Datastore();
        global.filesSeen = new Set();

        await server.run({devClient: false, ports: args.ports});

        if (global.config.run.clearAnnotated) {
            await startUp.removeExistingAnnotatedCSVs();
        } else {
            await startUp.processExistingAnnotatedCSVs();
        }
        await startBasecalledFilesWatcher();
        
        serverStarted = true;
        return true;
    } catch (err) {
        console.error("Failed to start server:", err);
        return false;
    }
}

function createWindow(showSettings = true) {
    console.log('createWindow() called');
    try {
        console.log('Creating BrowserWindow...');
        // Create the browser window.
        mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            show: true,  // Explicitly show
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
            title: 'RAMPART'
        });
        console.log('BrowserWindow created');

        if (showSettings) {
            // Load the settings page first
            console.log('Loading settings page...');
            mainWindow.loadFile(path.join(__dirname, '../public/settings.html'));
        } else {
            // Load the main RAMPART app
            loadMainApp();
        }

        // Open DevTools in development
        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }

        // Log when page is loaded
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('Page loaded successfully');
        });

        // Log any load failures
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Failed to load page:', errorCode, errorDescription);
        });

        // Detect renderer crashes
        mainWindow.webContents.on('render-process-gone', (event, details) => {
            console.error('Renderer process gone:', details);
        });

        // Detect window crashes
        mainWindow.on('unresponsive', () => {
            console.error('Window became unresponsive');
        });

        // Handle window close
        mainWindow.on('close', (event) => {
            console.log('Window close event fired');
            // Allow normal closing
        });

        // Emitted when the window is closed.
        mainWindow.on('closed', function () {
            console.log('Window closed');
            mainWindow = null;
        });
        
        console.log('Window setup complete');
    } catch (err) {
        console.error('Error in createWindow():', err);
        throw err;
    }

    // Keep a reference to prevent garbage collection
    return mainWindow;
}

function loadMainApp() {
    if (!mainWindow) return;
    
    const isDev = process.env.NODE_ENV === 'development';
    const startUrl = isDev 
        ? 'http://localhost:3000'
        : `http://localhost:${serverPort}`;
    
    console.log(`Loading RAMPART app from: ${startUrl}`);
    mainWindow.loadURL(startUrl);
}

// IPC Handlers for settings page
ipcMain.handle('load-settings', async () => {
    return loadSettings();
});

ipcMain.handle('select-path', async (event, isFile) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: isFile ? ['openFile'] : ['openDirectory']
    });
    
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.on('start-server', async (event, settings) => {
    console.log('Received start-server request with settings:', settings);
    
    // Save settings for next time
    userSettings = settings;
    saveSettings(settings);
    
    // Show loading state
    mainWindow.loadURL('data:text/html,<html><body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"><div style="text-align: center; color: white;"><h1>Starting RAMPART...</h1><p>Initializing server and loading data...</p></div></body></html>');
    
    // Start the server
    const success = await startServer(settings);
    
    if (success) {
        console.log('Server started successfully, loading main app...');
        // Give server a moment to fully initialize
        setTimeout(() => {
            loadMainApp();
        }, 1000);
    } else {
        console.error('Failed to start server');
        mainWindow.loadURL('data:text/html,<html><body style="font-family: sans-serif; padding: 40px;"><h1 style="color: #c33;">Error</h1><p>Failed to start RAMPART server. Please check your settings and try again.</p><button onclick="history.back()" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">Go Back</button></body></html>');
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', async () => {
    console.log('App ready event fired');
    console.log('Creating settings window...');
    createWindow(true); // Show settings page first
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});

// Clean up on quit
app.on('will-quit', () => {
    console.log('will-quit event fired');
});

app.on('before-quit', () => {
    console.log('before-quit event fired');
});

app.on('quit', () => {
    console.log('quit event fired');
});

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Prevent app from quitting when all windows close
app.on('window-all-closed', (e) => {
    console.log('window-all-closed event fired - PREVENTING DEFAULT');
    e.preventDefault();
    console.log('Prevented app quit from window-all-closed');
});

// Explicitly prevent app from autoquitting
if (process.platform === 'darwin') {
    app.dock.show();
}
