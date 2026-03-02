/*
 * Utility functions for detecting and using bundled resources (binaries, Python, etc.)
 * in the packaged Electron app.
 */

const path = require('path');
const fs = require('fs');
const { verbose } = require('./utils');

/**
 * Get the path to bundled resources directory.
 * In development: <app>/resources/
 * In production: <app.asar.unpacked>/resources/ or Resources dir
 */
function getResourcesPath() {
    if (process.env.NODE_ENV === 'development') {
        // Development: resources folder at project root
        return path.join(__dirname, '..', 'resources');
    }
    
    // Production: Check if we're in an asar package
    if (process.resourcesPath) {
        // Electron packaged app
        return path.join(process.resourcesPath, 'resources');
    }
    
    // Fallback
    return path.join(__dirname, '..', 'resources');
}

/**
 * Get the path to the minimap2 binary for the current platform.
 * Returns the bundled version if available, otherwise returns 'minimap2' for PATH lookup.
 */
function getMinimap2Path() {
    const platform = process.platform; // 'darwin', 'win32', 'linux'
    const binaryName = platform === 'win32' ? 'minimap2.exe' : 'minimap2';
    const bundledPath = path.join(getResourcesPath(), 'bin', platform, binaryName);
    
    if (fs.existsSync(bundledPath)) {
        verbose('resources', `Using bundled minimap2: ${bundledPath}`);
        return bundledPath;
    }
    
    // Try conda environment
    const condaPath = `/opt/miniconda3/envs/artic-rampart-mpxv/bin/${binaryName}`;
    if (fs.existsSync(condaPath)) {
        verbose('resources', `Using conda minimap2: ${condaPath}`);
        return condaPath;
    }
    
    // Fall back to PATH
    verbose('resources', 'Using system minimap2 from PATH');
    return binaryName;
}

/**
 * Get the Python executable path.
 * On Windows: Try bundled Python first.
 * On all platforms: Try common Python locations, fall back to PATH.
 */
function getPythonPath() {
    const platform = process.platform;
    
    // Windows: Try bundled Python
    if (platform === 'win32') {
        const bundledPython = path.join(getResourcesPath(), 'python', 'win32', 'python.exe');
        if (fs.existsSync(bundledPython)) {
            verbose('resources', `Using bundled Python: ${bundledPython}`);
            return bundledPython;
        }
    }
    
    // Try common Python installation locations
    const home = require('os').homedir();
    const pythonCandidates = platform === 'win32' ? [
        // Windows: Conda environments (user installs)
        path.join(home, 'miniconda3', 'envs', 'artic-rampart-mpxv', 'python.exe'),
        path.join(home, 'miniconda3', 'envs', 'artic-rampart', 'python.exe'),
        path.join(home, 'anaconda3', 'envs', 'artic-rampart-mpxv', 'python.exe'),
        path.join(home, 'anaconda3', 'envs', 'artic-rampart', 'python.exe'),
        // Windows: Conda base
        path.join(home, 'miniconda3', 'python.exe'),
        path.join(home, 'anaconda3', 'python.exe'),
        // Windows: System-level conda installs
        'C:\\ProgramData\\miniconda3\\envs\\artic-rampart-mpxv\\python.exe',
        'C:\\ProgramData\\miniconda3\\envs\\artic-rampart\\python.exe',
        'C:\\ProgramData\\anaconda3\\envs\\artic-rampart-mpxv\\python.exe',
        'C:\\ProgramData\\anaconda3\\envs\\artic-rampart\\python.exe',
        // Windows: Python launcher locations
        path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
        path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
        path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
    ] : [
        // macOS/Linux: Conda environments
        '/opt/miniconda3/envs/artic-rampart-mpxv/bin/python3',
        '/opt/miniconda3/envs/artic-rampart/bin/python3',
        '/opt/anaconda3/envs/artic-rampart-mpxv/bin/python3',
        '/opt/anaconda3/envs/artic-rampart/bin/python3',
        path.join(home, 'miniconda3', 'envs', 'artic-rampart-mpxv', 'bin', 'python3'),
        path.join(home, 'miniconda3', 'envs', 'artic-rampart', 'bin', 'python3'),
        path.join(home, 'anaconda3', 'envs', 'artic-rampart-mpxv', 'bin', 'python3'),
        path.join(home, 'anaconda3', 'envs', 'artic-rampart', 'bin', 'python3'),
        // Homebrew (macOS)
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        // System Python
        '/usr/bin/python3'
    ];
    
    for (const candidate of pythonCandidates) {
        if (fs.existsSync(candidate)) {
            verbose('resources', `Using Python: ${candidate}`);
            return candidate;
        }
    }
    
    // Fall back to PATH lookup ('python' covers both Windows 'python.exe' and cases
    // where python3 isn't separately available)
    const systemPython = platform === 'win32' ? 'python.exe' : 'python3';
    verbose('resources', `Using system Python from PATH: ${systemPython}`);
    return systemPython;
}

/**
 * Get environment variables for running Python scripts.
 * On Windows with bundled Python, set PYTHONPATH to include bundled packages.
 * On other platforms, use system Python or conda if available.
 */
function getPythonEnv() {
    const env = { ...process.env };
    
    if (process.platform === 'win32') {
        const bundledPython = path.join(getResourcesPath(), 'python', 'win32', 'python.exe');
        if (fs.existsSync(bundledPython)) {
            // Using bundled Python - set up environment
            const pythonHome = path.dirname(bundledPython);
            const libPath = path.join(pythonHome, 'Lib', 'site-packages');
            
            env.PYTHONHOME = pythonHome;
            env.PYTHONPATH = libPath;
            
            verbose('resources', `Python environment: PYTHONHOME=${pythonHome}, PYTHONPATH=${libPath}`);
        }
    }
    // For macOS/Linux, system Python or conda will use their own site-packages
    // No special environment setup needed - Python finds packages automatically
    
    return env;
}

/**
 * Check if all required bundled resources are available.
 * Returns an object with status of each resource.
 */
function checkBundledResources() {
    const status = {
        minimap2: fs.existsSync(getMinimap2Path()) || 'not found in bundle, will use PATH',
        python: getPythonPath(),
        platform: process.platform,
        resourcesPath: getResourcesPath()
    };
    
    return status;
}

module.exports = {
    getResourcesPath,
    getMinimap2Path,
    getPythonPath,
    getPythonEnv,
    checkBundledResources
};
