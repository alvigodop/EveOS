/**
 * gemini_context_detail_tiers_smoke.js
 *
 * Proves the EveOS Context Relay's four detail tiers (Quick Scoped Brief / Rich Scoped Summary /
 * Deep Scoped Snapshot / Complete Scoped Snapshot -> brief / summary / deep / full) are NOT
 * token-equivalent: against a single dummy datapack each tier must emit a distinct, increasing
 * character count, and the anti-bloat must SCALE (lower tiers trim harder). Also verifies the
 * anti-bloat itself: tracking params stripped from URLs and long URLs/notes truncated.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

// --- Generate a generous dummy datapack so the per-tier limits actually bite ---
const CARD_COUNT = 110;                       // > full cardLimit(120)? -> keep under to compare counts; >deep(80) to separate deep/full
const LONG_NOTE = ('This is an intentionally long note describing the card in detail. ').repeat(12); // ~780 chars
function trackedUrl(i) {
    // long path + every common tracking param + a giant junk query value
    return 'https://example.test/library/series/' + i + '/chapter/long-slug-segment-here'
        + '?utm_source=newsletter&utm_medium=email&utm_campaign=spring2026&utm_term=foo'
        + '&utm_content=bar&fbclid=IwAR' + 'z'.repeat(40) + '&gclid=' + 'q'.repeat(40)
        + '&ref=' + 'x'.repeat(120) + '&id=' + i;
}
function makeLinks(n) {
    const links = [];
    for (let i = 0; i < n; i += 1) {
        links.push({
            id: 'k' + i,
            title: 'Card ' + i + ' — ' + 'TitleWord '.repeat(4),
            url: trackedUrl(i),
            workspace: 'main',
            category: 'Test',
            notes: 'Card ' + i + ': ' + LONG_NOTE,
            tags: Array.from({ length: 18 }, (_, t) => 'tag' + t),
            genre: Array.from({ length: 18 }, (_, g) => 'genre' + g),
            relatedUrls: Array.from({ length: 8 }, (_, r) => ({ url: 'https://mirror' + r + '.test/' + i + '?utm_source=x&ref=' + 'y'.repeat(60) })),
            priority: 'High',
            chapter: String(i),
            identifiers: ['listening']
        });
    }
    return links;
}

const context = {
    console, Date, JSON, URLSearchParams, URL,
    WebSocket: { OPEN: 1 },
    navigator: {},
    window: {
        EveDataStore: {
            _modularSync: {
                sharedReady: true, engineReady: true,
                isHttpContext: () => false,
                getStore: () => ({
                    captureState: () => ({
                        metadata: { version: 1 },
                        bookmarks: {
                            config: {
                                activeWorkspace: 'main',
                                workspaces: [{ id: 'main', name: 'Main', subTabs: [] }],
                                bookmarkIdentifiers: [{ id: 'listening', label: 'Listening', description: 'Audio marker' }]
                            },
                            links: makeLinks(CARD_COUNT),
                            folders: {},
                            pins: []
                        },
                        library: { categories: {}, connections: [] }
                    })
                }),
                requestJson: async () => { throw new Error('Failed to fetch'); }
            }
        },
        config: { activeWorkspace: 'main', workspaces: [{ id: 'main', name: 'Main', subTabs: [] }] },
        displayMessage() {}
    }
};
context.window.window = context.window;

function runScript(relativePath) {
    vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), context, { filename: relativePath });
}
function assert(condition, message) { if (!condition) throw new Error('ASSERT FAILED: ' + message); }

(function main() {
    runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.local.shared.js');
    runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.local.scope.js');
    runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.local.bookmarks.js');
    runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.local.nexus.js');
    runScript('js/modules/features/modular-state-sync/modular-state-sync.api.context.local.js');
    const api = context.window.EveDataStore._modularSync;

    const scope = { scope: 'workspace', workspaceId: 'main', workspaceIds: ['main'], categoryName: '', label: 'Main' };
    const tiers = ['brief', 'summary', 'deep', 'full'];
    const out = {};
    tiers.forEach((tier) => {
        const r = api.buildLocalGeminiContext(tier, 200, { scope });
        assert(r && r.ok, tier + ' build failed');
        out[tier] = r.contextText || '';
    });

    const len = (t) => out[t].length;
    console.log('tier char counts:', tiers.map((t) => t + '=' + len(t)).join('  '));

    // 1) Distinct + strictly increasing (anti-bloat scales: lower tiers are smaller)
    assert(len('brief') < len('summary'), 'brief should be smaller than summary');
    assert(len('summary') < len('deep'), 'summary should be smaller than deep');
    assert(len('deep') < len('full'), 'deep should be smaller than full');

    // 2) Not token-equivalent — brief must be MUCH leaner than full
    assert(len('brief') < len('full') * 0.7, 'brief should be substantially leaner than full (real anti-bloat)');

    // 3) Anti-bloat: tracking params stripped from URLs in EVERY tier
    tiers.forEach((tier) => {
        ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'].forEach((param) => {
            assert(!out[tier].includes(param), tier + ' leaked tracking param ' + param);
        });
    });

    // 4) Anti-bloat scales on URLs: the junk 120-char "ref=xxxx" must be truncated; lower tiers
    //    truncate URLs harder than higher tiers (urlLimit 132 < 160 < 180 < 190).
    assert(!out.brief.includes('x'.repeat(120)), 'brief should truncate the long URL junk');
    assert(!out.full.includes('x'.repeat(120)), 'full should also truncate the long URL junk');
    const maxUrlLen = (t) => out[t].split('"').filter((s) => s.startsWith('http')).reduce((m, s) => Math.max(m, s.length), 0);
    assert(maxUrlLen('brief') <= maxUrlLen('full'), 'brief URLs should be trimmed at least as hard as full');

    // 5) Anti-bloat scales on notes/fields: the longest JSON string value (e.g. a note) is
    //    truncated harder in brief than full (noteLimit 120 vs 520). Uses quoted-string length so
    //    it is format-agnostic (compact vs pretty-printed JSON have identical string values).
    const maxStringValue = (t) => (out[t].match(/"(?:[^"\\]|\\.)*"/g) || []).reduce((m, s) => Math.max(m, s.length), 0);
    assert(maxStringValue('brief') < maxStringValue('full'), 'brief should truncate long field values harder than full');

    console.log('GEMINI_CONTEXT_DETAIL_TIERS_SMOKE_OK');
})();
