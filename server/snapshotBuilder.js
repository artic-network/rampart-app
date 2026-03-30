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

const fs = require('fs');
const path = require('path');

/**
 * Build a self-contained single-file HTML snapshot of the current RAMPART state.
 *
 * Reads build/index.html, inlines every referenced <link rel="stylesheet"> and
 * <script src="..."> asset, and injects the provided snapshot data as
 * `window.__RAMPART_SNAPSHOT__` so the page boots in standalone (no-server) mode.
 *
 * @param {object} snapshotData  { dataPerSample, combinedData, config, timestamp }
 * @param {string} buildDir      Absolute path to the React production build directory
 * @returns {string}             Complete self-contained HTML string
 */
function buildSnapshot(snapshotData, buildDir) {
    let html = fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8');

    // Safely serialise the payload: escape < > & so they cannot break the script context
    const safeJSON = JSON.stringify(snapshotData)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');

    // Inject the data as the very first element inside <head>
    html = html.replace(
        '<head>',
        `<head>\n  <script>window.__RAMPART_SNAPSHOT__=${safeJSON};</script>`
    );

    // Inline <link rel="stylesheet" href="..."> → <style>...</style>
    html = html.replace(/<link([^>]*)>/gi, (match, attrs) => {
        if (!/rel=["']stylesheet["']/.test(attrs)) return match;
        const hrefM = attrs.match(/href=["']([^"']+)["']/);
        if (!hrefM) return match;
        const filePath = resolveAsset(buildDir, hrefM[1]);
        if (filePath && fs.existsSync(filePath)) {
            const css = fs.readFileSync(filePath, 'utf8');
            return `<style>${css}</style>`;
        }
        return match;
    });

    // Inline <script src="..."></script> → <script>...</script>
    html = html.replace(/<script([^>]*)><\/script>/gi, (match, attrs) => {
        const srcM = attrs.match(/src=["']([^"']+)["']/);
        if (!srcM) return match;
        const filePath = resolveAsset(buildDir, srcM[1]);
        if (filePath && fs.existsSync(filePath)) {
            const js = fs.readFileSync(filePath, 'utf8');
            return `<script>${js}</script>`;
        }
        return match;
    });

    return html;
}

function resolveAsset(buildDir, href) {
    // href is like "./static/css/main.xxx.css" or "/static/js/..." — strip leading ./ or /
    const cleaned = href.replace(/^\.?\//, '');
    return path.join(buildDir, cleaned);
}

module.exports = { buildSnapshot };
