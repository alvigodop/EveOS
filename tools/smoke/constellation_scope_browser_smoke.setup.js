const {
    captureInspectorCover,
    clickAndWaitForMap,
    closeMap,
    ensureControlsExpanded,
    getStats
} = require('./constellation_scope_browser_smoke.shared');

async function runConstellationSetup(page) {
    await page.evaluate(async () => {
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        await new Promise((resolve) => setTimeout(resolve, 400));
    });

    const topbarStyles = await page.evaluate(() => {
        const container = document.querySelector('.top-right');
        const button = document.querySelector('.topbar-map-btn:not(.topbar-matrix-btn)');
        const primary = document.querySelector('.topbar-primary-btn');
        const containerStyle = container ? window.getComputedStyle(container) : null;
        const buttonStyle = button ? window.getComputedStyle(button) : null;
        const primaryStyle = primary ? window.getComputedStyle(primary) : null;
        const buttonRect = button ? button.getBoundingClientRect() : null;
        const primaryRect = primary ? primary.getBoundingClientRect() : null;
        return {
            overflowX: containerStyle ? containerStyle.overflowX : '',
            maxWidth: containerStyle ? containerStyle.maxWidth : '',
            minHeight: buttonStyle ? buttonStyle.minHeight : '',
            fontSize: buttonStyle ? buttonStyle.fontSize : '',
            paddingInline: buttonStyle ? [buttonStyle.paddingLeft, buttonStyle.paddingRight].join('/') : '',
            primaryMinHeight: primaryStyle ? primaryStyle.minHeight : '',
            primaryFontSize: primaryStyle ? primaryStyle.fontSize : '',
            height: buttonRect ? `${buttonRect.height}px` : '',
            primaryHeight: primaryRect ? `${primaryRect.height}px` : ''
        };
    });

    if (topbarStyles.overflowX !== 'auto') {
        throw new Error(`Expected top-right overflow-x auto, got ${topbarStyles.overflowX}`);
    }
    const mapHeight = Number.parseFloat(topbarStyles.minHeight) || Number.parseFloat(topbarStyles.height);
    const primaryHeight = Number.parseFloat(topbarStyles.primaryMinHeight) || Number.parseFloat(topbarStyles.primaryHeight);
    if (!(mapHeight < primaryHeight)) {
        throw new Error(`Expected smaller map button min-height, got ${JSON.stringify(topbarStyles)}`);
    }
    if (!(parseFloat(topbarStyles.fontSize) < parseFloat(topbarStyles.primaryFontSize))) {
        throw new Error(`Expected smaller map button font-size, got ${JSON.stringify(topbarStyles)}`);
    }

    await clickAndWaitForMap(page, () => page.locator('.topbar-map-btn:not(.topbar-matrix-btn)').click());
    const workspaceStats = await getStats(page);
    if (workspaceStats.scope.scope !== 'workspace' || workspaceStats.scope.workspaceId !== 'main') {
        throw new Error(`Topbar map scope mismatch: ${JSON.stringify(workspaceStats.scope)}`);
    }
    if (workspaceStats.nodeCount !== 9) {
        throw new Error(`Expected workspace nodeCount=9, got ${workspaceStats.nodeCount}`);
    }
    const switchElapsed = await page.evaluate(() => {
        const startedAt = performance.now();
        window.switchWorkspace('alt');
        return performance.now() - startedAt;
    });
    await page.waitForFunction(() => window.config?.activeWorkspace === 'alt', undefined, { timeout: 10000 });
    await page.waitForFunction(() => {
        const overlay = document.getElementById('constellation-map-overlay');
        return !overlay || overlay.style.display === 'none';
    }, undefined, { timeout: 10000 });
    const releasedStats = await getStats(page);
    if (releasedStats.visible || releasedStats.nodeCount !== 0 || releasedStats.edgeCount !== 0) {
        throw new Error(`Expected closed map state to release graph data on workspace switch, got ${JSON.stringify(releasedStats)}`);
    }
    if (!Number.isFinite(switchElapsed) || switchElapsed < 0 || switchElapsed > 1500) {
        throw new Error(`Unexpected workspace switch timing with map teardown: ${switchElapsed}`);
    }
    await page.evaluate(() => window.switchWorkspace('main'));
    await page.waitForFunction(() => window.config?.activeWorkspace === 'main', undefined, { timeout: 10000 });

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
    if (cardStats.motionMode !== 'free') {
        throw new Error(`Expected default motion mode to be free, got ${cardStats.motionMode}`);
    }

    await page.waitForFunction(() => {
        const state = window.EveConstellationMap?._shared?.state;
        const categoryNode = state?.nodes?.find((node) => node.kind === 'category');
        return !!categoryNode?.chainId && (state?.auraRoots instanceof Map ? state.auraRoots.size > 0 : false);
    }, null, { timeout: 2000 });

    const categoryAuraState = await page.evaluate(() => {
        const state = window.EveConstellationMap?._shared?.state;
        const categoryNode = state?.nodes?.find((node) => node.kind === 'category') || null;
        return {
            chainId: categoryNode?.chainId || '',
            auraRootsSize: state?.auraRoots instanceof Map ? state.auraRoots.size : 0
        };
    });
    if (!categoryAuraState.chainId || categoryAuraState.auraRootsSize < 1) {
        throw new Error(`Expected card scope category aura root to be active, got ${JSON.stringify(categoryAuraState)}`);
    }

    const folderAuraWidthStats = await page.evaluate(() => {
        const shared = window.EveConstellationMap?._shared;
        const state = shared?.state;
        const shapeFn = shared?.getFolderAuraShape;
        const measureBlobHalfWidthForNode = shared?.measureBlobHalfWidthForNode;
        const getAuraTuningValue = shared?.getAuraTuningValue;
        const clamp = shared?.clamp;
        if (!state?.nodeIndex || typeof shapeFn !== 'function' || typeof measureBlobHalfWidthForNode !== 'function') {
            throw new Error('Constellation shared geometry helpers unavailable for folder aura width test');
        }

        const rootFolder = state.nodeIndex.get('folder_main_Alpha_f-parent');
        const childFolder = state.nodeIndex.get('folder_main_Alpha_f-child');
        const categoryNode = state.nodeIndex.get('category_main_Alpha');
        if (!rootFolder || !childFolder || !categoryNode) {
            throw new Error('Missing category/root/child folder nodes for aura width test');
        }

        const widthScale = typeof getAuraTuningValue === 'function' ? getAuraTuningValue('folderWidthScale') : 1;

        const rootAxisAngle = Math.atan2(categoryNode.y - rootFolder.y, categoryNode.x - rootFolder.x);
        const rootBlobHalfWidth = measureBlobHalfWidthForNode(categoryNode, rootAxisAngle);
        const rootShape = shapeFn(rootFolder, Math.hypot(categoryNode.x - rootFolder.x, categoryNode.y - rootFolder.y), true, categoryNode);
        const expectedRootRadiusLat = clamp(rootBlobHalfWidth * 1.04, 96, 1600) * widthScale;

        const childAxisAngle = Math.atan2(rootFolder.y - childFolder.y, rootFolder.x - childFolder.x);
        const childBlobHalfWidth = measureBlobHalfWidthForNode(rootFolder, childAxisAngle);
        const childShape = shapeFn(childFolder, Math.hypot(rootFolder.x - childFolder.x, rootFolder.y - childFolder.y), false, rootFolder);
        const expectedChildRadiusLat = clamp(childBlobHalfWidth * 1.04, 96, 1600) * widthScale;
        const legacyRadiusLat = 1100 * widthScale;

        return {
            rootRadiusLat: rootShape.radiusLat,
            expectedRootRadiusLat,
            childRadiusLat: childShape.radiusLat,
            expectedChildRadiusLat,
            legacyRadiusLat,
            childBlobHalfWidth
        };
    });

    if (Math.abs(folderAuraWidthStats.rootRadiusLat - folderAuraWidthStats.expectedRootRadiusLat) > 0.75) {
        throw new Error(`Expected root folder aura width to follow category blob half-width, got ${JSON.stringify(folderAuraWidthStats)}`);
    }
    if (!(folderAuraWidthStats.childBlobHalfWidth > 0)) {
        throw new Error(`Expected child folder blob half-width to resolve from parent folder, got ${JSON.stringify(folderAuraWidthStats)}`);
    }
    if (Math.abs(folderAuraWidthStats.childRadiusLat - folderAuraWidthStats.expectedChildRadiusLat) > 0.75) {
        throw new Error(`Expected child folder aura width to follow parent folder blob half-width, got ${JSON.stringify(folderAuraWidthStats)}`);
    }
    if (Math.abs(folderAuraWidthStats.childRadiusLat - folderAuraWidthStats.legacyRadiusLat) < 1) {
        throw new Error(`Expected child folder aura width to stop using legacy fixed width, got ${JSON.stringify(folderAuraWidthStats)}`);
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
            toggleText: toggle ? toggle.textContent : '',
            width: Number.parseFloat(window.getComputedStyle(info).width || '0')
        };
    });
    if (collapsedInspector.hasAction) {
        throw new Error('Inspector should start collapsed with actions hidden');
    }
    if (!/Alpha/i.test(collapsedInspector.text)) {
        throw new Error(`Expected inspector to target selected category, got ${collapsedInspector.text}`);
    }
    if (!(collapsedInspector.width > 0 && collapsedInspector.width <= 90)) {
        throw new Error(`Expected compact collapsed inspector, got ${JSON.stringify(collapsedInspector)}`);
    }

    await page.evaluate(() => {
        const toggle = document.querySelector('[data-map-info-toggle="1"]');
        if (!toggle) throw new Error('Missing map info toggle');
        toggle.click();
    });
    await page.waitForFunction(() => {
        const toggle = document.querySelector('[data-map-info-toggle="1"]');
        return !!toggle && /Collapse/i.test(toggle.textContent || '');
    }, null, { timeout: 1500 });
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

    await page.locator('[data-map-info]').hover();
    await page.waitForFunction(() => {
        const cover = document.querySelector('[data-map-info] [data-map-info-cover]');
        if (!cover) return false;
        return Number.parseFloat(window.getComputedStyle(cover).opacity || '0') > 0.55;
    }, null, { timeout: 1200 });
    const categoryCoverOne = await captureInspectorCover(page);
    const categoryCoverDebug = await page.evaluate(() => {
        window.EveConstellationMap.__debugShiftInspectorHover(61000);
        return window.EveConstellationMap.__debugGetInspectorCoverState();
    });
    const categoryCoverTwo = categoryCoverDebug.current;
    if (!categoryCoverOne || !categoryCoverTwo || categoryCoverOne === categoryCoverTwo) {
        throw new Error(`Expected rotating category cover previews, got ${categoryCoverOne} -> ${categoryCoverTwo} :: ${JSON.stringify(categoryCoverDebug)}`);
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

    await ensureControlsExpanded(page);

    const followThemeShellStats = await page.evaluate(() => {
        const root = document.documentElement;
        const overlay = document.getElementById('constellation-map-overlay');
        const themeShared = window.EveConstellationMap?._sharedTheme;
        const applyMapTheme = themeShared?.applyMapTheme;
        if (!overlay || typeof applyMapTheme !== 'function') {
            throw new Error('Constellation theme helpers unavailable for follow-theme shell test');
        }

        const trackedVars = ['--bg-primary', '--card-bg', '--modal-bg', '--input-bg', '--modal-border'];
        const backup = {
            nativeScheme: root.getAttribute('data-native-scheme'),
            hadLightThemeClass: root.classList.contains('light-theme'),
            vars: Object.fromEntries(trackedVars.map((key) => [key, root.style.getPropertyValue(key)]))
        };

        root.setAttribute('data-native-scheme', 'dark');
        root.classList.remove('light-theme');
        root.style.setProperty('--bg-primary', '#f5f5f5');
        root.style.setProperty('--card-bg', '#ffffff');
        root.style.setProperty('--modal-bg', '#ffffff');
        root.style.setProperty('--input-bg', '#ffffff');
        root.style.setProperty('--modal-border', '#d0d7e2');
        applyMapTheme(overlay);

        const darkStyles = window.getComputedStyle(overlay);
        const result = {
            backgroundA: darkStyles.getPropertyValue('--map-theme-bg-a').trim(),
            backgroundB: darkStyles.getPropertyValue('--map-theme-bg-b').trim(),
            panelBase: darkStyles.getPropertyValue('--map-theme-panel-base').trim(),
            text: darkStyles.getPropertyValue('--map-theme-text').trim()
        };

        if (backup.nativeScheme == null) root.removeAttribute('data-native-scheme');
        else root.setAttribute('data-native-scheme', backup.nativeScheme);
        if (backup.hadLightThemeClass) root.classList.add('light-theme');
        else root.classList.remove('light-theme');
        trackedVars.forEach((key) => {
            const value = backup.vars[key];
            if (value) root.style.setProperty(key, value);
            else root.style.removeProperty(key);
        });
        applyMapTheme(overlay);

        return result;
    });

    if (followThemeShellStats.backgroundA.includes('#f5f5f5') || !followThemeShellStats.backgroundA.includes('#07101d')) {
        throw new Error(`Expected dark follow-theme shell background, got ${JSON.stringify(followThemeShellStats)}`);
    }
    if (followThemeShellStats.panelBase.includes('#ffffff') || !followThemeShellStats.panelBase.includes('#111a28')) {
        throw new Error(`Expected dark follow-theme panel shell, got ${JSON.stringify(followThemeShellStats)}`);
    }
    if (followThemeShellStats.text !== '#e2edf9') {
        throw new Error(`Expected dark follow-theme text color, got ${JSON.stringify(followThemeShellStats)}`);
    }

    return {
        canvasBox,
        cardStats,
        categorySeed,
        topbarStyles,
        workspaceStats,
        zoomStats
    };
}

module.exports = {
    runConstellationSetup
};
