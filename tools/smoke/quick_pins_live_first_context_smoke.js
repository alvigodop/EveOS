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

function runScript(context, relativePath) {
    const filePath = path.join(repoRoot, relativePath);
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

const listeners = {};
const windowObject = {
    EveQuickPins: {},
    EveOS: {
        DatapackIndex: {
            resolveBookmarkLink(linkId) {
                return {
                    id: String(linkId),
                    title: 'Stale Indexed Link',
                    url: 'https://stale.example.test',
                    workspace: 'main',
                    category: 'Old-Card'
                };
            }
        }
    },
    eveState: {
        config: { activeWorkspace: 'main' },
        links: [
            {
                id: 'link-1',
                title: 'Live Link',
                url: 'https://live.example.test',
                workspace: 'main',
                category: 'Amazing-Worlds'
            }
        ],
        quickPins: [
            {
                id: 'pin-bookmark-link-1',
                targetType: 'bookmark',
                targetId: 'link-1',
                scopeType: 'card',
                order: 0
            }
        ]
    },
    addEventListener(type, handler) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
    },
    dispatchEvent(event) {
        (listeners[event.type] || []).forEach((handler) => handler(event));
    }
};
windowObject.window = windowObject;

const context = vm.createContext({
    console,
    window: windowObject,
    CustomEvent: class CustomEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail || {};
        }
    },
    renderDashboard() {},
    saveData() {}
});

[
    'js/modules/features/quick-pins/quick-pins.core.base.js',
    'js/modules/features/quick-pins/quick-pins.core.store.js',
    'js/modules/features/quick-pins/quick-pins.core.context.js',
    'js/modules/features/quick-pins/quick-pins.core.actions.js',
    'js/modules/features/quick-pins/quick-pins.core.js',
    'js/modules/features/quick-pins/quick-pins.main.presentation.js',
    'js/modules/features/quick-pins/quick-pins.main.collection.js',
    'js/modules/features/quick-pins/quick-pins.main.js'
].forEach((file) => runScript(context, file));

const pin = windowObject.EveQuickPins.getPins()[0];
const contextForPin = windowObject.EveQuickPins.getTargetContext(pin);
assert(contextForPin.categoryName === 'Amazing-Worlds', 'Quick pins should prefer live link context over stale indexed context');

const activePins = windowObject.EveQuickPins.getActiveDockPins({
    activeWorkspace: 'main',
    focusCategory: 'Amazing-Worlds'
});
assert(activePins.length === 1, 'Card-scoped bookmark pin should be visible from live context without reload');
assert(activePins[0].label === 'Live Link', 'Dock label should come from the live bookmark');

console.log('QUICK_PINS_LIVE_FIRST_CONTEXT_SMOKE_OK');
