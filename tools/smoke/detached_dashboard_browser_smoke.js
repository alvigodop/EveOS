const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function makeFakeEvent(payload, workspaceId = 'main') {
    const raw = JSON.stringify(payload);
    return {
        preventDefault() {},
        stopPropagation() {},
        currentTarget: {
            classList: { remove() {} },
            getAttribute(name) {
                return name === 'data-card-workspace' ? workspaceId : null;
            }
        },
        dataTransfer: {
            getData(type) {
                if (type === 'application/json' || type === 'text/plain') return raw;
                return '';
            }
        }
    };
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && !!window.EveConstellationMap?._detached
        && !!window.moveBookmarksToFolderDrop
        && typeof window.drop === 'function'
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate((eventFactorySrc) => {
            const makeEvent = eval('(' + eventFactorySrc + ')');

            const seed = {
                links: [
                    { id: 'alpha-root', title: 'Alpha Root', url: 'https://alpha.example.com/root', workspace: 'main', category: 'Alpha', done: false },
                    { id: 'alpha-folder-link', title: 'Alpha Folder Link', url: 'https://alpha.example.com/folder', workspace: 'main', category: 'Alpha', folderId: 'f2', done: false },
                    { id: 'beta-root', title: 'Beta Root', url: 'https://beta.example.com/root', workspace: 'main', category: 'Beta', done: false }
                ],
                config: {
                    activeWorkspace: 'main',
                    viewMode: 'grid',
                    workspaces: [{ id: 'main', name: 'Main', icon: 'folder' }],
                    categoryOrder: ['Alpha', 'Beta', 'Gamma']
                },
                bookmarkFolders: {
                    'main::Alpha': {
                        nodes: [
                            { id: 'f1', parentId: null, name: 'Detached Root', order: 1 },
                            { id: 'f2', parentId: null, name: 'Live Alpha Folder', order: 2 }
                        ]
                    },
                    'main::Beta': {
                        nodes: [
                            { id: 'bf1', parentId: null, name: 'Beta Folder', order: 1 }
                        ]
                    }
                }
            };

            window.config = config = JSON.parse(JSON.stringify(seed.config));
            window.links = links = JSON.parse(JSON.stringify(seed.links));
            window.bookmarkFolders = bookmarkFolders = JSON.parse(JSON.stringify(seed.bookmarkFolders));
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }

            const detachedApi = window.EveConstellationMap._detached;
            const parkedEntry = detachedApi.parkFolderSubtree('main', 'Alpha', 'f1');
            if (!parkedEntry?.id) {
                throw new Error('Failed to create detached parking entry');
            }

            const malformedEntryId = 'det_broken_folder';
            const detachedStore = detachedApi.getDetachedStore();
            detachedStore.main = Array.isArray(detachedStore.main) ? detachedStore.main : [];
            detachedStore.main.push({
                id: malformedEntryId,
                kind: 'folder',
                workspaceId: 'main',
                originCategoryName: 'Alpha',
                parkingCategoryName: detachedApi.PARKING_CATEGORY_NAME,
                parkedAt: Date.now(),
                label: 'Broken Detached Chain',
                folder: {
                    rootId: 'missing-root',
                    nodes: [],
                    links: [
                        {
                            id: 'broken-link',
                            title: 'Broken Link',
                            url: 'https://broken.example.com',
                            workspace: 'main',
                            category: 'Alpha',
                            folderId: 'missing-folder',
                            done: false
                        }
                    ]
                }
            });
            detachedApi.persistDetachedStore();

            window.renderDashboard();

            let detachedCard = document.querySelector('.category-card[data-detached-parking-card="1"]');
            const detachedFolderEl = Array.from(detachedCard?.querySelectorAll('.bookmark-folder-group') || [])
                .find((element) => String(element.getAttribute('data-detached-entry-id') || '') === parkedEntry.id)
                || null;
            const detachedFolderEntryId = String(detachedFolderEl?.getAttribute('data-detached-entry-id') || parkedEntry.id);
            const detachedFolderId = String(parkedEntry.folder?.rootId || '');

            if (!detachedCard) throw new Error('Detached parking card not rendered');
            if (!detachedFolderEl) throw new Error('Detached parking folder not rendered');
            if (!detachedFolderEl.getAttribute('ondrop')) throw new Error('Detached folder drop handler missing');
            if (detachedFolderEl.getAttribute('draggable') !== 'true') throw new Error('Detached root folder not draggable');

            const repairedMalformedEntry = detachedApi.getDetachedEntry(malformedEntryId);
            const repairedMalformedRootId = String(repairedMalformedEntry?.folder?.rootId || '');
            const repairedMalformedRootNode = (repairedMalformedEntry?.folder?.nodes || []).find((node) => String(node?.id || '') === repairedMalformedRootId);
            const repairedMalformedLink = (repairedMalformedEntry?.folder?.links || []).find((link) => String(link?.id || '') === 'broken-link');
            if (!repairedMalformedRootId || !repairedMalformedRootNode) {
                throw new Error('Malformed detached entry did not receive a synthetic root');
            }
            if (!repairedMalformedLink || String(repairedMalformedLink.folderId || '') !== repairedMalformedRootId) {
                throw new Error('Malformed detached link did not reattach to the repaired root');
            }
            detachedCard = document.querySelector('.category-card[data-detached-parking-card="1"]');
            const detachedCardHtml = String(detachedCard?.textContent || '');
            if (!detachedCardHtml.includes('Broken Detached Chain') || !detachedCardHtml.includes('Broken Link')) {
                throw new Error('Repaired detached content did not render into the parking card');
            }

            detachedApi.handleDashboardParkingDrop(makeEvent({ ids: ['beta-root'] }), 'main');
            if ((window.links || []).some((link) => link.id === 'beta-root')) {
                throw new Error('Live bookmark remained in live store after parking drop');
            }
            const parkedLinkEntry = (detachedApi.getDetachedStore().main || []).find((entry) => entry.kind === 'link' && entry.link?.id === 'beta-root');
            if (!parkedLinkEntry) throw new Error('Parking root did not receive beta-root');

            detachedApi.handleDashboardDetachedFolderDrop(makeEvent({ ids: ['alpha-root'] }), detachedFolderEntryId, detachedFolderId);
            if ((window.links || []).some((link) => link.id === 'alpha-root')) {
                throw new Error('Live bookmark remained in live store after move into detached folder');
            }
            const parkedFolderLink = (detachedApi.getDetachedEntry(detachedFolderEntryId)?.folder?.links || []).find((link) => link.id === 'alpha-root' && String(link.folderId || '') === detachedFolderId);
            if (!parkedFolderLink) throw new Error('Detached folder did not receive alpha-root');

            window.moveBookmarksToFolderDrop(makeEvent({ type: 'detached-link', entryId: detachedFolderEntryId, linkId: 'alpha-root' }), 'Beta', 'bf1', 'main');
            const restoredLink = (window.links || []).find((link) => link.id === 'alpha-root');
            if (!restoredLink || restoredLink.category !== 'Beta' || String(restoredLink.folderId || '') !== 'bf1') {
                throw new Error('Detached bookmark did not restore into Beta folder: ' + JSON.stringify(restoredLink));
            }

            window.drop(makeEvent({ type: 'detached-folder', entryId: detachedFolderEntryId, folderId: detachedFolderId }), 'Gamma');
            const gammaTree = window.bookmarkFolders['main::Gamma'];
            const restoredFolder = Array.isArray(gammaTree?.nodes) ? gammaTree.nodes.find((node) => node.id === 'f1') : null;
            if (!restoredFolder || String(restoredFolder.parentId || '') !== '') {
                throw new Error('Detached folder chain did not restore into Gamma root');
            }
            if (detachedApi.getDetachedEntry(detachedFolderEntryId)) {
                throw new Error('Detached entry still present after restoring folder chain');
            }

            return {
                detachedCard: true,
                parkedLinkEntryId: parkedLinkEntry.id,
                restoredBookmarkFolderId: restoredLink.folderId,
                gammaFolderCount: Array.isArray(gammaTree?.nodes) ? gammaTree.nodes.length : 0,
                repairedMalformedRootId
            };
        }, makeFakeEvent.toString());

        console.log('DETACHED_DASHBOARD_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
