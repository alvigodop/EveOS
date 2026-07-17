// Deep-nesting payload smoke for the browser-side context builders.
//
// Generates a deterministic deep datapack (deep main tabs, decoy cards/bookmarks at every
// level, ONE needle bookmark at sub^9 in one branch) and drives the real builders with no
// sends: (a) the selective "Bookmarks & Folders + Contents + Sub^N" layer must carry the
// needle with its identifiers/notes/library data, the "This Tab" variant must exclude it;
// (b) the browser-local relay fallback must carry the needle card with tab attribution and
// no silent truncation of the deep branch.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..', '..');
const NEEDLE_ID = 'NEEDLE-deep-vault';
const NEEDLE_TITLE = 'Sunken Cathedral Chapter Tracker';
const MAX_DEPTH = 9;

// Deterministic generator (fixed breadths — no randomness needed).
let counter = 0;
const oid = (prefix) => `${prefix}_${++counter}`;
const links = [];
const bookmarkFolders = {};
let needleWorkspaceId = null;
let needleMainId = null;
let maxDepth = 0;

function addDecoys(wsId, count) {
    for (let c = 0; c < count; c += 1) {
        const card = `Decoy Set ${String.fromCharCode(65 + c)}`;
        for (let b = 0; b <= c % 2; b += 1) {
            links.push({
                id: oid('lnk'),
                title: `Decoy Item ${counter}`,
                url: `https://decoy.example/${counter}`,
                workspace: wsId,
                category: card
            });
        }
    }
}

function buildChain(parent, depth, onPath, decoyCap) {
    maxDepth = Math.max(maxDepth, depth);
    addDecoys(parent.id, 1 + (depth % 3));
    if (onPath && depth >= MAX_DEPTH) {
        needleWorkspaceId = parent.id;
        bookmarkFolders[`${parent.id}::Vault`] = {
            nodes: [
                { id: 'arc-outer', name: 'Outer Arc', parentId: '' },
                { id: 'arc-inner', name: 'Inner Arc', parentId: 'arc-outer' }
            ]
        };
        links.push({
            id: NEEDLE_ID,
            title: NEEDLE_TITLE,
            url: 'https://reader.example/sunken-cathedral/ch/318',
            workspace: parent.id,
            category: 'Vault',
            folderId: 'arc-inner',
            identifierIds: ['reading'],
            status: 'Actively Reading',
            chapter: 318,
            personalNotes: 'The one bookmark we must retrieve from the depths.',
            tags: ['deep', 'vault']
        });
        return;
    }
    if (!onPath && depth >= decoyCap) return;
    const nChildren = 2 + (depth % 2);
    const needleChild = onPath ? depth % nChildren : -1;
    for (let i = 0; i < nChildren; i += 1) {
        const child = { id: oid('ws'), name: `Layer ${depth + 1} Node ${i + 1}`, subTabs: [] };
        parent.subTabs.push(child);
        buildChain(child, depth + 1, onPath && i === needleChild, decoyCap);
    }
}

const workspaces = [];
for (let m = 0; m < 6; m += 1) {
    const main = { id: oid('main'), name: `Main Tab ${m + 1}`, subTabs: [] };
    workspaces.push(main);
    const onPath = m === 3;
    if (onPath) needleMainId = main.id;
    buildChain(main, 0, onPath, 3);
}

const config = {
    activeWorkspace: needleMainId,
    geminiLiveLinkEnabled: true,
    bookmarkIdentifiers: [{ id: 'reading', label: 'Reading' }],
    workspaces
};

function branchIds(rootId) {
    function find(nodes) {
        for (const node of nodes) {
            if (node.id === rootId) return node;
            const hit = find(node.subTabs || []);
            if (hit) return hit;
        }
        return null;
    }
    const ids = new Set([rootId]);
    (function visit(node) {
        (node.subTabs || []).forEach((child) => {
            if (!child.id || child.hiddenInParent || child.inactive === true) return;
            ids.add(child.id);
            if (!child.hideSubTabs) visit(child);
        });
    })(find(workspaces) || {});
    return Array.from(ids);
}
const ids = branchIds(needleMainId);

function makeContext() {
    const context = {
        console, Date, JSON, URL, URLSearchParams,
        WebSocket: { OPEN: 1 },
        navigator: {},
        setTimeout, clearTimeout,
        window: {
            config,
            eveState: { config, links, bookmarkFolders },
            EveLibrary: {
                ConnectionsAPI: {
                    getLinkedEntry(id) {
                        if (id !== NEEDLE_ID) return null;
                        return { entry: { status: 'Reading', author: 'A. Deep', rating: 9, summary: 'A story retrieved from sub^9.', genres: ['Mystery'], tags: ['library'] } };
                    }
                }
            },
            EveDataStore: {
                _modularSync: {
                    apiContextReady: true,
                    getCurrentGeminiContextScope() {
                        return { scope: 'workspace', workspaceId: needleMainId, workspaceIds: ids, label: 'deep branch', source: 'active-workspace' };
                    },
                    describeWorkspaceTabPath(id) { return 'tab ' + id; }
                }
            }
        }
    };
    context.window.window = context.window;
    return vm.createContext(context);
}

function run(context, rel) {
    vm.runInContext(fs.readFileSync(path.join(repo, rel), 'utf8'), context, { filename: rel });
}

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

assert(maxDepth >= MAX_DEPTH, 'generator should reach sub^9');
assert(ids.length > 20, 'needle branch should span many tabs');

// (a) selective contents chain
{
    const ctx = makeContext();
    run(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.names.bookmarks.js');
    run(ctx, 'js/modules/features/modular-state-sync/modular-state-sync.api.context.names.js');
    const api = ctx.window.EveDataStore._modularSync;

    const chain = api.buildSelectiveContext('bookmark-contents');
    assert(chain.message.includes(NEEDLE_TITLE), 'needle missing from selective contents chain payload');
    assert(chain.message.includes('chapter: 318'), 'needle chapter progress missing from contents chain');
    assert(chain.message.includes('library-linked') && chain.message.includes('author: A. Deep'), 'needle library data missing from contents chain');
    assert(chain.message.includes('[folder] Inner Arc:'), 'needle nested folder tree missing from contents chain');

    const current = api.buildSelectiveContext('bookmark-contents-current');
    assert(!current.message.includes(NEEDLE_TITLE), 'needle leaked into the This-Tab-only contents variant');
}

// (b) browser-local relay fallback
{
    const ctx = makeContext();
    [
        'js/modules/features/modular-state-sync/modular-state-sync.api.context.local.shared.js',
        'js/modules/features/modular-state-sync/modular-state-sync.api.context.local.scope.js',
        'js/modules/features/modular-state-sync/modular-state-sync.api.context.local.bookmarks.js',
        'js/modules/features/modular-state-sync/modular-state-sync.api.context.local.nexus.js',
        'js/modules/features/modular-state-sync/modular-state-sync.api.context.local.js'
    ].forEach((rel) => run(ctx, rel));
    const api = ctx.window.EveDataStore._modularSync;

    const built = api.buildLocalGeminiContext('full', 200, { scope: { scope: 'workspace', workspaceId: needleMainId, workspaceIds: ids } });
    assert(built.ok, 'local builder failed to produce a payload');
    assert(built.contextText.includes(NEEDLE_TITLE), 'needle missing from local relay payload');
    const cards = built.payload?.structuredScope?.cards || [];
    const vault = cards.find((card) => card.scopedKey === `${needleWorkspaceId}::Vault`);
    assert(!!vault, 'deep Vault card missing from local structuredScope');
    assert(!!vault.tabName, 'deep card lost its owning-tab attribution in local payload');

    console.log(`GEMINI_DEEP_NESTING_PAYLOAD_SMOKE_JS_OK (branch=${ids.length}, depth=sub^${maxDepth}, cards=${cards.length}, chars=${built.contextText.length})`);
}
