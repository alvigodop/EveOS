const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3046;
const LOG_FILE = path.join(os.tmpdir(), 'eve-backup-restore-target-remap-browser-smoke.log');

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
            { id: 'main-root', title: 'Main Root', url: 'https://example.com/main-root', workspace: 'main', category: 'Reading' },
            { id: 'main-folder-root', title: 'Main Folder Root', url: 'https://example.com/main-folder-root', workspace: 'main', category: 'Reading', folderId: 'f-a' },
            { id: 'main-folder-child', title: 'Main Folder Child', url: 'https://example.com/main-folder-child', workspace: 'main', category: 'Reading', folderId: 'f-b' },
            { id: 'target-root', title: 'Target Root', url: 'https://example.com/target-root', workspace: 'targetspace', category: 'Target' },
            { id: 'target-folder-old', title: 'Target Folder Old', url: 'https://example.com/target-folder-old', workspace: 'targetspace', category: 'Target', folderId: 'f-target' },
            { id: 'target-other', title: 'Target Other', url: 'https://example.com/target-other', workspace: 'targetspace', category: 'Target', folderId: 'f-else' }
        ],
        bookmarkFolders: {
            'main::Reading': {
                nodes: [
                    { id: 'f-a', parentId: null, name: 'Source Root', order: 1 },
                    { id: 'f-b', parentId: 'f-a', name: 'Source Child', order: 1 }
                ]
            },
            'targetspace::Target': {
                nodes: [
                    { id: 'f-target', parentId: null, name: 'Target Root', order: 1 },
                    { id: 'f-else', parentId: null, name: 'Keep Root', order: 2 }
                ]
            }
        },
        config: {
            activeWorkspace: 'main',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'folder', subTabs: [] },
                { id: 'targetspace', name: 'Target Space', icon: 'folder', subTabs: [] }
            ]
        },
        libraries: {
            'main::Reading': {
                dataType: 'graphicNovels',
                folderView: { root: 'all', chain: [], expanded: false },
                entries: [
                    { id: 'entry-main-root', title: 'Entry Main Root' },
                    { id: 'entry-main-folder-root', title: 'Entry Main Folder Root' },
                    { id: 'entry-main-folder-child', title: 'Entry Main Folder Child' }
                ]
            },
            'targetspace::Target': {
                dataType: 'graphicNovels',
                folderView: { root: 'all', chain: [], expanded: false },
                entries: [
                    { id: 'entry-target-root', title: 'Entry Target Root' },
                    { id: 'entry-target-folder-old', title: 'Entry Target Folder Old' },
                    { id: 'entry-target-other', title: 'Entry Target Other' }
                ]
            }
        },
        connections: [
            { id: 'conn-main-root', linkId: 'main-root', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'entry-main-root' },
            { id: 'conn-main-folder-root', linkId: 'main-folder-root', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'entry-main-folder-root' },
            { id: 'conn-main-folder-child', linkId: 'main-folder-child', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'entry-main-folder-child' },
            { id: 'conn-target-root', linkId: 'target-root', workspace: 'targetspace', categoryName: 'Target', libraryEntryId: 'entry-target-root' },
            { id: 'conn-target-folder-old', linkId: 'target-folder-old', workspace: 'targetspace', categoryName: 'Target', libraryEntryId: 'entry-target-folder-old' },
            { id: 'conn-target-other', linkId: 'target-other', workspace: 'targetspace', categoryName: 'Target', libraryEntryId: 'entry-target-other' }
        ]
    };
}

async function runBrowserSmoke(page) {
    return page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const normalize = (value) => JSON.parse(JSON.stringify(value));

        if (typeof window.loadData === 'function') {
            window.loadData();
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
        const LibraryState = window.EveLibrary?.State;
        if (
            !Store?.captureState
            || !Store?.applyState
            || !Store?.captureWorkspace
            || !Store?.captureCard
            || !Store?.captureFolder
            || !Store?.applyWorkspaceState
            || !Store?.applyCardState
            || !Store?.applyFolderState
            || !Transfer?.remapWorkspaceStateForRestore
            || !Transfer?.remapCardStateForRestore
            || !Transfer?.remapFolderStateForRestore
            || !LibraryState?.getAllLibraries
        ) {
            throw new Error('Required store or transfer helpers are unavailable');
        }

        const initialState = normalize(Store.captureState());
        const resetState = () => {
            const resetOk = Store.applyState(normalize(initialState));
            if (!resetOk) throw new Error('Failed to reset initial state');
        };

        const workspaceBackup = normalize(Store.captureWorkspace('main'));
        const remappedWorkspace = Transfer.remapWorkspaceStateForRestore(workspaceBackup, 'targetspace');
        if (!Store.applyWorkspaceState(remappedWorkspace)) {
            throw new Error('applyWorkspaceState returned false for remapped workspace backup');
        }
        const workspaceLinks = (window.eveState?.links || [])
            .filter((link) => link.workspace === 'targetspace' && link.category === 'Reading')
            .map((link) => String(link.id))
            .sort();
        const workspaceLibraries = Object.keys(LibraryState.getAllLibraries() || {}).sort();
        if (workspaceLinks.join('|') !== ['main-folder-child', 'main-folder-root', 'main-root'].sort().join('|')) {
            throw new Error(`Workspace remap failed: ${workspaceLinks.join('|')}`);
        }
        if (!workspaceLibraries.includes('targetspace::Reading')) {
            throw new Error(`Workspace library remap missing targetspace::Reading: ${workspaceLibraries.join('|')}`);
        }

        resetState();

        const cardBackup = normalize(Store.captureCard('main', 'Reading'));
        const remappedCard = Transfer.remapCardStateForRestore(cardBackup, {
            workspaceId: 'targetspace',
            categoryName: 'Imported Reading',
            createUniqueCategory: false
        });
        if (!Store.applyCardState(remappedCard)) {
            throw new Error('applyCardState returned false for remapped card backup');
        }
        const cardLinks = (window.eveState?.links || [])
            .filter((link) => link.workspace === 'targetspace' && link.category === 'Imported Reading')
            .map((link) => String(link.id))
            .sort();
        const cardTreeNodes = (((window.eveState?.bookmarkFolders || {})['targetspace::Imported Reading'] || {}).nodes || [])
            .map((node) => String(node.id))
            .sort();
        if (cardLinks.join('|') !== ['main-folder-child', 'main-folder-root', 'main-root'].sort().join('|')) {
            throw new Error(`Card remap failed: ${cardLinks.join('|')}`);
        }
        if (cardTreeNodes.join('|') !== ['f-a', 'f-b'].join('|')) {
            throw new Error(`Card folder tree remap failed: ${cardTreeNodes.join('|')}`);
        }

        resetState();

        const folderBackup = normalize(Store.captureFolder('main', 'Reading', 'f-a'));
        const remappedFolder = Transfer.remapFolderStateForRestore(folderBackup, {
            workspaceId: 'targetspace',
            categoryName: 'Target',
            folderId: 'f-target'
        });
        if (!Store.applyFolderState(remappedFolder)) {
            throw new Error('applyFolderState returned false for remapped folder backup');
        }
        const targetLinks = (window.eveState?.links || [])
            .filter((link) => link.workspace === 'targetspace' && link.category === 'Target')
            .map((link) => ({
                id: String(link.id),
                folderId: String(link.folderId || '')
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
        const targetTreeNodes = (((window.eveState?.bookmarkFolders || {})['targetspace::Target'] || {}).nodes || [])
            .map((node) => ({
                id: String(node.id),
                parentId: String(node.parentId || '')
            }))
            .sort((a, b) => a.id.localeCompare(b.id));

        const linkIds = targetLinks.map((link) => link.id).sort();
        if (linkIds.join('|') !== ['main-folder-child', 'main-folder-root', 'target-other', 'target-root'].sort().join('|')) {
            throw new Error(`Folder remap link set failed: ${JSON.stringify(targetLinks)}`);
        }
        const importedRootLink = targetLinks.find((link) => link.id === 'main-folder-root');
        const importedChildLink = targetLinks.find((link) => link.id === 'main-folder-child');
        if (!importedRootLink || importedRootLink.folderId !== 'f-target') {
            throw new Error(`Folder remap root link failed: ${JSON.stringify(targetLinks)}`);
        }
        if (!importedChildLink || importedChildLink.folderId !== 'f-b') {
            throw new Error(`Folder remap child link failed: ${JSON.stringify(targetLinks)}`);
        }
        if (targetLinks.some((link) => link.folderId === 'f-a')) {
            throw new Error(`Folder remap leaked source root folder id: ${JSON.stringify(targetLinks)}`);
        }
        if (!targetTreeNodes.some((node) => node.id === 'f-target' && node.parentId === '')) {
            throw new Error(`Folder remap missing target root node: ${JSON.stringify(targetTreeNodes)}`);
        }
        if (!targetTreeNodes.some((node) => node.id === 'f-b' && node.parentId === 'f-target')) {
            throw new Error(`Folder remap missing child node under target root: ${JSON.stringify(targetTreeNodes)}`);
        }
        if (targetTreeNodes.some((node) => node.id === 'f-a')) {
            throw new Error(`Folder remap leaked source root node id: ${JSON.stringify(targetTreeNodes)}`);
        }

        return {
            workspaceLinks,
            cardLinks,
            folderLinks: targetLinks,
            folderTreeNodes: targetTreeNodes
        };
    });
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-backup-restore-remap-store-'));
    let browser = null;
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
        await page.waitForFunction(() => (
            !!window.EveDataStore?.Store?.captureState
            && !!window.EveDataStore?.Store?.captureWorkspace
            && !!window.EveDataStore?.Store?.captureCard
            && !!window.EveDataStore?.Store?.captureFolder
            && !!window.EveDataStore?.Store?.applyState
            && !!window.EveDataStore?.Store?.applyWorkspaceState
            && !!window.EveDataStore?.Store?.applyCardState
            && !!window.EveDataStore?.Store?.applyFolderState
            && !!window.EveDataTransfer?.remapWorkspaceStateForRestore
            && !!window.EveDataTransfer?.remapCardStateForRestore
            && !!window.EveDataTransfer?.remapFolderStateForRestore
            && !!window.EveLibrary?.State?.getAllLibraries
            && typeof window.loadData === 'function'
        ), undefined, { timeout: 180000 });
        await page.waitForTimeout(1500);

        const result = await runBrowserSmoke(page);
        console.log(`BACKUP_RESTORE_TARGET_REMAP_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
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
    }
}

main();
