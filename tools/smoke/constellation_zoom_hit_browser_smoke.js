const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
    return {
        links: [
            { id: 'alpha-root-1', title: 'Alpha Root 1', url: 'https://alpha.example.com/root-1', workspace: 'main', category: 'Alpha', done: false },
            { id: 'alpha-root-2', title: 'Alpha Root 2', url: 'https://alpha.example.com/root-2', workspace: 'main', category: 'Alpha', done: false },
            { id: 'alpha-folder-1', title: 'Alpha Folder 1', url: 'https://alpha.example.com/folder-1', workspace: 'main', category: 'Alpha', folderId: 'f-parent', done: false },
            { id: 'alpha-folder-2', title: 'Alpha Folder 2', url: 'https://alpha.example.com/folder-2', workspace: 'main', category: 'Alpha', folderId: 'f-parent', done: false },
            { id: 'gamma-root-1', title: 'Gamma Root 1', url: 'https://gamma.example.com/root-1', workspace: 'main', category: 'Gamma', done: false }
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
                    { id: 'f-parent', parentId: null, name: 'Parent Folder', order: 1 }
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
        window.EveConstellationMap._setMotionMode?.('free');
    });
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return overlay && overlay.style.display !== 'none';
    }, undefined, { timeout: 15000 });
    await page.waitForTimeout(300);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedState(page, buildSeedPayload());
        await openWorkspaceMap(page);

        const audit = await page.evaluate(() => {
            const map = window.EveConstellationMap;
            const state = map?._shared?.state;
            const view = map?._view;
            const canvas = state?.canvas;
            if (!state || !view || !canvas) return { ok: false, reason: 'missing-map' };

            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.round(rect.width * 1.75);
            canvas.height = Math.round(rect.height * 1.75);
            view.fitToGraph();

            const target = state.nodes.find((node) => node.kind === 'link' && String(node.data?.linkId || '') === 'alpha-folder-1');
            if (!target) return { ok: false, reason: 'missing-target' };

            function toClientPoint(node) {
                const screenX = state.transform.tx + (node.x * state.transform.scale);
                const screenY = state.transform.ty + (node.y * state.transform.scale);
                return {
                    clientX: rect.left + (screenX * (rect.width / canvas.width)),
                    clientY: rect.top + (screenY * (rect.height / canvas.height))
                };
            }

            function sample(label) {
                const point = toClientPoint(target);
                const hit = view.getHitNode(point.clientX, point.clientY);
                return {
                    label,
                    scale: Number(state.transform.scale.toFixed(4)),
                    point,
                    hitId: String(hit?.id || ''),
                    hitKind: String(hit?.kind || '')
                };
            }

            const samples = [sample('initial')];
            for (let index = 0; index < 3; index += 1) {
                const center = view.getCanvasCenterClientPoint();
                view.zoomAt(0.68, center.x, center.y);
                samples.push(sample(`zoom-${index + 1}`));
            }

            const failed = samples.find((entry) => entry.hitId !== target.id);
            return {
                ok: !failed,
                targetId: target.id,
                failed,
                samples
            };
        });

        if (!audit.ok) {
            throw new Error('Constellation zoom hit mismatch: ' + JSON.stringify(audit));
        }

        console.log('CONSTELLATION_ZOOM_HIT_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
