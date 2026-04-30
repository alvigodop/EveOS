const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.getLiveLinks === 'function'
        && !!window.UnidexView?.setCardsUnified
        && !!window.UnidexView?.switchWorkspaceTab
    ), undefined, { timeout: 180000 });
}

async function seedSubtabUnifiedView(page) {
    await page.evaluate(() => {
        const grandchild = { id: 'child-b', name: 'Child B', icon: 'folder', subTabs: [] };
        const child = { id: 'child-a', name: 'Child A', icon: 'folder', subTabs: [grandchild] };
        const hiddenChild = { id: 'hidden-child', name: 'Hidden Child', icon: 'folder', hiddenInParent: true, subTabs: [] };
        const links = [
            { id: 'parent-link', title: 'Parent Bookmark', url: 'https://scope.example/parent', workspace: 'main', category: 'Parent Card', done: false },
            { id: 'child-link', title: 'Child Bookmark', url: 'https://scope.example/child', workspace: 'child-a', category: 'Child Card', done: false },
            { id: 'grandchild-link', title: 'Grandchild Bookmark', url: 'https://scope.example/grandchild', workspace: 'child-b', category: 'Grandchild Card', done: false },
            { id: 'hidden-link', title: 'Hidden Bookmark', url: 'https://scope.example/hidden', workspace: 'hidden-child', category: 'Hidden Card', done: false },
            { id: 'other-link', title: 'Other Bookmark', url: 'https://scope.example/other', workspace: 'other', category: 'Other Card', done: false }
        ];

        window.config = config = {
            activeWorkspace: 'main',
            viewMode: 'unidex',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'home', subTabs: [child, hiddenChild] },
                { id: 'other', name: 'Other', icon: 'folder', subTabs: [] }
            ],
            categoryOrder: ['Parent Card'],
            categoryOrderByWorkspace: {
                main: ['Parent Card'],
                'child-a': ['Child Card'],
                'child-b': ['Grandchild Card'],
                'hidden-child': ['Hidden Card'],
                other: ['Other Card']
            },
            unidexCardsUnified: true,
            unidexEntriesLayout: 'rows',
            unidexEntriesDensity: 'comfortable',
            unidexEntriesFilter: 'all',
            unidexEntriesGroupMode: 'flat'
        };
        window.links = links;
        window.bookmarkFolders = {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = {};
        }

        window.EveLibrary = window.EveLibrary || {};
        window.EveLibrary.Connections = [];
        window.EveLibrary.State = window.EveLibrary.State || {};
        window.EveLibrary.ConnectionsAPI = {
            loadConnections() {},
            getLinkedEntry() {
                return null;
            }
        };

        window.renderDashboard();
        window.UnidexView.switchWorkspaceTab('main');
        window.UnidexView.setCardsUnified(true);
    });
}

async function getRenderedState(page) {
    await page.waitForSelector('.unidex-shell .unidex-entries .unidex-entry-item', { timeout: 25000 });
    return page.evaluate(() => ({
        titles: Array.from(document.querySelectorAll('.unidex-entry-title')).map((node) => node.textContent.trim()),
        tags: Array.from(document.querySelectorAll('.unidex-entry-tag.workspace')).map((node) => node.textContent.trim()),
        header: document.querySelector('.unidex-panel-title')?.textContent?.trim() || '',
        entriesClass: document.querySelector('.unidex-entries')?.className || ''
    }));
}

async function assertMainScopeIncludesVisibleDescendants(page) {
    const state = await getRenderedState(page);
    for (const title of ['Parent Bookmark', 'Child Bookmark', 'Grandchild Bookmark']) {
        if (!state.titles.includes(title)) {
            throw new Error(`Expected unified parent tab scope to include ${title}: ${JSON.stringify(state)}`);
        }
    }
    for (const title of ['Hidden Bookmark', 'Other Bookmark']) {
        if (state.titles.includes(title)) {
            throw new Error(`Expected unified parent tab scope to exclude ${title}: ${JSON.stringify(state)}`);
        }
    }
    if (!state.tags.includes('Sub Tab: Child A') || !state.tags.includes('Sub Tab: Child B')) {
        throw new Error(`Expected descendant entries to expose source sub-tab tags: ${JSON.stringify(state)}`);
    }
}

async function assertChildScopeIncludesOwnDescendantsOnly(page) {
    await page.evaluate(() => {
        window.UnidexView.switchWorkspaceTab('child-a');
        window.UnidexView.setCardsUnified(true);
    });
    await page.waitForFunction(() => (
        (document.querySelector('.unidex-panel-title')?.textContent || '').includes('Child A')
    ), undefined, { timeout: 10000 });
    const state = await getRenderedState(page);
    for (const title of ['Child Bookmark', 'Grandchild Bookmark']) {
        if (!state.titles.includes(title)) {
            throw new Error(`Expected child tab unified scope to include ${title}: ${JSON.stringify(state)}`);
        }
    }
    for (const title of ['Parent Bookmark', 'Hidden Bookmark', 'Other Bookmark']) {
        if (state.titles.includes(title)) {
            throw new Error(`Expected child tab unified scope to exclude ${title}: ${JSON.stringify(state)}`);
        }
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedSubtabUnifiedView(page);
        await assertMainScopeIncludesVisibleDescendants(page);
        await assertChildScopeIncludesOwnDescendantsOnly(page);
        console.log('UNIDEX_UNIFIED_SUBTABS_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
