// Scope-mode UI parity smoke.
//
// Guards the contract that broke silently once: the Context Relay dialog offered a scope
// option ("Current Group") that the scope runtime's normalizeScopeMode allowlist rejected,
// so selecting it fell back to 'auto' and the feature was dead code — while a payload-level
// smoke stayed green. This smoke extracts every option value the dialog UI offers and
// asserts each one round-trips through the runtime, then locks the fallback behaviors.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_PATH = 'js/modules/gemini/html_loaders/agentic/gemini_link/geminiLiveLinkScopeRuntime.js';
const UI_CARD_PATH = 'js/modules/gemini/html_loaders/agentic/gemini_link/geminiLiveLinkUICard.js';
const UILOADER_PATH = 'js/modules/gemini/html_loaders/agentic/gemini_link/geminiLiveLinkUILoader.js';

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error('ASSERT FAILED: ' + message);
}

// --- 1. Extract the scope option values the dialog UI actually offers -----------------------
function extractUiScopeOptions() {
    const source = read(UI_CARD_PATH) + '\n' + read(UILOADER_PATH);
    const values = new Set();
    // The dynamic options list in _refreshGeminiLiveLinkScopeOptions: ['value', 'Label'] pairs.
    const optionsBlock = /_refreshGeminiLiveLinkScopeOptions\(\)\s*\{[\s\S]*?select\.innerHTML/.exec(source);
    assert(optionsBlock, 'could not locate the scope options block in the UI loader');
    const pairPattern = /\['([a-z-]+)',\s*'/g;
    let match;
    while ((match = pairPattern.exec(optionsBlock[0])) !== null) values.add(match[1]);
    // The static <option> tags in the settings dialog template for the same select.
    const staticSelect = /id="geminiLiveLinkScopeMode"[\s\S]*?<\/select>/.exec(source);
    if (staticSelect) {
        const optionPattern = /<option value="([a-z-]+)"/g;
        while ((match = optionPattern.exec(staticSelect[0])) !== null) values.add(match[1]);
    }
    assert(values.size >= 4, 'suspiciously few scope options extracted: ' + Array.from(values).join(', '));
    return Array.from(values);
}

// --- 2. Load the scope runtime in a sandbox --------------------------------------------------
function makeRuntime(configOverrides) {
    const config = Object.assign({
        activeWorkspace: 'main',
        viewMode: 'grid',
        unidexStage: '',
        groupOverviewId: '',
        geminiContextScopeMode: 'auto',
        geminiContextSelectedCardWorkspaceId: '',
        geminiContextSelectedCardCategory: '',
        sidebarGroups: [],
        workspaces: [
            { id: 'main', name: 'Main', subTabs: [] },
            { id: 'ws-grouped', name: 'Grouped Tab', groupId: 'sg-one', subTabs: [{ id: 'ws-grouped-child', name: 'Child', subTabs: [] }] }
        ]
    }, configOverrides || {});

    const sandbox = {
        console, JSON, Math, Date, String, Array, Object, Set,
        config: config,
        saveConfig: function () {},
        window: {}
    };
    sandbox.window.eveState = { get config() { return config; } };
    sandbox.window.EveSidebarGroups = {
        getGroupRoots: function (groupId, cfg) {
            return (cfg.workspaces || []).filter(function (ws) { return ws.groupId === groupId; });
        },
        findGroupById: function (groupId, cfg) {
            return (cfg.sidebarGroups || []).find(function (g) { return g.id === groupId; }) || null;
        }
    };
    sandbox.window.EveDataStore = { _modularSync: { getVisibleContextWorkspaceIds: function () {
        return ['main', 'ws-grouped', 'ws-grouped-child'];
    } } };
    vm.createContext(sandbox);
    vm.runInContext(read(RUNTIME_PATH), sandbox, { filename: RUNTIME_PATH });
    return { RT: sandbox.window.GeminiLiveLinkScopeRuntime, config: config };
}

// --- 3. Parity: every UI option must survive the runtime's normalizer ------------------------
function testUiRuntimeParity(uiOptions) {
    uiOptions.forEach(function (value) {
        // 'all' is only offered when whole-datapack is allowed, so test it in that state.
        const overrides = value === 'all' ? { viewMode: 'unidex', unidexStage: 'tabs' } : {};
        const { RT } = makeRuntime(overrides);
        const applied = RT.setScopeMode(value);
        assert(applied === value,
            'UI offers scope option "' + value + '" but the runtime normalized it to "' + applied
            + '" — dead dropdown option (add it to normalizeScopeMode\'s allowlist).');
        assert(RT.getScopeMode() === value,
            'scope mode "' + value + '" did not persist through getScopeMode');
    });
}

// --- 4. Behavior: each mode resolves a sane scope, fallbacks stay honest ---------------------
function testScopeResolution() {
    // group mode with a real group -> group scope with branch ids and the group's name
    {
        const { RT, config } = makeRuntime({ activeWorkspace: 'ws-grouped' });
        config.sidebarGroups.push({ id: 'sg-one', name: 'Group One', hidden: false });
        RT.setScopeMode('group');
        const sel = RT.getSelectedScope();
        assert(sel.scope === 'group', 'group mode should resolve scope "group", saw ' + sel.scope);
        assert(sel.label === 'Group: Group One', 'group scope should carry the group name, saw ' + sel.label);
        assert(sel.workspaceIds.indexOf('ws-grouped') >= 0 && sel.workspaceIds.indexOf('ws-grouped-child') >= 0,
            'group scope should cover the group root and its sub-tabs');
    }
    // group mode with no resolvable group -> honest tab fallback, never a mislabeled scope
    {
        const { RT } = makeRuntime({ activeWorkspace: 'main' });
        RT.setScopeMode('group');
        const sel = RT.getSelectedScope();
        assert(sel.scope === 'workspace' && sel.source === 'manual-group-fallback',
            'ungrouped tab must fall back to workspace scope, saw ' + sel.scope + '/' + sel.source);
        assert(/no group here/i.test(sel.label), 'group fallback label must say there is no group, saw ' + sel.label);
    }
    // card mode with no card selected -> honest tab fallback (the older sibling of the group bug)
    {
        const { RT } = makeRuntime({});
        RT.setScopeMode('card');
        const sel = RT.getSelectedScope();
        assert(sel.scope === 'workspace' && sel.source === 'manual-card-fallback',
            'card mode without a selected card must fall back honestly, saw ' + sel.scope + '/' + sel.source);
    }
    // card mode with a selection -> real card scope
    {
        const { RT, config } = makeRuntime({});
        config.geminiContextSelectedCardWorkspaceId = 'main';
        config.geminiContextSelectedCardCategory = 'Reading';
        RT.setScopeMode('card');
        const sel = RT.getSelectedScope();
        assert(sel.scope === 'card' && sel.categoryName === 'Reading', 'selected card must resolve a card scope');
    }
    // 'all' outside Unidex must degrade to auto (whole datapack is Unidex-only)
    {
        const { RT } = makeRuntime({ viewMode: 'grid' });
        const applied = RT.setScopeMode('all');
        assert(applied === 'auto', '"all" outside Unidex should degrade to auto, saw ' + applied);
    }
}

(function main() {
    const uiOptions = extractUiScopeOptions();
    console.log('UI scope options found: ' + uiOptions.join(', '));
    testUiRuntimeParity(uiOptions);
    testScopeResolution();
    console.log('GEMINI_SCOPE_MODE_UI_PARITY_SMOKE_OK');
})();
