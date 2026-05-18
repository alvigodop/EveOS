const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderSidebar === 'function'
        && !!window.EveSidebarRuntime
        && !!window.EveSidebarGroups
        && !!window.EveWorkspaceHelpers?.findParent
    ), undefined, { timeout: 120000 });
}

async function seedState(page) {
    await page.evaluate(() => {
        config = window.config = {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: '🏠', subTabs: [] },
                { id: 'alpha', name: 'Alpha', icon: '📁', subTabs: [] },
                { id: 'beta', name: 'Beta', icon: '📁', subTabs: [] },
                { id: 'gamma', name: 'Gamma', icon: '📁', subTabs: [] }
            ],
            sidebarGroups: [],
            sidebarOrderMode: 'auto',
            showHiddenSidebarGroups: false,
            showInactiveTabs: false,
            collapsedTabs: []
        };
        links = window.links = [];
        bookmarkFolders = window.bookmarkFolders = {};

        const groupsApi = window.EveSidebarGroups;
        groupsApi.ensureConfigDefaults(config);
        window.renderSidebar();
    });
}

async function runSmoke(page) {
    const result = await page.evaluate(async () => {
        const source = document.querySelector('#sidebar .ws-item[data-ws-id="gamma"]');
        const alpha = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
        const alphaBlock = alpha ? alpha.closest('.ws-top-order-block') : null;
        const targetSlot = alphaBlock ? alphaBlock.querySelector('.ws-order-slot') : null;
        if (!source || !targetSlot) {
            return {
                ok: false,
                reason: 'Missing source or alpha order slot',
                sourceFound: !!source,
                targetSlotFound: !!targetSlot
            };
        }

        let nativeDragStartCount = 0;
        source.addEventListener('dragstart', () => { nativeDragStartCount += 1; });

        const originalElementFromPoint = document.elementFromPoint.bind(document);

        document.elementFromPoint = function () { return targetSlot; };
        alpha.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 24,
            button: 0,
            clientX: 36,
            clientY: 180
        }));
        await new Promise(resolve => setTimeout(resolve, 220));
        document.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 24,
            button: 0,
            clientX: 46,
            clientY: 170
        }));
        document.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 24,
            button: 0,
            clientX: 46,
            clientY: 170
        }));
        document.elementFromPoint = originalElementFromPoint;
        await new Promise(resolve => setTimeout(resolve, 520));
        const orderAfterOwnSlotNoop = config.workspaces.map((ws) => ws.id);

        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 20,
            button: 0,
            clientX: 36,
            clientY: 220
        }));
        await new Promise(resolve => setTimeout(resolve, 260));
        source.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 20,
            button: 0,
            clientX: 39,
            clientY: 222
        }));
        const previewDuringJitter = !!document.querySelector('.ws-pointer-drag-preview');
        source.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 20,
            button: 0,
            clientX: 39,
            clientY: 222
        }));
        source.click();
        await new Promise(resolve => setTimeout(resolve, 80));
        const workspaceAfterJitterClick = config.activeWorkspace;
        config.activeWorkspace = 'main';

        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 23,
            button: 0,
            clientX: 36,
            clientY: 220
        }));
        await new Promise(resolve => setTimeout(resolve, 220));
        source.dispatchEvent(new PointerEvent('pointercancel', {
            bubbles: true,
            cancelable: true,
            pointerId: 23,
            button: 0,
            clientX: 36,
            clientY: 220
        }));
        const previewAfterSoftCancel = !!document.querySelector('.ws-pointer-drag-preview');
        const dragActiveAfterSoftCancel = document.getElementById('sidebar').classList.contains('ws-drag-active');
        source.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 23,
            button: 0,
            clientX: 36,
            clientY: 220
        }));
        await new Promise(resolve => setTimeout(resolve, 80));

        document.elementFromPoint = function () { return targetSlot; };

        source.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 21,
            button: 0,
            clientX: 36,
            clientY: 220
        }));
        await new Promise(resolve => setTimeout(resolve, 380));
        document.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 21,
            button: 0,
            clientX: 48,
            clientY: 180
        }));
        const rootPreview = document.querySelector('.ws-pointer-drag-preview');
        const previewDuringRootDrag = !!rootPreview
            && rootPreview.textContent.includes('Gamma');
        document.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 21,
            button: 0,
            clientX: 48,
            clientY: 180
        }));

        document.elementFromPoint = originalElementFromPoint;
        await new Promise(resolve => setTimeout(resolve, 120));
        const previewAfterRootDrag = !!document.querySelector('.ws-pointer-drag-preview');

        window.renderSidebar();
        await new Promise(resolve => requestAnimationFrame(resolve));

        const betaSource = document.querySelector('#sidebar .ws-item[data-ws-id="beta"]');
        const alphaTarget = document.querySelector('#sidebar .ws-item[data-ws-id="alpha"]');
        if (!betaSource || !alphaTarget) {
            return {
                ok: false,
                reason: 'Missing beta source or alpha nesting target after reorder',
                sourceDraggable: source.draggable,
                nativeDragStartCount,
                order: config.workspaces.map((ws) => ws.id)
            };
        }

        document.elementFromPoint = function () { return alphaTarget; };
        betaSource.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerId: 22,
            button: 0,
            clientX: 36,
            clientY: 260
        }));
        await new Promise(resolve => setTimeout(resolve, 380));
        betaSource.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId: 22,
            button: 0,
            clientX: 48,
            clientY: 185
        }));
        betaSource.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            pointerId: 22,
            button: 0,
            clientX: 48,
            clientY: 185
        }));
        document.elementFromPoint = originalElementFromPoint;
        await new Promise(resolve => setTimeout(resolve, 120));

        const alphaNode = window.EveWorkspaceHelpers.findById(config.workspaces, 'alpha');
        return {
            ok: true,
            sourceDraggable: source.draggable,
            betaSourceDraggable: betaSource.draggable,
            nativeDragStartCount,
            previewDuringJitter,
            workspaceAfterJitterClick,
            previewAfterSoftCancel,
            dragActiveAfterSoftCancel,
            orderAfterOwnSlotNoop,
            previewDuringRootDrag,
            previewAfterRootDrag,
            order: config.workspaces.map((ws) => ws.id),
            alphaChildren: Array.isArray(alphaNode && alphaNode.subTabs)
                ? alphaNode.subTabs.map((ws) => ws.id)
                : []
        };
    });

    if (!result.ok) {
        throw new Error(`Sidebar root pointer reorder setup failed: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.sourceDraggable || result.betaSourceDraggable || result.nativeDragStartCount !== 0) {
        throw new Error(`Expected workspace reorder to avoid native drag ghost: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.workspaceAfterJitterClick !== 'gamma') {
        throw new Error(`Expected normal-route hold jitter to remain clickable without applying a drag: ${JSON.stringify(result, null, 2)}`);
    }
    if (!result.previewAfterSoftCancel || !result.dragActiveAfterSoftCancel) {
        throw new Error(`Expected active pointercancel to preserve drag UI briefly: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.orderAfterOwnSlotNoop.join('|') !== 'main|alpha|beta|gamma') {
        throw new Error(`Expected dropping a tab before itself to be a no-op: ${JSON.stringify(result, null, 2)}`);
    }
    if (!result.previewDuringRootDrag || result.previewAfterRootDrag) {
        throw new Error(`Expected custom pointer drag preview during normal drag only: ${JSON.stringify(result, null, 2)}`);
    }
    const order = result.order;
    if (order.join('|') !== 'main|gamma|alpha') {
        throw new Error(`Unexpected sidebar root order after drag reorder: ${order.join(' | ')}`);
    }
    if (result.alphaChildren.join('|') !== 'beta') {
        throw new Error(`Expected dropping a tab on another tab to nest it: ${JSON.stringify(result, null, 2)}`);
    }
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });
        await waitForApp(page);
        await seedState(page);
        await runSmoke(page);
        console.log('SIDEBAR_WORKSPACE_REORDER_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
