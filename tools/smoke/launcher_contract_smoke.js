#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const rootLauncher = path.join(ROOT, 'start-server.bat');
const helperNames = [
    'start-server.paths.bat',
    'start-server.browser.bat',
    'start-server.browse.bat',
    'start-server.instance.bat',
    'start-server.stack.bat'
];

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const rootSource = read(rootLauncher);
const helperSources = new Map();
for (const name of helperNames) {
    const filePath = path.join(ROOT, 'tools', 'batch', name);
    assert(fs.existsSync(filePath), 'Missing launcher helper: ' + name);
    const source = read(filePath);
    assert(source.includes('goto %_START_SERVER_'), 'Helper lacks dispatch facade: ' + name);
    helperSources.set(name, source);
}

const routeContracts = [
    ['start-server.paths.bat', [':ResolveMainDataPackPath', ':NormalizePortInput', ':TrackInstance']],
    ['start-server.browser.bat', [':RefreshBrowserFallbackStatus', ':EnsureLightpandaMonitor']],
    ['start-server.browse.bat', [':LaunchBatch', ':BrowseProjectBatchFiles']],
    ['start-server.instance.bat', [':LaunchEveInstance', ':LaunchEvePortOnly']],
    ['start-server.stack.bat', [':BootStandardStack', ':EnsureBridge', ':PortInUse']]
];
for (const [name, labels] of routeContracts) {
    const source = helperSources.get(name);
    for (const label of labels) {
        assert(source.includes(label), name + ' is missing ' + label);
    }
}

assert(rootSource.includes('call "%START_SERVER_INSTANCE_BAT%" :LaunchEveInstance %*'),
    'Root launcher does not delegate instance startup');
assert(rootSource.includes('call "%START_SERVER_STACK_BAT%" :BootStandardStack %*'),
    'Root launcher does not delegate full-stack startup');
assert(rootSource.split(/\r?\n/).length <= 450,
    'Root launcher exceeds the 450-line facade contract');

const portsSource = read(path.join(ROOT, 'tools', 'batch', 'eveos-ports.bat'));
for (const key of [
    'EVEOS_WEB_PORT',
    'GEMINI_WS_PORT',
    'GEMINI_STATUS_PORT',
    'GEMINI_CONTROL_PORT',
    'LIGHTPANDA_BRIDGE_PORT',
    'CAMOFOX_BRIDGE_PORT',
    'WIKIMEDIA_BRIDGE_PORT',
    'POPUP_BRIDGE_PORT'
]) {
    assert(new RegExp('set "' + key + '=[0-9]+"').test(portsSource),
        'Canonical numeric port missing: ' + key);
}

for (const relativePath of [
    'server/python-server.py',
    'server/bridges/popup-bridge.py',
    'server/bridges/lightpanda-bridge.py',
    'server/bridges/camofox-bridge.py'
]) {
    assert(fs.existsSync(path.join(ROOT, relativePath)), 'Launcher target missing: ' + relativePath);
}

console.log('LAUNCHER_CONTRACT_SMOKE_OK', JSON.stringify({
    rootLines: rootSource.split(/\r?\n/).length,
    helpers: helperNames.length
}));