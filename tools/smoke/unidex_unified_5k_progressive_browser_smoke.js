const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.getLiveLinks === 'function'
        && !!window.UnidexView?.render
    ), undefined, { timeout: 180000 });
}

async function seedFiveThousandUnifiedView(page) {
    return page.evaluate(() => {
        const workspaces = [];
        const links = [];
        const libraryEntriesByLinkId = {};
        const categoryOrderByWorkspace = {};
        const workspaceCount = 20;
        const linksPerWorkspace = 275;

        for (let workspaceIndex = 0; workspaceIndex < workspaceCount; workspaceIndex += 1) {
            const workspaceId = `bulk-ws-${workspaceIndex}`;
            workspaces.push({
                id: workspaceId,
                name: `Bulk Tab ${workspaceIndex}`,
                icon: 'folder',
                subTabs: []
            });
            categoryOrderByWorkspace[workspaceId] = ['Bulk Card A', 'Bulk Card B'];

            for (let linkIndex = 0; linkIndex < linksPerWorkspace; linkIndex += 1) {
                const linkId = `bulk-link-${workspaceIndex}-${linkIndex}`;
                links.push({
                    id: linkId,
                    title: `Bulk Bookmark ${workspaceIndex}-${linkIndex} With A Long Wrapped Title Segment For Layout Stability`,
                    url: `https://bulk.example/${workspaceIndex}/${linkIndex}`,
                    workspace: workspaceId,
                    category: linkIndex % 2 === 0 ? 'Bulk Card A' : 'Bulk Card B',
                    identifiers: [linkIndex % 3 === 0 ? 'reading' : 'research'],
                    done: false
                });
                if (linkIndex % 2 === 0) {
                    libraryEntriesByLinkId[linkId] = {
                        author: `Author ${workspaceIndex} ${linkIndex} With Extended Alias Text`,
                        genre: 'Action, Adventure, Fantasy, Slice Of Life, Deep Archive, Long Running Collection',
                        status: linkIndex % 4 === 0 ? 'Reading' : 'Pending',
                        rating: String((linkIndex % 5) + 1),
                        chapter: String(linkIndex + 1),
                        type: 'Graphic Novel',
                        language: 'English',
                        summary: 'This intentionally long library summary exercises the unified card wrapping path so a large progressive render cannot spill text or tag rows into nearby bookmark cards before masonry measurement catches up.'
                    };
                }
            }
        }

        window.config = config = {
            activeWorkspace: 'bulk-ws-0',
            viewMode: 'unidex',
            workspaces,
            categoryOrder: categoryOrderByWorkspace['bulk-ws-0'].slice(),
            categoryOrderByWorkspace,
            unidexTabsUnified: true,
            unidexCardsUnified: false,
            unidexEntriesLayout: 'grid',
            unidexEntriesDensity: 'atlas',
            unidexEntriesFilter: 'all',
            unidexEntriesGroupMode: 'flat',
            bookmarkIdentifiers: [
                { id: 'reading', label: 'Reading', color: '#00d4ff', icon: '', description: 'Reading queue' },
                { id: 'research', label: 'Research', color: '#f6c35b', icon: '', description: 'Research queue' }
            ],
            collapsedTabs: []
        };
        window.links = links;
        window.bookmarkFolders = {};
        window.EveLibrary = window.EveLibrary || {};
        window.EveLibrary.Connections = [];
        window.EveLibrary.State = window.EveLibrary.State || {};
        window.EveLibrary.ConnectionsAPI = {
            loadConnections() {},
            getLinkedEntry(linkId) {
                const entry = libraryEntriesByLinkId[String(linkId || '')];
                return entry ? { entry } : null;
            }
        };
        const smokeSeedConfig = JSON.parse(JSON.stringify(config));
        const smokeSeedLinks = JSON.parse(JSON.stringify(links));
        window.__restoreUnidexUnified5kSmoke = function restoreUnidexUnified5kSmoke(overrides) {
            const clonedLinks = JSON.parse(JSON.stringify(smokeSeedLinks));
            const nextConfig = Object.assign({}, JSON.parse(JSON.stringify(smokeSeedConfig)), overrides || {});
            window.config = config = nextConfig;
            window.links = clonedLinks;
            window.bookmarkFolders = {};
            window.EveLibrary = window.EveLibrary || {};
            window.EveLibrary.Connections = [];
            window.EveLibrary.State = window.EveLibrary.State || {};
            window.EveLibrary.ConnectionsAPI = {
                loadConnections() {},
                getLinkedEntry(linkId) {
                    const entry = libraryEntriesByLinkId[String(linkId || '')];
                    return entry ? { entry } : null;
                }
            };
            if (window.eveState) {
                window.eveState.config = nextConfig;
                window.eveState.links = clonedLinks;
                window.eveState.bookmarkFolders = {};
            }
        };

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = {};
        }

        const startedAt = performance.now();
        if (typeof window._renderDashboardImmediate === 'function') {
            window._renderDashboardImmediate();
        } else {
            window.renderDashboard();
        }
        const initialRenderMs = performance.now() - startedAt;
        const entriesSection = document.querySelector('.unidex-entries');
        return {
            initialRenderMs,
            totalLinks: links.length,
            initialEntries: document.querySelectorAll('.unidex-entry-item').length,
            progressive: entriesSection?.dataset?.unidexProgressive === '1' || entriesSection?.hasAttribute('data-unidex-progressive'),
            rendered: Number(entriesSection?.dataset?.unidexProgressiveRendered || 0),
            total: Number(entriesSection?.dataset?.unidexProgressiveTotal || 0),
            status: document.querySelector('[data-unidex-progressive-status="1"]')?.textContent?.trim() || ''
        };
    });
}

async function assertProgressiveInitialLoad(initialState) {
    if (initialState.totalLinks !== 5500) {
        throw new Error(`Expected 5,500 seeded links: ${JSON.stringify(initialState)}`);
    }
    if (!initialState.progressive || initialState.initialEntries > 360 || initialState.initialEntries < 180) {
        throw new Error(`Expected initial unified view to render only the first chunk: ${JSON.stringify(initialState)}`);
    }
    if (initialState.initialRenderMs > 2500) {
        throw new Error(`Expected initial 5k unified render to stay responsive: ${JSON.stringify(initialState)}`);
    }
}

async function assertNoVisibleCardOverlap(page, label) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function collectLayoutState() {
        return page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll(
            '.unidex-entries > .unidex-entry-item, .unidex-identifier-group-body > .unidex-entry-item'
        ));
        const rects = nodes.map((node, index) => {
            const rect = node.getBoundingClientRect();
            return {
                index,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            };
        }).filter((rect) => (
            rect.width > 0
            && rect.height > 0
            && rect.bottom > -40
            && rect.top < window.innerHeight + 220
        )).slice(0, 80);
        const overlaps = [];
        for (let i = 0; i < rects.length; i += 1) {
            for (let j = i + 1; j < rects.length; j += 1) {
                const a = rects[i];
                const b = rects[j];
                const horizontalOverlap = a.left < b.right - 6 && a.right > b.left + 6;
                const verticalOverlap = a.top < b.bottom - 6 && a.bottom > b.top + 6;
                if (horizontalOverlap && verticalOverlap) {
                    overlaps.push({ a: a.index, b: b.index, aBottom: a.bottom, bTop: b.top });
                    if (overlaps.length >= 5) break;
                }
            }
            if (overlaps.length >= 5) break;
        }
        return {
            checked: rects.length,
            overlaps,
            maxHeight: rects.reduce((max, rect) => Math.max(max, Math.round(rect.height)), 0)
        };
        });
    }

    let layoutState = await collectLayoutState();
    if (layoutState.checked < 4) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        layoutState = await collectLayoutState();
    }

    if (layoutState.checked < 4 || layoutState.overlaps.length) {
        throw new Error(`Expected no visible unified card overlap during ${label}: ${JSON.stringify(layoutState)}`);
    }
}

async function assertVisibleCardContentContained(page, label) {
    const contentState = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll(
            '.unidex-entries > .unidex-entry-item, .unidex-identifier-group-body > .unidex-entry-item'
        )).filter((item) => {
            const rect = item.getBoundingClientRect();
            return rect.width > 0
                && rect.height > 0
                && rect.bottom > -40
                && rect.top < window.innerHeight + 220;
        }).slice(0, 40);

        const failures = [];
        items.forEach((item, index) => {
            const itemRect = item.getBoundingClientRect();
            const coverRect = item.querySelector('.unidex-entry-visual-btn')?.getBoundingClientRect();
            const mainRect = item.querySelector('.unidex-entry-main')?.getBoundingClientRect();
            const titleRect = item.querySelector('.unidex-entry-title')?.getBoundingClientRect();
            if (!coverRect || !mainRect || !titleRect) return;
            if (titleRect.top < coverRect.bottom - 2) {
                failures.push({ index, reason: 'title-over-cover', titleTop: titleRect.top, coverBottom: coverRect.bottom });
            }
            if (mainRect.bottom > itemRect.bottom + 2 || mainRect.left < itemRect.left - 2 || mainRect.right > itemRect.right + 2) {
                failures.push({ index, reason: 'main-overflows-card', mainBottom: mainRect.bottom, itemBottom: itemRect.bottom });
            }
        });

        return { checked: items.length, failures: failures.slice(0, 6) };
    });

    if (contentState.checked < 4 || contentState.failures.length) {
        throw new Error(`Expected unified card text/content to stay inside cards during ${label}: ${JSON.stringify(contentState)}`);
    }
}

async function assertProgressiveHydrationCompletes(page) {
    await page.waitForFunction(() => {
        const entriesSection = document.querySelector('.unidex-entries');
        return document.querySelectorAll('.unidex-entry-item').length === 5500
            && entriesSection?.getAttribute('aria-busy') === 'false';
    }, undefined, { timeout: 120000 });

    const finalState = await page.evaluate(async () => {
        window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.45));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const entriesSection = document.querySelector('.unidex-entries');
        return {
            entries: document.querySelectorAll('.unidex-entry-item').length,
            busy: entriesSection?.getAttribute('aria-busy') || '',
            largeClass: entriesSection?.classList?.contains('is-large-entry-set') || false,
            masonryState: entriesSection?.dataset?.unidexMasonryApplied || '',
            status: document.querySelector('[data-unidex-progressive-status="1"]')?.textContent?.trim() || ''
        };
    });

    if (finalState.entries !== 5500 || finalState.busy !== 'false' || !finalState.largeClass) {
        throw new Error(`Expected progressive 5k hydration to complete in large-list mode: ${JSON.stringify(finalState)}`);
    }
    if (!finalState.status.includes('Loaded 5,500')) {
        throw new Error(`Expected progressive status to confirm full load: ${JSON.stringify(finalState)}`);
    }
    await assertNoVisibleCardOverlap(page, 'flat hydration');
    await assertVisibleCardContentContained(page, 'flat hydration');
}

async function assertIdentifierGroupedProgressive(page) {
    const initialState = await page.evaluate(() => {
        if (typeof window.__restoreUnidexUnified5kSmoke === 'function') {
            window.__restoreUnidexUnified5kSmoke({ unidexEntriesGroupMode: 'identifiers' });
        } else {
            window.config.unidexEntriesGroupMode = 'identifiers';
            if (window.eveState?.config) window.eveState.config.unidexEntriesGroupMode = 'identifiers';
        }
        const startedAt = performance.now();
        if (typeof window._renderDashboardImmediate === 'function') {
            window._renderDashboardImmediate();
        } else {
            window.renderDashboard();
        }
        const entriesSection = document.querySelector('.unidex-entries');
        return {
            initialRenderMs: performance.now() - startedAt,
            initialEntries: document.querySelectorAll('.unidex-entry-item').length,
            groups: document.querySelectorAll('.unidex-identifier-group').length,
            progressive: entriesSection?.hasAttribute('data-unidex-progressive') || false,
            rendered: Number(entriesSection?.dataset?.unidexProgressiveRendered || 0),
            total: Number(entriesSection?.dataset?.unidexProgressiveTotal || 0)
        };
    });

    if (!initialState.progressive || initialState.groups < 2 || initialState.initialEntries > 360 || initialState.total !== 5500) {
        throw new Error(`Expected identifier grouped 5k view to use progressive chunks: ${JSON.stringify(initialState)}`);
    }

    await page.waitForFunction(() => {
        const entriesSection = document.querySelector('.unidex-entries');
        if ((!entriesSection || document.querySelectorAll('.unidex-entry-item').length === 0)
            && typeof window.__restoreUnidexUnified5kSmoke === 'function') {
            window.__restoreUnidexUnified5kSmoke({ unidexEntriesGroupMode: 'identifiers' });
            if (typeof window._renderDashboardImmediate === 'function') {
                window._renderDashboardImmediate();
            } else if (typeof window.renderDashboard === 'function') {
                window.renderDashboard();
            }
            return false;
        }
        return document.querySelectorAll('.unidex-entry-item').length === 5500
            && document.querySelectorAll('.unidex-identifier-group').length >= 2
            && entriesSection?.getAttribute('aria-busy') === 'false';
    }, undefined, { timeout: 120000 });
    await assertNoVisibleCardOverlap(page, 'identifier hydration');
    await assertVisibleCardContentContained(page, 'identifier hydration');
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        const initialState = await seedFiveThousandUnifiedView(page);
        await assertProgressiveInitialLoad(initialState);
        await assertNoVisibleCardOverlap(page, 'flat initial render');
        await assertVisibleCardContentContained(page, 'flat initial render');
        await assertProgressiveHydrationCompletes(page);
        await assertIdentifierGroupedProgressive(page);
        console.log('UNIDEX_UNIFIED_5K_PROGRESSIVE_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
