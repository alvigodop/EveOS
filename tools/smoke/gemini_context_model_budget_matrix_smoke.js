/**
 * gemini_context_model_budget_matrix_smoke.js
 *
 * Nova-pattern dummy-datapack test for the FULL Context Relay pipeline under the live model's
 * limited context window. The live voice model (gemini-2.5-flash native audio) runs a ~128k-token
 * session, so every send must stay inside the ~32k-token (128k-char) model budget — for EVERY
 * scope (whole datapack / tab branch / card) at EVERY detail tier (brief/summary/deep/full),
 * with the tier ladder stepping down when the scoped snapshot is too big, valid JSON always, and
 * the silent Data Stream deltas staying tiny. Also proves the localStorage budget override.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const LIVE_FRAME_GUARD = 46000;   // 45k chunk + chunk marker headroom

// --- A large, realistic dummy datapack: 3 workspaces, chunky cards, long notes/URLs/tags ---
const LONG_NOTE = ('Detailed reading note with plot points, progress, and impressions. ').repeat(10);
function link(ws, cat, i) {
    return {
        id: `${ws}-${cat}-${i}`,
        title: `${cat} Entry ${i} — ` + 'TitleWord '.repeat(4),
        url: `https://example.test/${ws}/${cat}/${i}/long-slug?utm_source=x&fbclid=abc&ref=${'r'.repeat(90)}&id=${i}`,
        workspace: ws,
        category: cat,
        notes: `${cat} ${i}: ${LONG_NOTE}`,
        tags: Array.from({ length: 14 }, (_, t) => 'tag' + t),
        genre: Array.from({ length: 10 }, (_, g) => 'genre' + g),
        relatedUrls: Array.from({ length: 5 }, (_, r) => ({ url: `https://mirror${r}.test/${i}?utm_medium=y` })),
        priority: 'High',
        chapter: String(i),
        identifiers: ['listening']
    };
}
const WORKSPACES = ['main', 'media', 'research'];
const links = [];
WORKSPACES.forEach((ws) => {
    for (let c = 1; c <= 5; c += 1) for (let i = 0; i < 30; i += 1) links.push(link(ws, `Cat${c}`, i));
    for (let i = 0; i < 12; i += 1) links.push(link(ws, 'SmallCat', i));   // small card for un-degraded full sends
});

function makeVmContext({ budgetOverride } = {}) {
    const sent = [];
    const context = {
        console, Date, JSON, URLSearchParams, URL,
        WebSocket: { OPEN: 1 },
        navigator: {},
        window: {
            localStorage: { getItem: (key) => (key === 'geminiContextCharBudget' && budgetOverride ? String(budgetOverride) : null) },
            config: {
                activeWorkspace: 'main',
                geminiLiveLinkEnabled: true,
                geminiContextDataStreamEnabled: true,
                workspaces: WORKSPACES.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), subTabs: [] }))
            },
            eveState: { links },
            EveDataStore: {
                _modularSync: {
                    sharedReady: true, engineReady: true,
                    isHttpContext: () => false,   // forces the local-builder pipeline (Nova pattern)
                    getStore: () => ({
                        captureState: () => ({
                            metadata: { version: 1 },
                            bookmarks: {
                                config: {
                                    activeWorkspace: 'main',
                                    workspaces: WORKSPACES.map((id) => ({ id, name: id, subTabs: [] })),
                                    bookmarkIdentifiers: [{ id: 'listening', label: 'Listening', description: 'Audio marker' }]
                                },
                                links,
                                folders: {},
                                pins: []
                            },
                            library: { categories: {}, connections: [] }
                        })
                    }),
                    requestJson: async () => { throw new Error('file:// mode'); }
                }
            },
            webSocket: { readyState: 1, send(payload) { sent.push(JSON.parse(payload)); } },
            displayMessage() {}
        }
    };
    context.window.window = context.window;
    return { context, sent };
}

function runScript(context, relativePath) {
    vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), context, { filename: relativePath });
}
function loadPipeline(context) {
    runScript(context, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.local.js');
    runScript(context, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.js');
    runScript(context, 'js/modules/features/modular-state-sync/modular-state-sync.api.datastream.trace.js');
    runScript(context, 'js/modules/features/modular-state-sync/modular-state-sync.api.datastream.js');
}
function assert(condition, message) { if (!condition) throw new Error('ASSERT FAILED: ' + message); }

function reassemble(frames) {
    return frames.map((p) => p.realtime_input.media_chunks[0].data.replace(/^\[EveOS context chunk \d+\/\d+\]\n/, '')).join('');
}
function assertValidJsonBlock(message, label) {
    const start = message.indexOf('{');
    const end = message.lastIndexOf('}');
    assert(start >= 0 && end > start, `${label}: no JSON block found`);
    JSON.parse(message.slice(start, end + 1));   // throws if the snapshot JSON is broken
}

(async function main() {
    const MODEL_BUDGET = 128000;
    const TOKEN_BUDGET = 32000;
    const SCOPES = {
        'whole-datapack': { scope: 'all', workspaceId: '', workspaceIds: [], categoryName: '', label: 'Whole datapack' },
        'tab-branch': { scope: 'workspace', workspaceId: 'media', workspaceIds: ['media'], categoryName: '', label: 'Media branch' },
        'card': { scope: 'card', workspaceId: 'media', workspaceIds: ['media'], categoryName: 'SmallCat', label: 'Small card' }
    };
    const TIERS = ['brief', 'summary', 'deep', 'full'];

    const { context, sent } = makeVmContext({});
    loadPipeline(context);
    const api = context.window.EveDataStore._modularSync;

    console.log('scope           tier     requested->sent   chars    ~tokens  chunks  degraded');
    for (const [scopeName, scope] of Object.entries(SCOPES)) {
        for (const tier of TIERS) {
            sent.length = 0;
            const result = await api.sendContextToGemini(tier, 90, { scope });
            assert(result.ok && result.sent, `${scopeName}/${tier}: send failed: ${result.error || ''}`);
            const m = result.manifest;
            assert(m.modelBudgetChars === MODEL_BUDGET, `${scopeName}/${tier}: default model budget should be ${MODEL_BUDGET}`);
            assert(m.messageChars <= MODEL_BUDGET, `${scopeName}/${tier}: ${m.messageChars} chars exceeds the model budget`);
            assert(m.estimatedTokens <= TOKEN_BUDGET, `${scopeName}/${tier}: ~${m.estimatedTokens} tokens exceeds the token budget`);
            assert(m.transportTruncated === false, `${scopeName}/${tier}: should never need the byte clip (ladder must fit first)`);
            assert(sent.length === m.transportChunkCount, `${scopeName}/${tier}: chunk count mismatch`);
            sent.forEach((frame) => {
                assert(frame.realtime_input.media_chunks[0].data.length < LIVE_FRAME_GUARD, `${scopeName}/${tier}: chunk over frame guard`);
                assert(frame.is_modular_context === true, `${scopeName}/${tier}: modular flag missing`);
            });
            assertValidJsonBlock(reassemble(sent), `${scopeName}/${tier}`);
            console.log(
                `${scopeName.padEnd(15)} ${tier.padEnd(8)} ${(tier + '->' + result.mode).padEnd(17)} ${String(m.messageChars).padEnd(8)} ${String(m.estimatedTokens).padEnd(8)} ${String(m.transportChunkCount).padEnd(7)} ${m.autoDegradedFrom || '-'}`
            );
        }
    }

    // The card scope on a small card must keep FULL detail un-degraded (scope narrows, tier holds)
    {
        sent.length = 0;
        const result = await api.sendContextToGemini('full', 90, { scope: SCOPES.card });
        assert(result.mode === 'full' && !result.manifest.autoDegradedFrom, 'small card should send FULL without degradation');
    }
    // The whole-datapack FULL send must have laddered down (this pack is far beyond the budget)
    {
        sent.length = 0;
        const result = await api.sendContextToGemini('full', 90, { scope: SCOPES['whole-datapack'] });
        assert(result.manifest.autoDegradedFrom === 'full', 'whole-datapack full should auto-degrade');
        assert(result.manifest.messageChars <= MODEL_BUDGET, 'degraded whole-datapack send fits the budget');
    }

    // --- Data Stream: silent deltas stay tiny and carry the silent flags ---
    {
        sent.length = 0;
        const detail = {
            source: 'state-mutated', kind: 'data', mutationSeq: 7, at: Date.now(),
            meta: {
                dataDelta: {
                    complete: true,
                    workspaceIds: ['media'],
                    categoryNames: ['Cat1'],
                    linkIds: Array.from({ length: 200 }, (_, i) => `media-Cat1-${i}`),
                    addedLinkIds: Array.from({ length: 80 }, (_, i) => `media-Cat1-${i}`),
                    affectedScopes: [{ workspaceId: 'media', categoryName: 'Cat1' }]
                }
            }
        };
        const result = api.sendDataStreamToGemini(detail, { scope: SCOPES['tab-branch'] });
        assert(result.ok && result.sent, 'data stream should send');
        assert(sent.length === 1, 'data stream is a single frame');
        const frame = sent[0];
        assert(frame.silent_response === true && frame.data_stream.silent === true, 'data stream silent flags missing');
        const data = frame.realtime_input.media_chunks[0].data;
        assert(data.length < 8000, `data stream delta should stay tiny, saw ${data.length}`);
        assertValidJsonBlock(data, 'data-stream');
        console.log(`data-stream OK: ${data.length} chars, silent, capped lists`);
    }

    // --- Budget override: localStorage 'geminiContextCharBudget' = 40000 tightens everything ---
    {
        const { context: ctx2, sent: sent2 } = makeVmContext({ budgetOverride: 40000 });
        loadPipeline(ctx2);
        const api2 = ctx2.window.EveDataStore._modularSync;
        const result = await api2.sendContextToGemini('full', 90, { scope: SCOPES['whole-datapack'] });
        assert(result.ok && result.sent, 'override send failed');
        assert(result.manifest.modelBudgetChars === 40000, 'override budget should apply');
        assert(result.manifest.messageChars <= 40000, `override: ${result.manifest.messageChars} exceeds 40000`);
        console.log(`budget override OK: full whole-datapack fit into 40000 chars as ${result.mode}${result.manifest.transportTruncated ? ' (clipped)' : ''}`);
    }

    console.log('GEMINI_CONTEXT_MODEL_BUDGET_MATRIX_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
