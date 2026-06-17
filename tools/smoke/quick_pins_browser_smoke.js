const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3031;
const LOG_FILE = path.join(os.tmpdir(), 'eve-quick-pins-browser-smoke.log');

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
    const fillerLinks = Array.from({ length: 40 }, (_, index) => ({
        id: `reading-extra-${index}`,
        title: `Reading Extra ${index}`,
        url: `https://example.com/reading-extra-${index}`,
        workspace: 'main',
        category: 'Reading',
        done: false,
        pinned: false
    }));

    return {
        links: [
            { id: 'root-1', title: 'Root One', url: 'https://example.com/root', workspace: 'main', category: 'Reading', done: false, pinned: false },
            { id: 'folder-1', title: 'Folder One', url: 'https://example.com/folder', workspace: 'main', category: 'Reading', folderId: 'f-parent', done: false, pinned: false },
            { id: 'folder-2', title: 'Folder Two', url: 'https://example.com/folder-two', workspace: 'main', category: 'Reading', folderId: 'f-parent', done: false, pinned: false },
            { id: 'other-1', title: 'Other Card', url: 'https://example.com/other', workspace: 'main', category: 'Watching', done: false, pinned: false }
        ].concat(fillerLinks),
        quickPins: [],
        bookmarkFolders: {
            'main::Reading': {
                nodes: [
                    { id: 'f-parent', parentId: null, name: 'Reading Arc', order: 1 }
                ]
            }
        },
        config: {
            activeWorkspace: 'main',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'folder' }
            ],
            scrollableCategories: true
        }
    };
}

async function runQuickPinsSmoke(page) {
    return page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const getDockLabels = () => Array.from(document.querySelectorAll('#dock-container .dock-item')).map((item) => ({
            label: item.querySelector('.dock-title')?.textContent?.trim() || '',
            badge: item.querySelector('.dock-badge')?.textContent?.trim() || ''
        }));

        if (typeof window.togglePin !== 'function') throw new Error('togglePin unavailable');
        if (!window.EveQuickPins?.movePin) throw new Error('movePin unavailable');
        if (typeof window.showLinkContextMenu !== 'function') throw new Error('showLinkContextMenu unavailable');
        if (typeof window.setFocus !== 'function' || typeof window.clearFocus !== 'function') {
            throw new Error('focus helpers unavailable');
        }

        const readingScrollable = document.querySelector('.category-card[data-card-category="Reading"] .category-scrollable');
        if (!readingScrollable) {
            throw new Error('Expected scrollable Reading card list');
        }
        readingScrollable.scrollTop = Math.max(0, readingScrollable.scrollHeight - readingScrollable.clientHeight - 80);
        const readingScrollBeforePin = readingScrollable.scrollTop;
        window.togglePin('reading-extra-39');
        await wait(350);
        const readingScrollAfterPin = document.querySelector('.category-card[data-card-category="Reading"] .category-scrollable')?.scrollTop ?? 0;
        if (Math.abs(readingScrollAfterPin - readingScrollBeforePin) > 4) {
            throw new Error(`Expected Reading card scroll to persist after pin. before=${readingScrollBeforePin} after=${readingScrollAfterPin}`);
        }

        window.togglePin('root-1');
        window.togglePin('folder-1');
        await wait(300);

        const rootScope = window.EveQuickPins.getBookmarkScopeType('root-1');
        const folderScope = window.EveQuickPins.getBookmarkScopeType('folder-1');
        if (rootScope !== 'card') throw new Error(`Expected root scope=card, got ${rootScope}`);
        if (folderScope !== 'folder') throw new Error(`Expected folder scope=folder, got ${folderScope}`);

        window.showLinkContextMenu({
            preventDefault() {},
            stopPropagation() {},
            clientX: 16,
            clientY: 16
        }, 'folder-1');
        await wait(50);

        const pinAction = document.getElementById('ctx-pin-action');
        const folderScopeRow = document.getElementById('ctx-pin-scope-folder');
        if (!pinAction || !String(pinAction.textContent || '').includes('Unpin')) {
            throw new Error(`Unexpected context pin label: ${pinAction?.textContent}`);
        }
        if (!folderScopeRow || folderScopeRow.style.display === 'none') {
            throw new Error('Expected folder scope row to be visible');
        }

        window.ctxSetPinScope('card');
        await wait(100);
        if (window.EveQuickPins.getBookmarkScopeType('folder-1') !== 'card') {
            throw new Error('ctxSetPinScope failed to update bookmark scope');
        }

        window.EveQuickPins.toggleCardPin('main', 'Reading');
        window.EveQuickPins.setCardScopeType('main', 'Reading', 'card');
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        await wait(300);

        const normalDock = getDockLabels();
        if (!normalDock.some((entry) => entry.label === 'Root One')) {
            throw new Error(`Root pin missing from normal dock: ${JSON.stringify(normalDock)}`);
        }
        if (!normalDock.some((entry) => entry.label === 'Folder One')) {
            throw new Error(`Folder pin missing from normal dock: ${JSON.stringify(normalDock)}`);
        }
        if (normalDock.some((entry) => entry.label === 'Reading')) {
            throw new Error(`Card pin should be hidden until focus mode: ${JSON.stringify(normalDock)}`);
        }

        const folderDockItem = Array.from(document.querySelectorAll('#dock-container .dock-item')).find((item) => (
            item.querySelector('.dock-title')?.textContent?.trim() === 'Folder One'
        ));
        const folderLinkBadge = folderDockItem?.querySelector('.dock-badge--link-jump');
        if (!folderLinkBadge) {
            throw new Error('Expected pinned bookmark Link badge to expose reveal action');
        }
        if (getComputedStyle(folderLinkBadge).cursor !== 'pointer') {
            throw new Error('Expected pinned bookmark Link badge to use pointer cursor');
        }
        folderLinkBadge.click();
        await wait(850);
        const activeFolderId = window.eveState?.config?.activeManhwaFolders?.['main::Reading'] || '';
        const revealedFolderBookmark = document.querySelector('[data-link-id="folder-1"].quick-pin-reveal-target');
        if (activeFolderId !== 'f-parent') {
            throw new Error(`Expected Link badge to enter owning folder f-parent, got ${activeFolderId}`);
        }
        if (!revealedFolderBookmark) {
            throw new Error('Expected Link badge to reveal and highlight folder bookmark');
        }

        window.setFocus('Reading');
        await wait(400);
        const focusedDock = getDockLabels();
        if (!focusedDock.some((entry) => entry.label === 'Reading' && entry.badge === 'Card')) {
            throw new Error(`Focused card pin missing from dock: ${JSON.stringify(focusedDock)}`);
        }

        const visiblePins = window.EveQuickPins.getActiveDockPins({
            activeWorkspace: 'main',
            focusCategory: 'Reading'
        });
        const readingPin = visiblePins.find((pin) => pin.label === 'Reading' && pin.targetType === 'card');
        if (!readingPin) throw new Error('Focused card pin not found in active dock pin list');

        const beforeMove = getDockLabels().map((entry) => entry.label).join('|');
        window.EveQuickPins.movePin(readingPin.id, 'left', { visiblePinIds: visiblePins.map((pin) => pin.id) });
        await wait(250);
        const afterMove = getDockLabels().map((entry) => entry.label).join('|');
        if (beforeMove === afterMove) {
            throw new Error(`Expected dock order to change after move; still ${afterMove}`);
        }

        window.clearFocus();
        await wait(300);

        return {
            readingScrollBeforePin,
            readingScrollAfterPin,
            rootScope,
            folderScopeAfterContextChange: window.EveQuickPins.getBookmarkScopeType('folder-1'),
            activeFolderIdAfterLinkBadge: activeFolderId,
            normalDock,
            focusedDock,
            afterMove
        };
    });
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-quick-pins-store-'));
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
            localStorage.setItem('eveV22QuickPins', JSON.stringify(payload.quickPins));
        }, seed);

        await page.goto(`http://localhost:${PORT}/EveOS.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        await page.waitForFunction(() => (
            !!window.EveQuickPins &&
            !!window.togglePin &&
            !!window.showLinkContextMenu &&
            !!window.setFocus &&
            !!document.querySelector('.category-card')
        ), undefined, { timeout: 180000 });
        await page.waitForTimeout(1500);

        const result = await runQuickPinsSmoke(page);
        console.log(`QUICK_PINS_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
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
