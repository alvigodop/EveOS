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

const windowObject = {
    eveState: {
        links: [
            {
                id: '1',
                title: 'Amazing Worlds Link',
                url: 'https://example.test',
                workspace: 'main',
                category: 'Amazing-Worlds'
            }
        ],
        bookmarkFolders: {},
        config: {
            activeWorkspace: 'main',
            categoryOrder: [],
            categoryOrderByWorkspace: {
                main: ['Ama', 'Amazi', 'Amazing', 'Amazing-Worlds']
            }
        }
    }
};
windowObject.window = windowObject;

const context = vm.createContext({
    console,
    window: windowObject,
    config: windowObject.eveState.config,
    links: windowObject.eveState.links,
    bookmarkFolders: windowObject.eveState.bookmarkFolders
});

const code = fs.readFileSync(path.join(repoRoot, 'js/modules/core/category-order.js'), 'utf8');
vm.runInContext(code, context, { filename: 'js/modules/core/category-order.js' });

const order = windowObject.EveCategoryOrder.getOrder('main');
assert(order.join('|') === 'Amazing-Worlds', `Prefix placeholders should be hidden from card order, got ${order.join('|')}`);

const persistedOrder = windowObject.EveCategoryOrder.getOrder('main', { persist: true });
assert(persistedOrder.join('|') === 'Amazing-Worlds', 'Persisted order should prune prefix placeholders');
assert(windowObject.eveState.config.categoryOrderByWorkspace.main.join('|') === 'Amazing-Worlds', 'Store should be healed after persist');

console.log('CARD_PREFIX_CATEGORY_ORDER_SMOKE_OK');
