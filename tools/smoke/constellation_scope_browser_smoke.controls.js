const {
    clickToolbarControl,
    ensureControlsExpanded,
    getStats
} = require('./constellation_scope_browser_smoke.shared');

async function runConstellationControls(page, { canvasBox, categorySeed }) {
    await clickToolbarControl(page, '[data-map-toolbar="motion"]');
    await page.waitForTimeout(140);
    const smoothMotionStats = await getStats(page);
    if (smoothMotionStats.motionMode !== 'smooth') {
        throw new Error(`Expected motion mode to cycle to smooth, got ${smoothMotionStats.motionMode}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="motion"]');
    await page.waitForTimeout(140);
    const slowMotionStats = await getStats(page);
    if (slowMotionStats.motionMode !== 'slow') {
        throw new Error(`Expected motion mode to cycle to slow, got ${slowMotionStats.motionMode}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="motion"]');
    await page.waitForTimeout(140);
    const webMotionStats = await getStats(page);
    if (webMotionStats.motionMode !== 'web') {
        throw new Error(`Expected motion mode to cycle to web, got ${webMotionStats.motionMode}`);
    }
    const webAnchorSeed = webMotionStats.sampleNodes.find((node) => node.id === categorySeed.id);
    await page.waitForTimeout(650);
    const webMotionLaterStats = await getStats(page);
    const webAnchorLater = webMotionLaterStats.sampleNodes.find((node) => node.id === categorySeed.id);
    if (!webAnchorSeed || !webAnchorLater) {
        throw new Error('Missing category node while validating web motion mode');
    }
    const webCategoryDrift = Math.hypot(
        webAnchorLater.x - webAnchorSeed.x,
        webAnchorLater.y - webAnchorSeed.y
    );
    if (webCategoryDrift > 8) {
        throw new Error(`Expected web mode to keep the category hub steady, got drift=${webCategoryDrift}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="motion"]');
    await page.waitForTimeout(140);
    const freeMotionStats = await getStats(page);
    if (freeMotionStats.motionMode !== 'free') {
        throw new Error(`Expected motion mode to cycle back to free, got ${freeMotionStats.motionMode}`);
    }
    if (!(freeMotionStats.motionProfile.repulsionScale > smoothMotionStats.motionProfile.repulsionScale
        && smoothMotionStats.motionProfile.repulsionScale > slowMotionStats.motionProfile.repulsionScale
        && slowMotionStats.motionProfile.repulsionScale > webMotionStats.motionProfile.repulsionScale)) {
        throw new Error(`Expected repulsion scales to separate modes, got ${JSON.stringify({
            free: freeMotionStats.motionProfile,
            smooth: smoothMotionStats.motionProfile,
            slow: slowMotionStats.motionProfile,
            web: webMotionStats.motionProfile
        })}`);
    }
    if (!(webMotionStats.motionProfile.centerPullScale > slowMotionStats.motionProfile.centerPullScale
        && slowMotionStats.motionProfile.centerPullScale > smoothMotionStats.motionProfile.centerPullScale
        && smoothMotionStats.motionProfile.centerPullScale > freeMotionStats.motionProfile.centerPullScale)) {
        throw new Error(`Expected center pull scales to separate modes, got ${JSON.stringify({
            free: freeMotionStats.motionProfile,
            smooth: smoothMotionStats.motionProfile,
            slow: slowMotionStats.motionProfile,
            web: webMotionStats.motionProfile
        })}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="motion"]');
    await page.waitForTimeout(140);
    const resetMotionStats = await getStats(page);
    if (resetMotionStats.motionMode !== 'smooth') {
        throw new Error(`Expected motion mode to cycle back to smooth, got ${resetMotionStats.motionMode}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="polarity-kind"]');
    await page.waitForTimeout(140);
    const categoryPullStats = await getStats(page);
    const pulledCategory = categoryPullStats.sampleNodes.find((node) => node.id === categorySeed.id);
    if (!categoryPullStats.polaritySummary.attractKinds.includes('category')) {
        throw new Error(`Expected category kind polarity to switch to attract, got ${JSON.stringify(categoryPullStats.polaritySummary)}`);
    }
    if (!pulledCategory || pulledCategory.kindPolarity !== 'attract' || pulledCategory.polarity !== 'attract') {
        throw new Error(`Expected selected category to inherit pull polarity, got ${JSON.stringify(pulledCategory)}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="polarity-node"]');
    await page.waitForTimeout(140);
    const categoryNodePullStats = await getStats(page);
    const categoryNodePull = categoryNodePullStats.sampleNodes.find((node) => node.id === categorySeed.id);
    if (!categoryNodePull || categoryNodePull.nodePolarity !== 'attract' || categoryNodePull.polaritySource !== 'node') {
        throw new Error(`Expected selected category node override to switch to attract, got ${JSON.stringify(categoryNodePull)}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="polarity-node"]');
    await page.waitForTimeout(140);
    const categoryNodePushStats = await getStats(page);
    const categoryNodePush = categoryNodePushStats.sampleNodes.find((node) => node.id === categorySeed.id);
    if (!categoryNodePush || categoryNodePush.nodePolarity !== 'repel' || categoryNodePush.polarity !== 'repel') {
        throw new Error(`Expected selected category node override to switch to repel, got ${JSON.stringify(categoryNodePush)}`);
    }

    await clickToolbarControl(page, '[data-map-toolbar="polarity-node"]');
    await page.waitForTimeout(140);
    const categoryNodeResetStats = await getStats(page);
    const categoryNodeReset = categoryNodeResetStats.sampleNodes.find((node) => node.id === categorySeed.id);
    if (!categoryNodeReset || categoryNodeReset.nodePolarity !== 'inherit' || categoryNodeReset.polarity !== 'attract') {
        throw new Error(`Expected selected category node override to clear back to kind polarity, got ${JSON.stringify(categoryNodeReset)}`);
    }
    await page.evaluate(() => {
        const push = document.querySelector('[data-map-polarity-strength-number="repel"]');
        const pull = document.querySelector('[data-map-polarity-strength-number="attract"]');
        if (!push || !pull) throw new Error('Missing polarity strength inputs');
        push.value = '0.44';
        push.dispatchEvent(new Event('input', { bubbles: true }));
        pull.value = '0.38';
        pull.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(140);
    const tunedPolarityStats = await getStats(page);
    if (tunedPolarityStats.polaritySummary.strength.repel !== 0.44 || tunedPolarityStats.polaritySummary.strength.attract !== 0.38) {
        throw new Error(`Expected polarity strengths to update, got ${JSON.stringify(tunedPolarityStats.polaritySummary)}`);
    }
    await page.evaluate(() => {
        const centerPull = document.querySelector('[data-map-motion-tuning-number="centerPull"]');
        const speed = document.querySelector('[data-map-motion-tuning="speed"]');
        if (!centerPull || !speed) throw new Error('Missing motion tuning inputs');
        centerPull.value = '1.37';
        centerPull.dispatchEvent(new Event('input', { bubbles: true }));
        speed.value = '0.58';
        speed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(140);
    const tunedMotionStats = await getStats(page);
    if (tunedMotionStats.motionTuning.centerPull !== 1.37 || tunedMotionStats.motionTuning.speed !== 0.58) {
        throw new Error(`Expected motion tuning controls to update, got ${JSON.stringify(tunedMotionStats.motionTuning)}`);
    }
    await page.click('[data-map-static-kind="folder"]');
    await page.waitForTimeout(140);
    const directKindStaticStats = await getStats(page);
    if (!directKindStaticStats.staticSummary.kinds.includes('folder')) {
        throw new Error(`Expected direct folder freeze button to toggle folder static kind, got ${JSON.stringify(directKindStaticStats.staticSummary)}`);
    }
    await page.click('[data-map-static-kind="folder"]');
    await page.waitForTimeout(140);
    const clearedDirectKindStats = await getStats(page);
    if (clearedDirectKindStats.staticSummary.kinds.includes('folder')) {
        throw new Error(`Expected direct folder freeze button to release folder static kind, got ${JSON.stringify(clearedDirectKindStats.staticSummary)}`);
    }

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
