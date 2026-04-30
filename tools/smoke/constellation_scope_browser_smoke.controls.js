const {
    clickToolbarControl,
    ensureControlsExpanded,
    getStats
} = require('./constellation_scope_browser_smoke.shared');

const {
    runConstellationControlToggleChecks
} = require('./constellation_scope_browser_smoke.controls.toggles');

async function runConstellationControls(page, { canvasBox, categorySeed }) {
    await runConstellationControlToggleChecks(page, { categorySeed });

    const dragSeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const linkNode = stats.sampleNodes.find((node) => node.id === 'link_alpha-folder-1')
            || stats.sampleNodes.find((node) => node.kind === 'link');
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

    await page.evaluate((nodeId) => {
        if (!window.EveConstellationMap.__debugSelectNode(nodeId)) {
            throw new Error('Failed to select bookmark node for inspector cover assertion');
        }
    }, dragSeed.id);
    await page.waitForTimeout(180);
    await page.mouse.move(canvasBox.x + 28, canvasBox.y + 28);
    await page.waitForTimeout(120);
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
    await page.waitForFunction(() => {
        const cover = document.querySelector('[data-map-info] [data-map-info-cover]');
        if (!cover) return false;
        return Number.parseFloat(window.getComputedStyle(cover).opacity || '0') > 0.55;
    }, null, { timeout: 1200 });
    const hoveredInspectorCover = await page.evaluate(() => {
        const info = document.querySelector('[data-map-info]');
        const cover = info?.querySelector('[data-map-info-cover]');
        return {
            opacity: cover ? window.getComputedStyle(cover).opacity : '',
            transform: cover ? window.getComputedStyle(cover).transform : '',
            bottom: cover ? window.getComputedStyle(cover).bottom : ''
        };
    });
    if (Number.parseFloat(hoveredInspectorCover.opacity || '0') < 0.55) {
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
    if (Math.abs(draggedNode.x - dragSeed.origX) < 5 && Math.abs(draggedNode.y - dragSeed.origY) < 5) {
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

    const categoryDragPoint = await page.evaluate((categoryId) => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const categoryNode = stats.sampleNodes.find((node) => node.id === categoryId);
        if (!categoryNode) throw new Error('Missing category node before drag');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            x: rect.left + stats.transform.tx + (categoryNode.x * stats.transform.scale),
            y: rect.top + stats.transform.ty + (categoryNode.y * stats.transform.scale)
        };
    }, categoryDragSeed.id);

    await page.mouse.move(categoryDragPoint.x, categoryDragPoint.y);
    await page.mouse.down();
    await page.mouse.move(categoryDragPoint.x + 240, categoryDragPoint.y - 70, { steps: 14 });
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
    if (movedCategoryDistance < 1.5 || !movedCategory.hasManualAnchor) {
        throw new Error(`Expected dragged category node to keep its relocated position, got ${JSON.stringify({ before: categoryDragSeed, after: movedCategory })}`);
    }

    await page.evaluate(() => {
        window.EveConstellationMap.openMap({ scope: 'all' });
    });
    await page.waitForFunction(() => {
        const stats = window.EveConstellationMap?.__debugGetGraphStats?.();
        return !!stats
            && stats.visible
            && stats.scope?.scope === 'all'
            && stats.sampleNodes.some((node) => node.kind === 'workspace');
    }, null, { timeout: 5000 });
    await page.waitForTimeout(240);
    await ensureControlsExpanded(page);

    const workspaceHoldOnSeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const workspaceNode = stats.sampleNodes.find((node) => node.id === 'workspace_main')
            || stats.sampleNodes.find((node) => node.kind === 'workspace');
        if (!workspaceNode) throw new Error('No workspace node available for hold test');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            id: workspaceNode.id,
            origX: workspaceNode.x,
            origY: workspaceNode.y,
            hasManualAnchor: workspaceNode.hasManualAnchor,
            startX: rect.left + stats.transform.tx + (workspaceNode.x * stats.transform.scale),
            startY: rect.top + stats.transform.ty + (workspaceNode.y * stats.transform.scale)
        };
    });
    if (!workspaceHoldOnSeed.hasManualAnchor) {
        throw new Error(`Expected workspace node to start anchored when Hold Main Nodes is on, got ${JSON.stringify(workspaceHoldOnSeed)}`);
    }

    await page.mouse.move(workspaceHoldOnSeed.startX, workspaceHoldOnSeed.startY);
    await page.mouse.down();
    await page.mouse.move(workspaceHoldOnSeed.startX + 180, workspaceHoldOnSeed.startY - 60, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const workspaceHoldOnStats = await getStats(page);
    const workspaceHeld = workspaceHoldOnStats.sampleNodes.find((node) => node.id === workspaceHoldOnSeed.id);
    if (!workspaceHeld) {
        throw new Error('Dragged workspace node missing from debug sample after hold-on drag');
    }
    if (!workspaceHeld.hasManualAnchor || Math.hypot(workspaceHeld.x - workspaceHoldOnSeed.origX, workspaceHeld.y - workspaceHoldOnSeed.origY) < 2.5) {
        throw new Error(`Expected dragged workspace node to stay held with Hold Main Nodes on, got ${JSON.stringify({ before: workspaceHoldOnSeed, after: workspaceHeld })}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="stability"]');
    await page.waitForTimeout(220);
    const workspaceHoldOffState = await page.evaluate(() => ({
        stableMainNodes: !!window.EveConstellationMap?._shared?.state?.stableMainNodes,
        label: document.querySelector('[data-map-toolbar="stability"]')?.textContent || ''
    }));
    if (workspaceHoldOffState.stableMainNodes || !/Hold Main Nodes: OFF/i.test(workspaceHoldOffState.label)) {
        throw new Error(`Expected Hold Main Nodes to turn off before workspace release test, got ${JSON.stringify(workspaceHoldOffState)}`);
    }

    const workspaceHoldOffSeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const workspaceNode = stats.sampleNodes.find((node) => node.id === 'workspace_main')
            || stats.sampleNodes.find((node) => node.kind === 'workspace');
        if (!workspaceNode) throw new Error('No workspace node available for release test');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            id: workspaceNode.id,
            origX: workspaceNode.x,
            origY: workspaceNode.y,
            hasManualAnchor: workspaceNode.hasManualAnchor,
            startX: rect.left + stats.transform.tx + (workspaceNode.x * stats.transform.scale),
            startY: rect.top + stats.transform.ty + (workspaceNode.y * stats.transform.scale)
        };
    });
    if (workspaceHoldOffSeed.hasManualAnchor) {
        throw new Error(`Expected workspace node to rebuild without a manual anchor when Hold Main Nodes is off, got ${JSON.stringify(workspaceHoldOffSeed)}`);
    }

    await page.mouse.move(workspaceHoldOffSeed.startX, workspaceHoldOffSeed.startY);
    await page.mouse.down();
    await page.mouse.move(workspaceHoldOffSeed.startX - 170, workspaceHoldOffSeed.startY + 95, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const workspaceHoldOffStats = await getStats(page);
    const workspaceReleased = workspaceHoldOffStats.sampleNodes.find((node) => node.id === workspaceHoldOffSeed.id);
    if (!workspaceReleased) {
        throw new Error('Dragged workspace node missing from debug sample after hold-off drag');
    }
    if (workspaceReleased.hasManualAnchor || Math.hypot(workspaceReleased.x - workspaceHoldOffSeed.origX, workspaceReleased.y - workspaceHoldOffSeed.origY) < 2.5) {
        throw new Error(`Expected dragged workspace node to release instead of re-anchoring with Hold Main Nodes off, got ${JSON.stringify({ before: workspaceHoldOffSeed, after: workspaceReleased })}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="stability"]');
    await page.waitForTimeout(220);
    await page.evaluate(() => {
        window.EveConstellationMap.openCardMap('main', 'Alpha');
    });
    await page.waitForFunction(() => {
        const stats = window.EveConstellationMap?.__debugGetGraphStats?.();
        return !!stats
            && stats.visible
            && stats.scope?.scope === 'card'
            && stats.scope?.workspaceId === 'main'
            && stats.scope?.categoryName === 'Alpha';
    }, null, { timeout: 5000 });
    await page.waitForTimeout(220);
    await ensureControlsExpanded(page);

    const folderDragSeed = await page.evaluate(() => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const folderNode = stats.sampleNodes.find((node) => node.id === 'folder_main_Alpha_f-parent')
            || stats.sampleNodes.find((node) => node.kind === 'folder');
        if (!folderNode) throw new Error('No folder node available for drift test');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            id: folderNode.id,
            origX: folderNode.x,
            origY: folderNode.y,
            startX: rect.left + stats.transform.tx + (folderNode.x * stats.transform.scale),
            startY: rect.top + stats.transform.ty + (folderNode.y * stats.transform.scale)
        };
    });

    await page.mouse.click(folderDragSeed.startX, folderDragSeed.startY);
    await page.waitForTimeout(180);
    await page.evaluate((nodeId) => {
        const select = window.EveConstellationMap?._events?.setSelectedNode;
        const state = window.EveConstellationMap?._shared?.state;
        if (typeof select !== 'function' || !state) return;
        const node = state.nodeIndex?.get?.(nodeId)
            || state.nodes?.find?.((entry) => entry?.id === nodeId);
        if (node) select(node);
    }, folderDragSeed.id);
    await page.waitForTimeout(80);
    await ensureControlsExpanded(page);
    await clickToolbarControl(page, '[data-map-toolbar="polarity-node"]');
    await page.waitForTimeout(140);
    const folderNodePullStats = await getStats(page);
    const folderNodePull = folderNodePullStats.sampleNodes.find((node) => node.id === folderDragSeed.id);
    if (!folderNodePull || folderNodePull.nodePolarity !== 'attract' || folderNodePull.polarity !== 'attract') {
        throw new Error(`Expected selected folder node override to switch to attract, got ${JSON.stringify(folderNodePull)}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="polarity-clear"]');
    await page.waitForTimeout(140);
    const clearedPolarityStats = await getStats(page);
    if (clearedPolarityStats.polaritySummary.nodeOverrideCount !== 0 || clearedPolarityStats.polaritySummary.attractKinds.length !== 0) {
        throw new Error(`Expected polarity controls to clear, got ${JSON.stringify(clearedPolarityStats.polaritySummary)}`);
    }

    const folderDragPoint = await page.evaluate((folderId) => {
        const stats = window.EveConstellationMap.__debugGetGraphStats();
        const folderNode = stats.sampleNodes.find((node) => node.id === folderId);
        if (!folderNode) throw new Error('Missing folder node before drag');
        const canvas = document.querySelector('[data-map-canvas]');
        const rect = canvas.getBoundingClientRect();
        return {
            x: rect.left + stats.transform.tx + (folderNode.x * stats.transform.scale),
            y: rect.top + stats.transform.ty + (folderNode.y * stats.transform.scale)
        };
    }, folderDragSeed.id);

    await page.mouse.move(folderDragPoint.x, folderDragPoint.y);
    await page.mouse.down();
    await page.mouse.move(folderDragPoint.x + 170, folderDragPoint.y + 55, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(260);
    const folderAnchoredStats = await getStats(page);
    const movedFolder = folderAnchoredStats.sampleNodes.find((node) => node.id === folderDragSeed.id);
    if (!movedFolder) {
        throw new Error('Dragged folder node missing from debug sample after drag');
    }
    const movedFolderDistance = Math.hypot(
        movedFolder.x - folderDragSeed.origX,
        movedFolder.y - folderDragSeed.origY
    );
    if (movedFolderDistance < 2.5) {
        throw new Error(`Expected dragged folder node to relocate, got ${JSON.stringify({ before: folderDragSeed, after: movedFolder })}`);
    }

    await page.waitForTimeout(1400);
    const folderFloatStats = await getStats(page);
    const floatedFolder = folderFloatStats.sampleNodes.find((node) => node.id === folderDragSeed.id);
    if (!floatedFolder) {
        throw new Error('Dragged folder node missing from debug sample after float check');
    }
    if (Math.hypot(floatedFolder.x - folderDragSeed.origX, floatedFolder.y - folderDragSeed.origY) < 2.5) {
        throw new Error(`Expected floated folder node to stay relocated instead of snapping back, got ${JSON.stringify({ before: folderDragSeed, anchored: movedFolder, floated: floatedFolder })}`);
    }
    if (floatedFolder.isStatic || floatedFolder.hasManualAnchor) {
        throw new Error(`Expected dragged folder node to remain fluid instead of becoming fixed, got ${JSON.stringify({ anchored: movedFolder, floated: floatedFolder })}`);
    }

    return {
        anchoredStats,
        draggedNode,
        folderDragSeed
    };
}

module.exports = {
    runConstellationControls
};
