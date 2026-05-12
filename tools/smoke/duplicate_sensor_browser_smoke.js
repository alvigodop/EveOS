const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3028;
const LOG_FILE = path.join(os.tmpdir(), 'eve-duplicate-sensor-browser-smoke.log');

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
            { id: 'root-1', title: 'Root Duplicate 1', url: 'https://example.com/root-dup', workspace: 'main', category: 'Reading' },
            { id: 'root-2', title: 'Root Duplicate 2', url: 'https://example.com/root-dup/', workspace: 'main', category: 'Reading' },
            { id: 'folder-1', title: 'Folder Duplicate 1', url: 'https://example.com/folder-dup?b=2&a=1', workspace: 'main', category: 'Reading', folderId: 'f-a' },
            { id: 'folder-2', title: 'Folder Duplicate 2', url: 'https://www.example.com/folder-dup?a=1&b=2', workspace: 'main', category: 'Reading', folderId: 'f-a' },
            { id: 'tab-1', title: 'Tab Duplicate 1', url: 'https://example.com/tab-dup', workspace: 'main', category: 'Reading' },
            { id: 'tab-2', title: 'Tab Duplicate 2', url: 'https://example.com/tab-dup', workspace: 'main', category: 'Watching' },
            { id: 'global-1', title: 'Global Duplicate 1', url: 'https://example.com/global-dup', workspace: 'main', category: 'Watching' },
            { id: 'global-2', title: 'Global Duplicate 2', url: 'https://example.com/global-dup', workspace: 'alt', category: 'Reading' },
            { id: 'related-1', title: 'Related URL Target', url: 'https://example.com/related-target', workspace: 'alt', category: 'Reading' },
            { id: 'related-2', title: 'Different Related URL Source', url: 'https://example.com/related-source', relatedUrls: [{ url: 'https://example.com/related-target' }], workspace: 'alt', category: 'Reading' },
            { id: 'unique-1', title: 'Unique Entry', url: 'https://example.com/unique', workspace: 'main', category: 'Reading', folderId: 'f-b' }
        ],
        bookmarkFolders: {
            'main::Reading': {
                nodes: [
                    { id: 'f-a', parentId: null, name: 'Main Folder', order: 1 },
                    { id: 'f-b', parentId: 'f-a', name: 'Sub Folder', order: 1 }
                ]
            }
        },
        config: {
            activeWorkspace: 'main',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'folder' },
                { id: 'alt', name: 'Alt', icon: 'folder' }
            ],
            backupSettingsMode: 'duplicates',
            duplicateSensorScope: 'card',
            duplicateSensorWorkspaceId: 'main',
            duplicateSensorCategoryName: 'Reading',
            duplicateSensorFolderId: 'f-a'
        }
    };
}

async function runDuplicateSmoke(page) {
    return page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        async function waitForSelectOptions(element, minimumOptions = 1, timeoutMs = 5000) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                if (element && element.options && element.options.length >= minimumOptions) {
                    return;
                }
                await wait(100);
            }
            throw new Error(`Select did not populate in time: ${element?.id || 'unknown'}`);
        }

        if (!document.getElementById('settingsModal') && window.modalTemplate) {
            const host = document.createElement('div');
            host.innerHTML = window.modalTemplate;
            while (host.firstChild) {
                document.body.appendChild(host.firstChild);
            }
        }

        if (typeof window.openSettings !== 'function') {
            throw new Error('openSettings unavailable');
        }
        if (typeof window.runDuplicateSensorForFullBackup !== 'function' ||
            typeof window.runDuplicateSensorForWorkspace !== 'function' ||
            typeof window.runDuplicateSensorForCard !== 'function' ||
            typeof window.runDuplicateSensorForFolder !== 'function') {
            throw new Error('duplicate sensor runners unavailable');
        }

        window.openSettings();
        await wait(500);

        const backupModeSelect = document.getElementById('backupSettingsMode');
        const tabBackupSelect = document.getElementById('tabBackupSelect');
        const cardWorkspaceSelect = document.getElementById('cardBackupWorkspaceSelect');
        const cardCategorySelect = document.getElementById('cardBackupCategorySelect');
        const folderWorkspaceSelect = document.getElementById('folderBackupWorkspaceSelect');
        const folderCategorySelect = document.getElementById('folderBackupCategorySelect');
        const folderSelect = document.getElementById('folderBackupFolderSelect');
        const fullSummaryNode = document.getElementById('duplicateSensorSummaryFull');
        const fullResultsNode = document.getElementById('duplicateSensorResultsFull');
        const workspaceSummaryNode = document.getElementById('duplicateSensorSummaryWorkspace');
        const workspaceResultsNode = document.getElementById('duplicateSensorResultsWorkspace');
        const cardSummaryNode = document.getElementById('duplicateSensorSummaryCard');
        const cardResultsNode = document.getElementById('duplicateSensorResultsCard');
        const folderSummaryNode = document.getElementById('duplicateSensorSummaryFolder');
        const folderResultsNode = document.getElementById('duplicateSensorResultsFolder');

        if (!backupModeSelect || !tabBackupSelect || !cardWorkspaceSelect || !cardCategorySelect ||
            !folderWorkspaceSelect || !folderCategorySelect || !folderSelect ||
            !fullSummaryNode || !fullResultsNode || !workspaceSummaryNode || !workspaceResultsNode ||
            !cardSummaryNode || !cardResultsNode || !folderSummaryNode || !folderResultsNode) {
            throw new Error('Integrated duplicate sensor controls missing');
        }

        backupModeSelect.value = 'all';
        backupModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(200);

        await waitForSelectOptions(tabBackupSelect);
        await waitForSelectOptions(cardWorkspaceSelect);
        await waitForSelectOptions(cardCategorySelect);
        await waitForSelectOptions(folderWorkspaceSelect);
        await waitForSelectOptions(folderCategorySelect);

        const setSelectValue = async (element, value) => {
            if (!element || value == null) return;
            element.value = value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            await wait(150);
        };

        const runScope = async ({ workspaceId, categoryName, folderId, runner, summaryNode, resultsNode }) => {
            await setSelectValue(tabBackupSelect, workspaceId);
            await setSelectValue(cardWorkspaceSelect, workspaceId);
            await setSelectValue(cardCategorySelect, categoryName);
            await setSelectValue(folderWorkspaceSelect, workspaceId);
            await setSelectValue(folderCategorySelect, categoryName);
            if (folderId != null) {
                await waitForSelectOptions(folderSelect);
                await setSelectValue(folderSelect, folderId);
            }

            const report = runner();
            await wait(200);
            return {
                report,
                summary: summaryNode.textContent.trim(),
                renderedGroups: resultsNode.querySelectorAll('.duplicate-sensor-group').length
            };
        };

        const folder = await runScope({
            workspaceId: 'main',
            categoryName: 'Reading',
            folderId: 'f-a',
            runner: window.runDuplicateSensorForFolder,
            summaryNode: folderSummaryNode,
            resultsNode: folderResultsNode
        });
        if (folder.report.duplicateGroups !== 1 || folder.renderedGroups !== 1) {
            throw new Error(`Folder duplicate mismatch: ${JSON.stringify(folder)}`);
        }

        const card = await runScope({
            workspaceId: 'main',
            categoryName: 'Reading',
            runner: window.runDuplicateSensorForCard,
            summaryNode: cardSummaryNode,
            resultsNode: cardResultsNode
        });
        if (card.report.duplicateGroups !== 2) {
            throw new Error(`Card duplicate mismatch: ${JSON.stringify(card)}`);
        }

        const workspace = await runScope({
            workspaceId: 'main',
            runner: window.runDuplicateSensorForWorkspace,
            summaryNode: workspaceSummaryNode,
            resultsNode: workspaceResultsNode
        });
        if (workspace.report.duplicateGroups !== 3) {
            throw new Error(`Workspace duplicate mismatch: ${JSON.stringify(workspace)}`);
        }

        const full = await runScope({
            runner: window.runDuplicateSensorForFullBackup,
            summaryNode: fullSummaryNode,
            resultsNode: fullResultsNode
        });
        if (full.report.duplicateGroups !== 5) {
            throw new Error(`Full duplicate mismatch: ${JSON.stringify(full)}`);
        }

        const mergeResult = window.EveDuplicateSensor.mergeDuplicateGroup(['related-1', 'related-2']);
        await wait(200);
        const kept = (window.getLiveLinks ? window.getLiveLinks() : window.links).find((link) => String(link.id) === String(mergeResult?.mergedId));
        const removedExists = (window.getLiveLinks ? window.getLiveLinks() : window.links).some((link) => (
            Array.isArray(mergeResult?.removedIds) && mergeResult.removedIds.includes(String(link.id))
        ));
        const removedId = String(mergeResult?.removedIds?.[0] || '');
        const expectedIncomingTitle = removedId === 'related-1' ? 'Related URL Target' : 'Different Related URL Source';
        if (mergeResult?.removedIds?.length !== 1 || removedExists || !String(kept?.notes || '').includes(expectedIncomingTitle)) {
            throw new Error(`Related URL duplicate merge failed: ${JSON.stringify({ mergeResult, kept, removedExists, expectedIncomingTitle })}`);
        }

        return {
            folder: folder.report.duplicateGroups,
            card: card.report.duplicateGroups,
            workspace: workspace.report.duplicateGroups,
            allTabs: full.report.duplicateGroups,
            relatedMergeRemoved: mergeResult.removedIds.length,
            finalSummary: full.summary
        };
    });
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-duplicate-store-'));
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
        logStep('waitForStatus:start');
        await waitForStatus(`http://localhost:${PORT}/api/status`);
        logStep('waitForStatus:done');

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        const seed = buildSeedPayload();

        await page.addInitScript((payload) => {
            localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
            localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
        }, seed);

        await page.goto(`http://localhost:${PORT}/EveOS.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        await page.waitForFunction(() => (
            !!window.EveDuplicateSensor &&
            !!window.runDuplicateSensorForFullBackup &&
            !!window.runDuplicateSensorForWorkspace &&
            !!window.runDuplicateSensorForCard &&
            !!window.runDuplicateSensorForFolder &&
            !!window.openSettings &&
            !!document.querySelector('.category-card')
        ), undefined, { timeout: 180000 });
        await page.waitForTimeout(1500);

        const result = await runDuplicateSmoke(page);
        console.log(`DUPLICATE_SENSOR_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
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
                logStep(`browserClose:error:${error && error.stack ? error.stack : String(error)}`);
            }
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
    }
}

main();
