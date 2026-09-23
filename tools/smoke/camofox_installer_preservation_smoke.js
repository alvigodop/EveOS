'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const batchPath = path.join(ROOT, 'tools', 'batch', 'start-camofox-bridge.bat');
const packagePath = path.join(ROOT, 'tools', 'camofox-runtime', 'package.json');
const serverPath = path.join(ROOT, 'server_modules', 'camofox_server.py');

function requireTrue(condition, message) {
    if (!condition) throw new Error(message);
}

const batch = fs.readFileSync(batchPath, 'utf8');
const runtimePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const server = fs.readFileSync(serverPath, 'utf8');

const installMatch = /(?:^|\r?\n):installRuntime\r?\n/.exec(batch);
const startMatch = /(?:^|\r?\n):startBridge\r?\n/.exec(batch);
const installStart = installMatch?.index ?? -1;
const installEnd = startMatch?.index ?? -1;
requireTrue(installStart >= 0 && installEnd > installStart, 'installer label boundaries are missing');
const installSection = batch.slice(installStart, installEnd);

const checkIndex = installSection.indexOf('node "%INSTALL_DOCTOR%" --runtime >nul 2>nul');
const healthyIndex = installSection.indexOf('Existing Camofox Node runtime is healthy; preserving node_modules.');
const npmIndex = installSection.indexOf('call npm install --no-package-lock --omit=dev');
const browserCheck = installSection.indexOf('"%EVEOS_PYTHON%" "%BROWSER_FETCHER%" --check >nul 2>nul');
const browserFetch = installSection.indexOf('"%EVEOS_PYTHON%" "%BROWSER_FETCHER%"');

requireTrue(checkIndex >= 0, 'runtime doctor is missing from installer');
requireTrue(healthyIndex > checkIndex, 'healthy-runtime preservation branch is missing');
requireTrue(npmIndex > healthyIndex, 'npm install is not gated behind the runtime doctor');
requireTrue(browserCheck >= 0 && browserCheck < checkIndex, 'browser verification must run before runtime rebuild logic');
requireTrue(browserFetch >= 0, 'EveOS-local browser fetcher is missing');
requireTrue(installSection.includes('if not errorlevel 1 ('), 'healthy runtime branch is not conditional');
requireTrue(installSection.includes('npm install skipped. No native rebuild is needed.'),
    'installer does not explicitly preserve a healthy native runtime');
requireTrue(installSection.includes('CAMOFOX_SKIP_DOWNLOAD=1') || batch.includes('set "CAMOFOX_SKIP_DOWNLOAD=1"'),
    'upstream duplicate browser download is not suppressed');
for (const variable of ['CAMOUFOX_EXECUTABLE', 'CAMOUFOX_EXECUTABLE_PATH', 'CAMOFOX_EXECUTABLE_PATH']) {
    requireTrue(batch.includes(`set "${variable}=%BROWSER_EXE%"`),
        `controller is missing ${variable} EveOS-local browser binding`);
}
requireTrue(runtimePackage.dependencies?.['@askjo/camofox-browser'] === '1.14.0',
    'Camofox server dependency pin drifted');
requireTrue(!runtimePackage.dependencies?.['camoufox-js'],
    'camoufox-js must not be installed separately just to fetch the browser');
requireTrue(server.includes('browser_binary = _camofox_browser_binary()'),
    'Camofox server launch does not resolve the EveOS-local executable');
for (const variable of ['CAMOUFOX_INSTALL_DIR', 'CAMOUFOX_EXECUTABLE',
    'CAMOUFOX_EXECUTABLE_PATH', 'CAMOFOX_EXECUTABLE_PATH']) {
    requireTrue(server.includes(`env["${variable}"]`),
        `Camofox server launch is missing ${variable}`);
}
requireTrue(server.includes('env["CAMOUFOX_EXECUTABLE"] = browser_binary'),
    'canonical external executable override is not bound to EveOS-local browser');
requireTrue(server.includes('env["USERPROFILE"] = windows_home')
    && server.includes('env["HOME"] = windows_home'),
    'legacy Windows Camoufox home resolver is not redirected into EveOS state');
requireTrue(server.includes('def _windows_camofox_cache_root():')
    && server.includes('"AppData", "Local", "camoufox", "camoufox", "Cache"'),
    'project-local legacy Camoufox cache layout is missing');
requireTrue(server.includes('["cmd.exe", "/d", "/c", "mklink", "/J", cache_root, browser_root]'),
    'legacy Camoufox compatibility cache does not junction to the verified EveOS browser');
requireTrue(server.includes('EveOS-local compatibility cache'),
    'Camofox compatibility-cache launch diagnostic is missing');

console.log('CAMOFOX_INSTALLER_PRESERVATION_SMOKE_OK');
