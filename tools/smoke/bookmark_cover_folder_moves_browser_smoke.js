const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3034;
const LOG_FILE = path.join(os.tmpdir(), 'eve-bookmark-cover-folder-moves-smoke.log');

function logStep(message) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

function coverData(label, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180"><rect width="120" height="180" fill="${color}"/><text y="90">${label}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}#${label}.jpg`;
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
            {
                id: 'l-root',
                title: 'Root Cover Bookmark',
                url: 'https://example.com/root',
                workspace: 'main',
                category: 'Reading',
                coverImage: coverData('root-primary', '#164e63')
            },
            {
                id: 'l-extra',
                title: 'Extra Cover Bookmark',
                url: 'https://example.com/extra',
                workspace: 'main',
                category: 'Reading',
                coverImage: coverData('extra-primary', '#7c2d12'),
                coverImages: [coverData('extra-random', '#713f12')]
            },
            {
                id: 'l-library',
                title: 'Library Cover Bookmark',
                url: 'https://example.com/library',
                workspace: 'main',
                category: 'Reading'
            }
        ],
        bookmarkFolders: {
            'main::Reading': {
                nodes: [
                    { id: 'f-parent', parentId: null, name: 'Folder A', order: 1 },
                    { id: 'f-child', parentId: 'f-parent', name: 'Folder B', order: 1 },
                    { id: 'f-grand', parentId: 'f-child', name: 'Folder C', order: 1 }
                ]
            }
        },
        config: {
            activeWorkspace: 'main',
            workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
            viewMode: 'card'
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
                    {
                        id: 'e-library',
                        title: 'Linked Library Entry',
                        image: coverData('library-linked', '#4c1d95')
                    }
                ]
            }
        },
        connections: [
            { id: 'c-library', linkId: 'l-library', workspace: 'main', categoryName: 'Reading', libraryEntryId: 'e-library' }
        ]
    };
}

async function runBrowserSmoke(page) {
    return page.evaluate(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate, timeoutMs, label) => {
            const started = Date.now();
            while (Date.now() - started < timeoutMs) {
                if (predicate()) return;
                await wait(50);
            }
            throw new Error(`Timed out waiting for ${label}`);
        };

        function normalizeImageSrc(value) {
            return String(value || '').trim();
        }

        function findCardLinkNode(title) {
            return Array.from(document.querySelectorAll('.category-card li'))
                .find((node) => String(node.textContent || '').includes(title)) || null;
        }

        function findLinkById(linkId) {
            return Array.from(window.eveState?.links || [])
                .find((link) => String(link?.id || '') === String(linkId || '')) || null;
        }

        function findUnidexEntryNode(title) {
            return Array.from(document.querySelectorAll('.unidex-entry-item'))
                .find((node) => String(node.textContent || '').includes(title)) || null;
        }

        async function captureHoverCover(linkId, title) {
            const link = findLinkById(linkId);
            if (!link) {
                throw new Error(`Missing bookmark for ${title}`);
            }
            const libraryEntry = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(linkId)?.entry || null;
            const rawCoverUrl = String(
                window.EveBookmarkCovers?.getDisplayCover?.(link, libraryEntry?.image || libraryEntry?.imageUrl)
                || link?.coverImage
                || libraryEntry?.image
                || libraryEntry?.imageUrl
                || ''
            ).trim();
            return normalizeImageSrc(rawCoverUrl);
        }

        function captureUnidexCover(title) {
            const target = findUnidexEntryNode(title);
            if (!target) {
                throw new Error(`Missing Unidex entry node for ${title}`);
            }
            return normalizeImageSrc(target.querySelector('.unidex-entry-cover')?.src);
        }

        if (typeof window.loadData === 'function') {
            window.loadData();
        }
        if (window.EveLibrary?.Storage?.loadLibrary) {
            window.EveLibrary.Storage.loadLibrary();
        }
        if (window.EveLibrary?.ConnectionsAPI?.loadConnections) {
            window.EveLibrary.ConnectionsAPI.loadConnections();
        }
        await waitFor(() => (
            Array.isArray(window.eveState?.links)
            && window.eveState.links.length >= 3
            && !!window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.('l-library')?.entry
        ), 5000, 'seeded bookmark and library state');

        if (!window.EveBookmarkFolders?.moveLinksToFolderTarget) {
            throw new Error('moveLinksToFolderTarget unavailable');
        }

        const movedExtra = window.EveBookmarkFolders.moveLinksToFolderTarget(['l-extra'], 'main', 'Reading', 'f-parent');
        const movedLibrary = window.EveBookmarkFolders.moveLinksToFolderTarget(['l-library'], 'main', 'Reading', 'f-grand');
        if (!movedExtra || !movedLibrary) {
            throw new Error(`Expected folder moves to succeed: extra=${movedExtra}, library=${movedLibrary}`);
        }

        await waitFor(() => {
            const extraLink = findLinkById('l-extra');
            const libraryLink = findLinkById('l-library');
            return String(extraLink?.folderId || '') === 'f-parent'
                && String(libraryLink?.folderId || '') === 'f-grand';
        }, 4000, 'folder ids to update after move');
        if (typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }
        await waitFor(() => {
            const rootLink = findLinkById('l-root');
            const extraLink = findLinkById('l-extra');
            const libraryLink = findLinkById('l-library');
            return !!rootLink && !!extraLink && !!libraryLink;
        }, 4000, 'dashboard state to stabilize');

        const rootHover = await captureHoverCover('l-root', 'Root Cover Bookmark');
        const extraHover = await captureHoverCover('l-extra', 'Extra Cover Bookmark');
        const libraryHover = await captureHoverCover('l-library', 'Library Cover Bookmark');

        const rootLink = window.eveState.links.find((link) => String(link.id) === 'l-root');
        const extraLink = window.eveState.links.find((link) => String(link.id) === 'l-extra');
        const libraryLink = window.eveState.links.find((link) => String(link.id) === 'l-library');
        if (!rootLink || !extraLink || !libraryLink) {
            throw new Error('Failed to resolve seeded links after move');
        }

        if (String(extraLink.folderId) !== 'f-parent') {
            throw new Error(`Extra bookmark folder move failed: ${extraLink.folderId}`);
        }
        if (String(libraryLink.folderId) !== 'f-grand') {
            throw new Error(`Library bookmark folder move failed: ${libraryLink.folderId}`);
        }

        if (!rootHover.includes('root-primary.jpg')) {
            throw new Error(`Unexpected root hover cover: ${rootHover}`);
        }
        if (!extraHover.includes('extra-random.jpg')) {
            throw new Error(`Unexpected additional-cover hover image after folder move: ${extraHover}`);
        }
        if (!libraryHover.includes('library-linked.jpg')) {
            throw new Error(`Unexpected library-linked hover image after folder move: ${libraryHover}`);
        }

        const previousPerfMode = !!window._evePerfMode;
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        await waitFor(() => !!document.querySelector('li[data-link-id="l-root"]'), 4000, 'performance-mode bookmark row');
        window._evePerfMode = true;
        const perfRow = document.querySelector('li[data-link-id="l-root"]');
        perfRow.dispatchEvent(new PointerEvent('pointerover', {
            bubbles: true,
            relatedTarget: null
        }));
        await waitFor(() => {
            const overlay = document.getElementById('bookmark-cover-hover-overlay');
            return overlay?.classList.contains('is-visible')
                && normalizeImageSrc(overlay.querySelector('.bookmark-cover-hover-image')?.src).includes('root-primary.jpg');
        }, 4000, 'performance-mode cover hover');
        const perfHoverVisible = document.getElementById('bookmark-cover-hover-overlay')?.classList.contains('is-visible');
        window.hideBookmarkCoverHover?.();
        window._evePerfMode = previousPerfMode;
        if (!perfHoverVisible) {
            throw new Error('Expected delegated cover hover to work in large-pack performance mode');
        }

        if (window.eveState?.config) {
            window.eveState.config.viewMode = 'unidex';
        }
        if (typeof config !== 'undefined' && config) {
            config.viewMode = 'unidex';
        }
        if (typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }
        await waitFor(() => !!window.UnidexView?.switchWorkspaceTab && !!window.UnidexView?.selectCategory, 4000, 'Unidex helpers');
        if (!window.UnidexView?.switchWorkspaceTab || !window.UnidexView?.selectCategory) {
            throw new Error('Unidex navigation helpers unavailable');
        }
        window.UnidexView.switchWorkspaceTab('main');
        await waitFor(() => {
            const tab = document.querySelector('[data-unidex-workspace-tab="main"], .unidex-workspace-tab.active');
            return !tab || String(tab.dataset?.workspaceId || 'main') === 'main';
        }, 4000, 'Unidex workspace switch');
        window.UnidexView.selectCategory('Reading');
        await waitFor(() => {
            return !!findUnidexEntryNode('Root Cover Bookmark')
                && !!findUnidexEntryNode('Extra Cover Bookmark')
                && !!findUnidexEntryNode('Library Cover Bookmark');
        }, 8000, 'Unidex entries to render');

        const unidexRoot = captureUnidexCover('Root Cover Bookmark');
        const unidexExtra = captureUnidexCover('Extra Cover Bookmark');
        const unidexLibrary = captureUnidexCover('Library Cover Bookmark');

        if (!unidexRoot.includes('root-primary.jpg')) {
            throw new Error(`Unexpected root Unidex cover: ${unidexRoot}`);
        }
        if (!unidexExtra.includes('extra-random.jpg')) {
            throw new Error(`Unexpected additional-cover Unidex image after folder move: ${unidexExtra}`);
        }
        if (!unidexLibrary.includes('library-linked.jpg')) {
            throw new Error(`Unexpected library-linked Unidex image after folder move: ${unidexLibrary}`);
        }

        return {
            rootHover,
            extraHover,
            libraryHover,
            unidexRoot,
            unidexExtra,
            unidexLibrary,
            folderIds: {
                extra: extraLink.folderId,
                library: libraryLink.folderId
            }
        };
    });
}

async function main() {
    fs.writeFileSync(LOG_FILE, '');
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-bookmark-cover-folder-store-'));
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
            localStorage.setItem('eveLibraryData', JSON.stringify(payload.libraries));
            localStorage.setItem('eveLibraryConnections', JSON.stringify(payload.connections));
        }, seed);

        await page.goto(`http://localhost:${PORT}/EveOS.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
        });
        await page.waitForFunction(() => (
            !!window.EveBookmarkFolders?.moveLinksToFolderTarget &&
            !!window.EveBookmarkCovers?.getDisplayCover &&
            !!window.EveLibrary?.Storage?.loadLibrary &&
            !!window.EveLibrary?.ConnectionsAPI?.loadConnections &&
            !!window.showBookmarkCoverHover &&
            typeof window.renderDashboard === 'function'
        ), undefined, { timeout: 180000 });
        await page.waitForTimeout(1500);

        const result = await runBrowserSmoke(page);
        console.log(`BOOKMARK_COVER_FOLDER_MOVES_SMOKE_OK ${JSON.stringify(result)}`);
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
