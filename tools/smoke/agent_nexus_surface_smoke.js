#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const modulePath = path.join(ROOT, 'js', 'modules', 'gemini', 'search_monitor', 'agentNexus.js');
const manifestPath = path.join(ROOT, 'js', 'config', 'manifest', 'scripts.parts', '13-gemini.js');
const cssPath = path.join(ROOT, 'css', 'modules', 'gemini', 'gemini_link_surfaces.agent-nexus.css');
const source = fs.readFileSync(modulePath, 'utf8');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const windowMock = {
    setTimeout,
    clearTimeout,
    location: { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8765' }
};

vm.runInNewContext(source, {
    window: windowMock, console, setTimeout, clearTimeout, AbortController, URLSearchParams
}, { filename: modulePath });

function requireContract(condition, message) {
    if (!condition) throw new Error(message);
}

const markup = windowMock.EveOSAgentNexus?.markup?.() || '';
requireContract(markup.includes('data-agent-id="tlo"'), 'TLO peer surface is missing');
requireContract(markup.includes('data-agent-tool-id="nexus-browser"'), 'Nexus Browser peer surface is missing');
requireContract(markup.includes('data-agent-nexus-view="management"'), 'Agent Management view is missing');
requireContract(markup.includes('Headed / observable') && markup.includes('Headless'),
    'Nexus Browser does not state its headed/headless capability boundary');
requireContract(markup.includes('Never included in browser projections'),
    'Private-note projection boundary is not visible to the user');
requireContract(source.includes('/api/eve-state/modular/agent-management'),
    'Agent Nexus is not wired to Agent Management');
requireContract(!source.includes('/api/local-moe/start'),
    'Agent Nexus can auto-start Local MoE');
requireContract(manifest.indexOf('agentNexus.js') < manifest.indexOf('searchMonitorAiHome.js'),
    'Agent Nexus is not loaded before its Search Monitor host');
requireContract(/@media \(max-width: 620px\)/.test(css), 'Agent Nexus lacks its narrow-layout contract');

console.log('AGENT_NEXUS_SURFACE_SMOKE_OK');
