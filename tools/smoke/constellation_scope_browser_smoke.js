const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildSeedPayload() {
    return {
        links: [
            { id: 'alpha-root-1', title: 'Alpha Root 1', url: 'https://alpha.example.com/root-1', workspace: 'main', category: 'Alpha', done: false, tags: ['alpha'] },
            { id: 'alpha-root-2', title: 'Alpha Root 2', url: 'https://alpha.example.com/root-2', workspace: 'main', category: 'Alpha', done: false, tags: ['alpha'] },
            { id: 'alpha-folder-1', title: 'Alpha Folder 1', url: 'https://alpha.example.com/folder-1', workspace: 'main', category: 'Alpha', folderId: 'f-parent', done: false, tags: ['arc'], coverImage: 'data:image/gif;base64,R0lGODlhAQABAPAAAMrKygAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==' },
            { id: 'alpha-folder-2', title: 'Alpha Folder 2', url: 'https://alpha.example.com/folder-2', workspace: 'main', category: 'Alpha', folderId: 'f-child', done: false, tags: ['arc'] },
            { id: 'gamma-root-1', title: 'Gamma Root 1', url: 'https://gamma.example.com/root-1', workspace: 'main', category: 'Gamma', done: false, tags: ['gamma'] },
            { id: 'beta-root-1', title: 'Beta Root 1', url: 'https://beta.example.com/root-1', workspace: 'alt', category: 'Beta', done: false, tags: ['beta'] }
        ],
        config: {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'folder' },
                { id: 'alt', name: 'Alt', icon: 'folder' }
            ],
            categoryOrder: ['Alpha', 'Gamma', 'Beta']
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
        && typeof window.openUnidexView === 'function'
        && !!window.EveConstellationMap?.openCurrentViewMap
        && !!window.EveConstellationMap?.__debugGetGraphStats
        && !!document.querySelector('.topbar-map-btn')
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
            window.eveState.quickPins = clonedPins;
        }

        try {
            localStorage.setItem('eveV22Data', JSON.stringify(clonedLinks));
            localStorage.setItem('eveV22Config', JSON.stringify(clonedConfig));
            localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(clonedFolders));
            localStorage.setItem('eveV22QuickPins', JSON.stringify(clonedPins));
        } catch (error) {
            // Some embedded/sandboxed contexts in file:// mode reject localStorage access.
        }

        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }, payload);
}

async function clickAndWaitForMap(page, clickFn) {
    await clickFn();
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return overlay && overlay.style.display !== 'none' && !!window.EveConstellationMap?.__debugGetGraphStats?.().visible;
    }, undefined, { timeout: 15000 });
    await page.waitForTimeout(250);
}

async function closeMap(page) {
    await page.locator('[data-map-toolbar="close"]').click();
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return !overlay || overlay.style.display === 'none';
    }, undefined, { timeout: 10000 });
}

async function getStats(page) {
    return page.evaluate(() => window.EveConstellationMap.__debugGetGraphStats());
}

async function runSmoke(page) {
    await page.evaluate(async () => {
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        await new Promise((resolve) => setTimeout(resolve, 400));
    });

    const topbarStyles = await page.evaluate(() => {
        const container = document.querySelector('.top-right');
        const button = document.querySelector('.topbar-map-btn');
        const containerStyle = container ? window.getComputedStyle(container) : null;
        const buttonStyle = button ? window.getComputedStyle(button) : null;
        return {
            overflowX: containerStyle ? containerStyle.overflowX : '',
            maxWidth: containerStyle ? containerStyle.maxWidth : '',
            minHeight: buttonStyle ? buttonStyle.minHeight : '',
            fontSize: buttonStyle ? buttonStyle.fontSize : ''
        };
    });

    if (topbarStyles.overflowX !== 'auto') {
        throw new Error(`Expected top-right overflow-x auto, got ${topbarStyles.overflowX}`);
    }

    await clickAndWaitForMap(page, () => page.locator('.topbar-map-btn').click());
    const workspaceStats = await getStats(page);
    if (workspaceStats.scope.scope !== 'workspace' || workspaceStats.scope.workspaceId !== 'main') {
        throw new Error(`Topbar map scope mismatch: ${JSON.stringify(workspaceStats.scope)}`);
    }
    if (workspaceStats.nodeCount !== 9) {
        throw new Error(`Expected workspace nodeCount=9, got ${workspaceStats.nodeCount}`);
    }
    await closeMap(page);

    await clickAndWaitForMap(page, () => page.evaluate(() => {
        if (typeof window.openCategorySettings !== 'function') {
            throw new Error('openCategorySettings unavailable');
        }
        window.openCategorySettings('Alpha');
        const modal = document.getElementById('categorySettingsModal');
        if (!modal) throw new Error('Category settings modal missing');
        const button = Array.from(modal.querySelectorAll('button'))
            .find((node) => String(node.textContent || '').includes('Constellation Map'));
        if (!button) throw new Error('Missing card settings map button');
        button.click();
    }));
    const cardStats = await getStats(page);
    if (cardStats.scope.scope !== 'card' || cardStats.scope.categoryName !== 'Alpha') {
        throw new Error(`Card map scope mismatch: ${JSON.stringify(cardStats.scope)}`);
    }
    if (cardStats.nodeCount !== 7) {
        throw new Error(`Expected card nodeCount=7, got ${cardStats.nodeCount}`);
    }

    const categorySeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const categoryNode = stats.sampleNodes.find((node) => node.kind === 'category');
        if (!categoryNode) throw new Error('No category node available for card map click test');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            id: categoryNode.id,
            origX: categoryNode.x,
            origY: categoryNode.y,
            clickX: rect.left + stats.transform.tx + (categoryNode.x * stats.transform.scale),
            clickY: rect.top + stats.transform.ty + (categoryNode.y * stats.transform.scale)
        };
    });

    await page.mouse.click(categorySeed.clickX, categorySeed.clickY);
    await page.waitForTimeout(180);

    const collapsedInspector = await page.evaluate(() => {
        const info = document.querySelector('[data-map-info]');
        const toggle = info?.querySelector('[data-map-info-toggle="1"]');
        return {
            text: info ? info.textContent : '',
            hasAction: !!info?.querySelector('[data-map-action="primary"]'),
            toggleText: toggle ? toggle.textContent : ''
        };
    });
    if (collapsedInspector.hasAction) {
        throw new Error('Inspector should start collapsed with actions hidden');
    }
    if (!/Alpha/i.test(collapsedInspector.text)) {
        throw new Error(`Expected inspector to target selected category, got ${collapsedInspector.text}`);
    }
    if (!/Expand/i.test(collapsedInspector.toggleText)) {
        throw new Error(`Expected collapsed inspector toggle, got ${collapsedInspector.toggleText}`);
    }

    await page.locator('[data-map-info-toggle="1"]').click();
    await page.waitForTimeout(120);
    const expandedInspector = await page.evaluate(() => {
        const info = document.querySelector('[data-map-info]');
        return {
            text: info ? info.textContent : '',
            toggleText: info?.querySelector('[data-map-info-toggle="1"]')?.textContent || ''
        };
    });
    if (!/Collapse/i.test(expandedInspector.toggleText)) {
        throw new Error(`Expected expanded inspector toggle, got ${expandedInspector.toggleText}`);
    }
    if (!/Center/i.test(expandedInspector.text)) {
        throw new Error('Expanded inspector should expose node actions');
    }

    const canvas = page.locator('[data-map-canvas]');
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) {
        throw new Error('Constellation canvas bounding box unavailable');
    }

    await page.mouse.move(canvasBox.x + (canvasBox.width * 0.5), canvasBox.y + (canvasBox.height * 0.5));
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(220);
    const zoomStats = await getStats(page);
    if (!(zoomStats.transform.scale > cardStats.transform.scale)) {
        throw new Error(`Expected zoom scale to increase (${cardStats.transform.scale} -> ${zoomStats.transform.scale})`);
    }

    const dragSeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const linkNode = stats.sampleNodes.find((node) => node.kind === 'link');
        if (!linkNode) throw new Error('No link node available for drag test');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            id: linkNode.id,
            origX: linkNode.x,
            origY: linkNode.y,
            startX: rect.left + stats.transform.tx + (linkNode.x * stats.transform.scale),
            startY: rect.top + stats.transform.ty + (linkNode.y * stats.transform.scale)
        };
    });

    await page.mouse.click(dragSeed.startX, dragSeed.startY);
    await page.waitForTimeout(180);
    const bookmarkInspectorCover = await page.evaluate(() => {
        const info = document.querySelector('[data-map-info]');
        const img = info?.querySelector('img');
        const cover = info?.querySelector('[data-map-info-cover]');
        return {
            hasImage: !!img,
            src: img?.getAttribute('src') || '',
            opacity: cover ? window.getComputedStyle(cover).opacity : '',
            bottom: cover ? window.getComputedStyle(cover).bottom : ''
        };
    });
    if (!bookmarkInspectorCover.hasImage || !bookmarkInspectorCover.src.startsWith('data:image/gif;base64,')) {
        throw new Error(`Expected bookmark inspector cover preview, got ${JSON.stringify(bookmarkInspectorCover)}`);
    }
    if (Number.parseFloat(bookmarkInspectorCover.opacity || '0') > 0.05) {
        throw new Error(`Expected bookmark inspector cover to stay hidden until hover, got ${JSON.stringify(bookmarkInspectorCover)}`);
    }

    await page.locator('[data-map-info]').hover();
    await page.waitForTimeout(180);
    const hoveredInspectorCover = await page.evaluate(() => {
        const info = document.querySelector('[data-map-info]');
        const cover = info?.querySelector('[data-map-info-cover]');
        return {
            opacity: cover ? window.getComputedStyle(cover).opacity : '',
            transform: cover ? window.getComputedStyle(cover).transform : '',
            bottom: cover ? window.getComputedStyle(cover).bottom : ''
        };
    });
    if (Number.parseFloat(hoveredInspectorCover.opacity || '0') < 0.95) {
        throw new Error(`Expected bookmark inspector cover to show on hover, got ${JSON.stringify(hoveredInspectorCover)}`);
    }

    await page.mouse.move(dragSeed.startX, dragSeed.startY);
    await page.mouse.down();
    await page.mouse.move(dragSeed.startX + 60, dragSeed.startY + 35, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    const dragStats = await getStats(page);
    const draggedNode = dragStats.sampleNodes.find((node) => node.id === dragSeed.id);
    if (!draggedNode) {
        throw new Error('Dragged node missing from debug sample after drag');
    }
    if (Math.abs(draggedNode.x - dragSeed.origX) < 8 && Math.abs(draggedNode.y - dragSeed.origY) < 8) {
        throw new Error(`Expected dragged node to move meaningfully, got ${JSON.stringify({ before: dragSeed, after: draggedNode })}`);
    }

    const categoryDragSeed = await page.evaluate((categoryId) => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const categoryNode = stats.sampleNodes.find((node) => node.id === categoryId);
        if (!categoryNode) throw new Error('No category node available for drag persistence test');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            id: categoryNode.id,
            origX: categoryNode.x,
            origY: categoryNode.y,
            startX: rect.left + stats.transform.tx + (categoryNode.x * stats.transform.scale),
            startY: rect.top + stats.transform.ty + (categoryNode.y * stats.transform.scale)
        };
    }, categorySeed.id);

    await page.mouse.move(categoryDragSeed.startX, categoryDragSeed.startY);
    await page.mouse.down();
    await page.mouse.move(categoryDragSeed.startX + 240, categoryDragSeed.startY - 70, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const anchoredStats = await getStats(page);
    const movedCategory = anchoredStats.sampleNodes.find((node) => node.id === categoryDragSeed.id);
    if (!movedCategory) {
        throw new Error('Moved category node missing from debug sample after drag');
    }
    const movedCategoryDistance = Math.hypot(
        movedCategory.x - categoryDragSeed.origX,
        movedCategory.y - categoryDragSeed.origY
    );
    if (movedCategoryDistance < 45) {
        throw new Error(`Expected dragged category node to keep its relocated position, got ${JSON.stringify({ before: categoryDragSeed, after: movedCategory })}`);
    }

    const panSeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        const minX = 150;
        const maxX = Math.max(minX + 40, rect.width - 420);
        const minY = 140;
        const maxY = Math.max(minY + 40, rect.height - 140);
        for (let x = minX; x < maxX; x += 26) {
            for (let y = minY; y < maxY; y += 26) {
                const crowded = stats.sampleNodes.some((node) => {
                    const screenX = stats.transform.tx + (node.x * stats.transform.scale);
                    const screenY = stats.transform.ty + (node.y * stats.transform.scale);
                    return Math.hypot(screenX - x, screenY - y) < 42;
                });
                if (!crowded) {
                    return { startX: rect.left + x, startY: rect.top + y };
                }
            }
        }
        return { startX: rect.left + minX, startY: rect.top + minY };
    });

    const prePanTx = anchoredStats.transform.tx;
    await page.keyboard.down('Space');
    await page.mouse.move(panSeed.startX, panSeed.startY);
    await page.mouse.down();
    await page.mouse.move(panSeed.startX - 280, panSeed.startY, { steps: 14 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await page.waitForTimeout(900);
    const panStats = await getStats(page);
    if (Math.abs(panStats.transform.tx - prePanTx) < 100) {
        throw new Error(`Expected map pan to shift transform.tx meaningfully (${prePanTx} -> ${panStats.transform.tx})`);
    }
    if (Math.abs(panStats.visibleWorldBounds.minX - zoomStats.visibleWorldBounds.minX) < 20) {
        throw new Error(`Expected visible world bounds to shift with panning, got ${JSON.stringify({ before: zoomStats.visibleWorldBounds, after: panStats.visibleWorldBounds })}`);
    }
    if (JSON.stringify(panStats.worldBounds) !== JSON.stringify(zoomStats.worldBounds)) {
        throw new Error(`World bounds should stay stable while panning, got ${JSON.stringify({ before: zoomStats.worldBounds, after: panStats.worldBounds })}`);
    }

    await page.mouse.move(canvasBox.x + (canvasBox.width * 0.5), canvasBox.y + (canvasBox.height * 0.5));
    await page.mouse.wheel(0, -1600);
    await page.waitForTimeout(220);
    const deepZoomStats = await getStats(page);
    if (!(deepZoomStats.transform.scale > 3.4)) {
        throw new Error(`Expected deeper zoom-in headroom, got scale=${deepZoomStats.transform.scale}`);
    }
    await closeMap(page);

    await page.evaluate(() => window.openUnidexView());
    await page.waitForTimeout(700);

    const topbarHiddenInUnidex = await page.evaluate(() => {
        const mapButton = document.querySelector('.topbar-map-btn');
        return mapButton ? window.getComputedStyle(mapButton).display === 'none' : false;
    });
    if (!topbarHiddenInUnidex) {
        throw new Error('Topbar map button should be hidden in Unidex mode');
    }

    const unidexMapButtonCount = await page.locator('.unidex-map-btn').count();
    if (unidexMapButtonCount < 1) {
        throw new Error('Expected at least one Unidex map button');
    }

    await clickAndWaitForMap(page, () => page.locator('.unidex-map-btn').first().click());
    const allStats = await getStats(page);
    if (allStats.scope.scope !== 'all') {
        throw new Error(`Unidex tabs-stage scope mismatch: ${JSON.stringify(allStats.scope)}`);
    }
    if (allStats.kinds.workspace !== 2) {
        throw new Error(`Expected 2 workspace nodes in all-tabs map, got ${JSON.stringify(allStats.kinds)}`);
    }
    await closeMap(page);

    await page.evaluate(() => window.UnidexView.switchWorkspaceTab('main'));
    await page.waitForTimeout(500);
    await clickAndWaitForMap(page, () => page.locator('.unidex-map-btn').first().click());
    const cardsStageStats = await getStats(page);
    if (cardsStageStats.scope.scope !== 'workspace' || cardsStageStats.scope.workspaceId !== 'main') {
        throw new Error(`Unidex cards-stage scope mismatch: ${JSON.stringify(cardsStageStats.scope)}`);
    }
    await closeMap(page);

    await page.evaluate(() => window.UnidexView.selectCategory('Alpha'));
    await page.waitForTimeout(800);
    await clickAndWaitForMap(page, () => page.locator('.unidex-map-btn').first().click());
    const entriesStageStats = await getStats(page);
    if (entriesStageStats.scope.scope !== 'card' || entriesStageStats.scope.categoryName !== 'Alpha') {
        throw new Error(`Unidex entries-stage scope mismatch: ${JSON.stringify(entriesStageStats.scope)}`);
    }
    await closeMap(page);

    const unidexContextMenuVisible = await page.evaluate(() => {
        const menu = document.getElementById('unidex-context-menu');
        if (!menu) return false;
        window.showUnidexContextMenu({
            preventDefault() {},
            stopPropagation() {},
            clientX: 64,
            clientY: 64
        });
        return menu.style.display !== 'none' || menu.getBoundingClientRect().width > 0;
    });
    if (!unidexContextMenuVisible) {
        throw new Error('Unidex context menu did not open');
    }

    return {
        topbarStyles,
        workspaceStats,
        cardStats,
        zoomStats,
        draggedNode,
        panStats,
        deepZoomStats,
        allStats,
        cardsStageStats,
        entriesStageStats,
        topbarHiddenInUnidex
    };
}

async function main() {
    const payload = buildSeedPayload();
    const errors = [];
    const consoleErrors = [];
    let browser = null;

    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

        page.on('pageerror', (error) => {
            errors.push(error && error.stack ? error.stack : String(error));
        });
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await waitForApp(page);
        await page.waitForTimeout(2500);
        await seedState(page, payload);
        await page.waitForTimeout(500);

        const result = await runSmoke(page);

        if (errors.length) {
            throw new Error(`Page errors detected:\n${errors.join('\n\n')}`);
        }

        const criticalConsoleErrors = consoleErrors.filter((entry) => {
            if (/Tracking Prevention blocked access to storage/i.test(entry)) return false;
            if (/Failed to load resource/i.test(entry)) return false;
            return true;
        });
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`CONSTELLATION_SCOPE_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        if (browser) await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
