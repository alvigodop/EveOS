'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const batchPath = path.join(ROOT, 'tools', 'batch', 'start-camofox-bridge.bat');
const packagePath = path.join(ROOT, 'tools', 'camofox-runtime', 'package.json');

function requireTrue(condition, message) {
    if (!condition) throw new Error(message);
}

const batch = fs.readFileSync(batchPath, 'utf8');
const runtimePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const installStart = batch.indexOf(':installRuntime');
const installEnd = batch.indexOf(':startBridge');
requireTrue(installStart >= 0 && installEnd > installStart, 'installer section boundaries are missing');
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
requireTrue(runtimePackage.dependencies?.['@askjo/camofox-browser'] === '1.14.0',
    'Camofox server dependency pin drifted');
requireTrue(!runtimePackage.dependencies?.['camoufox-js'],
    'camoufox-js must not be installed separately just to fetch the browser');

console.log('CAMOFOX_INSTALLER_PRESERVATION_SMOKE_OK');
