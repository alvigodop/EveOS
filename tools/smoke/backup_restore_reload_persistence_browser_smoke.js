const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3047;
const LOG_FILE = path.join(os.tmpdir(), 'eve-backup-restore-reload-persistence-browser-smoke.log');

function logStep(message) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

async function waitForStatus(url, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ok = await new Promise((resolve) => {
            const req = http.get(url, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(1000, () => {
                req.destroy();
                resolve(false);
            });
        });
        if (ok) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function buildSeedPayload() {
    return {
        links: [
            { id: 'old-link', title: 'Old Link', url: 'https://example.com/old', workspace: 'main', category: 'Reading' }
        ],
        bookmarkFolders: {},
        config: {
            activeWorkspace: 'main',
            workspaces: [{ id: 'main', name: 'Main', icon: 'folder', subTabs: [] }]
        },
        libraries: {
            'main::Reading': {
                dataType: 'graphicNovels',
                folderView: { root: 'all', chain: [], expanded: false },
                entries: [
                    { id: 'entry-old-link', title: 'Entry Old Link' }
                ]
            }
        },
        connections: [
            { id: 'conn-old-link', linkId: 'old-link', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'entry-old-link' }
        ]
    };
}

async function waitForAppReady(page) {
    await page.waitForFunction(() => (
        !!window.EveDataStore?.Store?.captureState
        && !!window.EveDataStore?.Store?.applyState
        && !!window.EveDataStore?.ModularSync?.syncNow
        && !!window.EveDataTransfer?.persistRestoredState
        && !!window.EveLibrary?.Storage?.loadLibrary
        && !!window.EveLibrary?.ConnectionsAPI?.loadConnections
        && typeof window.loadData === 'function'
    ), undefined, { timeout: 180000 });
}

async function applyRestoreAndPersist(page) {
    return page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const clone = (value) => JSON.parse(JSON.stringify(value));

        if (typeof window.loadData === 'function') {
            await window.loadData();
        }
        if (window.EveLibrary?.Storage?.loadLibrary) {
            window.EveLibrary.Storage.loadLibrary();
        }
        if (window.EveLibrary?.ConnectionsAPI?.loadConnections) {
            window.EveLibrary.ConnectionsAPI.loadConnections();
        }
        await wait(400);

        const Store = window.EveDataStore?.Store;
        const Transfer = window.EveDataTransfer;
        if (!Store?.captureState || !Store?.applyState || !Transfer?.persistRestoredState) {
            throw new Error('Restore helpers unavailable');
        }

        const seededSync = await window.EveDataStore.ModularSync.syncNow(true);
        if (!seededSync?.ok) {
            throw new Error(`Initial modular sync failed: ${JSON.stringify(seededSync || {})}`);
        }

        const restoredState = clone(Store.captureState());
        restoredState.metadata = {
            ...(restoredState.metadata || {}),
            generator: 'backup_restore_reload_persistence_browser_smoke'
        };
        restoredState.bookmarks.links = [
            { id: 'restored-link', title: 'Restored Link', url: 'https://example.com/restored', workspace: 'main', category: 'Reading' }
        ];
        restoredState.library.categories = {
            'main::Reading': {
                dataType: 'graphicNovels',
                folderView: { root: 'all', chain: [], expanded: false },
                entries: [
                    { id: 'entry-restored-link', title: 'Entry Restored Link' }
                ]
            }
        };
        restoredState.library.connections = [
            { id: 'conn-restored-link', linkId: 'restored-link', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'entry-restored-link' }
        ];

        const applied = Store.applyState(restoredState);
        if (!applied) {
            throw new Error('applyState returned false for restored state');
        }

        const inMemoryLinks = (window.eveState?.links || []).map((link) => String(link.id)).sort();
        const appliedConnections = (window.EveLibrary?.ConnectionsAPI?.getAll?.() || [])
            .map((connection) => String(connection.linkId))
            .sort();
        if (inMemoryLinks.join('|') !== ['restored-link'].join('|')) {
            throw new Error(`Restored state not applied in memory: ${inMemoryLinks.join('|')}`);
        }
        if (appliedConnections.join('|') !== ['restored-link'].join('|')) {
            throw new Error(`Restored connections not applied in memory: ${appliedConnections.join('|')}`);
        }

        const persisted = await Transfer.persistRestoredState({
            skipRender: true,
            skipSuggestions: true
        });
        if (!persisted?.ok) {
            throw new Error(`persistRestoredState failed: ${JSON.stringify(persisted || {})}`);
        }

        const storedConnections = await window.EveCoreStorage?.loadJson?.(
            'eveLibraryConnections',
            [],
            { legacyKeys: ['eveLibraryConnections'] }
        );
        return {
            inMemoryLinks,
            appliedConnections,
            currentConnections: (window.EveLibrary?.ConnectionsAPI?.getAll?.() || [])
                .map((connection) => String(connection.linkId))
                .sort(),
            storedConnections: (Array.isArray(storedConnections) ? storedConnections : [])
                .map((connection) => String(connection.linkId))
                .sort(),
            localFallbackConnections: JSON.parse(localStorage.getItem('eveLibraryConnections') || '[]')
                .map((connection) => String(connection.linkId))
                .sort(),
            capturedConnections: (Store.captureState()?.library?.connections || [])
                .map((connection) => String(connection.linkId))
                .sort()
        };
    });
}

async function readReloadedState(page) {
    return page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        if (typeof window.loadData === 'function') {
            await window.loadData();
        }
        if (window.EveLibrary?.Storage?.loadLibrary) {
            window.EveLibrary.Storage.loadLibrary();
        }
        if (window.EveLibrary?.ConnectionsAPI?.loadConnections) {
            window.EveLibrary.ConnectionsAPI.loadConnections();
        }
        await wait(400);

        const links = (window.eveState?.links || []).map((link) => String(link.id)).sort();
        const connections = (window.EveLibrary?.ConnectionsAPI?.getAll?.() || []).map((conn) => String(conn.linkId)).sort();
        const libraryEntries = (((window.EveLibrary?.State?.getAllLibraries?.() || {})['main::Reading'] || {}).entries || [])
            .map((entry) => String(entry.id))
            .sort();
        return { links, connections, libraryEntries };
    });
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-backup-restore-reload-store-'));
    let browser = null;
    let beforeReload = null;
    const server = spawn('python', ['server/python-server.py', String(PORT), '--no-browser', '--modular-root', modularRoot], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverStdout = '';
    let serverStderr = '';
    server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
    server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

    try {
        logStep('main:waitForStatus:start');
        await waitForStatus(`http://localhost:${PORT}/api/status`);
        logStep('main:waitForStatus:done');

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        const seed = buildSeedPayload();

        await page.addInitScript((payload) => {
            if (sessionStorage.getItem('eve-backup-restore-reload-seeded') === '1') {
                return;
            }
            sessionStorage.setItem('eve-backup-restore-reload-seeded', '1');
            localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
            localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
            localStorage.setItem('eveLibraryData', JSON.stringify(payload.libraries));
            localStorage.setItem('eveLibraryConnections', JSON.stringify(payload.connections));
        }, seed);

        await page.goto(`http://localhost:${PORT}/EveOS.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        await waitForAppReady(page);
        await page.waitForTimeout(1500);

        beforeReload = await applyRestoreAndPersist(page);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await waitForAppReady(page);
        await page.waitForTimeout(1500);

        const afterReload = await readReloadedState(page);
        if (afterReload.links.join('|') !== ['restored-link'].join('|')) {
            throw new Error(`Reloaded old link state: ${JSON.stringify(afterReload)}`);
        }
        if (afterReload.connections.join('|') !== ['restored-link'].join('|')) {
            throw new Error(`Reloaded old connection state: ${JSON.stringify(afterReload)}`);
        }
        if (afterReload.libraryEntries.join('|') !== ['entry-restored-link'].join('|')) {
            throw new Error(`Reloaded old library state: ${JSON.stringify(afterReload)}`);
        }

        console.log(`BACKUP_RESTORE_RELOAD_PERSISTENCE_BROWSER_SMOKE_OK ${JSON.stringify({
            beforeReload,
            afterReload
        })}`);
    } catch (error) {
        console.error(error && error.stack ? error.stack : String(error));
        if (beforeReload) {
            console.error(`--- BEFORE RELOAD ---\n${JSON.stringify(beforeReload, null, 2)}`);
        }
        console.error('--- SERVER STDOUT ---');
        console.error(serverStdout);
        console.error('--- SERVER STDERR ---');
        console.error(serverStderr);
        process.exitCode = 1;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                logStep(`browserClose:error:${String(error)}`);
            }
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
    }
}

main();
