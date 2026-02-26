/**
 * BrowserEmulator Core Module
 * 
 * Defines the main BrowserEmulator object.
 * Logic is distributed across sub-modules:
 * - be-config.js
 * - be-utils.js
 * - be-proxy-manager.js
 * - be-render-orchestrator.js
 * - be-init.js
 * 
 * Strategies for rendering are loaded as separate modules extending this object.
 * 
 * @version 1.2.1-modular
 */

const BrowserEmulator = {
    version: '1.2.1-modular',
    _initialized: false
};

// Make sure global access is set up immediately
window.BrowserEmulator = BrowserEmulator;
console.log('BrowserEmulator: Core shell loaded');
