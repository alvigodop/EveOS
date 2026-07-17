// Extreme-datapack smoke for the EveOS Context Relay: when a datapack is so large that even the
// chunked transport ceiling (600k chars) can't fit the selected tier, the send path must
// AUTO-STEP the detail tier down (full -> deep -> summary -> brief) until a complete, valid JSON
// snapshot fits — never byte-chop a huge one mid-structure. Also covers the pathological case
// where even brief exceeds the ceiling: the last-resort clip must cut at a line boundary and
// append the transport notice.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

// Build a deterministic fake context body of roughly `chars` characters made of full lines, with
// a valid JSON block so "no broken JSON" is checkable after transport.
function fakeContextText(mode, chars) {
    const header = `[EveOS ${mode} scoped state snapshot]\n`;
    const json = JSON.stringify({ schema: `eveos.fake.${mode}`, mode, cards: ['alpha', 'beta'] });
    const line = `bookmark-row ${mode} 0123456789 0123456789 0123456789 0123456789\n`;
    let body = '';
    while (header.length + json.length + body.length < chars) body += line;
    return `${header}${json}\n${body}`;
}

function makeContext(tierSizes, sent, fetchedModes) {
    const context = {
        console,
        Date,
        JSON,
        URLSearchParams,
        WebSocket: { OPEN: 1 },
        navigator: {},
        window: {
            // Pin the model budget to the transport ceiling: these scenarios exercise the 600k
            // transport guard + ladder mechanics (the model-budget default is covered by
            // gemini_context_model_budget_matrix_smoke.js). Also proves the override knob works.
            localStorage: { getItem: (key) => (key === 'geminiContextCharBudget' ? '600000' : null) },
            config: { activeWorkspace: 'main', workspaces: [{ id: 'main', name: 'Main' }] },
            EveDataStore: {
                _modularSync: {
                    sharedReady: true,
                    engineReady: true,
                    requestJson: async (query) => {
                        const mode = /mode=([a-z]+)/.exec(String(query))[1];
                        fetchedModes.push(mode);
                        return {
                            ok: true,
                            payload: {
                                ok: true,
                                mode,
                                contextText: fakeContextText(mode, tierSizes[mode]),
                                payload: {
                                    scope: { scope: 'workspace', workspaceId: 'main', workspaceIds: ['main'], label: 'Current tab branch' },
                                    bookmarks: {
                                        config: { activeWorkspace: 'main', workspaces: [{ id: 'main', name: 'Main' }] },
                                        links: [{ workspace: 'main', category: 'Test', title: 'Alpha' }]
                                    },
                                    library: { categories: {}, connections: [] }
                                }
                            }
                        };
                    }
                }
            },
            WebSocket: { OPEN: 1 },
            webSocket: { readyState: 1, send(payload) { sent.push(JSON.parse(payload)); } },
            displayMessage() {}
        }
    };
    context.window.window = context.window;
    return context;
}

function runScript(context, relativePath) {
    const file = path.join(root, relativePath);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: relativePath });
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async function main() {
    // --- Scenario 1: extreme pack — full (2.4M) and deep (1.1M) exceed the ceiling; summary
    // (300k) fits. The ladder must land on summary with NO byte-truncation.
    {
        const sent = [], fetchedModes = [];
        const ctx = makeContext({ full: 2400000, deep: 1100000, summary: 300000, brief: 40000 }, sent, fetchedModes);
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.sync.js');
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.scope.js');
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.transport.js');
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.js');
        const api = ctx.window.EveDataStore._modularSync;
        const result = await api.sendContextToGemini('full', 90);

        assert(result.ok && result.sent, 'extreme pack should still send');
        assert(fetchedModes.join(',') === 'full,deep,summary', `ladder should walk full->deep->summary, saw ${fetchedModes.join(',')}`);
        assert(result.mode === 'summary', `final mode should be summary, saw ${result.mode}`);
        assert(result.manifest.autoDegradedFrom === 'full', 'manifest should record the tier it stepped down from');
        assert(Math.abs(result.manifest.autoDegradedChars - 2400000) < 200, `manifest should record the original size (~2.4M), saw ${result.manifest.autoDegradedChars}`);
        assert(result.manifest.transportTruncated === false, 'a laddered send must NOT be byte-truncated');
        const joined = sent.map((p) => p.realtime_input.media_chunks[0].data.replace(/^\[EveOS context chunk \d+\/\d+\]\n/, '')).join('');
        assert(joined.includes('"schema":"eveos.fake.summary"'), 'reassembled message should contain the summary tier JSON intact');
        assert(!joined.includes('TRANSPORT NOTICE'), 'no transport notice on a laddered send');
        assert(sent.length === result.manifest.transportChunkCount, 'chunk count should match manifest');
        console.log(`scenario 1 OK: laddered full(2.4M)->summary(${result.manifest.messageChars} chars), ${sent.length} chunks, no truncation`);
    }

    // --- Scenario 2: pathological — every tier exceeds the ceiling. Last-resort clip must cut at
    // a LINE boundary (no mid-line/mid-token split) and append the transport notice.
    {
        const sent = [], fetchedModes = [];
        const ctx = makeContext({ full: 3000000, deep: 2000000, summary: 1500000, brief: 900000 }, sent, fetchedModes);
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.sync.js');
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.scope.js');
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.transport.js');
        runScript(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.js');
        const api = ctx.window.EveDataStore._modularSync;
        const result = await api.sendContextToGemini('full', 90);

        assert(result.ok && result.sent, 'pathological pack should still send something');
        assert(fetchedModes.join(',') === 'full,deep,summary,brief', `ladder should walk all tiers, saw ${fetchedModes.join(',')}`);
        assert(result.mode === 'brief', 'should end on brief');
        assert(result.manifest.transportTruncated === true, 'pathological send is truncated');
        const joined = sent.map((p) => p.realtime_input.media_chunks[0].data.replace(/^\[EveOS context chunk \d+\/\d+\]\n/, '')).join('');
        assert(joined.includes('[TRANSPORT NOTICE:'), 'transport notice missing');
        const beforeNotice = joined.slice(0, joined.indexOf('\n\n[TRANSPORT NOTICE:'));
        const lastLine = beforeNotice.slice(beforeNotice.lastIndexOf('\n') + 1);
        assert(lastLine === '' || lastLine === 'bookmark-row brief 0123456789 0123456789 0123456789 0123456789',
            `clip must land on a line boundary, saw tail: "${lastLine.slice(-80)}"`);
        console.log(`scenario 2 OK: all tiers oversized -> brief clipped at line boundary (${result.manifest.messageChars} chars)`);
    }

    console.log('GEMINI_CONTEXT_EXTREME_PACK_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
