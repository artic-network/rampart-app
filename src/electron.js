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
const { ipcMain, dialog, Menu, MenuItem } = electron;

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
let lastServerError = null;

// ── Console log window ────────────────────────────────────────────────────────
let logWindow = null;
const logHistory = [];
const MAX_LOG_HISTORY = 5000;

function appendToLog(level, args) {
    const msg = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a, null, 2); } catch (_) { return String(a); }
    }).join(' ');
    const entry = { t: Date.now(), level, msg };
    logHistory.push(entry);
    if (logHistory.length > MAX_LOG_HISTORY) logHistory.shift();
    if (logWindow && !logWindow.isDestroyed()) {
        logWindow.webContents.send('log-entry', entry);
    }
}

// Intercept console methods — originals are preserved so terminal still works
const _origLog   = console.log.bind(console);
const _origInfo  = console.info.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...a) => { _origLog(...a);   appendToLog('log',   a); };
console.info  = (...a) => { _origInfo(...a);  appendToLog('info',  a); };
console.warn  = (...a) => { _origWarn(...a);  appendToLog('warn',  a); };
console.error = (...a) => { _origError(...a); appendToLog('error', a); };

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
        sampleSheet: settings.sampleSheet,
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

        // Get the correct build path for packaged app.
        // In a packaged asar build, app.getAppPath() returns the .asar path, but
        // express.static / createReadStream cannot read from inside an asar archive.
        // Because build/**/* is in asarUnpack, the files are in app.asar.unpacked/.
        const rawAppPath = app.getAppPath();
        const resolvedAppPath = rawAppPath.includes('app.asar')
            ? rawAppPath.replace('app.asar', 'app.asar.unpacked')
            : rawAppPath;
        const buildPath = path.join(resolvedAppPath, 'build');
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
            mainWindow.loadFile(path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '../build/settings.html')).catch(err => {
                console.error('Failed to load settings page:', err);
            });
        } else {
            loadMainApp();
        }

        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Failed to load page:', errorCode, errorDescription);
        });

        mainWindow.webContents.on('render-process-gone', (event, details) => {
            console.error(`Renderer process gone — reason: ${details.reason}, exitCode: ${details.exitCode}`);
            // reason 'oom' = out of memory, 'crashed' = V8/GPU crash,
            // 'killed' = killed by OS (often also OOM), 'clean-exit' = intentional
            if (details.reason === 'oom' || details.reason === 'killed') {
                console.error('LIKELY CAUSE: Renderer ran out of memory. Consider reducing data sent per update.');
            }
            dialog.showMessageBox({
                type: 'error',
                title: 'Display Crashed',
                message: 'The display window crashed',
                detail: `Reason: ${details.reason} (exit code ${details.exitCode})\n\nThe RAMPART server is still running. Click Reload to reconnect the display.`,
                buttons: ['Reload Display', 'Quit RAMPART'],
                defaultId: 0
            }).then(({ response }) => {
                if (response === 0 && mainWindow) {
                    mainWindow.reload();
                } else {
                    app.quit();
                }
            });
        });

        mainWindow.on('unresponsive', () => {
            console.error('Window became unresponsive');
        });

        mainWindow.on('close', function (e) {
            if (!serverStarted) return; // no confirmation needed before server starts
            e.preventDefault();
            const browserUrl = `http://localhost:${serverPort}`;
            dialog.showMessageBox(mainWindow, {
                type: 'question',
                buttons: ['Quit RAMPART', 'Keep Running', 'Open in Browser', 'Cancel'],
                defaultId: 1,
                cancelId: 3,
                title: 'Close RAMPART',
                message: 'RAMPART is running',
                detail: `Quitting will stop all processing.\n\n"Keep Running" will close this window but keep RAMPART running in the background — use the menu or Cmd+0 to reopen the window.\n\nRAMPART is also accessible in any web browser at:\n${browserUrl}`,
            }).then(({ response }) => {
                if (response === 0) {
                    mainWindow.destroy();
                    app.quit();
                } else if (response === 1) {
                    mainWindow.hide();
                } else if (response === 2) {
                    electron.shell.openExternal(browserUrl);
                    mainWindow.hide();
                }
                // response === 3: Cancel — do nothing
            });
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

    // Apply port from settings (defaults to 3555)
    if (settings.port && Number.isInteger(settings.port) && settings.port > 1024 && settings.port < 65535) {
        serverPort = settings.port;
    } else {
        serverPort = 3555;
    }
    
    // Show loading state with live updates
    mainWindow.loadURL('data:text/html,<html><head><script>window.addEventListener("DOMContentLoaded", () => { if (window.electronAPI) { window.electronAPI.onStatusUpdate((msg) => { const log = document.getElementById("log"); if (log) { log.innerHTML += "<div>" + msg + "</div>"; log.scrollTop = log.scrollHeight; } }); } });</script></head><body style="font-family: monospace; margin: 0; padding: 20px; background: #1a1a1a; color: #22968B;"><h2 style="color: #F6EECA; margin-bottom: 10px;">Starting RAMPART...</h2><div id="log" style="font-size: 12px; line-height: 1.6; max-height: 80vh; overflow-y: auto; white-space: pre-wrap;"></div></body></html>');
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check minimap2 is available before starting
    sendStatus('Checking for minimap2...');
    const mm2Check = await checkMinimap2();
    if (mm2Check.ok) {
        sendStatus(`✓ Found minimap2 ${mm2Check.version} (${mm2Check.path})`);
    } else {
        sendStatus(`⚠️ minimap2 not found at "${mm2Check.path}": ${mm2Check.error}`);
        sendStatus('  Annotation will fail. Ensure the bundled binary is intact or install minimap2 on PATH.');
    }

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
        sendStatus('❌ FAILED to start server — returning to settings...');
        // Navigate back to the settings page; it will pick up lastServerError via get-startup-error
        await new Promise(resolve => setTimeout(resolve, 1500));
        mainWindow.loadFile(path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '../build/settings.html'));
    }
});

// Add handler to show settings
ipcMain.on('show-settings', () => {
    if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '../build/settings.html'));
    }
});

// Return the last startup error to the settings page and clear it
ipcMain.handle('get-startup-error', () => {
    const err = lastServerError;
    lastServerError = null;
    return err;
});

// ── Log window IPC ────────────────────────────────────────────────────────────
ipcMain.handle('get-log-history', () => logHistory);

ipcMain.on('open-log-window', () => createLogWindow());

function createLogWindow() {
    if (logWindow && !logWindow.isDestroyed()) {
        logWindow.show();
        logWindow.focus();
        return logWindow;
    }
    const unpackedDir = __dirname.replace('app.asar', 'app.asar.unpacked');
    logWindow = new BrowserWindow({
        width: 920,
        height: 580,
        title: 'RAMPART Console',
        backgroundColor: '#0d1a1c',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    logWindow.loadFile(path.join(unpackedDir, '../build/console.html'));
    logWindow.on('closed', () => { logWindow = null; });
    return logWindow;
}

/**
 * Check that minimap2 can be found and executed.
 * Returns { ok, path, version } on success or { ok: false, path, error } on failure.
 */
function checkMinimap2() {
    return new Promise((resolve) => {
        const { spawn: _spawn } = require('child_process');
        const { getMinimap2Path } = require('../server/bundledResources');
        const mm2Path = getMinimap2Path();
        const child = _spawn(mm2Path, ['--version']);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (err) => {
            resolve({ ok: false, path: mm2Path, error: err.message });
        });
        child.on('exit', (code) => {
            // minimap2 --version exits 0 and prints version to stdout
            const version = (stdout + stderr).trim().split('\n')[0];
            if (code === 0 || version) {
                resolve({ ok: true, path: mm2Path, version });
            } else {
                resolve({ ok: false, path: mm2Path, error: `exited with code ${code}` });
            }
        });
        setTimeout(() => resolve({ ok: false, path: mm2Path, error: 'timed out' }), 5000);
    });
}

// Increase the V8 heap limit for the renderer process.
// Default is ~1.5GB; 4GB gives more headroom for large datasets.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
    buildMenu();
    createWindow(true); // Show settings page first

    // Periodically log renderer memory usage to help diagnose crashes with large data
    setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(
                'performance.memory ? JSON.stringify({used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit}) : null'
            ).then((result) => {
                if (result) {
                    const m = JSON.parse(result);
                    const usedMB  = (m.used  / 1048576).toFixed(0);
                    const limitMB = (m.limit / 1048576).toFixed(0);
                    const pct = ((m.used / m.limit) * 100).toFixed(0);
                    if (parseInt(pct) > 70) {
                        console.warn(`[renderer] heap ${usedMB}MB / ${limitMB}MB (${pct}%) — high memory usage`);
                    } else {
                        console.log(`[renderer] heap ${usedMB}MB / ${limitMB}MB (${pct}%)`);
                    }
                }
            }).catch(() => {});
        }
    }, 30000); // every 30s
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow(!serverStarted);
    } else {
        mainWindow.show();
        mainWindow.focus();
    }
});

// Prevent auto-quit when all windows are closed — user chose "Keep Running"
app.on('window-all-closed', (e) => {
    e.preventDefault();
});

function buildMenu() {
    const template = [
        ...(process.platform === 'darwin' ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'Window',
            submenu: [
                {
                    label: 'Show Window',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => {
                        if (mainWindow === null) {
                            createWindow(!serverStarted);
                        } else {
                            mainWindow.show();
                            mainWindow.focus();
                        }
                    }
                },
                {
                    label: 'Show Console',
                    accelerator: 'CmdOrCtrl+Shift+L',
                    click: () => createLogWindow()
                },
                { type: 'separator' },
                { role: 'minimize' },
                { role: 'zoom' },
                ...(process.platform === 'darwin' ? [{ type: 'separator' }, { role: 'front' }] : [])
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Explicitly prevent app from autoquitting
if (process.platform === 'darwin') {
    app.dock.show();
}
