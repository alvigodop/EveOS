const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openCategorySettings === 'function'
        && typeof window.renderCategoryFolderManager === 'function'
        && !!window.EveBookmarkFolders?.buildFolderView
        && !!window.EveQuickPins?.getPins
    ), undefined, { timeout: 180000 });
}

function buildSeed() {
    const workspace = 'main';
    const category = 'Alpha';
    const nodes = [];
    const links = [];
    const pins = [];
    let folderIndex = 0;

    function addLevel(parentId, depth, maxDepth) {
        if (depth > maxDepth) return;
        for (let i = 0; i < 3; i += 1) {
            folderIndex += 1;
            const folderId = `folder-${folderIndex}`;
            nodes.push({
                id: folderId,
                parentId,
                name: `Folder ${folderIndex}`,
                order: folderIndex
            });
            for (let j = 0; j < 4; j += 1) {
                const linkId = `link-${folderIndex}-${j}`;
                links.push({
                    id: linkId,
                    title: `Bookmark ${folderIndex}-${j}`,
                    url: `https://example.com/${folderIndex}/${j}`,
                    workspace,
                    category,
                    folderId
                });
                if (j < 2) {
                    pins.push({
                        id: `bookmark-pin-${folderIndex}-${j}`,
                        targetType: 'bookmark',
                        targetId: linkId,
                        scopeType: 'folder',
                        order: pins.length
                    });
                }
            }
            pins.push({
                id: `folder-pin-${folderIndex}`,
                targetType: 'folder',
                targetId: `${workspace}::${category}::${folderId}`,
                scopeType: folderIndex % 2 === 0 ? 'card' : 'tab',
                order: pins.length
            });
            addLevel(folderId, depth + 1, maxDepth);
        }
    }

    addLevel(null, 1, 4);

    return {
        config: {
            activeWorkspace: workspace,
            viewMode: 'grid',
            workspaces: [{ id: workspace, name: 'Main', icon: 'folder' }],
            categoryOrder: [category],
            activeManhwaScopeRoots: {},
            activeManhwaFolders: {}
        },
        links,
        bookmarkFolders: {
            [`${workspace}::${category}`]: {
                nodes,
                settings: {}
            }
        },
        pins,
        folderCount: nodes.length
    };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async (seed) => {
            const clonedConfig = JSON.parse(JSON.stringify(seed.config));
            const clonedLinks = JSON.parse(JSON.stringify(seed.links));
            const clonedFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders));
            const clonedPins = JSON.parse(JSON.stringify(seed.pins));

            window.config = config = clonedConfig;
            window.links = links = clonedLinks;
            window.bookmarkFolders = bookmarkFolders = clonedFolders;
            if (window.eveState) {
                window.eveState.config = clonedConfig;
                window.eveState.links = clonedLinks;
                window.eveState.bookmarkFolders = clonedFolders;
            }
            if (window.EveQuickPins?.replacePinsForWorkspace) {
                window.EveQuickPins.replacePinsForWorkspace('main', clonedPins, { silent: true });
            } else if (window.eveState) {
                window.eveState.quickPins = clonedPins;
            }

            let filterPinsForFolderCalls = 0;
            let buildFolderViewCalls = 0;
            const originalFilterPinsForFolder = window.EveQuickPins.filterPinsForFolder;
            const originalBuildFolderView = window.EveBookmarkFolders.buildFolderView;

            window.EveQuickPins.filterPinsForFolder = function (...args) {
                filterPinsForFolderCalls += 1;
                return originalFilterPinsForFolder.apply(this, args);
            };
            window.EveBookmarkFolders.buildFolderView = function (...args) {
                buildFolderViewCalls += 1;
                return originalBuildFolderView.apply(this, args);
            };

            const startedAt = performance.now();
            window.openCategorySettings('Alpha', 'folders');
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));

            return {
                openMs: performance.now() - startedAt,
                filterPinsForFolderCalls,
                buildFolderViewCalls,
                renderedRows: document.querySelectorAll('.bookmark-folder-manager-row').length,
                folderCount: seed.folderCount
            };
        }, buildSeed());

        if (result.filterPinsForFolderCalls !== 0) {
            throw new Error(`Expected zero filterPinsForFolder calls, saw ${result.filterPinsForFolderCalls}`);
        }
        if (result.buildFolderViewCalls !== 1) {
            throw new Error(`Expected one buildFolderView call, saw ${result.buildFolderViewCalls}`);
        }
        if (result.renderedRows < result.folderCount) {
            throw new Error(`Expected at least ${result.folderCount} rendered rows, saw ${result.renderedRows}`);
        }

        console.log('CATEGORY_FOLDER_MANAGER_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
