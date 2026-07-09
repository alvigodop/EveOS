const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function loadScript(ctx, relativePath) {
    const absPath = path.join(ROOT, relativePath);
    vm.runInContext(fs.readFileSync(absPath, 'utf8'), ctx, { filename: relativePath });
}

function makeElement(id) {
    return {
        id,
        style: {},
        textContent: '',
        innerHTML: '',
        disabled: false,
        value: '',
        classList: {
            toggle() {},
            contains() { return false; },
            add() {},
            remove() {}
        },
        addEventListener() {},
        querySelectorAll() { return []; }
    };
}

function makeContext() {
    const elements = new Map();
    const window = {
        EveOS: { SearchAdvanced: { Modules: {} } },
        eveState: {
            config: {
                workspaces: [{ id: 'main', name: 'Main', subTabs: [] }],
                activeWorkspace: 'main'
            }
        },
        links: [],
        setLiveLinks(nextLinks) {
            window.links = nextLinks;
        },
        console
    };

    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeElement(id));
            return elements.get(id);
        },
        querySelectorAll() {
            return [];
        },
        querySelector() {
            return null;
        }
    };

    const ctx = {
        window,
        document,
        console,
        setTimeout,
        clearTimeout,
        config: window.eveState.config,
        saveConfig() {},
        saveData() {},
        renderSidebar() {},
        renderDashboard() {}
    };
    ctx.global = ctx;
    vm.createContext(ctx);
    return { ctx, window, elements };
}

async function testBannerContract() {
    const { ctx, window, elements } = makeContext();
    loadScript(ctx, 'js/modules/features/search-advanced/sa-ui.form.fields.js');

    const ui = window.EveOS.SearchAdvanced.Modules.createUiFormFields();
    const banner = ctx.document.getElementById('nxOrphanBanner');
    const text = ctx.document.getElementById('nxOrphanText');
    ctx.document.getElementById('nxOrphanViewBtn');
    ctx.document.getElementById('nxOrphanRescueBtn');
    ctx.document.getElementById('nxOrphanDismissBtn');
    ctx.document.getElementById('esResults');
    ctx.document.getElementById('esMeta');

    banner.style.display = 'flex';
    text.textContent = '0 orphaned bookmarks from deleted workspaces';

    window.EveOS.SearchAdvanced.CacheAggregator = {
        aggregateAllCaches: async () => ({ stats: { totalEntries: 0, totalProviders: 0, cardCount: 0 } }),
        detectOrphanedLinks: () => ({ orphaned: [], orphanedByWorkspace: {} })
    };
    await ui.updateFooterStats();

    if (banner.style.display !== 'none') {
        throw new Error('Zero-orphan report should hide the orphan banner.');
    }

    const orphan = { title: 'Lost', url: 'https://example.test', category: 'Old', workspace: 'deleted-ws' };
    const legacyReport = {
        orphaned: [orphan],
        orphanedByWorkspace: { 'deleted-ws': [orphan] }
    };
    window.EveOS.SearchAdvanced.CacheAggregator.detectOrphanedLinks = () => legacyReport;
    await ui.updateFooterStats();

    if (banner.style.display !== 'flex') {
        throw new Error('Legacy orphan report should show the orphan banner.');
    }
    if (!text.textContent.includes('1 orphaned bookmarks') || !text.textContent.includes('deleted-ws')) {
        throw new Error('Orphan banner did not render the normalized count and workspace.');
    }

    ui.renderOrphanList(legacyReport);
    const results = elements.get('esResults');
    const meta = elements.get('esMeta');
    if (!results.innerHTML.includes('deleted-ws') || !results.innerHTML.includes('Lost')) {
        throw new Error('Orphan list did not render legacy orphan report data.');
    }
    if (meta.textContent !== '1 orphaned bookmarks found') {
        throw new Error('Orphan list meta did not use the normalized count.');
    }
}

function testDiagnosticsContract() {
    const { ctx, window } = makeContext();
    loadScript(ctx, 'js/modules/features/search-advanced/sa-cache-aggregator.diagnostics.js');

    window.links = [
        { id: 'ok-1', title: 'Current', url: 'https://current.test', workspace: 'main', category: 'Main' },
        { id: 'ghost-1', title: 'Ghost', url: 'https://ghost.test', workspace: 'deleted-ws' }
    ];
    window.EveWorkspaceHelpers = {
        flattenIds() {
            return [];
        }
    };

    const diagnostics = window.EveOS.SearchAdvanced.CacheAggregatorDiagnostics;
    const report = diagnostics.detectOrphanedLinks();
    if (report.totalOrphaned !== 1) throw new Error('Diagnostics should expose totalOrphaned.');
    if (!report.knownIds.includes('main')) {
        throw new Error('Diagnostics should keep main as a safe known workspace when helper data is empty.');
    }
    if (!Array.isArray(report.ghostWorkspaces) || report.ghostWorkspaces[0] !== 'deleted-ws') {
        throw new Error('Diagnostics should expose ghostWorkspaces.');
    }

    const rescued = diagnostics.rescueOrphanedLinks();
    if (rescued.rescued !== 1) throw new Error('Rescue should report the orphaned bookmark count.');
    if (!rescued.restoredTabs.some((tab) => tab.id === 'deleted-ws')) {
        throw new Error('Rescue should restore the deleted workspace tab instead of hiding the disturbance.');
    }
    if (window.links[1].workspace !== 'deleted-ws') {
        throw new Error('Rescue should not silently rewrite orphaned bookmarks to main.');
    }
    if (window.links[1].category !== 'Recovered') {
        throw new Error('Rescue should mark uncategorized orphaned links as recovered.');
    }
}

function testGroupRecoveryContract() {
    const { ctx, window } = makeContext();
    loadScript(ctx, 'js/modules/features/search-advanced/sa-cache-aggregator.diagnostics.js');

    // Simulate corruption that took out a grouped tab AND its group: config has neither, but the
    // Nexus index records still carry the tab's original name plus its group id + group name.
    window.eveState.config.sidebarGroups = [
        { id: 'sg_existing', name: 'Untouched Group', color: '', collapsed: false, hidden: false, parentWorkspaceId: '' }
    ];
    window.EveOS.SearchAdvanced.CacheAggregatorScope = {
        getDatapackIndexApi() { return {}; },
        getDatapackSnapshot() {
            return {
                records: [
                    {
                        type: 'bookmark',
                        workspaceId: 'ws-lost-grouped',
                        title: 'Grouped Bookmark',
                        url: 'https://grouped.test',
                        categoryName: 'Research',
                        path: {
                            linkId: 'lost-1',
                            workspaceId: 'ws-lost-grouped',
                            workspaceLabel: 'Deep Research',
                            groupId: 'sg_work',
                            groupLabel: 'Work Stuff'
                        }
                    },
                    {
                        type: 'bookmark',
                        workspaceId: 'ws-lost-plain',
                        title: 'Ungrouped Bookmark',
                        url: 'https://plain.test',
                        categoryName: 'Misc',
                        path: {
                            linkId: 'lost-2',
                            workspaceId: 'ws-lost-plain',
                            workspaceLabel: 'Scratch Tab'
                        }
                    }
                ]
            };
        },
        getLiveLinks() { return window.links; }
    };
    window.links = [];

    const diagnostics = window.EveOS.SearchAdvanced.CacheAggregatorDiagnostics;
    const report = diagnostics.detectOrphanedLinks();
    if (report.ghostLabels['ws-lost-grouped'] !== 'Deep Research') {
        throw new Error('Report should keep the original tab name for the grouped ghost.');
    }
    if (report.ghostGroups['ws-lost-grouped'] !== 'sg_work') {
        throw new Error('Report should remember which group the ghost tab belonged to.');
    }
    if (report.groupLabels.sg_work !== 'Work Stuff') {
        throw new Error('Report should remember the original group name.');
    }
    if (report.ghostGroups['ws-lost-plain']) {
        throw new Error('Ungrouped ghosts must not be assigned a group.');
    }

    const rescued = diagnostics.rescueOrphanedLinks();
    const groupedTab = ctx.config.workspaces.find((tab) => tab.id === 'ws-lost-grouped');
    const plainTab = ctx.config.workspaces.find((tab) => tab.id === 'ws-lost-plain');
    if (!groupedTab || groupedTab.name !== 'Deep Research') {
        throw new Error('Rescue should restore the grouped tab with its original name.');
    }
    if (groupedTab.groupId !== 'sg_work') {
        throw new Error('Rescue should restore the tab\'s group membership.');
    }
    if (!plainTab || plainTab.groupId) {
        throw new Error('Rescue should restore ungrouped tabs without inventing a group.');
    }
    const recoveredGroup = ctx.config.sidebarGroups.find((group) => group.id === 'sg_work');
    if (!recoveredGroup || recoveredGroup.name !== 'Work Stuff') {
        throw new Error('Rescue should recreate the missing group with its original name.');
    }
    if (!rescued.restoredGroups.some((group) => group.id === 'sg_work')) {
        throw new Error('Rescue result should report the recreated group.');
    }
    if (ctx.config.sidebarGroups[0].name !== 'Untouched Group') {
        throw new Error('Existing groups must be left untouched.');
    }

    // A second rescue must not duplicate the group.
    diagnostics.rescueOrphanedLinks();
    const workGroups = ctx.config.sidebarGroups.filter((group) => group.id === 'sg_work');
    if (workGroups.length !== 1) {
        throw new Error('Repeat rescues must not duplicate recovered groups.');
    }
}

(async function main() {
    await testBannerContract();
    testDiagnosticsContract();
    testGroupRecoveryContract();
    console.log('NEXUS_ORPHAN_BANNER_REPORT_SHAPE_OK');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
