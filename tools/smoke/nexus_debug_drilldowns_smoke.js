const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        !!window.EveOS?.SearchAdvanced?.DebugView?.renderDebugPanel
        && !!window.EveOS?.SearchAdvanced?.DebugDrilldowns?.renderSpineDrilldowns
        && !!window.EveOS?.SearchAdvanced?.Index?.rebuild
        && !!window.EveBookmarkFolders?.collectFolderIntegrity
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error && error.message ? error.message : String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            const seededConfig = Object.assign({}, window.eveState?.config || {}, {
                activeWorkspace: 'main',
                viewMode: 'grid',
                showInactiveTabs: true,
                workspaces: [
                    { id: 'main', name: 'Main', icon: 'home', subTabs: [] }
                ],
                categoryOrder: ['Reading'],
                categoryOrderByWorkspace: {
                    main: ['Reading']
                },
                hideStats: [],
                collapsedTabs: [],
                sidebarGroups: []
            });
            const seededLinks = [
                {
                    id: 'broken-link',
                    title: 'Broken Folder Bookmark',
                    url: 'https://example.com/broken',
                    workspace: 'main',
                    category: 'Reading',
                    folderId: 'child-folder',
                    done: false
                },
                {
                    id: 'missing-folder-link',
                    title: 'Missing Folder Bookmark',
                    url: 'https://example.com/missing',
                    workspace: 'main',
                    category: 'Reading',
                    folderId: 'missing-folder',
                    done: false
                }
            ];
            const seededFolders = {
                'main::Reading': {
                    nodes: [
                        { id: 'child-folder', name: 'Child Folder', parentId: 'deleted-parent', order: 0 }
                    ]
                }
            };

            window.config = config = seededConfig;
            window.links = links = seededLinks;
            window.bookmarkFolders = bookmarkFolders = seededFolders;
            if (window.eveState) {
                window.eveState.config = seededConfig;
                window.eveState.links = seededLinks;
                window.eveState.bookmarkFolders = seededFolders;
            }

            await window.EveOS.SearchAdvanced.Index.rebuild({ reason: 'debug-drilldowns-smoke', force: true });

            const container = document.createElement('div');
            document.body.appendChild(container);
            await window.EveOS.SearchAdvanced.DebugView.renderDebugPanel(container);

            const folderRow = container.querySelector('[data-nx-drill-kind="folder"]');
            const reasonRow = container.querySelector('[data-nx-drill-kind="reason"]');
            const issueRow = container.querySelector('[data-nx-drill-kind="issue"]');
            const workspaceRow = container.querySelector('[data-nx-drill-kind="workspace"]');
            folderRow?.click();
            await new Promise(resolve => setTimeout(resolve, 250));
            const folderPanelText = container.querySelector('.nx-debug-drill-panel')?.textContent || '';
            const repairButton = container.querySelector('[data-nx-drill-action="repair-folders"]');
            const provenanceButton = container.querySelector('[data-nx-drill-action="inspect-provenance"]');
            provenanceButton?.click();
            const provenanceText = container.querySelector('.nx-debug-drill-provenance')?.textContent || '';
            reasonRow?.click();
            await new Promise(resolve => setTimeout(resolve, 250));
            const reasonPanelText = container.querySelector('.nx-debug-drill-panel')?.textContent || '';

            return {
                hasFolderRow: !!folderRow,
                hasReasonRow: !!reasonRow,
                hasIssueRow: !!issueRow,
                hasWorkspaceRow: !!workspaceRow,
                hasRepairButton: !!repairButton,
                hasProvenanceButton: !!provenanceButton,
                folderPanelText,
                provenanceText,
                reasonPanelText,
                drillState: Object.assign({}, window.EveOS.SearchAdvanced.DebugDrilldownState)
            };
        });

        if (pageErrors.length) {
            throw new Error(`Page errors during Nexus debug drilldowns smoke: ${pageErrors.join(' | ')}`);
        }
        if (!result.hasFolderRow || !result.hasReasonRow || !result.hasIssueRow || !result.hasWorkspaceRow) {
            throw new Error(`Expected all drilldown row kinds, saw ${JSON.stringify(result)}`);
        }
        if (!result.hasRepairButton || !result.folderPanelText.includes('Repair This Card')) {
            throw new Error(`Expected folder drilldown repair action, saw ${JSON.stringify(result)}`);
        }
        if (!result.hasProvenanceButton || !result.provenanceText.includes('Workspace') || !result.provenanceText.includes('main')) {
            throw new Error(`Expected inline provenance inspection, saw ${JSON.stringify(result)}`);
        }
        if (!result.reasonPanelText.includes('Go To Path') || !result.reasonPanelText.includes('Open View State')) {
            throw new Error(`Expected issue actions in reason drilldown, saw ${JSON.stringify(result)}`);
        }

        console.log('NEXUS_DEBUG_DRILLDOWNS_SMOKE_OK ' + JSON.stringify({
            folderRow: result.hasFolderRow,
            issueRow: result.hasIssueRow,
            state: result.drillState
        }));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
