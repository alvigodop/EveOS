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
        if (typeof window.runDuplicateSensor !== 'function') {
            throw new Error('runDuplicateSensor unavailable');
        }

        window.openSettings();
        await wait(300);

        const scopeSelect = document.getElementById('duplicateSensorScope');
        const workspaceSelect = document.getElementById('duplicateSensorWorkspaceSelect');
        const categorySelect = document.getElementById('duplicateSensorCategorySelect');
        const folderSelect = document.getElementById('duplicateSensorFolderSelect');
        const summaryNode = document.getElementById('duplicateSensorSummary');
        const resultsNode = document.getElementById('duplicateSensorResults');
        if (!scopeSelect || !workspaceSelect || !categorySelect || !folderSelect || !summaryNode || !resultsNode) {
            throw new Error('Duplicate sensor controls missing');
        }

        const runScope = async (scope, workspaceId, categoryName, folderId) => {
            scopeSelect.value = scope;
            scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await wait(150);

            if (workspaceId != null && workspaceSelect.style.display !== 'none') {
                workspaceSelect.value = workspaceId;
                workspaceSelect.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(150);
            }
            if (categoryName != null && categorySelect.style.display !== 'none') {
                categorySelect.value = categoryName;
                categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(150);
            }
            if (folderId != null && folderSelect.style.display !== 'none') {
                folderSelect.value = folderId;
                folderSelect.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(150);
            }

            const report = window.runDuplicateSensor();
            await wait(150);
            return {
                report,
                summary: summaryNode.textContent.trim(),
                renderedGroups: resultsNode.querySelectorAll('.duplicate-sensor-group').length
            };
        };

        const folder = await runScope('folder', 'main', 'Reading', 'f-a');
        if (folder.report.duplicateGroups !== 1 || folder.renderedGroups !== 1) {
            throw new Error(`Folder duplicate mismatch: ${JSON.stringify(folder)}`);
        }

        const card = await runScope('card', 'main', 'Reading', null);
        if (card.report.duplicateGroups !== 2) {
            throw new Error(`Card duplicate mismatch: ${JSON.stringify(card)}`);
        }

        const workspace = await runScope('workspace', 'main', null, null);
        if (workspace.report.duplicateGroups !== 3) {
            throw new Error(`Workspace duplicate mismatch: ${JSON.stringify(workspace)}`);
        }

        const allTabs = await runScope('all_tabs', null, null, null);
        if (allTabs.report.duplicateGroups !== 4) {
            throw new Error(`All-tabs duplicate mismatch: ${JSON.stringify(allTabs)}`);
        }

        return {
            folder: folder.report.duplicateGroups,
            card: card.report.duplicateGroups,
            workspace: workspace.report.duplicateGroups,
            allTabs: allTabs.report.duplicateGroups,
            finalSummary: allTabs.summary
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
            !!window.runDuplicateSensor &&
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
