#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const aiHomePath = path.join(ROOT, 'js', 'modules', 'gemini', 'search_monitor', 'searchMonitorAiHome.js');
const initPath = path.join(ROOT, 'js', 'modules', 'gemini', 'gemini-init.js');
const loaderPath = path.join(
    ROOT, 'js', 'modules', 'gemini', 'html_loaders', 'layout', 'mdl_wrap', 'mdlLayoutWrapperUILoader.js'
);
const manifestPath = path.join(ROOT, 'js', 'config', 'manifest', 'scripts.parts', '13-gemini.js');
const source = fs.readFileSync(aiHomePath, 'utf8');
const initSource = fs.readFileSync(initPath, 'utf8');
const loaderSource = fs.readFileSync(loaderPath, 'utf8');
const manifestSource = fs.readFileSync(manifestPath, 'utf8');

const requests = [];
const windowMock = {
    setTimeout,
    clearTimeout,
    open() {},
    EveOSLocalControl: {
        baseUrl: () => 'http://127.0.0.1:9082',
        async fetchJson(url, options) {
            requests.push({ url, method: options?.method || 'GET' });
            return {
                ok: true,
                running: false,
                state: 'stopped',
                setupReady: true,
                runtimeReady: false,
                runtimeHealth: 'offline',
                activeModel: { id: 'qwen36-nvfp4', label: 'Qwen 35B' },
                port: 5180,
                runtimePort: 1919,
                message: 'Stopped; explicit start required.'
            };
        }
    }
};
vm.runInNewContext(source, { window: windowMock, console, setTimeout, clearTimeout }, { filename: aiHomePath });

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    const api = windowMock.EveOSSearchMonitorAiHome;
    assert(api, 'AI Home API was not exported');
    const markup = api.markup();
    for (const provider of ['gemini', 'local-moe', 'agents']) {
        assert(markup.includes(`data-ai-provider="${provider}"`), `Missing ${provider} provider section`);
    }
    assert(markup.includes('Search Monitor Assistant'), 'Compact Search Monitor Assistant was removed');
    assert(markup.includes('data-eveos-control-plane'), 'Top localhost control is missing');
    assert(markup.includes('data-agent-id="tlo"') && markup.includes('Placeholder only'),
        'Agent Nexus does not keep TLO as a Phase 2 placeholder');
    assert(!/<details[^>]+data-ai-provider="(?:gemini|local-moe|agents)"[^>]*\sopen(?:\s|>)/.test(markup),
        'A provider is expanded by default');
    assert(source.includes('/api/local-moe/start') && source.includes('/api/local-moe/stop'),
        'Local MoE lifecycle routes are missing');
    assert(!initSource.includes("requestGeminiBoot('full-monitor-view')"),
        'Opening Workspace still boots Gemini before its provider is opened');
    assert(loaderSource.includes("getElementById('gemini-provider-runtime-host')"),
        'Gemini full UI is not scoped to its provider body');
    assert(manifestSource.indexOf('searchMonitorAiHome.js') < manifestSource.indexOf('gemini-init.js'),
        'AI Home module must load before gemini-init');

    const listeners = {};
    const gemini = { open: false, addEventListener(type, fn) { listeners[`gemini:${type}`] = fn; } };
    const localMoe = { open: false, addEventListener(type, fn) { listeners[`local:${type}`] = fn; } };
    const root = {
        addEventListener() {},
        querySelector(selector) {
            if (selector === '[data-ai-provider="gemini"]') return gemini;
            if (selector === '[data-ai-provider="local-moe"]') return localMoe;
            return null;
        },
        querySelectorAll() { return []; }
    };
    let geminiBootRequests = 0;
    api.bind(root, { onGeminiOpen() { geminiBootRequests += 1; } });
    api.setWorkspaceActive(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(requests.length === 1 && requests[0].url.endsWith('/api/local-moe/status'),
        'Workspace activation must perform only a passive Local MoE status read');
    assert(requests[0].method === 'GET', 'Workspace activation issued a mutating Local MoE request');
    assert(geminiBootRequests === 0, 'Workspace activation booted collapsed Gemini Link');
    gemini.open = true;
    listeners['gemini:toggle']();
    assert(geminiBootRequests === 1, 'Opening Gemini Link did not request its preserved workspace');

    console.log('SEARCH_MONITOR_AI_HOME_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
