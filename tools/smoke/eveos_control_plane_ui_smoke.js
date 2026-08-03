#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const localControlSource = fs.readFileSync(
    path.join(ROOT, 'js', 'modules', 'core', 'eveos-local-control.js'),
    'utf8'
);
const source = fs.readFileSync(
    path.join(ROOT, 'js', 'modules', 'gemini', 'server_control', 'eveosControlPlane.js'),
    'utf8'
);
const shellSource = fs.readFileSync(
    path.join(ROOT, 'js', 'modules', 'gemini', 'gemini-init.js'),
    'utf8'
);

let webRunning = false;
const events = [];
const statusNode = { textContent: '' };
const labelNode = { textContent: '' };
const iconNode = { textContent: '' };
const buttonNode = {
    disabled: false,
    dataset: {},
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute() {},
    querySelector(selector) {
        if (selector === '[data-eveos-control-action-label]') return labelNode;
        if (selector === '.material-icons') return iconNode;
        return null;
    }
};
const openNode = {
    hidden: true,
    dataset: {},
    addEventListener() {}
};
const controlNode = {
    dataset: {},
    title: '',
    parentElement: {
        querySelector(selector) {
            return selector === '[data-eveos-control-open]' ? openNode : null;
        }
    },
    querySelector(selector) {
        if (selector === '[data-eveos-control-status]') return statusNode;
        if (selector === '[data-eveos-control-toggle]') return buttonNode;
        return null;
    }
};

async function fetchJson(url, options) {
    if (url.endsWith('/api/control-plane/health')) {
        return {
            ok: true,
            service: 'eveos-control-plane',
            controllerAvailable: true,
            running: true,
            state: 'running',
            port: 9082
        };
    }
    if (url.endsWith('/api/control-plane/status')) {
        return {
            ok: true,
            service: 'eveos-control-plane',
            controllerAvailable: true,
            web: {
                ok: true,
                running: webRunning,
                desiredRunning: webRunning,
                state: webRunning ? 'running' : 'stopped',
                url: 'http://127.0.0.1:8765/EveOS.html',
                message: webRunning ? 'EveOS localhost is online.' : 'EveOS localhost is stopped.'
            }
        };
    }
    if (url.endsWith('/api/eveos-server/start') && options?.method === 'POST') {
        webRunning = true;
        return {
            ok: true,
            running: true,
            desiredRunning: true,
            state: 'running',
            url: 'http://127.0.0.1:8765/EveOS.html',
            message: 'EveOS localhost started.'
        };
    }
    if (url.endsWith('/api/eveos-server/stop') && options?.method === 'POST') {
        webRunning = false;
        return {
            ok: true,
            running: false,
            desiredRunning: false,
            state: 'stopped',
            url: 'http://127.0.0.1:8765/EveOS.html',
            message: 'EveOS localhost stopped.'
        };
    }
    throw new Error(`Unexpected URL: ${url}`);
}

class CustomEventMock {
    constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
    }
}

const documentMock = {
    readyState: 'complete',
    visibilityState: 'visible',
    documentElement: {},
    body: { appendChild() {} },
    querySelectorAll(selector) {
        if (selector === '[data-eveos-control-plane]') return [controlNode];
        if (selector === '[data-eveos-control-toggle]') return [buttonNode];
        if (selector === '[data-eveos-control-open]') return [openNode];
        return [];
    },
    getElementById(id) {
        return id === 'gemini-ui-root' ? {} : null;
    },
    createElement() {
        return { setAttribute() {}, click() {}, remove() {} };
    },
    addEventListener() {}
};

const windowMock = {
    config: { bridges: { localControlPort: 9082, geminiControlPort: 9082 } },
    GeminiServerNetwork: { fetchJson },
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    dispatchEvent(event) { events.push(event); },
    open() {}
};

const context = {
    window: windowMock,
    document: documentMock,
    MutationObserver: class { observe() {} },
    CustomEvent: CustomEventMock,
    AbortController,
    fetch,
    console
};

vm.runInNewContext(localControlSource, context, { filename: 'eveos-local-control.js' });
vm.runInNewContext(source, context, { filename: 'eveosControlPlane.js' });

(async () => {
    await windowMock.EveOSControlPlane.refreshStatus();
    if (statusNode.textContent !== 'Localhost Off' || labelNode.textContent !== 'Start') {
        throw new Error(`stopped UI mismatch: ${statusNode.textContent}/${labelNode.textContent}`);
    }

    await windowMock.EveOSControlPlane.start();
    if (statusNode.textContent !== 'Online' || labelNode.textContent !== 'Stop') {
        throw new Error(`running UI mismatch: ${statusNode.textContent}/${labelNode.textContent}`);
    }
    if (openNode.hidden) throw new Error('localhost open button stayed hidden while running');
    if (!events.some((event) => event.type === 'eve:eveos-control-plane-status')) {
        throw new Error('control-plane status event was not published');
    }
    if (!shellSource.includes('data-eveos-control-plane')) {
        throw new Error('Search Monitor shell is not wired to EveOS local control');
    }
    const shellControl = shellSource.match(/<div class="gemini-server-control"[^>]*>/)?.[0] || '';
    if (shellControl.includes('data-gemini-server-control')) {
        throw new Error('Search Monitor top control is still coupled to Gemini lifecycle');
    }
    if (!source.includes('record.addedNodes')) {
        throw new Error('control binding observer is not scoped to newly added lifecycle controls');
    }
    if (!source.includes('EveOSLocalControl.ensure')) {
        throw new Error('Search Monitor does not use the shared local-control cold start');
    }
    if (/new MutationObserver\(function \(\) \{\s*bind\(document\)/.test(source)) {
        throw new Error('control binding observer can recursively republish its own DOM mutations');
    }

    console.log('EVEOS_CONTROL_PLANE_UI_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
