const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.saveData === 'function'
        && typeof window.saveConfig === 'function'
        && !!window.EveCoreStorage
        && !!document.getElementById('notes-area')
    ), undefined, { timeout: 180000 });
    await page.waitForTimeout(1500);
}

async function waitForIndexedDbKeys(page, requiredKeys, timeoutMs = 30000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const ready = await page.evaluate(async (keys) => {
            if (!window.IDBStore || typeof window.IDBStore.get !== 'function') return false;
            const values = await Promise.all(keys.map((key) => window.IDBStore.get(key)));
            return values.every((value) => value !== undefined);
        }, requiredKeys);
        if (ready) return;
        await page.waitForTimeout(200);
    }
    throw new Error(`Timed out waiting for IndexedDB keys: ${JSON.stringify(requiredKeys)}`);
}

async function runIndexedDbScenario(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
    await waitForApp(page);

    await page.evaluate(async () => {
        localStorage.clear();
        if (window.IDBStore?.clear) {
            await window.IDBStore.clear();
        }
        links = [];
        bookmarkFolders = {};
        quickPins = [];
        window.constellationDetachedChains = {};
        config = { ...(config || {}) };
        const notesArea = document.getElementById('notes-area');
        if (notesArea) notesArea.value = '';
    });

    await page.evaluate(() => {
        links = [{
            id: 101,
            title: 'Alpha Link',
            url: 'https://example.com/alpha',
            category: 'Start',
            done: false,
            workspace: 'main'
        }];
        bookmarkFolders = {
            Start: [{
                id: 'folder-1',
                name: 'Pinned Cluster',
                links: [101]
            }]
        };
        quickPins = [{ id: 101, title: 'Alpha Link' }];
        window.constellationDetachedChains = {
            detached: [{ id: 'chain-1', label: 'Detached' }]
        };
        config = {
            ...(config || {}),
            userName: 'Drift Core',
            theme: 'custom',
            accent: '#22c55e',
            bgColor: '#101922',
            cardColor: '#1a2530',
            popupColor: '#16202a'
        };
        const notesArea = document.getElementById('notes-area');
        if (notesArea) notesArea.value = 'IDB notes payload';
        saveData({ skipRender: true, skipSuggestions: true });
        saveConfig();
        saveNotes();
    });

    await waitForIndexedDbKeys(page, [
        'core_eveV22Data',
        'core_eveV22BookmarkFolders',
        'core_eveV22QuickPins',
        'core_eveV22ConstellationDetached',
        'core_eveV22Config',
        'core_eveV22Notes'
    ]);

    const beforeReload = await page.evaluate(async () => {
        const snapshotSaved = await window.EveChronosEngine.captureSnapshot();
        const idbKeys = await window.IDBStore.keys();
        return {
            storageStatus: window.EveCoreStorage.getStatus(),
            idbKeys: idbKeys.filter((key) => String(key || '').startsWith('core_')).sort(),
            legacyLinksPresent: localStorage.getItem('eveV22Data') !== null,
            legacyConfigPresent: localStorage.getItem('eveV22Config') !== null,
            themeBootPresent: localStorage.getItem('eveV22ThemeBoot') !== null,
            snapshotSaved,
            localSnapshotCount: Object.keys(localStorage).filter((key) => key.startsWith('eveos_pulse_snapshot_')).length
        };
    });

    await page.reload({ waitUntil: 'load', timeout: 240000 });
    await waitForApp(page);

    const afterReload = await page.evaluate(() => ({
        title: Array.isArray(links) && links[0] ? links[0].title : '',
        userName: config?.userName || '',
        notes: document.getElementById('notes-area')?.value || ''
    }));

    await context.close();
    return { beforeReload, afterReload };
}

async function runFallbackScenario(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', {
            configurable: true,
            enumerable: true,
            get() {
                return undefined;
            }
        });
    });
    const page = await context.newPage();

    await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
    await waitForApp(page);

    await page.evaluate(() => {
        localStorage.clear();
        links = [];
        bookmarkFolders = {};
        quickPins = [];
        window.constellationDetachedChains = {};
        config = { ...(config || {}) };
        const notesArea = document.getElementById('notes-area');
        if (notesArea) notesArea.value = '';
    });

    await page.evaluate(() => {
        links = [{
            id: 202,
            title: 'Fallback Link',
            url: 'https://example.com/fallback',
            category: 'Start',
            done: false,
            workspace: 'main'
        }];
        bookmarkFolders = {
            Start: [{
                id: 'folder-2',
                name: 'Fallback Folder',
                links: [202]
            }]
        };
        quickPins = [{ id: 202, title: 'Fallback Link' }];
        window.constellationDetachedChains = {
            detached: [{ id: 'chain-2', label: 'Fallback Detached' }]
        };
        config = {
            ...(config || {}),
            userName: 'Fallback Drift',
            theme: 'light'
        };
        const notesArea = document.getElementById('notes-area');
        if (notesArea) notesArea.value = 'Fallback notes payload';
        saveData({ skipRender: true, skipSuggestions: true });
        saveConfig();
        saveNotes();
    });

    await page.waitForFunction(() => {
        return localStorage.getItem('eveV22Data') !== null
            && localStorage.getItem('eveV22Config') !== null
            && localStorage.getItem('eveV22Notes') !== null;
    }, undefined, { timeout: 30000 });

    const beforeReload = await page.evaluate(async () => ({
        storageStatus: window.EveCoreStorage.getStatus(),
        legacyLinksPresent: localStorage.getItem('eveV22Data') !== null,
        legacyConfigPresent: localStorage.getItem('eveV22Config') !== null,
        themeBootPresent: localStorage.getItem('eveV22ThemeBoot') !== null,
        snapshotSaved: await window.EveChronosEngine.captureSnapshot(),
        localSnapshotCount: Object.keys(localStorage).filter((key) => key.startsWith('eveos_pulse_snapshot_')).length
    }));

    await page.reload({ waitUntil: 'load', timeout: 240000 });
    await waitForApp(page);

    const afterReload = await page.evaluate(() => ({
        title: Array.isArray(links) && links[0] ? links[0].title : '',
        userName: config?.userName || '',
        notes: document.getElementById('notes-area')?.value || ''
    }));

    await context.close();
    return { beforeReload, afterReload };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const indexedDbScenario = await runIndexedDbScenario(browser);
        const fallbackScenario = await runFallbackScenario(browser);

        if (indexedDbScenario.beforeReload.storageStatus.backend !== 'indexeddb' || indexedDbScenario.beforeReload.storageStatus.degraded) {
            throw new Error(`Expected IndexedDB backend for normal scenario: ${JSON.stringify(indexedDbScenario.beforeReload.storageStatus)}`);
        }
        if (!indexedDbScenario.beforeReload.idbKeys.includes('core_eveV22Data') || !indexedDbScenario.beforeReload.idbKeys.some((key) => key.startsWith('core_eveos_pulse_snapshot_'))) {
            throw new Error(`Expected core state and Chronos snapshot in IndexedDB: ${JSON.stringify(indexedDbScenario.beforeReload.idbKeys)}`);
        }
        if (indexedDbScenario.beforeReload.legacyLinksPresent || indexedDbScenario.beforeReload.legacyConfigPresent) {
            throw new Error(`Expected heavy legacy localStorage keys to be cleaned after IndexedDB save: ${JSON.stringify(indexedDbScenario.beforeReload)}`);
        }
        if (!indexedDbScenario.beforeReload.themeBootPresent) {
            throw new Error('Expected theme boot mirror to remain in localStorage');
        }
        if (!indexedDbScenario.beforeReload.snapshotSaved || indexedDbScenario.beforeReload.localSnapshotCount !== 0) {
            throw new Error(`Expected Chronos to save snapshots only to IndexedDB in normal mode: ${JSON.stringify(indexedDbScenario.beforeReload)}`);
        }
        if (indexedDbScenario.afterReload.title !== 'Alpha Link' || indexedDbScenario.afterReload.userName !== 'Drift Core' || indexedDbScenario.afterReload.notes !== 'IDB notes payload') {
            throw new Error(`Expected IndexedDB state to restore after reload: ${JSON.stringify(indexedDbScenario.afterReload)}`);
        }

        if (fallbackScenario.beforeReload.storageStatus.backend !== 'localstorage' || !fallbackScenario.beforeReload.storageStatus.degraded) {
            throw new Error(`Expected degraded localStorage backend when IndexedDB is unavailable: ${JSON.stringify(fallbackScenario.beforeReload.storageStatus)}`);
        }
        if (!fallbackScenario.beforeReload.legacyLinksPresent || !fallbackScenario.beforeReload.legacyConfigPresent || !fallbackScenario.beforeReload.themeBootPresent) {
            throw new Error(`Expected localStorage fallback keys when IndexedDB is unavailable: ${JSON.stringify(fallbackScenario.beforeReload)}`);
        }
        if (fallbackScenario.beforeReload.snapshotSaved !== false || fallbackScenario.beforeReload.localSnapshotCount !== 0) {
            throw new Error(`Expected Chronos snapshots to stay disabled in fallback mode: ${JSON.stringify(fallbackScenario.beforeReload)}`);
        }
        if (fallbackScenario.afterReload.title !== 'Fallback Link' || fallbackScenario.afterReload.userName !== 'Fallback Drift' || fallbackScenario.afterReload.notes !== 'Fallback notes payload') {
            throw new Error(`Expected localStorage fallback state to restore after reload: ${JSON.stringify(fallbackScenario.afterReload)}`);
        }

        console.log(`CORE_STORAGE_BACKEND_SMOKE_OK ${JSON.stringify({ indexedDbScenario, fallbackScenario })}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
