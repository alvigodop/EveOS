const {
    captureInspectorCover,
    clickAndWaitForMap,
    clickToolbarControl,
    closeMap,
    getStats
} = require('./constellation_scope_browser_smoke.shared');

async function runConstellationUnidex(page, { anchoredStats, canvasBox, categorySeed, folderDragSeed, zoomStats }) {
    await page.evaluate((folderId) => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const folderNode = stats.sampleNodes.find((node) => node.id === folderId);
        if (!folderNode) throw new Error('Missing floated folder node before static test');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        window.__folderStaticClickPoint = {
            x: rect.left + stats.transform.tx + (folderNode.x * stats.transform.scale),
            y: rect.top + stats.transform.ty + (folderNode.y * stats.transform.scale)
        };
    }, folderDragSeed.id);

    const folderStaticPoint = await page.evaluate(() => window.__folderStaticClickPoint);
    await page.mouse.click(folderStaticPoint.x, folderStaticPoint.y);
    await clickToolbarControl(page, '[data-map-toolbar="static-node"]');
    await page.waitForTimeout(220);
    const staticFolderStats = await getStats(page);
    const staticFolder = staticFolderStats.sampleNodes.find((node) => node.id === folderDragSeed.id);
    if (!staticFolder?.isStatic || staticFolder.staticSource !== 'node') {
        throw new Error(`Expected selected folder node to enter static-node mode, got ${JSON.stringify(staticFolder)}`);
    }
    await page.waitForTimeout(1000);
    const staticFolderLaterStats = await getStats(page);
    const staticFolderLater = staticFolderLaterStats.sampleNodes.find((node) => node.id === folderDragSeed.id);
    if (!staticFolderLater?.isStatic || staticFolderLater.staticSource !== 'node') {
        throw new Error(`Expected static folder node to stay static, got ${JSON.stringify(staticFolderLater)}`);
    }
    const staticFolderDrift = Math.hypot(staticFolderLater.x - staticFolder.x, staticFolderLater.y - staticFolder.y);
    if (staticFolderDrift > 1.35) {
        throw new Error(`Expected static folder node to hold position after toggle, got ${JSON.stringify({ staticFolder, staticFolderLater })}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="static-kind"]');
    await page.waitForTimeout(120);
    const staticKindStats = await getStats(page);
    const folderKindLocked = staticKindStats.staticSummary?.kinds || [];
    if (!folderKindLocked.includes('folder')) {
        throw new Error(`Expected folder kind to be locked static, got ${JSON.stringify(staticKindStats.staticSummary)}`);
    }
    const folderKindNodes = staticKindStats.sampleNodes.filter((node) => node.kind === 'folder');
    if (!folderKindNodes.length || folderKindNodes.some((node) => !node.isStatic || node.staticSource !== 'kind')) {
        throw new Error(`Expected every folder node to enter static-kind mode, got ${JSON.stringify(folderKindNodes)}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="static-clear"]');
    await page.waitForTimeout(120);

    await page.evaluate((categoryId) => {
        if (!window.EveConstellationMap.__debugSelectNode(categoryId)) {
            throw new Error('Unable to select category node before static-chain test');
        }
    }, categorySeed.id);
    await page.waitForTimeout(150);
    await clickToolbarControl(page, '[data-map-toolbar="static-chain"]');
    await page.waitForTimeout(180);
    const staticChainStats = await getStats(page);
    const branchRoots = staticChainStats.staticSummary?.branchRoots || [];
    if (!branchRoots.includes(categorySeed.id)) {
        throw new Error(`Expected selected category to become a static chain root, got ${JSON.stringify(staticChainStats.staticSummary)}`);
    }
    const branchNodes = staticChainStats.sampleNodes.filter((node) => (
        node.id === categorySeed.id
        || node.id === 'folder_main_Alpha_f-parent'
        || node.id === 'folder_main_Alpha_f-child'
    ));
    if (branchNodes.length < 3 || branchNodes.some((node) => !node.isStatic || node.staticSource !== 'branch')) {
        throw new Error(`Expected category chain to lock category and folder descendants, got ${JSON.stringify(branchNodes)}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="static-clear"]');
    await page.waitForTimeout(120);
    const clearedStaticStats = await getStats(page);
    if ((clearedStaticStats.staticSummary?.nodeIds || []).length || (clearedStaticStats.staticSummary?.kinds || []).length) {
        throw new Error(`Expected static locks to clear, got ${JSON.stringify(clearedStaticStats.staticSummary)}`);
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
    if (Math.abs(panStats.transform.tx - prePanTx) < 15) {
        throw new Error(`Expected map pan to shift transform.tx meaningfully (${prePanTx} -> ${panStats.transform.tx})`);
    }
    if (Math.abs(panStats.visibleWorldBounds.minX - zoomStats.visibleWorldBounds.minX) < 3) {
        throw new Error(`Expected visible world bounds to shift with panning, got ${JSON.stringify({ before: zoomStats.visibleWorldBounds, after: panStats.visibleWorldBounds })}`);
    }
    if (JSON.stringify(panStats.worldBounds) !== JSON.stringify(zoomStats.worldBounds)) {
        throw new Error(`World bounds should stay stable while panning, got ${JSON.stringify({ before: zoomStats.worldBounds, after: panStats.worldBounds })}`);
    }

    await page.mouse.move(canvasBox.x + (canvasBox.width * 0.5), canvasBox.y + (canvasBox.height * 0.5));
    await page.mouse.wheel(0, -1600);
    await page.waitForTimeout(220);
    const deepZoomStats = await getStats(page);
    if (!(deepZoomStats.transform.scale > 3.1)) {
        throw new Error(`Expected deeper zoom-in headroom, got scale=${deepZoomStats.transform.scale}`);
    }
    await closeMap(page);

    await page.evaluate(() => window.openUnidexView());
    await page.waitForTimeout(700);

    const topbarHiddenInUnidex = await page.evaluate(() => {
        const mapButton = document.querySelector('.topbar-constellation-btn');
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
    const workspaceSeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const workspaceNode = stats.sampleNodes.find((node) => node.kind === 'workspace' && node.label === 'Main');
        if (!workspaceNode) throw new Error('No workspace node for workspace cover test');
        return {
            id: workspaceNode.id
        };
    });
    await page.evaluate((nodeId) => {
        if (!window.EveConstellationMap.__debugSelectNode(nodeId)) {
            throw new Error('Failed to select workspace node for workspace cover test');
        }
    }, workspaceSeed.id);
    await page.waitForTimeout(180);
    await page.locator('[data-map-info]').hover();
    await page.waitForTimeout(160);
    const workspaceCoverOne = await captureInspectorCover(page);
    const workspaceCoverDebug = await page.evaluate(() => {
        window.EveConstellationMap.__debugShiftInspectorHover(31000);
        return window.EveConstellationMap.__debugGetInspectorCoverState();
    });
    const workspaceCoverTwo = workspaceCoverDebug.current;
    if (!workspaceCoverOne || !workspaceCoverTwo || workspaceCoverOne === workspaceCoverTwo) {
        throw new Error(`Expected rotating workspace cover previews, got ${workspaceCoverOne} -> ${workspaceCoverTwo} :: ${JSON.stringify(workspaceCoverDebug)}`);
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
        allStats,
        cardsStageStats,
        deepZoomStats,
        entriesStageStats,
        panStats,
        topbarHiddenInUnidex
    };
}

module.exports = {
    runConstellationUnidex
};
