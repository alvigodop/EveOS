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

async function testUnidexControlsState() {
    const metrics = {
        saves: 0,
        renders: 0
    };
    const confidenceMap = new Map([
        ['linked-low', 0.2],
        ['linked-high', 0.9]
    ]);
    const context = createContext({
        config: {},
        saveConfig() { metrics.saves += 1; },
        renderDashboard() { metrics.renders += 1; }
    });

    loadModules(context, [
        'js/modules/ui/dashboard/unidex-view.controls.state.config.js',
        'js/modules/ui/dashboard/unidex-view.controls.state.transforms.js',
        'js/modules/ui/dashboard/unidex-view.controls.state.js'
    ]);

    const factory = context.window.UnidexViewModules.createControlsState;
    assert(typeof factory === 'function', 'createControlsState should exist');

    const controls = factory({
        readConfig: () => context.config,
        persistConfig: context.saveConfig,
        requestRender: context.renderDashboard,
        getLinkedLibraryEntry: (id) => confidenceMap.has(id) ? { id } : null,
        getEntryConfidence: (entry) => confidenceMap.get(entry.id)
    });

    controls.setEntriesLayoutMode('grid');
    assert(context.config.unidexEntriesLayout === 'grid', 'layout mode should persist through injected config access');
    controls.toggleEntriesLayout();
    assert(context.config.unidexEntriesLayout === 'rows', 'layout toggle should update config');
    assert(metrics.saves >= 2, 'config saves should be triggered');
    assert(metrics.renders >= 1, 'render callback should be triggered');

    controls.setEntriesSortOrder('desc');
    const transformed = controls.applyEntriesViewTransforms(
        [{ id: 'linked-low' }, { id: 'linked-high' }, { id: 'bookmark-only' }],
        'linked'
    );
    assert(transformed.length === 2, 'linked filter should keep linked entries only');
    assert(transformed[0].id === 'linked-high', 'confidence sort should order linked entries');
}

async function testUnidexCoreAdapters() {
    const state = {
        stage: 'tabs',
        selectedWorkspaceId: '',
        selectedCategory: ''
    };
    const metrics = {
        renders: 0,
        switched: [],
        opened: [],
        dashboardOpenCalls: 0,
        resets: 0
    };
    const context = createContext({
        config: { activeWorkspace: 'main' }
    });

    loadModules(context, [
        'js/modules/ui/dashboard/unidex-view.core.navigation.js',
        'js/modules/ui/dashboard/unidex-view.core.actions.js'
    ]);

    const navigation = context.window.UnidexViewModules.createCoreNavigation({
        state,
        helpers: {
            decodeParam: (value) => value,
            resetLibraryReadyWait: () => { metrics.resets += 1; }
        },
        stages: {
            resetSelection: () => { metrics.resets += 1; }
        },
        getActiveWorkspaceId: () => context.config.activeWorkspace,
        switchWorkspaceById: (workspaceId) => metrics.switched.push(workspaceId),
        requestRender: () => { metrics.renders += 1; }
    });

    navigation.switchWorkspaceTab('alt');
    assert(metrics.switched[0] === 'alt', 'navigation should use injected workspace switcher');
    context.config.activeWorkspace = 'alt';
    navigation.switchWorkspaceTab('alt');
    assert(metrics.renders === 1, 'navigation should render when already on active workspace');
    navigation.selectCategory('media');
    navigation.backToCards();
    navigation.backToTabs();
    assert(metrics.renders >= 3, 'navigation should use injected render callback for transitions');
    assert(metrics.resets >= 2, 'navigation reset hooks should run');

    const actions = context.window.UnidexViewModules.createCoreEntryActions({
        helpers: {
            decodeParam: (value) => value,
            getAllLinks: () => [{ id: '1', url: 'https://example.com' }]
        },
        openFromDashboard: (event, id) => {
            metrics.dashboardOpenCalls += 1;
            return `dashboard:${id}`;
        },
        normalizeEntryUrl: (url) => `normalized:${url}`,
        openUrl: (url) => metrics.opened.push(url)
    });

    const directOnly = context.window.UnidexViewModules.createCoreEntryActions({
        helpers: {
            decodeParam: (value) => value,
            getAllLinks: () => [{ id: '2', url: 'https://second.example.com' }]
        },
        normalizeEntryUrl: (url) => `normalized:${url}`,
        openUrl: (url) => metrics.opened.push(url)
    });

    assert(actions.openEntry('1', {}) === 'dashboard:1', 'entry actions should delegate through injected dashboard opener');
    directOnly.openEntryDirect('2', {});
    assert(metrics.dashboardOpenCalls === 1, 'dashboard opener should only run when injected');
    assert(metrics.opened[0] === 'normalized:https://second.example.com', 'entry actions should use injected url normalizer/open handler');
}

async function testLibraryWorkflowHelpers() {
    const metrics = {
        renderedEntries: 0,
        statsRendered: 0,
        optionsUpdated: 0,
        deleted: null,
        toggledFavorite: null,
        pagedTo: null,
        exported: null,
        imported: false,
        batchDeleted: null,
        opened: [],
        notifications: [],
        refreshes: 0,
        filledEntry: null
    };
    const listeners = {};
    const docElements = {};

    function makePanel(id) {
        return {
            id,
            innerHTML: '',
            style: { display: 'block' },
            closest() {
                return {
                    classList: {
                        contains() { return true; },
                        toggle() {}
                    }
                };
            }
        };
    }

    docElements['books-panel'] = makePanel('books-panel');
    docElements['books-search-rating-scale'] = { value: '' };
    docElements['books-entries'] = { id: 'books-entries' };
    docElements['books-stats-view'] = { id: 'books-stats-view', style: { display: 'block' }, innerHTML: '' };
    docElements['books-entries-view'] = { id: 'books-entries-view', style: { display: 'block' } };

    const documentStub = {
        getElementById(id) {
            return docElements[id] || null;
        },
        querySelectorAll() {
            return [];
        }
    };

    const context = createContext({
        document: documentStub,
        window: {
            console,
            location: { reload() {} },
            addEventListener(eventName, handler) {
                listeners[eventName] = handler;
            },
            open(url) {
                metrics.opened.push(url);
            }
        }
    });
    context.window.EveLibrary = context.window.EveLibrary || {};

    loadModules(context, [
        'js/modules/features/library/library-ui.panels.workflow.panel.js',
        'js/modules/features/library/library-ui.panels.workflow.actions.js',
        'js/modules/features/library/library-ui.panels.workflow.js'
    ]);

    const helpers = context.window.EveLibrary.UIModules.createPanelWorkflowHelpers({
        state: {
            currentEditingCategory: 'Books',
            currentEditingEntryId: '42'
        },
        State: {
            getConfig: () => ({ activeScale: 'ten' }),
            setPage: (categoryName, page) => { metrics.pagedTo = [categoryName, page]; },
            getCurrentWorkspaceId: () => 'main'
        },
        Storage: {
            exportCategoryLibrary: (categoryName) => { metrics.exported = categoryName; },
            importCategoryLibrary: (categoryName, file, done) => {
                metrics.imported = true;
                done(true);
            },
            saveLibrary() {}
        },
        EntryManager: {
            deleteEntry: (categoryName, entryId, done) => {
                metrics.deleted = [categoryName, entryId];
                done();
            },
            toggleFavorite: (categoryName, entryId, done) => {
                metrics.toggledFavorite = [categoryName, entryId];
                done();
            },
            batchDelete: (categoryName, ids, done) => {
                metrics.batchDeleted = [categoryName, ids.slice()];
                done();
            }
        },
        EntriesRenderer: {
            renderEntries() {
                metrics.renderedEntries += 1;
            }
        },
        OptionsUpdaters: {
            updateStatusOptions() { metrics.optionsUpdated += 1; },
            updateGenreOptions() { metrics.optionsUpdated += 1; },
            updateSortByOptions() { metrics.optionsUpdated += 1; },
            updateFieldsVisibility() { metrics.optionsUpdated += 1; }
        },
        StatsRenderer: {
            renderStats() { metrics.statsRendered += 1; }
        },
        Search: {
            resetFilters() {}
        },
        Shared: {
            createLibraryPanelHtml: (categoryName) => `<div>${categoryName}</div>`
        },
        forms: {
            getPrefix: () => 'books-',
            fillForm: (categoryName, entry) => { metrics.filledEntry = [categoryName, entry.id]; }
        },
        getRatingsApi: () => ({
            getActiveScale: () => 'ten'
        }),
        getDocument: () => documentStub,
        confirmAsync: async () => true,
        confirmSync: () => true,
        notify: (message, type) => { metrics.notifications.push([message, type]); },
        queryAll: () => [
            { getAttribute: () => 'a' },
            { getAttribute: () => 'b' }
        ],
        openUrl: (url) => { metrics.opened.push(url); },
        addWindowListener: (eventName, handler) => { listeners[eventName] = handler; },
        getActiveWorkspaceId: () => 'main'
    });

    helpers.initLibraryPanel('Books');
    assert(docElements['books-panel'].innerHTML.includes('Books'), 'panel workflow should build panel html');
    assert(metrics.renderedEntries >= 1, 'panel workflow should render entries');
    assert(metrics.optionsUpdated >= 4, 'panel workflow should update panel options');

    await helpers.confirmDeleteEntry('Books', '42');
    helpers.toggleFavorite('Books', '42');
    helpers.goToPage('Books', 3);
    helpers.exportLibrary('Books');
    helpers.importLibrary('Books', {});
    helpers.batchDelete('Books');
    helpers.openEntryLink('https://open.example.com');
    helpers.bindRealtimeUpdates();

    listeners['eve:library-link-updated']({
        detail: {
            categoryName: 'Books',
            workspaceId: 'main',
            entry: { id: '42' }
        }
    });

    assert(metrics.deleted[1] === '42', 'workflow actions should use injected delete path');
    assert(metrics.toggledFavorite[1] === '42', 'workflow actions should use injected toggle path');
    assert(metrics.pagedTo[1] === 3, 'workflow actions should update page state');
    assert(metrics.exported === 'Books', 'workflow actions should export through injected storage');
    assert(metrics.imported === true, 'workflow actions should import through injected storage');
    assert(metrics.batchDeleted[1].length === 2, 'workflow actions should batch delete selected ids');
    assert(metrics.opened[0] === 'https://open.example.com', 'workflow actions should use injected url opener');
    assert(metrics.notifications.some((entry) => entry[1] === 'success'), 'workflow actions should notify through injected notifier');
    assert(metrics.filledEntry[1] === '42', 'workflow realtime binding should flow through injected form handler');
}

async function testSettingsBrowserHelpers() {
    const context = createContext({
        eveState: {
            links: [
                { id: 'bookmark-1', title: 'Title A', category: 'Main' }
            ]
        }
    });

    loadModules(context, [
        'js/modules/modals/modal-settings.modular.browser.helpers.files.js',
        'js/modules/modals/modal-settings.modular.browser.helpers.normalize.js',
        'js/modules/modals/modal-settings.modular.browser.helpers.js'
    ]);

    const helpers = context.window.EveSettingsModularBrowserHelpers;
    assert(typeof helpers.buildBrowserBookmarkFilename === 'function', 'browser helper namespace should expose filename builder');
    assert(typeof helpers.normalizeBookmarkFilesInDirectory === 'function', 'browser helper namespace should expose normalize function');

    const filename = helpers.buildBrowserBookmarkFilename(
        { id: 'id:1', title: 'A/B:C*D' },
        'Main Browser'
    );
    assert(filename.endsWith('.json'), 'browser helper filename should keep json suffix');
    assert(!/[<>:"/\\|?*]/.test(filename), 'browser helper filename should sanitize invalid path characters');

    const liveMap = helpers.buildLiveBookmarkMap();
    const payload = helpers.applyLiveBookmarkToPayload(
        { bookmark: { id: 'bookmark-1', title: 'Old' } },
        { id: 'bookmark-1', title: 'Old' },
        liveMap.get('bookmark-1'),
        'bookmark-1'
    );
    assert(payload.contentChanged === true, 'browser helper payload sync should detect changed bookmark content');
}

async function testDataTransferImportFacades() {
    let appliedState = null;
    const context = createContext();
    context.window.EveDataTransfer = {
        sharedReady: true,
        exportReady: true,
        importParseFsReady: true,
        getWorkspaceMeta: (workspaceId) => ({
            name: workspaceId.toUpperCase(),
            icon: 'folder'
        }),
        slugifyFolderSegment: (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '-'),
        getDataStore: () => ({
            applyState(state) {
                appliedState = state;
                return true;
            }
        }),
        getAppConfig: () => ({ activeWorkspace: 'main' }),
        getWorkspaceSelect: () => ({ value: 'main' }),
        getCardWorkspaceSelect: () => ({ value: 'main' }),
        getCardCategorySelect: () => ({ value: 'Main' }),
        resolveTabFoldersFromRoot: async () => [],
        resolveCardFoldersFromRoot: async () => [],
        parseTabFolderHandle: async () => ({}),
        parseCardFolderHandle: async () => ({}),
        parseFullStateFromFolder: async () => ({}),
        buildUnifiedStateFromParsed: () => ({}),
        summarizeStateCounts: (state) => ({
            tabs: 1,
            cards: 1,
            bookmarks: Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links.length : 0
        })
    };
    context.showConfirm = async () => true;
    context.window.showDirectoryPicker = async () => ({ name: 'root' });

    loadModules(context, [
        'js/modules/features/data-transfer/data-transfer.folder-import.state.infer.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.build.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.state.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.parse.handles.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.parse.root.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.parse.js'
    ]);

    context.window.EveDataTransfer.parseAnyDataPackFolder = async () => ({
        state: {
            bookmarks: {
                links: [{ id: 'bookmark-1', workspace: 'main', category: 'Main' }]
            },
            library: {
                categories: {},
                connections: []
            }
        },
        sourceType: 'store'
    });

    loadModules(context, [
        'js/modules/features/data-transfer/data-transfer.folder-import.activate.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.restore.js',
        'js/modules/features/data-transfer/data-transfer.folder-import.js'
    ]);

    const ns = context.window.EveDataTransfer;
    assert(ns.importParseStateReady === true, 'data transfer state helpers should initialize');
    assert(ns.importReady === true, 'data transfer import facade should initialize');

    const groupedTabs = ns.buildParsedTabsFromCards([
        { workspaceId: 'main', categoryName: 'Main', links: [] },
        { workspaceId: 'alt', categoryName: 'Other', links: [] }
    ]);
    assert(groupedTabs.length === 2, 'data transfer state helpers should group cards by workspace');

    const activation = await ns.activateDataPackFolderFromPicker({ confirmTwice: true });
    assert(activation.ok === true, 'data transfer activate facade should apply parsed state');
    assert(appliedState && appliedState.bookmarks.links.length === 1, 'data transfer activate facade should pass state to the data store');
}

(async function main() {
    const tests = [
        ['unidex controls state', testUnidexControlsState],
        ['unidex core adapters', testUnidexCoreAdapters],
        ['library workflow helpers', testLibraryWorkflowHelpers],
        ['settings browser helpers', testSettingsBrowserHelpers],
        ['data transfer import facades', testDataTransferImportFacades]
    ];

    for (const [name, fn] of tests) {
        await runTest(name, fn);
    }

    console.log(`PASS all ${tests.length} non-scraper facade smoke tests`);
})().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
});
