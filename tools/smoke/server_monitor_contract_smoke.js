#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const files = [
    'server/server_monitor.html',
    'server/server_monitor_files/js/monitor_state.js',
    'server/server_monitor_files/js/monitor_commands.js',
    'server/server_monitor_files/js/monitor_ui.js',
    'server/server_monitor_files/js/monitor_logic.js',
    'server/server_monitor_files/js/monitor_checker_modules/monitor_status_check.js',
    'server/server_monitor_files/js/monitor_checker_modules/monitor_server_actions.js'
];

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

for (const relativePath of files) {
    const source = read(relativePath);
    assert(!source.includes('localhost:8000') && !source.includes('127.0.0.1:8000'),
        'Retired port 8000 remains in ' + relativePath);
    if (relativePath.endsWith('.js')) {
        new vm.Script(source, { filename: relativePath });
    }
}

const html = read(files[0]);
assert(html.includes('id="toggleGeminiBtn"'), 'Current Gemini control button missing');
assert(!html.includes('startLauncherBtn') && !html.includes('startHttpBtn'),
    'Legacy command-server controls remain');
const state = read(files[1]);
assert(state.includes('9082') && state.includes('9083') && state.includes('9084'),
    'Canonical Gemini ports are not represented');
assert(state.includes("new URL('gemini_chat_interface.html', window.location.href)"),
    'Monitor iframe is not page-relative');
const commands = read(files[2]);
assert(commands.includes('/api/gemini-server/'), 'Monitor does not use current lifecycle API');
assert(!commands.includes("command === '7'"), 'Legacy numeric command protocol remains');
const logic = read(files[4]);
assert(!logic.includes('forceRestartMainServer'), 'Monitor still auto-restarts Gemini');

console.log('SERVER_MONITOR_CONTRACT_SMOKE_OK');