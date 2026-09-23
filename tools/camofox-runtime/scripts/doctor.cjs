#!/usr/bin/env node
'use strict';

// Refuse partial npm installs that leave server.js behind but no SQLite addon.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'node_modules', '@askjo', 'camofox-browser', 'server.js');
const BROWSER = path.join(ROOT, 'browser');

function verifyRuntime() {
    if (!fs.existsSync(SERVER)) throw new Error('Camofox server.js is missing');
    const scopedRequire = createRequire(SERVER);
    const Database = scopedRequire('better-sqlite3');
    const database = new Database(':memory:');
    try {
        if (database.prepare('SELECT 1 AS ok').get().ok !== 1) {
            throw new Error('better-sqlite3 failed its native query check');
        }
    } finally {
        database.close();
    }
    console.log('CAMOFOX_NODE_RUNTIME_OK');
}

function verifyBrowser() {
    const manifest = path.join(BROWSER, 'version.json');
    const executable = process.platform === 'win32'
        ? path.join(BROWSER, 'camoufox.exe')
        : process.platform === 'darwin'
            ? path.join(BROWSER, 'Camoufox.app', 'Contents', 'MacOS', 'camoufox')
            : path.join(BROWSER, 'camoufox-bin');
    if (!fs.existsSync(manifest) || !fs.existsSync(executable)) {
        throw new Error('EveOS-local browser version.json or executable is missing');
    }
    const { version, release } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!version || !release) throw new Error('EveOS-local browser manifest is invalid');
    console.log('CAMOFOX_LOCAL_BROWSER_OK');
}

try {
    const selected = process.argv.includes('--runtime')
        ? 'runtime' : process.argv.includes('--browser') ? 'browser' : 'all';
    if (selected !== 'browser') verifyRuntime();
    if (selected !== 'runtime') verifyBrowser();
} catch (error) {
    console.error('CAMOFOX_INSTALL_INCOMPLETE: ' + String(error?.message || error).split('\n')[0]);
    process.exitCode = 1;
}
