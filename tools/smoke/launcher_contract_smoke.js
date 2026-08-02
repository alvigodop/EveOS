#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const rootLauncher = path.join(ROOT, 'start-server.bat');
const helperNames = [
    'start-server.paths.bat',
    'start-server.browser.bat',
    'start-server.browse.bat',
    'start-server.instance.bat',
    'start-server.stack.bat'
];
const pythonLauncherNames = [
    'server-menu.bat',
    'start-camofox-bridge.bat',
    'start-eveos-port.bat',
    'start-gemini-control.bat',
    'start-gemini.bat',
    'start-lightpanda-bridge.bat',
    'start-popup-bridge.bat',
    'start-server.instance.bat',
    'start-server.stack.bat',
    'start-wikimedia-bridge.bat'
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

const pythonResolverPath = path.join(ROOT, 'tools', 'batch', 'eveos-python.bat');
assert(fs.existsSync(pythonResolverPath), 'Canonical Python resolver is missing');
const pythonResolverSource = read(pythonResolverPath);
assert(pythonResolverSource.includes('.venv\\Scripts\\python.exe'),
    'Python resolver does not prefer the documented project virtual environment');
assert(pythonResolverSource.includes('where python'),
    'Python resolver lacks the PATH fallback');

if (process.platform === 'win32') {
    const command = [
        'call tools\\batch\\eveos-python.bat >nul',
        'if errorlevel 1 exit /b 9',
        'if not defined EVEOS_PYTHON exit /b 10',
        '"!EVEOS_PYTHON!" --version >nul 2>nul'
    ].join(' & ');
    const probe = childProcess.spawnSync(process.env.ComSpec || 'cmd.exe', [
        '/d', '/v:on', '/c', command
    ], {
        encoding: 'utf8',
        cwd: ROOT,
        env: { ...process.env, EVEOS_PYTHON: 'C:\\missing\\eveos-python.exe' }
    });
    assert(probe.status === 0,
        'Python resolver live probe failed: ' + (probe.stderr || probe.stdout || probe.status));
}

for (const name of pythonLauncherNames) {
    const source = read(path.join(ROOT, 'tools', 'batch', name));
    assert(source.includes('eveos-python.bat'),
        name + ' bypasses the canonical Python resolver');
    assert(source.includes('EVEOS_PYTHON'),
        name + ' does not launch the resolved Python interpreter');
    assert(/if errorlevel 1/i.test(source),
        name + ' does not stop when Python resolution fails');
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
    helpers: helperNames.length,
    pythonLaunchers: pythonLauncherNames.length
}));
