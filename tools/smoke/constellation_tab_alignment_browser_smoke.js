const {
    chromium,
    prepareSeededPage
} = require('./constellation_scope_browser_smoke.shared');

function buildAlignmentPayload() {
    return {
        links: [
            {
                id: 'main-alpha-1',
                title: 'Main Alpha',
                url: 'https://main.example.com/a',
                workspace: 'main',
                category: 'Alpha',
                done: false
            },
            {
                id: 'sub-beta-1',
                title: 'Sub Beta',
                url: 'https://sub.example.com/b',
                workspace: 'sub',
                category: 'Beta',
                done: false
            }
        ],
        config: {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [
                {
                    id: 'main',
                    name: 'Main',
                    icon: 'folder',
                    subTabs: [
                        { id: 'sub', name: 'Sub', icon: 'folder' }
                    ]
                }
            ],
            categoryOrder: ['Alpha', 'Beta']
        },
        bookmarkFolders: {},
        quickPins: []
    };
}

function normalizeAngle(angle) {
    let value = Number.isFinite(angle) ? angle : 0;
    while (value <= -Math.PI) value += Math.PI * 2;
    while (value > Math.PI) value -= Math.PI * 2;
    return value;
}

async function main() {
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

        await prepareSeededPage(page, buildAlignmentPayload());

        await page.evaluate(() => {
            window.EveConstellationMap.getNexusGraphProjection = null;
            if (window.EveOS?.DatapackIndex) window.EveOS.DatapackIndex.buildGraphProjection = null;
            if (window.EveOS?.SearchAdvanced?.Index) window.EveOS.SearchAdvanced.Index.buildGraphProjection = null;
            window.EveConstellationMap.openMap({ scope: 'all' });
        });
        await page.waitForFunction(() => {
            const stats = window.EveConstellationMap?.__debugGetGraphStats?.();
            const state = window.EveConstellationMap?._shared?.state;
            return !!stats
                && stats.visible
                && stats.scope?.scope === 'all'
                && stats.sampleNodes.some((node) => node.id === 'workspace_main')
                && stats.sampleNodes.some((node) => node.id === 'workspace_sub')
                && stats.sampleNodes.some((node) => node.id === 'category_main_Alpha')
                && state?.auraRoots?.size > 0
                && state?.workspaceAuraRoots?.size > 0;
        }, null, { timeout: 10000 });
        await page.waitForTimeout(1400);

        const result = await page.evaluate(() => {
            const state = window.EveConstellationMap?._shared?.state;
            const category = state?.nodeIndex?.get?.('category_main_Alpha');
            const mainWorkspace = state?.nodeIndex?.get?.('workspace_main');
            const subWorkspace = state?.nodeIndex?.get?.('workspace_sub');
            const auraRoot = category?.chainId ? state?.auraRoots?.get?.(category.chainId) : null;
            const workspaceGuide = state?.workspaceAuraRoots?.get?.('workspace_main');
            const subAnchor = state?.hierarchyAnchors?.get?.('workspace_sub') || null;
            if (!category || !mainWorkspace || !subWorkspace || !auraRoot || !workspaceGuide) {
                throw new Error('Missing nodes or aura data for alignment test');
            }

            const angleToWorkspace = Math.atan2(mainWorkspace.y - category.y, mainWorkspace.x - category.x);
            const angleDelta = Math.abs((((auraRoot.frontAngle - angleToWorkspace + Math.PI) % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI);
            const subDx = subWorkspace.x - mainWorkspace.x;
            const subDy = subWorkspace.y - mainWorkspace.y;
            const backDot = (subDx * workspaceGuide.backX) + (subDy * workspaceGuide.backY);
            const frontDot = (subDx * workspaceGuide.frontX) + (subDy * workspaceGuide.frontY);

            return {
                angleToWorkspace,
                frontAngle: auraRoot.frontAngle,
                angleDelta,
                backDot,
                frontDot,
                subAnchor,
                positions: {
                    category: { x: category.x, y: category.y },
                    mainWorkspace: { x: mainWorkspace.x, y: mainWorkspace.y },
                    subWorkspace: { x: subWorkspace.x, y: subWorkspace.y }
                }
            };
        });

        if (normalizeAngle(result.frontAngle - result.angleToWorkspace) > 0.42 || result.angleDelta > 0.42) {
            throw new Error(`Expected card aura to face its connected workspace, got ${JSON.stringify(result)}`);
        }
        if (!(result.backDot > 70) || !(result.frontDot < -20)) {
            throw new Error(`Expected sub-tab workspace to stay behind the main workspace, got ${JSON.stringify(result)}`);
        }
        if (!result.subAnchor || !Number.isFinite(result.subAnchor.x) || !Number.isFinite(result.subAnchor.y)) {
            throw new Error(`Expected hierarchy anchor for sub-tab workspace, got ${JSON.stringify(result)}`);
        }

        console.log(`CONSTELLATION_TAB_ALIGNMENT_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        if (browser) await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
