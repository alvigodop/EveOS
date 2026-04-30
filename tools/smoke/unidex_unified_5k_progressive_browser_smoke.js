const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.getLiveLinks === 'function'
        && !!window.UnidexView?.render
    ), undefined, { timeout: 180000 });
}

async function seedFiveThousandUnifiedView(page) {
    return page.evaluate(() => {
        const workspaces = [];
        const links = [];
        const categoryOrderByWorkspace = {};
        const workspaceCount = 20;
        const linksPerWorkspace = 275;

        for (let workspaceIndex = 0; workspaceIndex < workspaceCount; workspaceIndex += 1) {
            const workspaceId = `bulk-ws-${workspaceIndex}`;
            workspaces.push({
                id: workspaceId,
                name: `Bulk Tab ${workspaceIndex}`,
                icon: 'folder',
                subTabs: []
            });
            categoryOrderByWorkspace[workspaceId] = ['Bulk Card A', 'Bulk Card B'];

            for (let linkIndex = 0; linkIndex < linksPerWorkspace; linkIndex += 1) {
                links.push({
                    id: `bulk-link-${workspaceIndex}-${linkIndex}`,
                    title: `Bulk Bookmark ${workspaceIndex}-${linkIndex}`,
                    url: `https://bulk.example/${workspaceIndex}/${linkIndex}`,
                    workspace: workspaceId,
                    category: linkIndex % 2 === 0 ? 'Bulk Card A' : 'Bulk Card B',
                    identifiers: [linkIndex % 3 === 0 ? 'reading' : 'research'],
                    done: false
                });
            }
        }

        window.config = config = {
            activeWorkspace: 'bulk-ws-0',
            viewMode: 'unidex',
            workspaces,
            categoryOrder: categoryOrderByWorkspace['bulk-ws-0'].slice(),
            categoryOrderByWorkspace,
            unidexTabsUnified: true,
            unidexCardsUnified: false,
            unidexEntriesLayout: 'grid',
            unidexEntriesDensity: 'atlas',
            unidexEntriesFilter: 'all',
            unidexEntriesGroupMode: 'flat',
            bookmarkIdentifiers: [
                { id: 'reading', label: 'Reading', color: '#00d4ff', icon: '', description: 'Reading queue' },
                { id: 'research', label: 'Research', color: '#f6c35b', icon: '', description: 'Research queue' }
            ],
            collapsedTabs: []
        };
        window.links = links;
        window.bookmarkFolders = {};
        window.EveLibrary = window.EveLibrary || {};
        window.EveLibrary.Connections = [];
        window.EveLibrary.State = window.EveLibrary.State || {};
        window.EveLibrary.ConnectionsAPI = {
            loadConnections() {},
            getLinkedEntry() {
                return null;
            }
        };

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = {};
        }

        const startedAt = performance.now();
        if (typeof window._renderDashboardImmediate === 'function') {
            window._renderDashboardImmediate();
        } else {
            window.renderDashboard();
        }
        const initialRenderMs = performance.now() - startedAt;
        const entriesSection = document.querySelector('.unidex-entries');
        return {
            initialRenderMs,
            totalLinks: links.length,
            initialEntries: document.querySelectorAll('.unidex-entry-item').length,
            progressive: entriesSection?.dataset?.unidexProgressive === '1' || entriesSection?.hasAttribute('data-unidex-progressive'),
            rendered: Number(entriesSection?.dataset?.unidexProgressiveRendered || 0),
            total: Number(entriesSection?.dataset?.unidexProgressiveTotal || 0),
            status: document.querySelector('[data-unidex-progressive-status="1"]')?.textContent?.trim() || ''
        };
    });
}

async function assertProgressiveInitialLoad(initialState) {
    if (initialState.totalLinks !== 5500) {
        throw new Error(`Expected 5,500 seeded links: ${JSON.stringify(initialState)}`);
    }
    if (!initialState.progressive || initialState.initialEntries > 360 || initialState.initialEntries < 180) {
        throw new Error(`Expected initial unified view to render only the first chunk: ${JSON.stringify(initialState)}`);
    }
    if (initialState.initialRenderMs > 2500) {
        throw new Error(`Expected initial 5k unified render to stay responsive: ${JSON.stringify(initialState)}`);
    }
}

async function assertProgressiveHydrationCompletes(page) {
    await page.waitForFunction(() => {
        const entriesSection = document.querySelector('.unidex-entries');
        return document.querySelectorAll('.unidex-entry-item').length === 5500
            && entriesSection?.getAttribute('aria-busy') === 'false';
    }, undefined, { timeout: 120000 });

    const finalState = await page.evaluate(async () => {
        window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.45));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const entriesSection = document.querySelector('.unidex-entries');
        return {
            entries: document.querySelectorAll('.unidex-entry-item').length,
            busy: entriesSection?.getAttribute('aria-busy') || '',
            largeClass: entriesSection?.classList?.contains('is-large-entry-set') || false,
            masonryState: entriesSection?.dataset?.unidexMasonryApplied || '',
            status: document.querySelector('[data-unidex-progressive-status="1"]')?.textContent?.trim() || ''
        };
    });

    if (finalState.entries !== 5500 || finalState.busy !== 'false' || !finalState.largeClass) {
        throw new Error(`Expected progressive 5k hydration to complete in large-list mode: ${JSON.stringify(finalState)}`);
    }
    if (!finalState.status.includes('Loaded 5,500')) {
        throw new Error(`Expected progressive status to confirm full load: ${JSON.stringify(finalState)}`);
    }
}

async function assertIdentifierGroupedProgressive(page) {
    const initialState = await page.evaluate(() => {
        window.config.unidexEntriesGroupMode = 'identifiers';
        if (window.eveState?.config) window.eveState.config.unidexEntriesGroupMode = 'identifiers';
        const startedAt = performance.now();
        if (typeof window._renderDashboardImmediate === 'function') {
            window._renderDashboardImmediate();
        } else {
            window.renderDashboard();
        }
        const entriesSection = document.querySelector('.unidex-entries');
        return {
            initialRenderMs: performance.now() - startedAt,
            initialEntries: document.querySelectorAll('.unidex-entry-item').length,
            groups: document.querySelectorAll('.unidex-identifier-group').length,
            progressive: entriesSection?.hasAttribute('data-unidex-progressive') || false,
            rendered: Number(entriesSection?.dataset?.unidexProgressiveRendered || 0),
            total: Number(entriesSection?.dataset?.unidexProgressiveTotal || 0)
        };
    });

    if (!initialState.progressive || initialState.groups < 2 || initialState.initialEntries > 360 || initialState.total !== 5500) {
        throw new Error(`Expected identifier grouped 5k view to use progressive chunks: ${JSON.stringify(initialState)}`);
    }

    await page.waitForFunction(() => {
        const entriesSection = document.querySelector('.unidex-entries');
        return document.querySelectorAll('.unidex-entry-item').length === 5500
            && document.querySelectorAll('.unidex-identifier-group').length >= 2
            && entriesSection?.getAttribute('aria-busy') === 'false';
    }, undefined, { timeout: 120000 });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        const initialState = await seedFiveThousandUnifiedView(page);
        await assertProgressiveInitialLoad(initialState);
        await assertProgressiveHydrationCompletes(page);
        await assertIdentifierGroupedProgressive(page);
        console.log('UNIDEX_UNIFIED_5K_PROGRESSIVE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
