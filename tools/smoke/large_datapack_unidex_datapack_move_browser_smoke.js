const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.toggleBulkMode === 'function'
        && typeof window.confirmBulkTabMove === 'function'
        && !!window.UnidexView?.setEntriesDensityMode
        && !!window.EveOS?.SearchAdvanced?.Index?.rebuild
        && !!window.EveOS?.SearchAdvanced?.DatapackView?.openGateway
        && !!window.EveOS?.SearchAdvanced?.DatapackView?.openCardInternals
        && typeof window.getLiveLinks === 'function'
        && Array.isArray(window.getLiveLinks())
        && window.getLiveLinks().length > 0
    ), undefined, { timeout: 180000 });
}

async function seedLargeDatapack(page) {
    await page.evaluate(async () => {
        try {
            localStorage.clear();
        } catch (_) {
            // file:// storage can be unavailable.
        }

        const workspaces = [];
        const links = [];
        const linkedEntries = {};
        const categoryOrderByWorkspace = {};
        const bookmarkFolders = {};

        function buildCover(label, color) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
                <rect width="240" height="320" fill="${color}"/>
                <circle cx="190" cy="72" r="54" fill="rgba(255,255,255,0.18)"/>
                <text x="22" y="174" fill="white" font-size="30" font-family="Arial" font-weight="700">${label}</text>
            </svg>`;
            return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }

        for (let workspaceIndex = 0; workspaceIndex < 6; workspaceIndex += 1) {
            const workspaceId = `ws${workspaceIndex}`;
            workspaces.push({
                id: workspaceId,
                name: `Stress Tab ${workspaceIndex}`,
                icon: 'folder',
                subTabs: []
            });
            categoryOrderByWorkspace[workspaceId] = [];

            for (let cardIndex = 0; cardIndex < 18; cardIndex += 1) {
                const categoryName = `Card ${workspaceIndex}-${cardIndex}`;
                categoryOrderByWorkspace[workspaceId].push(categoryName);
                const scopedKey = `${workspaceId}::${categoryName}`;
                bookmarkFolders[scopedKey] = {
                    nodes: [
                        { id: `folder-${workspaceIndex}-${cardIndex}`, name: `Folder ${workspaceIndex}-${cardIndex}`, parentId: '', order: 0 }
                    ],
                    settings: { clickBehaviorMode: 'inherit' }
                };

                const bookmarkCount = workspaceIndex === 0 && cardIndex === 0 ? 150 : 12;
                for (let bookmarkIndex = 0; bookmarkIndex < bookmarkCount; bookmarkIndex += 1) {
                    const link = {
                        id: `link-${workspaceIndex}-${cardIndex}-${bookmarkIndex}`,
                        title: `Stress Bookmark ${workspaceIndex}-${cardIndex}-${bookmarkIndex}`,
                        url: `https://stress.example/${workspaceIndex}/${cardIndex}/${bookmarkIndex}`,
                        workspace: workspaceId,
                        category: categoryName,
                        folderId: bookmarkIndex % 3 === 0 ? `folder-${workspaceIndex}-${cardIndex}` : '',
                        identifiers: bookmarkIndex % 2 === 0 ? ['reading'] : ['research'],
                        notes: bookmarkIndex === 0 ? 'Long note seed for datapack view state smoke.' : ''
                    };
                    if (workspaceIndex < 2 && bookmarkIndex % 4 === 0) {
                        link.coverImage = buildCover(`S${workspaceIndex}${cardIndex}`, bookmarkIndex % 8 === 0 ? '#173a4d' : '#3a254d');
                    }
                    if (workspaceIndex === 0 && cardIndex === 0 && bookmarkIndex === 0) {
                        link.coverImage = 'data:image/png;base64,not-a-real-image';
                    }
                    if (bookmarkIndex % 5 === 0) {
                        linkedEntries[link.id] = {
                            title: link.title,
                            status: bookmarkIndex % 10 === 0 ? 'Reading' : 'Pending',
                            rating: String(3 + (bookmarkIndex % 3)),
                            author: `Stress Author ${workspaceIndex}-${cardIndex}`,
                            genre: 'Action, Fantasy, Long Running, Regression, Bookmarks, Datapack Stress Fixture',
                            summary: 'This linked-library summary is intentionally long enough to test large Unidex card clamping without letting one bookmark reserve a giant empty grid area. '.repeat(3),
                            derivedRatings: { confidence: 0.74 }
                        };
                    }
                    links.push(link);
                }
            }
        }

        window.config = config = {
            activeWorkspace: 'ws0',
            viewMode: 'unidex',
            workspaces,
            categoryOrder: categoryOrderByWorkspace.ws0.slice(),
            categoryOrderByWorkspace,
            bookmarkIdentifiers: [
                { id: 'reading', label: 'Reading', icon: '', color: '#4f8cff', description: 'Reading queue' },
                { id: 'research', label: 'Research', icon: '', color: '#f2b94b', description: 'Research queue' }
            ],
            unidexTabsUnified: true,
            unidexEntriesDensity: 'atlas',
            unidexEntriesGroupMode: 'identifiers',
            unidexEntriesLayout: 'grid',
            showInactiveTabs: true,
            showHiddenSidebarGroups: true,
            collapsedTabs: [],
            linksCollapsed: []
        };
        window.links = links;
        window.bookmarkFolders = bookmarkFolders;
        window.EveLibrary = window.EveLibrary || {};
        window.EveLibrary.Connections = Object.keys(linkedEntries).map((linkId) => ({ linkId, entry: linkedEntries[linkId] }));
        window.EveLibrary.State = window.EveLibrary.State || {};
        window.EveLibrary.ConnectionsAPI = {
            loadConnections() {},
            getLinkedEntry(linkId) {
                return linkedEntries[linkId] ? { entry: linkedEntries[linkId] } : null;
            }
        };
        window.EveLibrary.Ratings = {
            applyDerivedRatings(entry) {
                if (!entry.derivedRatings) entry.derivedRatings = { confidence: 0.74 };
            }
        };

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = bookmarkFolders;
        }

        window.__largeDatapackSmoke = { saveDataCalls: 0, moveEvents: [] };
        const originalSaveData = window.saveData;
        window.saveData = function smokeSaveData(payload) {
            window.__largeDatapackSmoke.saveDataCalls += 1;
            window.__largeDatapackSmoke.lastSaveData = JSON.parse(JSON.stringify(payload || {}));
            return originalSaveData.apply(this, arguments);
        };
        window.addEventListener('eve:bulk-bookmark-move', (event) => {
            window.__largeDatapackSmoke.moveEvents.push(JSON.parse(JSON.stringify(event.detail || {})));
        });

        await window.EveOS.SearchAdvanced.Index.rebuild({
            reason: 'large-datapack-unidex-move-smoke-seed',
            force: true
        });
        window.renderSidebar();
        window.renderDashboard();
    });
}

async function assertUnidexLargeView(page) {
    await page.waitForSelector('.unidex-shell .unidex-entries.is-density-atlas', { timeout: 25000 });
    await page.waitForSelector('.unidex-identifier-group', { timeout: 25000 });
    await page.waitForFunction(() => (
        document.querySelector('.unidex-entries')?.classList?.contains('is-large-entry-set')
    ), undefined, { timeout: 25000 });
    await page.waitForFunction(() => (
        !!document.querySelector('.unidex-entry-cover-slot.is-cover-error')
    ), undefined, { timeout: 25000 });

    const unidexState = await page.evaluate(() => ({
        density: window.config.unidexEntriesDensity,
        groupMode: window.config.unidexEntriesGroupMode,
        renderedEntries: document.querySelectorAll('.unidex-entry-item.is-density-atlas').length,
        identifierGroups: document.querySelectorAll('.unidex-identifier-group').length,
        gridClass: document.querySelector('.unidex-entries')?.className || '',
        masonryApplied: document.querySelector('.unidex-entries')?.dataset?.unidexMasonryApplied || '',
        groupedBodyDisplay: getComputedStyle(document.querySelector('.unidex-identifier-group-body')).display,
        groupedBodyGridAutoRows: getComputedStyle(document.querySelector('.unidex-identifier-group-body')).gridAutoRows,
        groupedBodyGridAutoFlow: getComputedStyle(document.querySelector('.unidex-identifier-group-body')).gridAutoFlow,
        coverErrors: document.querySelectorAll('.unidex-entry-cover-slot.is-cover-error').length,
        megaPerfMode: !!window._eveMegaPerfMode
    }));

    if (unidexState.renderedEntries < 1000 || unidexState.identifierGroups < 2) {
        throw new Error(`Expected large Unidex identifier/atlas view to render dense entries: ${JSON.stringify(unidexState)}`);
    }
    if (!unidexState.gridClass.includes('is-grid-layout') || unidexState.density !== 'atlas' || unidexState.groupMode !== 'identifiers') {
        throw new Error(`Expected Unidex density/group/layout state to hold: ${JSON.stringify(unidexState)}`);
    }
    if (!unidexState.gridClass.includes('is-large-entry-set') || !unidexState.gridClass.includes('is-grouped-entry-set')) {
        throw new Error(`Expected huge Unidex view to use large-list layout path: ${JSON.stringify(unidexState)}`);
    }
    if (unidexState.masonryApplied !== 'visible' || unidexState.groupedBodyDisplay !== 'grid' || unidexState.groupedBodyGridAutoRows !== '8px' || !unidexState.groupedBodyGridAutoFlow.includes('dense')) {
        throw new Error(`Expected huge Unidex view to use visible-only grouped masonry packing: ${JSON.stringify(unidexState)}`);
    }
}

async function assertUnidexLargeFlatPlacement(page) {
    await page.evaluate(() => window.UnidexView.setEntriesGroupMode('flat'));
    await page.waitForFunction(() => {
        const entries = document.querySelector('.unidex-entries');
        return entries?.classList?.contains('is-large-entry-set')
            && entries?.classList?.contains('is-flat-entry-set')
            && document.querySelectorAll('.unidex-entries > .unidex-entry-item').length > 1000;
    }, undefined, { timeout: 25000 });
    await page.waitForFunction(() => {
        const entries = document.querySelector('.unidex-entries');
        const visibleItems = Array.from(document.querySelectorAll('.unidex-entries > .unidex-entry-item')).filter((item) => {
            const rect = item.getBoundingClientRect();
            return rect.bottom > -50 && rect.top < window.innerHeight + 50;
        }).slice(0, 12);
        return entries?.dataset?.unidexMasonryApplied === 'visible'
            && visibleItems.length >= 6
            && visibleItems.every((item) => item.dataset.unidexMasonryMeasured === '1' && getComputedStyle(item).gridRowEnd.startsWith('span '));
    }, undefined, { timeout: 25000 });

    const flatState = await page.evaluate(() => {
        const entries = document.querySelector('.unidex-entries');
        const computed = getComputedStyle(entries);
        const items = Array.from(entries.querySelectorAll(':scope > .unidex-entry-item')).slice(0, 24);
        const rects = items.map((item) => {
            const rect = item.getBoundingClientRect();
            return {
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                height: Math.round(rect.height),
                span: getComputedStyle(item).gridRowEnd
            };
        });
        return {
            className: entries.className,
            display: computed.display,
        gridAutoRows: computed.gridAutoRows,
        gridAutoFlow: computed.gridAutoFlow,
        masonryApplied: entries.dataset.unidexMasonryApplied || '',
        measuredCount: document.querySelectorAll('.unidex-entries > .unidex-entry-item[data-unidex-masonry-measured="1"]').length,
        totalDirectEntries: document.querySelectorAll('.unidex-entries > .unidex-entry-item').length,
        rects
    };
    });

    if (flatState.display !== 'grid' || flatState.gridAutoRows !== '8px' || !flatState.gridAutoFlow.includes('dense')) {
        throw new Error(`Expected large flat Unidex to use dense grid placement: ${JSON.stringify(flatState)}`);
    }
    if (flatState.masonryApplied !== 'visible' || !flatState.rects.some((rect) => rect.span.startsWith('span '))) {
        throw new Error(`Expected large flat Unidex to use visible-only masonry spans: ${JSON.stringify(flatState)}`);
    }
    if (flatState.measuredCount < 6 || flatState.measuredCount > 140 || flatState.measuredCount >= flatState.totalDirectEntries) {
        throw new Error(`Expected large flat Unidex to measure only a bounded viewport window: ${JSON.stringify(flatState)}`);
    }
    const firstTop = flatState.rects[0]?.top;
    const firstRow = flatState.rects.filter((rect) => Math.abs(rect.top - firstTop) <= 4);
    const uniqueLefts = new Set(firstRow.map((rect) => rect.left));
    if (uniqueLefts.size < 3) {
        throw new Error(`Expected large flat Unidex placement to fill across the row instead of stacking down one side: ${JSON.stringify(flatState)}`);
    }
    const uniqueHeights = new Set(flatState.rects.map((rect) => rect.height));
    if (uniqueHeights.size < 2) {
        throw new Error(`Expected large flat Unidex cards to keep natural variable heights: ${JSON.stringify(flatState)}`);
    }
    const firstHeight = Math.max(...firstRow.map((rect) => rect.height));
    const secondTop = flatState.rects.map((rect) => rect.top).find((top) => top > firstTop + 20);
    if (!secondTop || secondTop - (firstTop + firstHeight) > 36) {
        throw new Error(`Expected large flat Unidex masonry to keep rows pulled upward without giant reserved holes: ${JSON.stringify(flatState)}`);
    }

    await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.35)));
    await page.waitForFunction(() => {
        const visibleItems = Array.from(document.querySelectorAll('.unidex-entries > .unidex-entry-item')).filter((item) => {
            const rect = item.getBoundingClientRect();
            return rect.bottom > -50 && rect.top < window.innerHeight + 50;
        }).slice(0, 8);
        return visibleItems.length >= 4
            && visibleItems.some((item) => item.dataset.unidexMasonryMeasured === '1');
    }, undefined, { timeout: 25000 });

    const scrolledState = await page.evaluate(() => ({
        measuredCount: document.querySelectorAll('.unidex-entries > .unidex-entry-item[data-unidex-masonry-measured="1"]').length,
        totalDirectEntries: document.querySelectorAll('.unidex-entries > .unidex-entry-item').length,
        scanIndex: Number(document.querySelector('.unidex-entries')?.dataset?.unidexMasonryScanIndex || 0)
    }));
    if (scrolledState.measuredCount > 220 || scrolledState.measuredCount >= scrolledState.totalDirectEntries) {
        throw new Error(`Expected scrolling large Unidex to keep measurement bounded: ${JSON.stringify(scrolledState)}`);
    }
}

async function assertDatapackViewLargeCaps(page) {
    await page.evaluate(() => {
        window.openExpandedSearchModal({ autoSearch: false });
        window.EveOS.SearchAdvanced.DatapackView.openGateway({ scope: { workspaceId: 'ws0' } });
    });
    await page.waitForSelector('#nxDatapackViewPanel', { timeout: 15000 });

    const gatewayState = await page.evaluate(() => {
        const panel = document.getElementById('nxDatapackViewPanel');
        const state = JSON.parse(panel.querySelector('.nx-dv-json pre')?.textContent || '{}');
        return {
            counts: state.counts,
            cardCount: Array.isArray(state.cards) ? state.cards.length : 0,
            jsonText: panel.querySelector('.nx-dv-json pre')?.textContent || ''
        };
    });
    if (gatewayState.counts.cards !== 18 || gatewayState.cardCount !== 18) {
        throw new Error(`Expected ws0 gateway to expose card summaries only: ${JSON.stringify(gatewayState.counts)}`);
    }
    if (gatewayState.jsonText.includes('https://stress.example/0/0/0')) {
        throw new Error('Datapack gateway leaked raw bookmark URLs for a large card.');
    }

    await page.evaluate(() => window.EveOS.SearchAdvanced.DatapackView.openCardInternals('ws0', 'Card 0-0'));
    await page.waitForSelector('.nx-dv-micro-overlay', { timeout: 15000 });
    const microState = await page.evaluate(() => {
        const overlay = document.querySelector('.nx-dv-micro-overlay');
        return {
            text: overlay?.textContent || '',
            rows: overlay ? overlay.querySelectorAll('.nx-dv-bookmark-row').length : 0
        };
    });
    if (microState.rows !== 120 || !microState.text.includes('30 omitted by safety cap')) {
        throw new Error(`Expected card internals to cap huge bookmark lists safely: ${JSON.stringify(microState)}`);
    }
    await page.evaluate(() => window.EveOS.SearchAdvanced.DatapackView.closeCardInternals());
}

async function assertLargeBulkMove(page) {
    const movedLinkId = 'link-0-0-1';
    await page.evaluate(() => {
        window.config.viewMode = 'grid';
        window.config.activeWorkspace = 'ws0';
        window.renderDashboard();
    });
    await page.waitForSelector('.category-card[data-card-category="Card 0-0"]', { timeout: 20000 });

    await page.evaluate((targetLinkId) => {
        if (!document.body.classList.contains('bulk-active')) window.toggleBulkMode();
        const checkbox = document.querySelector(`.bulk-check[data-bulk-id="${targetLinkId}"]`);
        if (!checkbox) throw new Error('Missing bulk checkbox for large move target.');
        checkbox.checked = true;
        window.toggleSelect(checkbox, targetLinkId, {
            stopPropagation() {},
            preventDefault() {},
            shiftKey: false
        });
        window.bulkWorkspace();
    }, movedLinkId);
    await page.waitForSelector('#bulk-tab-modal-overlay[style*="flex"]', { timeout: 10000 });
    await page.selectOption('#bulk-tab-existing-select', 'ws5');
    await page.fill('#bulk-tab-card-filter', 'Card 5-7');
    await page.waitForTimeout(100);
    await page.selectOption('#bulk-tab-card-existing-select', 'Card 5-7');
    await page.evaluate(() => window.confirmBulkTabMove());
    await page.waitForFunction(() => !document.body.classList.contains('bulk-active'), undefined, { timeout: 15000 });

    const moveState = await page.evaluate(() => {
        const moved = window.links.find((link) => link.id === 'link-0-0-1');
        return {
            moved,
            moveEvents: window.__largeDatapackSmoke.moveEvents,
            saveDataCalls: window.__largeDatapackSmoke.saveDataCalls,
            lastSaveData: window.__largeDatapackSmoke.lastSaveData
        };
    });
    if (moveState.moved?.workspace !== 'ws5' || moveState.moved?.category !== 'Card 5-7') {
        throw new Error(`Expected large bulk move to retarget the selected bookmark: ${JSON.stringify(moveState.moved)}`);
    }
    const lastEvent = moveState.moveEvents[moveState.moveEvents.length - 1];
    if (!lastEvent || lastEvent.source !== 'bulk-workspace-bookmark-move' || !Array.isArray(lastEvent.touchedScopes) || lastEvent.touchedScopes.length < 2) {
        throw new Error(`Expected large bulk move to emit precise mutation metadata: ${JSON.stringify(moveState)}`);
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedLargeDatapack(page);
        await assertUnidexLargeView(page);
        await assertUnidexLargeFlatPlacement(page);
        await assertDatapackViewLargeCaps(page);
        await assertLargeBulkMove(page);
        console.log('LARGE_DATAPACK_UNIDEX_DATAPACK_MOVE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
