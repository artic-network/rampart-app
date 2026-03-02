#!/usr/bin/env node

/**
 * Simple helper script to start Electron in development mode
 * This waits for the React dev server to be ready before launching Electron
 */

const { spawn } = require('child_process');
const net = require('net');

const REACT_DEV_SERVER_PORT = 3000;
const MAX_RETRIES = 30;
const RETRY_INTERVAL = 1000;

function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        
        socket.setTimeout(1000);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            resolve(false);
        });
        
        socket.connect(port, 'localhost');
    });
}

async function waitForReactServer(retries = 0) {
    if (retries >= MAX_RETRIES) {
        console.error('React dev server not responding. Make sure to run "npm start" first.');
        process.exit(1);
    }
    
    const isRunning = await checkPort(REACT_DEV_SERVER_PORT);
    
    if (isRunning) {
        console.log('React dev server is ready!');
        return true;
    }
    
    if (retries === 0) {
        console.log('Waiting for React dev server to start...');
    }
    
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    return waitForReactServer(retries + 1);
}

async function main() {
    console.log('Starting RAMPART in Electron development mode...');
    
    await waitForReactServer();
    
    console.log('Launching Electron...');
    const electron = spawn('electron', ['.'], {
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: 'inherit'
    });
    
    electron.on('close', (code) => {
        console.log(`Electron exited with code ${code}`);
        process.exit(code);
    });
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
