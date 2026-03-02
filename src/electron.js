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
const { spawn } = require('child_process');
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
let lastServerError = null;

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

async function startServer(settings, sendStatus) {
    const log = (msg) => {
        console.log(msg);
        if (sendStatus) sendStatus(msg);
    };
    
    // Set up config for Electron mode with user settings
    const args = {
        verbose: settings.verbose || false,
        devClient: false,
        ports: [serverPort, serverPort + 1],
        basecalledPath: settings.basecalledPath,
        annotatedDir: settings.annotatedPath || './annotations',
        protocol: settings.protocol,
        title: settings.title,
        referencesPath: settings.referencesPath,
        clearAnnotated: settings.clearAnnotated || false
    };
    
    log('Starting server with args: ' + JSON.stringify(args, null, 2));
    
    try {
        // Validate required paths exist
        log('Validating paths...');
        if (!fs.existsSync(args.basecalledPath)) {
            throw new Error(`Basecalled FASTQ directory not found: ${args.basecalledPath}`);
        }
        log('✓ Basecalled path exists: ' + args.basecalledPath);
        
        if (args.protocol && !fs.existsSync(args.protocol)) {
            throw new Error(`Protocol directory not found: ${args.protocol}`);
        }
        if (args.protocol) {
            log('✓ Protocol path exists: ' + args.protocol);
        }
        
        log('Initializing config...');
        const {config, pipelineRunners} = getInitialConfig(args);
        log('✓ Config initialized: ' + JSON.stringify({
            hasProtocol: !!config.protocol,
            hasGenome: !!config.genome,
            hasPipelines: !!config.pipelines,
            runTitle: config.run?.title
        }, null, 2));
        
        global.config = config;
        global.pipelineRunners = pipelineRunners;
        global.datastore = new Datastore();
        global.filesSeen = new Set();

        // Get the correct build path for packaged app
        const buildPath = path.join(app.getAppPath(), 'build');
        log('Build path: ' + buildPath);
        log('Build path exists: ' + fs.existsSync(buildPath));
        
        log('Starting Express server...');
        await server.run({devClient: false, ports: args.ports, buildPath});
        log('✓ Express server running on port ' + serverPort);

        if (global.config.run.clearAnnotated) {
            log('Clearing existing annotations...');
            await startUp.removeExistingAnnotatedCSVs();
        } else {
            log('Processing existing annotations...');
            await startUp.processExistingAnnotatedCSVs();
        }
        
        log('Starting basecalled files watcher...');
        await startBasecalledFilesWatcher();
        log('✓ File watcher started');
        
        serverStarted = true;
        log('===== SERVER STARTED SUCCESSFULLY =====');
        lastServerError = null;
        return true;
    } catch (err) {
        log('❌ ERROR: Failed to start server');
        log('Error message: ' + err.message);
        log('Error stack: ' + err.stack);
        lastServerError = err.message;
        return false;
    }
}

/**
 * Check that Python is available and mappy is installed.
 * Returns { ok, pythonPath, version, error }
 */
function checkPythonEnvironment() {
    return new Promise((resolve) => {
        const { getPythonPath } = require('../server/bundledResources');
        const pythonPath = getPythonPath();
        const child = spawn(pythonPath, ['-c', 'import mappy; print(mappy.__version__)']);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (err) => {
            resolve({ ok: false, pythonPath, error: `Python not found at '${pythonPath}': ${err.message}` });
        });
        child.on('exit', (code) => {
            if (code === 0) {
                resolve({ ok: true, pythonPath, version: stdout.trim() });
            } else {
                const detail = stderr.includes('No module named') ?
                    `mappy is not installed in the Python environment at '${pythonPath}'.\n\nInstall it with:\n  pip install mappy\n\nor activate the correct conda environment before launching RAMPART.` :
                    `Python check failed (exit ${code}):\n${stderr.trim() || 'Unknown error'}`;
                resolve({ ok: false, pythonPath, error: detail });
            }
        });
        // Timeout after 10 seconds
        setTimeout(() => resolve({ ok: false, pythonPath, error: 'Python check timed out after 10 seconds.' }), 10000);
    });
}

function createWindow(showSettings = true) {
    try {
        mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            show: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
            title: 'RAMPART'
        });

        if (showSettings) {
            mainWindow.loadFile(path.join(__dirname, '../build/settings.html')).catch(err => {
                console.error('Failed to load settings page:', err);
            });
        } else {
            loadMainApp();
        }

        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Failed to load page:', errorCode, errorDescription);
        });

        mainWindow.webContents.on('render-process-gone', (event, details) => {
            console.error('Renderer process gone:', details);
        });

        mainWindow.on('unresponsive', () => {
            console.error('Window became unresponsive');
        });

        mainWindow.on('closed', function () {
            mainWindow = null;
        });
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
    
    mainWindow.loadURL(startUrl).catch(err => {
        console.error('Failed to load URL:', err);
        console.error('Failed to load URL:', err);
        lastServerError = `Failed to load app: ${err.message}`;
        mainWindow.loadURL(`data:text/html,<html><body style="font-family: sans-serif; padding: 40px; background: #1a1a1a; color: #fffcf2;"><h1 style="color: #e06962;">Failed to Load</h1><p>Could not connect to RAMPART server at ${startUrl}</p><p style="color: #ccc;">${err.message}</p></body></html>`);
    });
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
    const sendStatus = (msg) => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('status-update', msg);
        }
    };
    
    // Save settings for next time
    userSettings = settings;
    saveSettings(settings);
    
    // Show loading state with live updates
    mainWindow.loadURL('data:text/html,<html><head><script>window.addEventListener("DOMContentLoaded", () => { if (window.electronAPI) { window.electronAPI.onStatusUpdate((msg) => { const log = document.getElementById("log"); if (log) { log.innerHTML += "<div>" + msg + "</div>"; log.scrollTop = log.scrollHeight; } }); } });</script></head><body style="font-family: monospace; margin: 0; padding: 20px; background: #1a1a1a; color: #22968B;"><h2 style="color: #F6EECA; margin-bottom: 10px;">Starting RAMPART...</h2><div id="log" style="font-size: 12px; line-height: 1.6; max-height: 80vh; overflow-y: auto; white-space: pre-wrap;"></div></body></html>');
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Start the server
    sendStatus('Calling startServer...');
    const success = await startServer(settings, sendStatus);
    
    if (success) {
        sendStatus('Server started successfully, loading main app...');
        // Give server a moment to fully initialize
        setTimeout(() => {
            sendStatus('Loading main app URL...');
            loadMainApp();
        }, 2000);
    } else {
        sendStatus('❌ FAILED to start server');
        sendStatus('See error messages above');
        // Error page is already shown with the log in the loading screen
        // Just update it with a back button
        await new Promise(resolve => setTimeout(resolve, 2000));
        const errorMsg = lastServerError || 'Unknown error occurred. Check the log above.';
        mainWindow.loadURL(`data:text/html,<html><body style="font-family: sans-serif; padding: 40px; background: #1a1a1a; color: #fffcf2;"><h1 style="color: #e06962;">Error Starting RAMPART</h1><p style="margin: 20px 0; font-size: 16px; line-height: 1.6; background: #803c38; padding: 15px; border-radius: 4px; border: 1px solid #e06962;">${errorMsg}</p><button onclick="window.location.reload()" style="padding: 12px 24px; background: #22968B; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 20px;">Try Again</button></body></html>`);
    }
});

// Add handler to show settings
ipcMain.on('show-settings', () => {
    if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, '../build/settings.html'));
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', async () => {
    // Pre-flight check: verify Python and mappy are available
    const pyCheck = await checkPythonEnvironment();
    if (!pyCheck.ok) {
        console.error('Python environment check failed:', pyCheck.error);
        // Show a blocking warning dialog before the settings window
        // We need at least one window or a hidden one for dialog parent
        await dialog.showMessageBox({
            type: 'warning',
            title: 'Missing Dependency: mappy',
            message: 'RAMPART requires mappy to be installed',
            detail: pyCheck.error +
                '\n\nYou can still configure RAMPART, but annotation will fail until mappy is available.' +
                '\n\nPython used: ' + pyCheck.pythonPath,
            buttons: ['Continue Anyway', 'Quit'],
            defaultId: 0,
            cancelId: 1
        }).then(({ response }) => {
            if (response === 1) {
                app.quit();
                return;
            }
        });
        // If user chose Quit, the app.quit() above will handle it
        if (app.isQuitting) return;
    }

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
app.on('window-all-closed', (e) => {
    e.preventDefault();
});

// Explicitly prevent app from autoquitting
if (process.platform === 'darwin') {
    app.dock.show();
}
