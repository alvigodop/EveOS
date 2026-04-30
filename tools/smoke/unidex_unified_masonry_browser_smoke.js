const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildCover(label, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
        <rect width="320" height="420" fill="${color}"/>
        <circle cx="250" cy="80" r="76" fill="rgba(255,255,255,0.18)"/>
        <text x="28" y="226" fill="white" font-size="36" font-family="Arial" font-weight="700">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.renderDashboard === 'function'
        && typeof window.getLiveLinks === 'function'
        && !!window.UnidexView?.setCardsUnified
        && !!window.UnidexView?.switchWorkspaceTab
    ), undefined, { timeout: 180000 });
}

async function seedUnifiedMasonry(page) {
    await page.evaluate((covers) => {
        const links = Array.from({ length: 8 }, (_, index) => ({
            id: `masonry-link-${index}`,
            title: `Masonry Bookmark ${index}`,
            url: `https://masonry.example/${index}`,
            workspace: 'main',
            category: index % 2 === 0 ? 'Tall Card' : 'Short Card',
            coverImage: covers[index % covers.length],
            done: false,
            pinned: false
        }));

        const longSummary = 'This intentionally long linked-library summary creates a tall Unidex bookmark card. '.repeat(8);
        const linkedEntries = {};
        links.forEach((link, index) => {
            linkedEntries[link.id] = {
                title: link.title,
                status: index % 2 === 0 ? 'Reading' : 'Saved',
                rating: String(5 - (index % 3)),
                author: index === 0 ? 'Long Author Name For Height' : 'Short Author',
                genre: index === 0 ? 'Action, Fantasy, Regression, Progression, Library, Archive, Research' : 'Action',
                summary: index === 0 ? longSummary : 'Short summary.',
                derivedRatings: { confidence: 0.82 }
            };
        });

        window.config = config = {
            activeWorkspace: 'main',
            viewMode: 'unidex',
            workspaces: [
                { id: 'main', name: 'Main', icon: 'folder' }
            ],
            categoryOrder: ['Tall Card', 'Short Card'],
            categoryOrderByWorkspace: {
                main: ['Tall Card', 'Short Card']
            },
            unidexCardsUnified: true,
            unidexEntriesLayout: 'grid',
            unidexEntriesDensity: 'comfortable',
            unidexEntriesFilter: 'all',
            unidexEntriesGroupMode: 'flat'
        };
        window.links = links;
        window.bookmarkFolders = {};

        if (window.eveState) {
            window.eveState.config = config;
            window.eveState.links = links;
            window.eveState.bookmarkFolders = {};
        }

        window.EveLibrary = window.EveLibrary || {};
        window.EveLibrary.Connections = links.map((link) => ({ linkId: link.id, entry: linkedEntries[link.id] }));
        window.EveLibrary.State = window.EveLibrary.State || {};
        window.EveLibrary.ConnectionsAPI = {
            loadConnections() {},
            getLinkedEntry(linkId) {
                return linkedEntries[linkId] ? { entry: linkedEntries[linkId] } : null;
            }
        };
        window.EveLibrary.Ratings = {
            applyDerivedRatings(entry) {
                if (!entry.derivedRatings) entry.derivedRatings = { confidence: 0.82 };
            }
        };

        window.renderDashboard();
        window.UnidexView.switchWorkspaceTab('main');
        window.UnidexView.setCardsUnified(true);
    }, [
        buildCover('A', '#173a4d'),
        buildCover('B', '#3a254d'),
        buildCover('C', '#264d30')
    ]);
}

async function assertMasonryPacking(page) {
    await page.waitForSelector('.unidex-entries.is-grid-layout .unidex-entry-item', { timeout: 25000 });
    await page.waitForFunction(() => {
        const items = Array.from(document.querySelectorAll('.unidex-entries.is-grid-layout > .unidex-entry-item'));
        return items.length >= 4 && items.every((item) => String(item.style.gridRowEnd || '').startsWith('span '));
    }, undefined, { timeout: 25000 });

    const layout = await page.evaluate(() => {
        const entries = document.querySelector('.unidex-entries.is-grid-layout');
        const items = Array.from(entries.querySelectorAll(':scope > .unidex-entry-item')).slice(0, 4);
        const rects = items.map((item) => {
            const rect = item.getBoundingClientRect();
            return {
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                height: Math.round(rect.height),
                span: item.style.gridRowEnd
            };
        });
        return {
            gridAutoRows: getComputedStyle(entries).gridAutoRows,
            gridAutoFlow: getComputedStyle(entries).gridAutoFlow,
            rects
        };
    });

    if (layout.gridAutoRows !== '8px' || !layout.gridAutoFlow.includes('dense')) {
        throw new Error(`Expected masonry grid settings: ${JSON.stringify(layout)}`);
    }
    if (layout.rects.length < 4 || !layout.rects[0].span.startsWith('span ')) {
        throw new Error(`Expected measured masonry spans: ${JSON.stringify(layout)}`);
    }
    if (layout.rects[0].height < layout.rects[1].height + 80) {
        throw new Error(`Expected first card to be materially taller for packing assertion: ${JSON.stringify(layout)}`);
    }

    const rowLockedTop = layout.rects[0].top + layout.rects[0].height;
    const packedCandidate = layout.rects.find((rect, index) => index >= 2 && rect.top < rowLockedTop - 30);
    if (!packedCandidate) {
        throw new Error(`Expected later cards to pack upward instead of waiting for the tallest row: ${JSON.stringify(layout)}`);
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 700, height: 1100 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);
        await seedUnifiedMasonry(page);
        await assertMasonryPacking(page);
        console.log('UNIDEX_UNIFIED_MASONRY_BROWSER_SMOKE_OK');
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
