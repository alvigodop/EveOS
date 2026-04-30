const {
    clickToolbarControl,
    getStats
} = require('./constellation_scope_browser_smoke.shared');

async function runConstellationControlToggleChecks(page, { categorySeed }) {
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

    const stabilityButtonBefore = await page.locator('[data-map-toolbar="stability"]').first().textContent();
    if (!/Hold Main Nodes: ON/i.test(stabilityButtonBefore || '')) {
        throw new Error(`Expected Hold Main Nodes button to start on, got ${stabilityButtonBefore}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="stability"]');
    await page.waitForTimeout(180);
    const stabilityOffState = await page.evaluate(() => ({
        stableMainNodes: !!window.EveConstellationMap?._shared?.state?.stableMainNodes,
        label: document.querySelector('[data-map-toolbar="stability"]')?.textContent || ''
    }));
    if (stabilityOffState.stableMainNodes || !/Hold Main Nodes: OFF/i.test(stabilityOffState.label)) {
        throw new Error(`Expected Hold Main Nodes button/state to flip off, got ${JSON.stringify(stabilityOffState)}`);
    }
    await clickToolbarControl(page, '[data-map-toolbar="stability"]');
    await page.waitForTimeout(180);
    const stabilityOnState = await page.evaluate(() => ({
        stableMainNodes: !!window.EveConstellationMap?._shared?.state?.stableMainNodes,
        label: document.querySelector('[data-map-toolbar="stability"]')?.textContent || ''
    }));
    if (!stabilityOnState.stableMainNodes || !/Hold Main Nodes: ON/i.test(stabilityOnState.label)) {
        throw new Error(`Expected Hold Main Nodes button/state to flip back on, got ${JSON.stringify(stabilityOnState)}`);
    }

    const auraViewLabels = await page.evaluate(() => ({
        nodes: document.querySelector('[data-map-aura-view="nodes"]')?.textContent || '',
        overlaps: document.querySelector('[data-map-aura-view="overlaps"]')?.textContent || ''
    }));
    if (!/Node Aura View: ON/i.test(auraViewLabels.nodes) || !/Red Aura View: ON/i.test(auraViewLabels.overlaps)) {
        throw new Error(`Expected aura view buttons to exist and start on, got ${JSON.stringify(auraViewLabels)}`);
    }

    await clickToolbarControl(page, '[data-map-aura-view="nodes"]');
    await page.waitForTimeout(140);
    const nodeAuraViewOff = await page.evaluate(() => ({
        controls: window.EveConstellationMap?._shared?.state?.auraControls || null,
        label: document.querySelector('[data-map-aura-view="nodes"]')?.textContent || ''
    }));
    if (nodeAuraViewOff?.controls?.views?.nodeVolumes !== false || !/Node Aura View: OFF/i.test(nodeAuraViewOff.label)) {
        throw new Error(`Expected node aura view to toggle off, got ${JSON.stringify(nodeAuraViewOff)}`);
    }
    await clickToolbarControl(page, '[data-map-aura-view="nodes"]');
    await page.waitForTimeout(140);

    await clickToolbarControl(page, '[data-map-aura-view="overlaps"]');
    await page.waitForTimeout(140);
    const overlapAuraViewOff = await page.evaluate(() => ({
        controls: window.EveConstellationMap?._shared?.state?.auraControls || null,
        label: document.querySelector('[data-map-aura-view="overlaps"]')?.textContent || ''
    }));
    if (overlapAuraViewOff?.controls?.views?.overlapVolumes !== false || !/Red Aura View: OFF/i.test(overlapAuraViewOff.label)) {
        throw new Error(`Expected overlap aura view to toggle off, got ${JSON.stringify(overlapAuraViewOff)}`);
    }
    await clickToolbarControl(page, '[data-map-aura-view="overlaps"]');
    await page.waitForTimeout(140);

    await clickToolbarControl(page, '[data-map-aura-toggle="visuals"]');
    await page.waitForTimeout(140);
    const auraMasterOff = await page.evaluate(() => {
        const nodeButton = document.querySelector('[data-map-aura-view="nodes"]');
        const overlapButton = document.querySelector('[data-map-aura-view="overlaps"]');
        return {
            controls: window.EveConstellationMap?._shared?.state?.auraControls || null,
            nodeDisabled: !!nodeButton?.disabled,
            overlapDisabled: !!overlapButton?.disabled
        };
    });
    if (auraMasterOff?.controls?.visualsEnabled !== false || !auraMasterOff.nodeDisabled || !auraMasterOff.overlapDisabled) {
        throw new Error(`Expected master aura visuals toggle to disable view-only buttons, got ${JSON.stringify(auraMasterOff)}`);
    }
    await clickToolbarControl(page, '[data-map-aura-toggle="visuals"]');
    await page.waitForTimeout(140);
    const auraMasterOn = await page.evaluate(() => ({
        controls: window.EveConstellationMap?._shared?.state?.auraControls || null,
        nodeDisabled: !!document.querySelector('[data-map-aura-view="nodes"]')?.disabled,
        overlapDisabled: !!document.querySelector('[data-map-aura-view="overlaps"]')?.disabled
    }));
    if (auraMasterOn?.controls?.visualsEnabled === false || auraMasterOn.nodeDisabled || auraMasterOn.overlapDisabled) {
        throw new Error(`Expected master aura visuals toggle to restore view-only buttons, got ${JSON.stringify(auraMasterOn)}`);
    }

    await page.evaluate((categoryId) => {
        if (!window.EveConstellationMap.__debugSelectNode(categoryId)) {
            throw new Error('Failed to restore selected category node after control toggles');
        }
    }, categorySeed.id);
    await page.waitForTimeout(140);

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

}

module.exports = {
    runConstellationControlToggleChecks
};
