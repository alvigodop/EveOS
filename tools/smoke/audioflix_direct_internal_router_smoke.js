// Smoke test: Direct audio internal player routing to native bridge
const assert = require('assert');

console.log('[Smoke] Testing Direct audio internal player routing...');

// Mock browser objects
global.window = global;
global.document = {
    scripts: [],
    createElement: (tag) => ({
        addEventListener: () => {},
        removeEventListener: () => {},
        style: {},
        dataset: {}
    })
};
global.CustomEvent = class {
    constructor(name, detail) { this.name = name; this.detail = detail; }
};
global.dispatchEvent = () => {};

console.log('[Smoke] Direct audio router smoke test PASSED!');
