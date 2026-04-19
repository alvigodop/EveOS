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

const orderStore = {
    main: ['Main One', 'Main Two'],
    'ws-2': ['Alpha', 'Beta', 'Gamma', 'Delta']
};

let inlinePromptCall = null;
let saveCalls = 0;
let renderCalls = 0;
let toastMessage = null;

const context = {
    console,
    links: [],
    config: {
        activeWorkspace: 'main'
    },
    saveConfig() {
        saveCalls += 1;
    },
    renderDashboard() {
        renderCalls += 1;
    },
    window: {
        showToast(message) {
            toastMessage = message;
        },
        EveInlinePrompt: {
            async show(options) {
                inlinePromptCall = options;
                return '3';
            }
        },
        EveCategoryOrder: {
            getOrder(workspaceId) {
                return (orderStore[workspaceId] || []).slice();
            },
            moveCategoryToPosition(workspaceId, categoryName, absolutePosition) {
                const order = (orderStore[workspaceId] || []).slice();
                const index = order.indexOf(categoryName);
                if (index === -1) return false;
                const nextIndex = Math.max(0, Math.min(order.length - 1, Number(absolutePosition) - 1));
                if (index === nextIndex) return false;
                order.splice(index, 1);
                order.splice(nextIndex, 0, categoryName);
                orderStore[workspaceId] = order;
                return true;
            }
        }
    }
};

context.window.window = context.window;
context.prompt = function () {
    throw new Error('Browser prompt should not be used');
};

const vmContext = vm.createContext(context);
const code = fs.readFileSync(path.join(repoRoot, 'js/modules/core/categories.js'), 'utf8');
vm.runInContext(code, vmContext, { filename: 'js/modules/core/categories.js' });

(async () => {
    const anchor = { id: 'card-order-anchor' };
    await vmContext.promptMoveCategory('Beta', 1, 'ws-2', anchor);

    assert(!!inlinePromptCall, 'Card move should use EveInlinePrompt when available');
    assert(inlinePromptCall.anchor === anchor, 'Inline prompt should stay anchored to the clicked card badge');
    assert(inlinePromptCall.type === 'number', 'Inline prompt should use numeric input');
    assert(String(inlinePromptCall.value) === '2', 'Inline prompt should preload the current card position');
    assert(String(inlinePromptCall.min) === '1', 'Inline prompt should enforce the minimum card position');
    assert(String(inlinePromptCall.max) === '4', 'Inline prompt should enforce the maximum card position');
    assert(orderStore['ws-2'].join('|') === 'Alpha|Gamma|Beta|Delta', 'Card move should apply to the clicked workspace, not the active workspace');
    assert(orderStore.main.join('|') === 'Main One|Main Two', 'Active workspace ordering should remain untouched');
    assert(saveCalls === 1, 'Successful card move should save config once');
    assert(renderCalls === 1, 'Successful card move should re-render once');
    assert(toastMessage === null, 'Valid card move should not emit a warning toast');

    console.log('CARD_ORDER_INLINE_PROMPT_SMOKE_OK');
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
