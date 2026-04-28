const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.moveBookmarksToFolderDrop === 'function'
        && typeof window.promptCreateBookmarkFolder === 'function'
        && typeof window.submitCategoryFolderCreate === 'function'
        && !!window.EveBookmarkFolders?.buildFolderView
        && !!window.EveFolderViewV2?.invalidateAllCachedViewModels
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await page.waitForTimeout(1500);

        const result = await page.evaluate(async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const waitFor = async (predicate, timeoutMs, label) => {
                const started = Date.now();
                while (Date.now() - started < timeoutMs) {
                    if (predicate()) return;
                    await wait(50);
                }
                throw new Error(`Timed out waiting for ${label}`);
            };

            function seedState(folderModeEnabled) {
                const seededLinks = [
                    {
                        id: 'l-root',
                        title: 'Root Bookmark',
                        url: 'https://example.com/root',
                        workspace: 'main',
                        category: 'Reading'
                    },
                    {
                        id: 'l-foldered',
                        title: 'Existing Folder Bookmark',
                        url: 'https://example.com/foldered',
                        workspace: 'main',
                        category: 'Reading',
                        folderId: 'f-parent'
                    }
                ];
                const seededConfig = Object.assign({}, window.config || {}, {
                    activeWorkspace: 'main',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
                    viewMode: 'card',
                    categoryOrder: ['Reading'],
                    hiddenCategories: [],
                    collapsedCategories: [],
                    cardFolderViewModes: { 'main::Reading': !!folderModeEnabled },
                    activeManhwaFolders: {},
                    activeManhwaFolderChains: {},
                    activeManhwaScopeRoots: {}
                });
                const seededFolders = {
                    'main::Reading': {
                        nodes: [
                            { id: 'f-parent', parentId: null, name: 'Folder A', order: 0 }
                        ],
                        settings: { clickBehaviorMode: 'inherit' }
                    }
                };

                window.links = links = seededLinks;
                window.config = config = seededConfig;
                window.bookmarkFolders = bookmarkFolders = seededFolders;
                if (window.eveState) {
                    window.eveState.links = seededLinks;
                    window.eveState.config = seededConfig;
                    window.eveState.bookmarkFolders = seededFolders;
                }
                window.EveFolderViewV2.invalidateAllCachedViewModels();
                window.renderDashboard();
            }

            function findNode(selector, text) {
                return Array.from(document.querySelectorAll(selector))
                    .find((node) => String(node.textContent || '').includes(text)) || null;
            }

            function findNormalFolderByTitle(title) {
                const titleNode = Array.from(document.querySelectorAll('.bookmark-folder-group > .bookmark-folder-summary .bookmark-folder-title'))
                    .find((node) => String(node.textContent || '').trim() === title) || null;
                return titleNode?.closest('.bookmark-folder-group') || null;
            }

            function findV2FolderByTitle(title) {
                const titleNode = Array.from(document.querySelectorAll('.folder-tile-title'))
                    .find((node) => String(node.textContent || '').trim() === title) || null;
                return titleNode?.closest('.folder-tile') || null;
            }

            function sectionHasLinkTitle(section, title) {
                if (!section) return false;
                return Array.from(section.querySelectorAll('li'))
                    .some((node) => String(node.textContent || '').includes(title));
            }

            function makeBookmarkDropEvent(linkId) {
                const payload = JSON.stringify({ ids: [linkId] });
                return {
                    preventDefault() {},
                    stopPropagation() {},
                    dataTransfer: {
                        getData(type) {
                            return type === 'text/plain' || type === 'application/json' ? payload : '';
                        }
                    }
                };
            }

            function dispatchDragHover(node) {
                node.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
            }

            function dispatchDragOver(node) {
                node.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
            }

            function dispatchDragLeave(node) {
                node.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }));
            }

            function assertVisibleDropStyle(node, label) {
                const styles = getComputedStyle(node);
                if (!styles.boxShadow || styles.boxShadow === 'none') {
                    throw new Error(`${label} did not expose a visible drop shadow`);
                }
            }

            seedState(false);
            await waitFor(() => !!findNormalFolderByTitle('Folder A'), 6000, 'folder sections before creator smoke');
            window.promptCreateBookmarkFolder('Reading', '', 'main');
            await waitFor(() => {
                const modal = document.getElementById('bookmarkFolderCreatorModal');
                return modal && modal.style.display === 'flex'
                    && !!document.getElementById('bookmarkFolderCreatorNameInput');
            }, 6000, 'folder creator modal to bootstrap from card action');
            document.getElementById('bookmarkFolderCreatorNameInput').value = 'Smoke Folder';
            if (!window.submitCategoryFolderCreate()) {
                throw new Error('Folder creator submit returned false');
            }
            await waitFor(() => !!findNormalFolderByTitle('Smoke Folder'), 6000, 'new folder to render on card without reload');

            seedState(false);
            await waitFor(() => (
                sectionHasLinkTitle(document.querySelector('.bookmark-folder-root-group'), 'Root Bookmark')
                && !!findNormalFolderByTitle('Folder A')
            ), 6000, 'normal folder sections');

            const normalFolder = findNormalFolderByTitle('Folder A');
            dispatchDragHover(normalFolder);
            dispatchDragOver(normalFolder);
            if (!normalFolder.classList.contains('bookmark-folder-drop-target')) {
                throw new Error('Normal folder drop hover class was not applied');
            }
            assertVisibleDropStyle(normalFolder, 'Normal folder drop target');
            window.setBookmarkFolderDropHover(
                { currentTarget: normalFolder, relatedTarget: normalFolder.querySelector('.bookmark-folder-title') },
                'bookmark-folder-drop-target',
                false
            );
            await wait(120);
            if (!normalFolder.classList.contains('bookmark-folder-drop-target')) {
                throw new Error('Normal folder drop hover was cleared while moving across child content');
            }
            dispatchDragLeave(normalFolder);
            await wait(120);
            if (normalFolder.classList.contains('bookmark-folder-drop-target')) {
                throw new Error('Normal folder drop hover class was not removed');
            }

            window.moveBookmarksToFolderDrop(makeBookmarkDropEvent('l-root'), 'Reading', 'f-parent', 'main');
            await waitFor(() => {
                const rootGroup = document.querySelector('.bookmark-folder-root-group');
                const folderGroup = findNormalFolderByTitle('Folder A');
                const movedLink = (window.eveState?.links || []).find((link) => String(link.id) === 'l-root');
                return String(movedLink?.folderId || '') === 'f-parent'
                    && rootGroup
                    && folderGroup
                    && !sectionHasLinkTitle(rootGroup, 'Root Bookmark')
                    && sectionHasLinkTitle(folderGroup, 'Root Bookmark');
            }, 6000, 'normal folder move DOM refresh');

            seedState(true);
            await waitFor(() => (
                sectionHasLinkTitle(document.querySelector('.v2-folder-root-container'), 'Root Bookmark')
                && !!findV2FolderByTitle('Folder A')
            ), 6000, 'V2 folder root grid');

            const v2Folder = findV2FolderByTitle('Folder A');
            dispatchDragHover(v2Folder);
            dispatchDragOver(v2Folder);
            if (!v2Folder.classList.contains('folder-tile-drag-hover')) {
                throw new Error('V2 folder tile drop hover class was not applied');
            }
            assertVisibleDropStyle(v2Folder, 'V2 folder tile drop target');
            window.setBookmarkFolderDropHover(
                { currentTarget: v2Folder, relatedTarget: v2Folder.querySelector('.folder-tile-title') },
                'folder-tile-drag-hover',
                false
            );
            await wait(120);
            if (!v2Folder.classList.contains('folder-tile-drag-hover')) {
                throw new Error('V2 folder drop hover was cleared while moving across child content');
            }
            dispatchDragLeave(v2Folder);
            await wait(120);
            if (v2Folder.classList.contains('folder-tile-drag-hover')) {
                throw new Error('V2 folder tile drop hover class was not removed');
            }

            window.moveBookmarksToFolderDrop(makeBookmarkDropEvent('l-root'), 'Reading', 'f-parent', 'main');
            await waitFor(() => {
                const rootContainer = document.querySelector('.v2-folder-root-container');
                const movedLink = (window.eveState?.links || []).find((link) => String(link.id) === 'l-root');
                return String(movedLink?.folderId || '') === 'f-parent'
                    && rootContainer
                    && !sectionHasLinkTitle(rootContainer, 'Root Bookmark');
            }, 6000, 'V2 folder move root refresh');

            const cached = window.EveFolderViewV2.getCachedViewModel('main', 'Reading');
            const cachedRootHasMovedLink = (cached?.rootLinks || []).some((link) => String(link.id) === 'l-root');
            const cachedFolderHasMovedLink = (cached?.folderLinks?.get('f-parent') || []).some((link) => String(link.id) === 'l-root');
            if (cachedRootHasMovedLink || !cachedFolderHasMovedLink) {
                throw new Error('V2 folder view cache stayed stale after bookmark folder drop');
            }

            return {
                folderCreatorBootstrapped: true,
                normalMove: true,
                v2Move: true,
                movedFolderId: (window.eveState.links.find((link) => String(link.id) === 'l-root') || {}).folderId || ''
            };
        });

        console.log('BOOKMARK_FOLDER_DROP_UI_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
