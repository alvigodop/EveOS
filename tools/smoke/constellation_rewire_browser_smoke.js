const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
    return {
        links: [
            { id: 'alpha-root-1', title: 'Alpha Root 1', url: 'https://alpha.example.com/root-1', workspace: 'main', category: 'Alpha', done: false },
            { id: 'gamma-root-1', title: 'Gamma Root 1', url: 'https://gamma.example.com/root-1', workspace: 'main', category: 'Gamma', done: false },
            { id: 'alpha-folder-1', title: 'Alpha Folder 1', url: 'https://alpha.example.com/folder-1', workspace: 'main', category: 'Alpha', folderId: 'f-parent', done: false },
            { id: 'alpha-folder-2', title: 'Alpha Folder 2', url: 'https://alpha.example.com/folder-2', workspace: 'main', category: 'Alpha', folderId: 'f-child', done: false },
            { id: 'alpha-folder-3', title: 'Alpha Folder 3', url: 'https://alpha.example.com/folder-3', workspace: 'main', category: 'Alpha', folderId: 'f-parent', done: false }
        ],
        config: {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'folder' }
            ],
            categoryOrder: ['Alpha', 'Gamma']
        },
        bookmarkFolders: {
            'main::Alpha': {
                nodes: [
                    { id: 'f-parent', parentId: null, name: 'Parent Folder', order: 1 },
                    { id: 'f-child', parentId: 'f-parent', name: 'Child Folder', order: 1 }
                ]
            }
        },
        quickPins: []
    };
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && !!window.EveConstellationMap?.openWorkspaceMap
        && !!window.EveConstellationMap?._shared?.state
    ), undefined, { timeout: 180000 });
}

async function seedState(page, payload) {
    await page.evaluate((seed) => {
        const clonedConfig = JSON.parse(JSON.stringify(seed.config));
        const clonedLinks = JSON.parse(JSON.stringify(seed.links));
        const clonedFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders || {}));
        const clonedPins = JSON.parse(JSON.stringify(seed.quickPins || []));

        config = clonedConfig;
        links = clonedLinks;
        bookmarkFolders = clonedFolders;
        quickPins = clonedPins;
        window.config = config;
        window.links = links;
        window.bookmarkFolders = bookmarkFolders;
        if (window.eveState) {
            window.eveState.links = clonedLinks;
            window.eveState.quickPins = clonedPins;
        }

        try {
            localStorage.setItem('eveV22Data', JSON.stringify(clonedLinks));
            localStorage.setItem('eveV22Config', JSON.stringify(clonedConfig));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(clonedFolders));
            localStorage.setItem('eveV22QuickPins', JSON.stringify(clonedPins));
        } catch (error) {
            // file:// may block localStorage in some contexts
        }

        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }, payload);
}

async function openWorkspaceMap(page) {
    await page.evaluate(() => {
        window.EveConstellationMap.openWorkspaceMap('main');
        window.EveConstellationMap._setConstellationRewireEnabled?.(true);
    });
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return overlay && overlay.style.display !== 'none';
    }, undefined, { timeout: 15000 });
    await page.waitForTimeout(300);
}

async function getNodeScreenPoint(page, query) {
    return page.evaluate((q) => {
        const map = window.EveConstellationMap;
        const state = map?._shared?.state;
        const canvas = state?.canvas;
        if (!state || !canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const node = state.nodes.find((item) => {
            if (q.kind && item.kind !== q.kind) return false;
            if (q.linkId && String(item.data?.linkId || '') !== String(q.linkId)) return false;
            if (q.folderId && String(item.data?.folderId || '') !== String(q.folderId)) return false;
            if (q.categoryName && String(item.data?.categoryName || '') !== String(q.categoryName)) return false;
            return true;
        });
        if (!node) return null;
        return {
            id: node.id,
            clientX: rect.left + state.transform.tx + (node.x * state.transform.scale),
            clientY: rect.top + state.transform.ty + (node.y * state.transform.scale)
        };
    }, query);
}

async function getEmptyDropPoint(page) {
    return page.evaluate(() => {
        const map = window.EveConstellationMap;
        const state = map?._shared?.state;
        const canvas = state?.canvas;
        const getHitNode = map?._view?.getHitNode;
        if (!canvas || typeof getHitNode !== 'function') return null;
        const rect = canvas.getBoundingClientRect();
        for (let y = rect.bottom - 30; y >= rect.top + 30; y -= 24) {
            for (let x = rect.right - 30; x >= rect.left + 30; x -= 24) {
                if (!getHitNode(x, y)) {
                    return { clientX: x, clientY: y };
                }
            }
        }
        return null;
    });
}

async function dragNode(page, from, to) {
    await page.mouse.move(from.clientX, from.clientY);
    await page.mouse.down();
    await page.mouse.move(
        from.clientX + ((to.clientX - from.clientX) * 0.35),
        from.clientY + ((to.clientY - from.clientY) * 0.35),
        { steps: 12 }
    );
    await page.mouse.move(to.clientX, to.clientY, { steps: 18 });
    await page.mouse.up();
    await page.waitForTimeout(350);
}

async function clickNode(page, point) {
    await page.mouse.move(point.clientX, point.clientY);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
}

async function readState(page) {
    return page.evaluate(() => ({
        links: JSON.parse(JSON.stringify(window.links || [])),
        folders: JSON.parse(JSON.stringify(window.bookmarkFolders || {}))
    }));
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page, buildSeedPayload());
        await openWorkspaceMap(page);

        const linkToGamma = await getNodeScreenPoint(page, { kind: 'link', linkId: 'alpha-folder-1' });
        const gammaCard = await getNodeScreenPoint(page, { kind: 'category', categoryName: 'Gamma' });
        if (!linkToGamma || !gammaCard) throw new Error('Missing source link or Gamma card node');
        await page.evaluate(() => {
            const map = window.EveConstellationMap;
            const state = map?._shared?.state;
            const linkNode = state?.nodes?.find((node) => node.kind === 'link' && String(node.data?.linkId || '') === 'alpha-folder-1');
            map?._armConstellationRewireNode?.(linkNode, { keepEnabled: true });
        });
        await dragNode(page, linkToGamma, gammaCard);

        let state = await readState(page);
        const movedLink = state.links.find((link) => link.id === 'alpha-folder-1');
        if (!movedLink || movedLink.category !== 'Gamma' || String(movedLink.folderId || '') !== '') {
            throw new Error('Expected alpha-folder-1 to move to Gamma card root, got ' + JSON.stringify(movedLink));
        }

        const childFolder = await getNodeScreenPoint(page, { kind: 'folder', folderId: 'f-child' });
        const gammaCardAfterMove = await getNodeScreenPoint(page, { kind: 'category', categoryName: 'Gamma' });
        if (!childFolder || !gammaCardAfterMove) throw new Error('Missing child folder or Gamma card node for folder move');
        await page.evaluate(() => {
            const map = window.EveConstellationMap;
            const state = map?._shared?.state;
            const folderNode = state?.nodes?.find((node) => node.kind === 'folder' && String(node.data?.folderId || '') === 'f-child');
            map?._armConstellationRewireNode?.(folderNode, { keepEnabled: true });
        });
        await clickNode(page, gammaCardAfterMove);

        state = await readState(page);
        const gammaTree = state.folders['main::Gamma'];
        const alphaTree = state.folders['main::Alpha'];
        const gammaChildFolder = Array.isArray(gammaTree?.nodes)
            ? gammaTree.nodes.find((node) => node.id === 'f-child')
            : null;
        if (!gammaChildFolder || String(gammaChildFolder.parentId || '') !== '') {
            throw new Error('Expected f-child to move to Gamma root, got ' + JSON.stringify({
                gammaChildFolder,
                gammaTree,
                alphaTree
            }));
        }
        const movedChildLink = state.links.find((link) => link.id === 'alpha-folder-2');
        if (!movedChildLink || movedChildLink.category !== 'Gamma' || movedChildLink.workspace !== 'main') {
            throw new Error('Expected alpha-folder-2 to follow f-child into Gamma, got ' + JSON.stringify(movedChildLink));
        }

        const parkingState = await page.evaluate(() => {
            const map = window.EveConstellationMap;
            const state = map?._shared?.state;
            const linkNode = state?.nodes?.find((node) => node.kind === 'link' && String(node.data?.linkId || '') === 'alpha-folder-3');
            map?._detachConstellationNodeToParking?.(linkNode);
            return {
                detachedStore: JSON.parse(JSON.stringify(map?._detached?.getDetachedStore?.() || {})),
                visibleDetachedIds: (state?.nodes || [])
                    .filter((node) => node.data?.detachedRoot)
                    .map((node) => String(node.id || ''))
            };
        });

        state = await readState(page);
        const detachedLink = state.links.find((link) => link.id === 'alpha-folder-3');
        const parkedEntries = Array.isArray(parkingState?.detachedStore?.main) ? parkingState.detachedStore.main : [];
        const parkedLink = parkedEntries.find((entry) => entry.kind === 'link' && String(entry?.link?.id || '') === 'alpha-folder-3');
        if (detachedLink || !parkedLink || !parkingState.visibleDetachedIds.length) {
            throw new Error('Expected alpha-folder-3 to detach into parking, got ' + JSON.stringify({
                detachedLink,
                parkedLink,
                visibleDetachedIds: parkingState.visibleDetachedIds
            }));
        }

        const detachedLinkPoint = await getNodeScreenPoint(page, { kind: 'link', linkId: 'alpha-folder-3' });
        const gammaCardForDetachedRestore = await getNodeScreenPoint(page, { kind: 'category', categoryName: 'Gamma' });
        if (!detachedLinkPoint || !gammaCardForDetachedRestore) {
            throw new Error('Missing detached link node or Gamma card node for detached restore');
        }

        const reattachState = await page.evaluate(() => {
            const map = window.EveConstellationMap;
            const state = map?._shared?.state;
            const detachedNode = state?.nodes?.find((node) => node.kind === 'link' && node.data?.detachedRoot && String(node.data?.linkId || '') === 'alpha-folder-3');
            if (!detachedNode || !state?.infoEl) {
                return { ok: false, reason: 'missing-detached-node' };
            }
            state.selected = null;
            state.hovered = detachedNode;
            state.infoEl.innerHTML = '';
            const clickProbe = document.createElement('button');
            clickProbe.setAttribute('data-map-action', 'primary');
            state.infoEl.appendChild(clickProbe);
            clickProbe.click();
            return {
                ok: true,
                primaryLabel: String(map?._coreActions?.getPrimaryAction?.(detachedNode)?.label || ''),
                rewireEnabled: !!state.rewire?.enabled,
                sourceNodeId: String(state.rewire?.sourceNodeId || '')
            };
        });
        if (!reattachState.ok || reattachState.primaryLabel !== 'Reattach Chain' || !reattachState.rewireEnabled || !reattachState.sourceNodeId) {
            throw new Error('Detached inspector primary action did not arm rewire: ' + JSON.stringify(reattachState));
        }

        await clickNode(page, gammaCardForDetachedRestore);
        state = await readState(page);
        const restoredDetachedLink = state.links.find((link) => link.id === 'alpha-folder-3');
        if (!restoredDetachedLink || restoredDetachedLink.category !== 'Gamma' || String(restoredDetachedLink.folderId || '') !== '') {
            throw new Error('Detached bookmark did not restore into Gamma root from inspector action: ' + JSON.stringify(restoredDetachedLink));
        }

        console.log('CONSTELLATION_REWIRE_BROWSER_SMOKE_OK ' + JSON.stringify({
            movedLinkCategory: movedLink.category,
            movedFolderCategory: movedChildLink.category,
            detachedLinkParked: true,
            detachedLinkRestored: restoredDetachedLink.category,
            gammaFolderCount: Array.isArray(gammaTree?.nodes) ? gammaTree.nodes.length : 0
        }));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
