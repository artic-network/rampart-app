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

async function startServer() {
    // Set up directories
    const { basecalledDir, annotatedDir } = ensureRampartDirectories();
    
    // Set up config for Electron mode with default paths
    const args = {
        verbose: false,
        devClient: false,
        ports: [serverPort, serverPort + 1],
        basecalledPath: basecalledDir,
        annotatedPath: annotatedDir
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
        
        return true;
    } catch (err) {
        console.error("Failed to start server:", err);
        return false;
    }
}

function createWindow() {
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
                contextIsolation: true
            },
            title: 'RAMPART'
        });
        console.log('BrowserWindow created');

        // Load a placeholder first - don't try to load app until server is ready
        console.log('Loading placeholder page...');
        mainWindow.loadURL('data:text/html,<html><body><h1>RAMPART Starting...</h1><p>Please wait while the server starts</p></body></html>');

        // Don't load the app yet - we'll do that after server starts
        // Store startUrl for later
        const isDev = process.env.NODE_ENV === 'development';
        const startUrl = isDev 
            ? 'http://localhost:3000'
            : `http://localhost:${serverPort}`;
        mainWindow.rampartUrl = startUrl;

        // Open DevTools in development
        if (isDev) {
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', async () => {
    console.log('App ready event fired');
    console.log('Creating window...');
    createWindow();
    console.log('Window created with placeholder');
    
    console.log('Starting RAMPART server...');
    const serverStarted = await startServer();
    
    if (serverStarted) {
        console.log(`Server running on port ${serverPort}`);
        console.log('Loading RAMPART app into window...');
        if (mainWindow && mainWindow.rampartUrl) {
            mainWindow.loadURL(mainWindow.rampartUrl);
            console.log(`App loading from: ${mainWindow.rampartUrl}`);
        }
    } else {
        console.error('Failed to start server.');
        if (mainWindow) {
            mainWindow.loadURL('data:text/html,<html><body><h1>Error</h1><p>Failed to start RAMPART server</p></body></html>');
        }
    }
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
