const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3026;
const LOG_FILE = path.join(os.tmpdir(), 'eve-library-folder-browser-smoke.log');

function logStep(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line);
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
            { id: 'l-c', title: 'Folder C Bookmark', url: 'https://example.com/c', workspace: 'main', category: 'Reading', folderId: 'f-c' }
        ],
        bookmarkFolders: {
            'main::Reading': {
                nodes: [
                    { id: 'f-a', parentId: null, name: 'Main Folder', order: 1 },
                    { id: 'f-b', parentId: 'f-a', name: 'Sub Folder', order: 1 },
                    { id: 'f-c', parentId: 'f-b', name: 'Deep Folder', order: 1 }
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
                    root: 'folder:f-a',
                    chain: [{ selection: 'self_and_descendants' }],
                    expanded: false
                },
                entries: [
                    { id: 'e-root', title: 'Entry Root' },
                    { id: 'e-a', title: 'Entry A' },
                    { id: 'e-b', title: 'Entry B' },
                    { id: 'e-c', title: 'Entry C' }
                ]
            }
        },
        connections: [
            { id: 'c-root', linkId: 'l-root', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-root' },
            { id: 'c-a', linkId: 'l-a', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-a' },
            { id: 'c-b', linkId: 'l-b', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-b' },
            { id: 'c-c', linkId: 'l-c', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-c' }
        ]
    };
}

async function runBrowserSmoke(page) {
    return page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const card = Array.from(document.querySelectorAll('.category-card')).find((el) => /Reading/i.test(el.textContent || ''));
        if (!card) throw new Error('Reading card not found');

        const categoryName = (card.querySelector('.category-title')?.textContent || 'Reading').trim() || 'Reading';
        window.EveLibrary.UI.toggleLibraryPanel(categoryName);
        await wait(300);

        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const panel = document.getElementById(prefix + 'panel');
        if (!panel) throw new Error('Library panel missing');

        const visibleTitles = () => Array.from(
            panel.querySelectorAll('.lib-entry-title, .lib-entry-title-btn')
        ).map((el) => (el.textContent || '')
            .replace(/^\s*\d+\.\s+/, '')
            .trim()
        ).filter(Boolean).sort();

        const folderBar = document.getElementById(prefix + 'folder-filter-bar');
        if (!folderBar) throw new Error('Folder filter bar missing');

        const selects = () => Array.from(folderBar.querySelectorAll('select'));
        if (selects().length < 2) throw new Error('Expected root and branch folder selects');

        const initialTitles = visibleTitles();
        if (initialTitles.join('|') !== ['Entry A', 'Entry B', 'Entry C'].sort().join('|')) {
            throw new Error(`Initial folder entries mismatch: ${initialTitles.join('|')}`);
        }

        const rootSelect = selects()[0];
        rootSelect.value = 'root';
        rootSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(300);

        const rootTitles = visibleTitles();
        if (rootTitles.join('|') !== 'Entry Root') {
            throw new Error(`Root-only mismatch: ${rootTitles.join('|')}`);
        }

        const folderSelect = selects()[0];
        folderSelect.value = 'folder:f-a';
        folderSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(300);

        const branchSelect = selects()[1];
        if (!branchSelect) throw new Error('Branch select missing after folder reset');
        branchSelect.value = 'child:f-b';
        branchSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(300);

        const childTitles = visibleTitles();
        if (childTitles.join('|') !== 'Entry B') {
            throw new Error(`Child folder mismatch: ${childTitles.join('|')}`);
        }

        const toggleBtn = folderBar.querySelector('.lib-folder-chain-toggle');
        if (!toggleBtn) throw new Error('Folder chain toggle missing');
        toggleBtn.click();
        await wait(200);

        const expandedCount = selects().length;
        if (expandedCount < 3) throw new Error('Expanded chain controls missing');

        return { categoryName, initialTitles, rootTitles, childTitles, expandedCount };
    });
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    logStep('main:start');
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-lib-browser-store-'));
    logStep(`main:modularRoot:${modularRoot}`);
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

        logStep('main:browser:launch:start');
        browser = await chromium.launch({ headless: true });
        logStep('main:browser:launch:done');
        const page = await browser.newPage();
        logStep('main:browser:newPage:done');
        const seed = buildSeedPayload();

        await page.addInitScript((payload) => {
            localStorage.setItem('eveV22Data', JSON.stringify(payload.links));
            localStorage.setItem('eveV22Config', JSON.stringify(payload.config));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(payload.bookmarkFolders));
            localStorage.setItem('eveLibraryData', JSON.stringify(payload.libraries));
            localStorage.setItem('eveLibraryConnections', JSON.stringify(payload.connections));
        }, seed);
        logStep('main:browser:addInitScript:done');

        logStep('main:browser:goto:start');
        await page.goto(`http://localhost:${PORT}/EveOS.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        logStep('main:browser:goto:done');
        logStep('main:browser:waitForFunction:start');
        await page.waitForFunction(() => (
            !!window.EveLibrary &&
            !!window.EveLibrary.UI &&
            document.querySelector('.category-card')
        ), undefined, { timeout: 180000 });
        logStep('main:browser:waitForFunction:done');
        await page.waitForTimeout(2000);
        logStep('main:browser:settled');

        logStep('main:browser:runSmoke:start');
        const result = await runBrowserSmoke(page);
        logStep(`main:browser:runSmoke:done:${JSON.stringify(result)}`);
        await browser.close();
        logStep('main:browser:close:done');
        console.log(`LIB_FOLDER_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } catch (error) {
        logStep(`main:error:${error && error.stack ? error.stack : String(error)}`);
        console.error(error && error.stack ? error.stack : String(error));
        console.error('--- SERVER STDOUT ---');
        console.error(serverStdout);
        console.error('--- SERVER STDERR ---');
        console.error(serverStderr);
        process.exitCode = 1;
    } finally {
        logStep('main:finally:start');
        if (browser) {
            try {
                await browser.close();
                logStep('main:finally:browserClosed');
            } catch (error) {
                logStep(`main:finally:browserCloseError:${error && error.stack ? error.stack : String(error)}`);
            }
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
        logStep('main:finally:done');
    }
}

main();
