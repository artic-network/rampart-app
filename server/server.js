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

const express = require('express');
const path = require('path');
const SocketIO = require('socket.io');
var portfinder = require('portfinder');
const { initialConnection, setUpIOListeners } = require("./socket");
const { log, warn, fatal } = require("./utils");

const portInUse = (port) => {
    // Throw so the caller's Promise/try-catch can handle it gracefully
    throw new Error(`Port ${port} is already in use. Please close the other program using port ${port} and try again.`);
};

/**
 * Start a simple express server to deliver the index.html
 * And open a socket (using socket.io) for all communications
 * (this is in preperation for a move to electron, where main-renderer
 * process communication is socket-like)
 */
const run = async ({devClient, ports, buildPath}) => {
    let serverPort = ports[0];
    let socketPort = ports[1];
    if (devClient && (serverPort !== 3000 || socketPort !== 3001)) {
        fatal(`\nYou cannot specify the develepment client (--devClient) and custom ports (--ports). You can either
      (a) run the production (client) bundle, generated via "npm run build" and then specify custom ports or,
      (b) Run the development client server (via "npm run start" in a different terminal window) and use the default ports.
    `);
    }

    // serverPort = await portfinder.getPortPromise({
    //     port: serverPort,    // minimum port
    //     stopPort: serverPort + 1000 // maximum port
    // });
    // socketPort = await portfinder.getPortPromise({
    //     port: serverPort + 1,    // minimum port
    //     stopPort: socketPort + 1000 // maximum port
    // });
    //
    // if (serverPort !== ports[0] || socketPort !== ports[1]) {
    //     warn(`Port ${ports[0]} and/or ${ports[1]} are in use, using ${serverPort} and  ${socketPort} instead.`);
    // }

    log(`\n\n---------------------------------------------------------------------------`);
    log(`RAMPART daemon running`);

    /*     S  E  R  V  E  R     */
    if (devClient) {
        /* we don't have to serve any JS code as this is being handled by the dev server */
        log(`Not serving the JS bundle -- you must run "npm run start" to run the client`);
    } else {
        /* serve production (built) bundle -- html & javascript */
        const app = express();
        app.set('port', serverPort);
        const buildDir = buildPath || path.join(__dirname, "..", 'build');
        log(`Serving from build directory: ${buildDir}`);
        app.use(express.static(buildDir));
        app.get('/', function (req, res) {
            res.sendFile(path.join(buildDir, 'index.html'));
        });
        app.get('/getSocketPort', function (req, res) {
            /* API call for the client served by this rampart.js to know what socket to connect on */
            res.json({socketPort})
        });
        await new Promise((resolve, reject) => {
            app.listen(app.get('port'), () => {
                log(`\n---------------------------------------------------------------------------`);
                log(`Serving built bundle at http://localhost:${serverPort}`);
                log(`---------------------------------------------------------------------------\n`);
                resolve();
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${serverPort} is already in use. Please close the other program using port ${serverPort} and try again.`));
                } else {
                    reject(new Error(`Failed to start server on port ${serverPort}: ${err.message}`));
                }
            });
        });

    }

    /*     S  O  C  K  E  T     */
    global.io = SocketIO.listen(socketPort);
    // TODO - handle EADDRINUSE error. Tried above method & try/catch without success
    global.io.on('connection', (socket) => {
        log('client connection detected');
        initialConnection(socket);
        setUpIOListeners(socket);
    });

    log(`socket open on port ${socketPort} for all data communication`);
    log(`---------------------------------------------------------------------------\n\n`);

    global.io.emit("infoMessage", `Server starting up`);
};

module.exports = {
    run
};
