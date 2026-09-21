#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const modulePath = path.join(ROOT, 'js', 'modules', 'gemini', 'search_monitor', 'tloChat.js');
const manifestPath = path.join(ROOT, 'js', 'config', 'manifest', 'scripts.parts', '13-gemini.js');
const cssPath = path.join(ROOT, 'css', 'modules', 'gemini', 'gemini_link_surfaces.tlo-chat.css');
const source = fs.readFileSync(modulePath, 'utf8');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const windowMock = {
    setTimeout, clearTimeout, crypto: globalThis.crypto,
    location: { protocol: 'http:', origin: 'http://127.0.0.1:8765' }
};

vm.runInNewContext(source, {
    window: windowMock, console, setTimeout, clearTimeout, AbortController,
    TextDecoder, Uint32Array, Date, fetch: async () => { throw new Error('unexpected fetch'); }
}, { filename: modulePath });

function requireContract(condition, message) {
    if (!condition) throw new Error(message);
}

async function run() {
    const api = windowMock.EveOSTloChat;
    const markup = api?.markup?.() || '';
    for (const contract of ['data-agent-id="tlo"', 'data-tlo-transcript', 'data-tlo-form',
        'data-tlo-action="cancel"', 'data-tlo-action="clear"', 'data-agent-nexus-view="management"']) {
        requireContract(markup.includes(contract), `TLO chat surface is missing ${contract}`);
    }
    requireContract(source.includes('/api/eve-state/modular/tlo/chat/stream')
        && source.includes('/api/eve-state/modular/tlo/chat/cancel'),
        'TLO chat is not connected to the EveOS streaming/cancel adapter');
    requireContract(!source.includes('/api/local-moe/start'), 'Opening TLO can start Local MoE');
    requireContract(source.includes("api_unreachable") && source.includes('retry automatically'),
        'TLO status no longer distinguishes a reachable EveOS server from an unreachable TLO API');
    requireContract(manifest.indexOf('tloChat.js') < manifest.indexOf('agentNexus.js'),
        'TLO chat is not loaded before the Agent Nexus facade');
    requireContract(/@media \(max-width: 620px\)/.test(css), 'TLO chat lacks its narrow-layout contract');

    const encoder = new TextEncoder();
    const chunks = [
        'data: {"choices":[{"delta":{"content":"A"}}]}\n',
        '\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DO',
        'NE]\n\n'
    ];
    const body = new ReadableStream({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
            controller.close();
        }
    });
    let text = '';
    let finalized = 0;
    await api.consumeSseResponse({ body }, {
        onDelta(piece) { text += piece; },
        onDone() { finalized += 1; }
    });
    requireContract(text === 'AB', `Streaming deltas were not ordered: ${text}`);
    requireContract(finalized === 1, `Streaming finalized ${finalized} times`);
    console.log('TLO_CHAT_SURFACE_SMOKE_OK');
}

run().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
});
