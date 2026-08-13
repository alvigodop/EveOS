#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const initializer = read(
    'js/modules/features/scraper/core/module-system/module-initializer.js'
);
const canonicalFallbacks = [
    'js/modules/features/scraper/core/fixes/global-fix.js',
    'js/modules/features/scraper/core/module-system/module-loader.js',
    'js/modules/features/scraper/utils/cors-proxy/cors-proxy-manager.js',
    'js/modules/features/scraper/utils/error-handling/suppressor/error-suppressor.js'
];
const retiredFallbacks = [
    'js/modules/core/global-fix.js',
    'js/modules/core/module-loader.js',
    'js/modules/utils/cors-proxy-manager.js',
    'js/modules/utils/error-suppressor.js'
];

canonicalFallbacks.forEach((asset) => {
    assert(initializer.includes(asset), `ModuleInitializer must recover ${asset}`);
});
retiredFallbacks.forEach((asset) => {
    assert(!initializer.includes(asset), `ModuleInitializer still references retired ${asset}`);
});

const emulator = read(
    'js/modules/features/scraper/discovery/google-scraper-core-components/gsc-emulator.js'
);
const emulatorChain = [
    'browser-emulator/core.js',
    'browser-emulator/be-config.js',
    'browser-emulator/be-utils.js',
    'browser-emulator/be-proxy-manager.js',
    'browser-emulator/be-render-orchestrator.js',
    'browser-emulator/be-init.js',
    'browser-emulator/proxy-strategy.js',
    'browser-emulator/iframe-strategy.js',
    'browser-emulator/local-strategy.js'
];

let previousIndex = -1;
emulatorChain.forEach((asset) => {
    const assetIndex = emulator.indexOf(asset);
    assert(assetIndex > previousIndex, `BrowserEmulator recovery order is invalid at ${asset}`);
    previousIndex = assetIndex;
});
assert(emulator.includes('__eveBrowserEmulatorRecoveryPromise'),
    'BrowserEmulator recovery must deduplicate concurrent attempts');
assert(!emulator.includes('js/modules/utils/browser-emulator.js'),
    'BrowserEmulator recovery still references the retired monolith');

console.log('RUNTIME_ASSET_RECOVERY_SMOKE_OK');
