const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        !!window.EveOS?.SearchAdvanced?.DebugView?.renderDebugPanel
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
                    {
                        id: 'main',
                        name: 'Main',
                        icon: 'home',
                        subTabs: [
                            { id: 'child', name: 'Child Tab', icon: 'star', subTabs: [] }
                        ]
                    }
                ],
                categoryOrder: ['Alpha', 'Beta'],
                categoryOrderByWorkspace: {
                    main: ['Alpha'],
                    child: ['Beta']
                },
                hideStats: [],
                collapsedTabs: [],
                sidebarGroups: []
            });
            const seededLinks = [
                { id: 'main-1', title: 'Main Root', url: 'https://example.com/main-1', workspace: 'main', category: 'Alpha', done: false, identifierIds: ['reading'] },
                { id: 'main-2', title: 'Main Foldered', url: 'https://example.com/main-2', workspace: 'main', category: 'Alpha', folderId: 'folder-a', done: true },
                { id: 'child-1', title: 'Child Bookmark', url: 'https://example.com/child-1', workspace: 'child', category: 'Beta', done: false }
            ];
            const seededFolders = {
                'main::Alpha': {
                    nodes: [
                        { id: 'folder-a', name: 'Folder A', parentId: '', order: 0 }
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

            await window.EveOS.SearchAdvanced.Index.rebuild({ reason: 'debug-workspace-detail-smoke', force: true });

            const mainDetail = await window.EveOS.SearchAdvanced.DebugView.collectWorkspaceDetail('main');
            const container = document.createElement('div');
            document.body.appendChild(container);
            await window.EveOS.SearchAdvanced.DebugView.renderDebugPanel(container);

            const mainDetailNode = container.querySelector('.nx-debug-ws-detail[data-workspace-id="main"]');
            const childRow = container.querySelector('.nx-debug-ws-row[data-workspace-id="child"]');
            childRow?.click();
            await new Promise(resolve => setTimeout(resolve, 350));
            const childDetailNode = container.querySelector('.nx-debug-ws-detail[data-workspace-id="child"]');

            const actionLabels = Array.from(container.querySelectorAll('.nx-debug-ws-detail [data-nx-debug-action]'))
                .map((node) => node.textContent.trim());

            return {
                mainDetail: {
                    directBookmarks: mainDetail?.directBookmarks,
                    branchBookmarks: mainDetail?.branchBookmarks,
                    cardCount: mainDetail?.cardCount,
                    folderCount: mainDetail?.folderCount,
                    childCount: mainDetail?.directChildCount
                },
                initialHasMainDetail: !!mainDetailNode,
                childRowExists: !!childRow,
                childDetailText: childDetailNode?.textContent || '',
                selectedWorkspaceId: window.EveOS.SearchAdvanced.DebugViewState?.selectedWorkspaceId || '',
                actionLabels
            };
        });

        if (pageErrors.length) {
            throw new Error(`Page errors during Nexus debug workspace detail smoke: ${pageErrors.join(' | ')}`);
        }
        if (result.mainDetail.directBookmarks !== 2 || result.mainDetail.branchBookmarks !== 3) {
            throw new Error(`Expected main detail to include direct and branch bookmarks, saw ${JSON.stringify(result.mainDetail)}`);
        }
        if (result.mainDetail.cardCount < 1 || result.mainDetail.folderCount !== 1 || result.mainDetail.childCount !== 1) {
            throw new Error(`Expected main detail card/folder/child counts, saw ${JSON.stringify(result.mainDetail)}`);
        }
        if (!result.initialHasMainDetail || !result.childRowExists) {
            throw new Error(`Expected rendered workspace rows and default detail, saw ${JSON.stringify(result)}`);
        }
        if (result.selectedWorkspaceId !== 'child' || !result.childDetailText.includes('Child Tab') || !result.childDetailText.includes('Cards In This Tab')) {
            throw new Error(`Expected child workspace click to render child detail, saw ${JSON.stringify(result)}`);
        }
        ['Open Tab', 'Scope Nexus Here', 'Open View State', 'Open Map'].forEach((label) => {
            if (!result.actionLabels.includes(label)) {
                throw new Error(`Expected workspace detail action "${label}", saw ${JSON.stringify(result.actionLabels)}`);
            }
        });

        console.log('NEXUS_DEBUG_WORKSPACE_DETAILS_SMOKE_OK ' + JSON.stringify(result.mainDetail));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
