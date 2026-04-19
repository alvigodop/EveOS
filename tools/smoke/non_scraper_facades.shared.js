const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function createContext(overrides = {}) {
    const context = {
        console,
        Map,
        Set,
        Date,
        JSON,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        setTimeout,
        clearTimeout
    };

    context.window = {
        console,
        location: {
            reload() {}
        },
        addEventListener() {},
        open() {}
    };
    context.document = {
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    context.location = context.window.location;
    context.config = {};
    context.saveConfig = function () {};
    context.renderDashboard = function () {};
    context.normalizeUrl = function (url) { return url; };
    context.showToast = function () {};
    context.showConfirm = async function () { return true; };
    context.confirm = function () { return true; };

    Object.assign(context, overrides);

    context.window.window = context.window;
    context.window.document = context.document;
    context.window.location = context.location;
    context.window.addEventListener = context.window.addEventListener || function () {};
    context.window.open = context.window.open || function () {};
    context.window.eveState = context.eveState || context.window.eveState || null;
    context.window.links = context.links || context.window.links || [];
    context.window.showDirectoryPicker = context.showDirectoryPicker || context.window.showDirectoryPicker;
    context.window.EveSettingsModularBrowserHelpers = context.window.EveSettingsModularBrowserHelpers || {};
    context.self = context.window;
    context.globalThis = context;

    return vm.createContext(context);
}

function loadModules(context, modules) {
    modules.forEach((modulePath) => {
        vm.runInContext(readModule(modulePath), context, { filename: modulePath });
    });
}

async function runTest(name, fn) {
    await fn();
    console.log(`PASS ${name}`);
}

module.exports = {
    assert,
    createContext,
    loadModules,
    runTest
};
