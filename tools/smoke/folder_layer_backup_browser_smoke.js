const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3027;
const LOG_FILE = path.join(os.tmpdir(), 'eve-folder-layer-browser-smoke.log');

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
            { id: 'l-root', title: 'Root Bookmark', url: 'https://example.com/root', workspace: 'main', category: 'Reading' },
            { id: 'l-a', title: 'Folder A Bookmark', url: 'https://example.com/a', workspace: 'main', category: 'Reading', folderId: 'f-a' },
            { id: 'l-b', title: 'Folder B Bookmark', url: 'https://example.com/b', workspace: 'main', category: 'Reading', folderId: 'f-b' },
            { id: 'l-x', title: 'Folder X Bookmark', url: 'https://example.com/x', workspace: 'main', category: 'Reading', folderId: 'f-x' }
        ],
        bookmarkFolders: {
            'main::Reading': {
                nodes: [
                    { id: 'f-a', parentId: null, name: 'Main Folder', order: 1 },
                    { id: 'f-b', parentId: 'f-a', name: 'Sub Folder', order: 1 },
                    { id: 'f-x', parentId: null, name: 'Other Folder', order: 2 }
                ]
            }
        },
        config: {
            activeWorkspace: 'main',
            workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }]
        },
        libraries: {
            'main::Reading': {
                dataType: 'graphicNovels',
                folderView: {
                    root: 'all',
                    chain: [],
                    expanded: false
                },
                entries: [
                    { id: 'e-root', title: 'Entry Root' },
                    { id: 'e-a', title: 'Entry A' },
                    { id: 'e-b', title: 'Entry B' },
                    { id: 'e-x', title: 'Entry X' }
                ]
            }
        },
        connections: [
            { id: 'c-root', linkId: 'l-root', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-root' },
            { id: 'c-a', linkId: 'l-a', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-a' },
            { id: 'c-b', linkId: 'l-b', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-b' },
            { id: 'c-x', linkId: 'l-x', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-x' }
        ],
        knowledge: {
            wikiEntries: [{ title: 'Reading', url: 'https://en.wikipedia.org/wiki/Reading' }],
            fandomDomains: [{ title: 'Readingverse', domain: 'readingverse.fandom.com', url: 'https://readingverse.fandom.com' }],
            wikiCategories: [{ name: 'Reference' }],
            wikiDataStore: {
                searchResults: {
                    'readingverse.fandom.com': {
                        domain: 'readingverse.fandom.com',
                        items: [{ title: 'Readingverse Home' }]
                    }
                }
            },
            wikiCacheStore: {
                Reading: { title: 'Reading', updatedAt: 1712000000000 }
            },
            apiSearchCachePool: {
                naruto: {
                    query: 'naruto',
                    updatedAt: 1712000000000,
                    expiresAt: 1712086400000,
                    summary: { totalResults: 2, perSource: { openlibrary: 1, tvmaze: 1 } },
                    sources: {
                        openlibrary: { docs: [{ title: 'Naruto Companion' }] },
                        tvmaze: [{ name: 'Naruto Live Action' }]
                    }
                }
            },
            apiSearchPrefs: {
                liveResults: false,
                hybridResults: true,
                ttlMs: 86400000
            }
        }
    };
}

async function runBrowserSmoke(page, backupParent) {
    return page.evaluate(async (destinationPath) => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const normalize = (value) => JSON.parse(JSON.stringify(value));
        const readingScopedKey = 'main::Reading';

        if (typeof window.loadData === 'function') {
            window.loadData();
        }
        if (window.EveLibrary?.Storage?.loadLibrary) {
            window.EveLibrary.Storage.loadLibrary();
        }
        await wait(300);

        await window.EveDataStore.ModularSync.syncNow(true);

        const capture = window.EveDataStore.Store.captureFolder('main', 'Reading', 'f-a');
        if (!capture) throw new Error('captureFolder returned null');
        if (capture.metadata?.type !== 'folder' || capture.metadata?.folderId !== 'f-a') {
            throw new Error(`Unexpected folder capture metadata: ${JSON.stringify(capture.metadata || {})}`);
        }

        const capturedLinkIds = (capture.bookmarks?.links || []).map((entry) => String(entry.id)).sort();
        if (capturedLinkIds.join('|') !== ['l-a', 'l-b'].join('|')) {
            throw new Error(`Unexpected captured folder links: ${capturedLinkIds.join('|')}`);
        }

        const capturedFolderIds = ((capture.bookmarks?.folders || {})[readingScopedKey]?.nodes || [])
            .map((node) => String(node.id))
            .sort();
        if (capturedFolderIds.join('|') !== ['f-a', 'f-b'].join('|')) {
            throw new Error(`Unexpected captured folder nodes: ${capturedFolderIds.join('|')}`);
        }

        if (!document.getElementById('settingsModal') && typeof window.modalTemplate === 'string' && window.modalTemplate.trim()) {
            document.body.insertAdjacentHTML('beforeend', window.modalTemplate);
        }
        window.openSettings();
        await wait(400);

        const backupMode = document.getElementById('backupSettingsMode');
        const folderPanel = document.querySelector('[data-backup-panel="folder"]');
        const folderWorkspaceSelect = document.getElementById('folderBackupWorkspaceSelect');
        const folderCategorySelect = document.getElementById('folderBackupCategorySelect');
        const folderSelect = document.getElementById('folderBackupFolderSelect');
        const modularScopeSelect = document.getElementById('modularLayerScope');
        const modularFolderSelect = document.getElementById('modularLayerFolderSelect');
        if (!backupMode || !folderPanel || !folderWorkspaceSelect || !folderCategorySelect || !folderSelect || !modularScopeSelect || !modularFolderSelect) {
            throw new Error('Folder backup/settings controls missing');
        }

        backupMode.value = 'folder';
        backupMode.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(150);
        const folderPanelVisible = !folderPanel.hidden && window.getComputedStyle(folderPanel).display !== 'none';
        if (!folderPanelVisible) throw new Error('Folder backup panel did not become visible');

        const folderOptionValues = Array.from(folderSelect.options).map((option) => option.value).sort();
        if (folderOptionValues.join('|') !== ['f-a', 'f-b', 'f-x'].join('|')) {
            throw new Error(`Unexpected folder backup options: ${folderOptionValues.join('|')}`);
        }

        modularScopeSelect.value = 'folder';
        modularScopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(150);
        const modularFolderValues = Array.from(modularFolderSelect.options).map((option) => option.value).sort();
        if (modularFolderValues.join('|') !== ['f-a', 'f-b', 'f-x'].join('|')) {
            throw new Error(`Unexpected modular folder options: ${modularFolderValues.join('|')}`);
        }

        const backupResult = await window.EveDataStore.ModularSync.backupLayer({
            layer: 'folder',
            workspaceId: 'main',
            categoryName: 'Reading',
            folderId: 'f-a',
            destinationPath
        });
        if (!backupResult?.ok || !backupResult.destinationPath) {
            throw new Error(`Folder layer backup failed: ${JSON.stringify(backupResult || {})}`);
        }

        const modified = normalize(capture);
        modified.bookmarks.links = [
            {
                id: 'l-a2',
                title: 'Folder A Replacement',
                url: 'https://example.com/a2',
                workspace: 'main',
                category: 'Reading',
                folderId: 'f-a'
            }
        ];
        modified.library.connections = [
            {
                id: 'c-a2',
                linkId: 'l-a2',
                workspace: 'main',
                categoryName: 'Reading',
                libraryEntryId: 'e-a2'
            }
        ];
        modified.library.categories[readingScopedKey] = {
            dataType: 'graphicNovels',
            folderView: { root: 'all', chain: [], expanded: false },
            entries: [
                { id: 'e-a2', title: 'Entry A2' }
            ]
        };

        const applied = window.EveDataStore.Store.applyFolderState(modified);
        if (!applied) throw new Error('applyFolderState returned false');

        const afterApplyIds = window.eveState.links
            .filter((entry) => entry.workspace === 'main' && entry.category === 'Reading')
            .map((entry) => String(entry.id))
            .sort();
        if (afterApplyIds.join('|') !== ['l-a2', 'l-root', 'l-x'].sort().join('|')) {
            throw new Error(`Unexpected link ids after folder apply: ${afterApplyIds.join('|')}`);
        }

        await window.EveDataStore.ModularSync.syncNow(true);

        return {
            backupDestinationPath: backupResult.destinationPath,
            folderOptionValues,
            modularFolderValues,
            afterApplyIds
        };
    }, backupParent);
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-folder-layer-store-'));
    const backupParent = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-folder-layer-backups-'));
    let browser = null;
    const server = spawn('python', ['python-server.py', String(PORT), '--no-browser', '--modular-root', modularRoot], {
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
            localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
            localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
            localStorage.setItem('eveLibraryData', JSON.stringify(payload.libraries));
            localStorage.setItem('eveLibraryConnections', JSON.stringify(payload.connections));
            localStorage.setItem('reading_wikiEntries', JSON.stringify(payload.knowledge.wikiEntries));
            localStorage.setItem('reading_fandomDomains', JSON.stringify(payload.knowledge.fandomDomains));
            localStorage.setItem('reading_wikiCategories', JSON.stringify(payload.knowledge.wikiCategories));
            localStorage.setItem('reading_wikiDataStore', JSON.stringify(payload.knowledge.wikiDataStore));
            localStorage.setItem('reading_wikiCacheStore', JSON.stringify(payload.knowledge.wikiCacheStore));
            localStorage.setItem('reading_apiSearchCachePool', JSON.stringify(payload.knowledge.apiSearchCachePool));
            localStorage.setItem('reading_apiSearchPrefs', JSON.stringify(payload.knowledge.apiSearchPrefs));
        }, seed);

        await page.goto(`http://localhost:${PORT}/EveOS.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        await page.waitForFunction(() => (
            !!window.EveDataStore &&
            !!window.EveDataStore.Store &&
            !!window.EveDataStore.Store.captureFolder &&
            !!window.EveDataStore.Store.applyFolderState &&
            !!window.EveDataStore.ModularSync &&
            !!window.EveDataStore.ModularSync.syncNow &&
            !!window.EveDataStore.ModularSync.backupLayer &&
            !!window.EveLibrary?.Storage?.loadLibrary &&
            typeof window.loadData === 'function' &&
            typeof window.openSettings === 'function'
        ), undefined, { timeout: 180000 });
        await page.waitForTimeout(2000);

        const result = await runBrowserSmoke(page, backupParent);
        const exportedFiles = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath);
                    continue;
                }
                exportedFiles.push(path.relative(result.backupDestinationPath, fullPath).replace(/\\/g, '/'));
            }
        };
        walk(result.backupDestinationPath);

        const hasFolderJson = exportedFiles.includes('folders/main-folder/folder.json')
            || exportedFiles.includes('f/main-folder/folder.json')
            || exportedFiles.some((file) => /\/folder\.json$/i.test(file));
        if (!hasFolderJson) {
            throw new Error(`Expected folder.json in exported folder subtree. Files: ${exportedFiles.join(', ')}`);
        }

        if (!exportedFiles.some((file) => /(?:entries|e)\/.+\.json$/i.test(file))) {
            throw new Error(`Expected bookmark entry JSON files in exported subtree. Files: ${exportedFiles.join(', ')}`);
        }
        if (!exportedFiles.includes('knowledge/scoped-storage.json')) {
            throw new Error(`Expected knowledge/scoped-storage.json in exported subtree. Files: ${exportedFiles.join(', ')}`);
        }

        console.log(`FOLDER_LAYER_BROWSER_SMOKE_OK ${JSON.stringify({
            ...result,
            exportedFiles
        })}`);
    } catch (error) {
        console.error(error && error.stack ? error.stack : String(error));
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
        fs.rmSync(backupParent, { recursive: true, force: true });
    }
}

main();
