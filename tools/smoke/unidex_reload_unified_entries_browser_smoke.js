const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.getLiveLinks === 'function'
        && !!window.UnidexView?.render
        && !!window.UnidexView?.switchWorkspaceTab
    ), undefined, { timeout: 180000 });
}

function buildLegacyUnifiedSeed() {
    const links = [];
    for (let index = 0; index < 18; index += 1) {
        links.push({
            id: `reload-link-${index}`,
            title: `Reload Bookmark ${index}`,
            url: `https://reload.example/${index}`,
            workspace: 'main',
            category: index % 2 === 0 ? 'Reading' : 'Archive',
            done: false
        });
    }

    return {
        links,
        folders: {},
        config: {
            activeWorkspace: 'main',
            viewMode: 'unidex',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'home', subTabs: [] }
            ],
            categoryOrder: ['Reading', 'Archive'],
            categoryOrderByWorkspace: {
                main: ['Reading', 'Archive']
            },
            unidexCardsUnified: true,
            unidexTabsUnified: false,
            unidexEntriesLayout: 'grid',
            unidexEntriesDensity: 'comfortable',
            unidexEntriesFilter: 'all',
            unidexEntriesGroupMode: 'flat'
        }
    };
}

async function seedLegacyStorageAndReload(page) {
    const seed = buildLegacyUnifiedSeed();
    await page.evaluate(async (payload) => {
        try {
            localStorage.clear();
        } catch (_) {
            // Some file:// contexts reject localStorage clearing.
        }
        try {
            if (window.IDBStore?.clear) await window.IDBStore.clear();
        } catch (_) {
            // Legacy reload coverage only requires localStorage.
        }

        localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
        localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.folders));
        localStorage.setItem('eveLibraryConnections', JSON.stringify([]));
        localStorage.setItem('eveLibraryData', JSON.stringify([]));
    }, seed);

    await page.reload({ waitUntil: 'load', timeout: 180000 });
    await waitForApp(page);
}

async function assertUnifiedEntriesRestored(page) {
    await page.waitForSelector('.unidex-shell .unidex-entries .unidex-entry-item', { timeout: 30000 });
    const state = await page.evaluate(() => ({
        viewMode: window.eveState?.config?.viewMode || '',
        activeWorkspace: window.eveState?.config?.activeWorkspace || '',
        unidexStage: window.eveState?.config?.unidexStage || '',
        unidexStagePersisted: window.eveState?.config?.unidexStagePersisted === true,
        panelTitle: document.querySelector('.unidex-panel-title')?.textContent?.trim() || '',
        shellLabel: document.querySelector('.unidex-shell')?.getAttribute('aria-label') || '',
        entries: document.querySelectorAll('.unidex-entry-item').length,
        wrapperCards: document.querySelectorAll('.unidex-card').length,
        bodyText: document.body.textContent.slice(0, 600)
    }));

    if (state.viewMode !== 'unidex' || state.activeWorkspace !== 'main') {
        throw new Error(`Expected reload to stay in Unidex main workspace: ${JSON.stringify(state)}`);
    }
    if (!state.panelTitle.includes('Main Unified Entries') || !state.shellLabel.includes('Unified Entries')) {
        throw new Error(`Expected reload to restore workspace unified entries view: ${JSON.stringify(state)}`);
    }
    if (state.entries !== 18 || state.wrapperCards > 0) {
        throw new Error(`Expected bookmark entries, not the wrapper/card overview, after reload: ${JSON.stringify(state)}`);
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message || String(error)));
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedLegacyStorageAndReload(page);
        await assertUnifiedEntriesRestored(page);
        if (pageErrors.length) {
            throw new Error(`Unexpected page errors during reload smoke: ${pageErrors.join(' | ')}`);
        }
        console.log('UNIDEX_RELOAD_UNIFIED_ENTRIES_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
