const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

const links = [
    {
        id: 'link-1',
        title: 'Reading Bookmark',
        url: 'https://example.test/reading',
        workspace: 'source-tab',
        category: 'Reading'
    }
];

let modalCall = null;
let saveDataCall = null;
let saveConfigCall = null;

const context = {
    console,
    links,
    config: {
        activeWorkspace: 'source-tab'
    },
    bookmarkFolders: {},
    saveConfig(options) {
        saveConfigCall = options;
    },
    saveData(options) {
        saveDataCall = options;
    },
    renderDashboard() {},
    window: {
        links,
        config: {
            activeWorkspace: 'source-tab'
        },
        bookmarkFolders: {},
        eveState: {
            links,
            config: {
                activeWorkspace: 'source-tab'
            },
            bookmarkFolders: {}
        },
        showConfirmWithTitle(title, message, options) {
            modalCall = { title, message, options };
            return Promise.resolve(true);
        },
        confirm() {
            throw new Error('Native browser confirm should not be used for card moves');
        }
    }
};

context.window.window = context.window;

const vmContext = vm.createContext(context);
// The modular move code defers UI refreshes through timers; give the sandbox the host timers.
vmContext.setTimeout = setTimeout;
vmContext.clearTimeout = clearTimeout;
vmContext.setInterval = setInterval;
vmContext.clearInterval = clearInterval;
vmContext.window.setTimeout = setTimeout;
vmContext.window.clearTimeout = clearTimeout;

// Load the categories modules exactly as the production manifest does: shared helpers and
// the move/ui modules first, then the facade (moveCategoryCardToWorkspace lives in
// categories.move.js after modularization).
[
    'js/modules/core/categories.shared.js',
    'js/modules/core/categories.move.js',
    'js/modules/core/categories.ui.js',
    'js/modules/core/categories.js'
].forEach((relPath) => {
    const moduleCode = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    vm.runInContext(moduleCode, vmContext, { filename: relPath });
});

(async () => {
    const moveResult = vmContext.window.moveCategoryCardToWorkspace('source-tab', 'Reading', 'target-tab', {
        requireConfirm: true,
        targetWorkspaceName: 'Target Tab',
        source: 'card-move-custom-confirm-smoke'
    });

    assert(moveResult && typeof moveResult.then === 'function', 'Async modal card move should return a confirmation promise');
    const confirmedMoveResult = await moveResult;
    assert(confirmedMoveResult === true, 'Confirmed async card move should resolve true after applying the move');

    assert(!!modalCall, 'Card move should request a custom modal confirmation');
    assert(modalCall.title === 'Move Card', 'Card move modal should use a descriptive title');
    assert(modalCall.options?.confirmLabel === 'Move Card', 'Card move modal should customize confirm label');
    assert(modalCall.options?.cancelLabel === 'Keep Here', 'Card move modal should customize cancel label');
    assert(modalCall.message.includes('Move card "Reading" to Target Tab?'), 'Card move modal should show destination context');
    assert(links[0].workspace === 'target-tab', 'Confirmed card move should update bookmark workspace');
    assert(links[0].category === 'Reading', 'Confirmed card move should preserve category name');
    assert(saveConfigCall?.source === 'card-move-custom-confirm-smoke', 'Confirmed card move should save config');
    assert(saveDataCall?.source === 'card-move-custom-confirm-smoke', 'Confirmed card move should save data');

    console.log('CARD_MOVE_CUSTOM_CONFIRM_SMOKE_OK');
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
