const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function readModule(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

function createSnapshot(overrides = {}) {
    return {
        links: [
            {
                id: 'b_reading',
                title: 'Reading Bookmark',
                url: overrides.readingUrl || 'https://example.test/old',
                workspace: 'main',
                category: 'Reading',
                folderId: 'f_queue',
                notes: overrides.readingNotes || 'old note'
            },
            {
                id: 'b_other',
                title: 'Other Bookmark',
                url: 'https://example.test/other',
                workspace: 'main',
                category: 'Other'
            }
        ],
        bookmarkFolders: {
            'main::Reading': {
                nodes: [{ id: 'f_queue', name: overrides.folderName || 'Queue', parentId: '' }]
            },
            'main::Other': {
                nodes: [{ id: 'f_other', name: 'Other Folder', parentId: '' }]
            }
        },
        quickPins: overrides.quickPins || [
            { targetType: 'bookmark', targetId: 'b_reading', scope: 'main' }
        ],
        constellationDetachedChains: {}
    };
}

function createContext() {
    const localStorage = createLocalStorage();
    const before = createSnapshot();
    const elements = new Map([
        ['editHistoryResults', { innerHTML: '' }],
        ['editHistoryLayerLabel', { textContent: '' }],
        ['backupSettingsMode', { value: 'bookmark' }]
    ]);
    const config = {
        workspaces: [
            { id: 'main', name: 'Main', icon: 'home', subTabs: [] },
            { id: 'archive', name: 'Archive', icon: 'folder', subTabs: [] }
        ]
    };
    const windowObject = {
        EveEditHistory: {},
        EveCoreStorage: {
            async saveJson(key, value) {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            },
            async loadJson(key, fallback) {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            }
        },
        eveState: {
            links: clone(before.links),
            bookmarkFolders: clone(before.bookmarkFolders),
            quickPins: clone(before.quickPins),
            constellationDetachedChains: {},
            config: clone(config)
        },
        links: clone(before.links),
        bookmarkFolders: clone(before.bookmarkFolders),
        quickPins: clone(before.quickPins),
        config: clone(config),
        EveFolderViewV2: {
            invalidateAllCachedViewModels() {
                windowObject.__folderInvalidated = true;
            }
        },
        EveQuickPins: {
            _core: {
                setRawStore(nextPins) {
                    windowObject.quickPins = clone(nextPins);
                    windowObject.eveState.quickPins = clone(nextPins);
                }
            }
        },
        showToast() {},
        renderSidebar() {
            windowObject.__sidebarRendered = true;
        },
        renderDashboard() {
            windowObject.__dashboardRendered = true;
        }
    };
    const document = {
        getElementById(id) {
            return elements.get(id) || null;
        }
    };
    windowObject.window = windowObject;
    windowObject.document = document;
    const context = {
        console,
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
        clearTimeout,
        localStorage,
        document,
        window: windowObject,
        eveState: windowObject.eveState,
        links: windowObject.eveState.links,
        bookmarkFolders: windowObject.eveState.bookmarkFolders,
        quickPins: windowObject.eveState.quickPins,
        config: windowObject.eveState.config,
        EveCoreStorage: windowObject.EveCoreStorage,
        saveData(options = {}) {
            windowObject.__lastSaveDataOptions = options;
            return Promise.resolve(true);
        },
        saveConfig(options = {}) {
            windowObject.__lastSaveConfigOptions = options;
            return Promise.resolve(true);
        },
        renderSidebar: windowObject.renderSidebar,
        renderDashboard: windowObject.renderDashboard,
        showToast: windowObject.showToast
    };
    windowObject.saveData = context.saveData;
    windowObject.saveConfig = context.saveConfig;
    windowObject.renderSidebar = context.renderSidebar;
    windowObject.renderDashboard = context.renderDashboard;
    windowObject.showToast = context.showToast;
    context.window.localStorage = localStorage;
    context.window.globalThis = context.window;
    context.globalThis = context;
    context.self = context.window;
    context.__elements = elements;
    return vm.createContext(context);
}

async function main() {
    const context = createContext();
    [
        'js/modules/core/storage.delta.js',
        'js/modules/features/edit-history/edit-history.core.js',
        'js/modules/features/edit-history/edit-history.config.js',
        'js/modules/features/edit-history/edit-history.restore.js',
        'js/modules/features/edit-history/edit-history.ui.js'
    ].forEach((relativePath) => {
        vm.runInContext(readModule(relativePath), context, { filename: relativePath });
    });
    await Promise.resolve();

    const before = createSnapshot();
    const after = createSnapshot({ readingUrl: 'https://example.test/new', readingNotes: 'new note' });
    const delta = context.buildCoreDataDelta(before, after);
    const api = context.window.EveEditHistory;

    api.recordDataMutation({ before, after, delta, source: 'bookmark-edit', meta: { reason: 'smoke' } });
    const layers = new Set(api.getEntries().map((entry) => entry.scope.layer));
    assert(layers.has('datapack'), 'Datapack history should be captured.');
    assert(layers.has('workspace'), 'Workspace history should be captured.');
    assert(layers.has('card'), 'Card history should be captured.');
    assert(layers.has('folder'), 'Folder history should be captured from bookmark folder scope.');
    assert(layers.has('bookmark'), 'Bookmark history should be captured.');
    assert(!api.getEntries({ layer: 'card' }).some((entry) => entry.scope.key === 'main::Other'), 'Unchanged cards should not receive card history.');
    assert(api.renderPanel(), 'Edit history UI should render into the settings panel target.');
    assert(context.__elements.get('editHistoryResults').innerHTML.includes('Restore This Layer'), 'Rendered edit history UI should expose restore controls.');

    for (let index = 0; index < 6; index += 1) {
        const prev = createSnapshot({ readingUrl: `https://example.test/${index}` });
        const next = createSnapshot({ readingUrl: `https://example.test/${index + 1}` });
        api.recordDataMutation({
            before: prev,
            after: next,
            delta: context.buildCoreDataDelta(prev, next),
            source: `bookmark-edit-${index}`
        });
    }
    assert(api.getEntries({ layer: 'bookmark' }).filter((entry) => entry.scope.key === 'b_reading').length === 5, 'Bookmark history should cap at 5 entries per scope.');

    const folderBefore = createSnapshot({ folderName: 'Queue' });
    const folderAfter = createSnapshot({ folderName: 'Queue Renamed' });
    const folderDelta = context.buildCoreDataDelta(folderBefore, folderAfter);
    assert(folderDelta.affectedScopes.some((scope) => scope.workspaceId === 'main' && scope.categoryName === 'Reading'), 'Folder rename should mark the card scope.');
    assert(folderDelta.folderIds.includes('f_queue'), 'Folder rename should mark the exact folder id.');

    const pinBefore = createSnapshot({ quickPins: [] });
    const pinAfter = createSnapshot({ quickPins: [{ targetType: 'bookmark', targetId: 'b_reading', scope: 'main' }] });
    const pinDelta = context.buildCoreDataDelta(pinBefore, pinAfter);
    assert(pinDelta.linkIds.includes('b_reading'), 'Quick-pin change should mark the pinned bookmark.');
    assert(pinDelta.affectedScopes.some((scope) => scope.workspaceId === 'main' && scope.categoryName === 'Reading'), 'Quick-pin change should mark the bookmark card scope.');

    context.window.eveState.links = clone(after.links);
    context.window.links = context.window.eveState.links;
    context.links = context.window.eveState.links;
    const restoreEntry = api.getEntries({ layer: 'bookmark' }).find((entry) => entry.scope.key === 'b_reading');
    const result = await api.restoreEntry(restoreEntry);
    assert(result.ok, `Bookmark restore should succeed: ${JSON.stringify(result)}`);
    assert(context.window.eveState.links.find((link) => link.id === 'b_reading').url === restoreEntry.before.link.url, 'Bookmark restore should return the scoped bookmark to its previous URL.');
    assert(context.window.__lastSaveDataOptions?.meta?.skipEditHistory, 'Restore should persist without recursively recording history.');

    const configBefore = {
        workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }]
    };
    const configAfter = {
        workspaces: [{ id: 'main', name: 'Renamed Main', icon: 'home', subTabs: [] }]
    };
    const configDelta = context.buildConfigDelta(configBefore, configAfter);
    api.recordConfigMutation({ before: configBefore, after: configAfter, delta: configDelta, source: 'tab-settings' });
    const workspaceConfigEntry = api.getEntries({ layer: 'workspace' }).find((entry) => entry.mutationKind === 'config' && entry.scope.key === 'main');
    assert(workspaceConfigEntry, 'Workspace config history should be captured.');
    context.window.eveState.config = clone(configAfter);
    context.window.config = context.window.eveState.config;
    context.config = context.window.eveState.config;
    const configRestore = await api.restoreEntry(workspaceConfigEntry);
    assert(configRestore.ok, `Workspace config restore should succeed: ${JSON.stringify(configRestore)}`);
    assert(context.window.eveState.config.workspaces[0].name === 'Main', 'Workspace config restore should revert the tab name.');
    assert(context.window.__lastSaveConfigOptions?.meta?.skipEditHistory, 'Config restore should persist without recursively recording history.');

    const cardConfigBefore = {
        workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
        cardDescriptions: { 'main::Reading': 'Old card description' },
        folderBookmarkProgressiveReveal: { 'main::Reading::f_queue': 'on' },
        categoryOrderByWorkspace: { main: ['Reading', 'Other'] }
    };
    const cardConfigAfter = {
        workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
        cardDescriptions: { 'main::Reading': 'New card description' },
        folderBookmarkProgressiveReveal: { 'main::Reading::f_queue': 'off' },
        categoryOrderByWorkspace: { main: ['Other', 'Reading'] }
    };
    api.recordConfigMutation({
        before: cardConfigBefore,
        after: cardConfigAfter,
        delta: context.buildConfigDelta(cardConfigBefore, cardConfigAfter),
        source: 'card-settings'
    });
    const cardConfigEntry = api.getEntries({ layer: 'card' }).find((entry) => entry.mutationKind === 'config' && entry.scope.key === 'main::Reading');
    const folderConfigEntry = api.getEntries({ layer: 'folder' }).find((entry) => entry.mutationKind === 'config' && entry.scope.key === 'main::Reading::f_queue');
    assert(cardConfigEntry, 'Card config history should be captured for card description/order changes.');
    assert(folderConfigEntry, 'Folder config history should be captured for folder reveal changes.');

    context.window.eveState.config = clone(cardConfigAfter);
    context.window.config = context.window.eveState.config;
    context.config = context.window.eveState.config;
    const cardConfigRestore = await api.restoreEntry(cardConfigEntry);
    assert(cardConfigRestore.ok, `Card config restore should succeed: ${JSON.stringify(cardConfigRestore)}`);
    assert(context.window.eveState.config.cardDescriptions['main::Reading'] === 'Old card description', 'Card config restore should revert the card description.');
    assert(context.window.eveState.config.categoryOrderByWorkspace.main[0] === 'Reading', 'Card config restore should revert card order.');

    context.window.eveState.config = clone(cardConfigAfter);
    context.window.config = context.window.eveState.config;
    context.config = context.window.eveState.config;
    const folderConfigRestore = await api.restoreEntry(folderConfigEntry);
    assert(folderConfigRestore.ok, `Folder config restore should succeed: ${JSON.stringify(folderConfigRestore)}`);
    assert(context.window.eveState.config.folderBookmarkProgressiveReveal['main::Reading::f_queue'] === 'on', 'Folder config restore should revert folder reveal mode.');

    console.log('EDIT_HISTORY_SCOPED_SMOKE_OK');
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
