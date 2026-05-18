const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 860 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error && error.message ? error.message : String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => (
            typeof window.openExpandedSearchModal === 'function'
            && !!window.EveOS?.SearchAdvanced?.DatapackView
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => {
            const longTitle = 'A Very Long Bookmark Title That Used To Push Across The Card Internals Editor And Collide With Nearby Boxes';
            const longUrl = 'https://example.com/library/collection/source-code-json-structure/card-internals/path/with/a/very/long/slug/and/query?alpha=one&beta=two&gamma=three&delta=four';
            window.config = config = {
                activeWorkspace: 'main',
                workspaces: [{ id: 'main', name: 'Main', icon: 'home', subTabs: [] }],
                categoryOrderByWorkspace: { main: ['Browser With A Long Card Name For Layout Testing'] }
            };
            window.links = links = [
                {
                    id: 'b1',
                    title: longTitle,
                    url: longUrl,
                    workspace: 'main',
                    category: 'Browser With A Long Card Name For Layout Testing',
                    folderId: 'f2',
                    identifiers: ['reading', 'source-code-json-link'],
                    notes: 'Long notes should stay inside the bookmark editor row and never overlap the source metadata chips. '.repeat(8)
                },
                {
                    id: 'b2',
                    title: 'Root Bookmark',
                    url: 'https://example.com/root',
                    workspace: 'main',
                    category: 'Browser With A Long Card Name For Layout Testing'
                }
            ];
            window.bookmarkFolders = bookmarkFolders = {
                'main::Browser With A Long Card Name For Layout Testing': {
                    nodes: [
                        { id: 'f1', name: 'Folder With A Long Name That Should Wrap Instead Of Escaping', parentId: '', order: 0 },
                        { id: 'f2', name: 'Nested Source Folder With A Long JSON Path', parentId: 'f1', order: 1 }
                    ]
                }
            };
            if (window.eveState) {
                window.eveState.config = config;
                window.eveState.links = links;
                window.eveState.bookmarkFolders = bookmarkFolders;
            }
        });

        await page.evaluate(() => window.openExpandedSearchModal({ autoSearch: false }));
        await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });
        await page.locator('#nxDatapackViewBtn').click();
        await page.waitForSelector('#nxDatapackViewPanel', { timeout: 10000 });
        await page.locator('.nx-dv-json summary').click();
        await page.locator('[data-nx-dv-action="open-card"]').first().click();
        await page.waitForSelector('.nx-dv-micro-overlay', { timeout: 10000 });

        const layoutReport = await page.evaluate(() => {
            function rectOf(node) {
                const rect = node.getBoundingClientRect();
                return {
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height
                };
            }

            function overlaps(a, b) {
                const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                return x > 2 && y > 2;
            }

            function directChildOverlaps(selector) {
                const issues = [];
                document.querySelectorAll(selector).forEach((box, boxIndex) => {
                    const children = Array.from(box.children).filter((child) => {
                        const rect = child.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    });
                    children.forEach((child, childIndex) => {
                        const rect = rectOf(child);
                        children.slice(childIndex + 1).forEach((other) => {
                            const otherRect = rectOf(other);
                            if (overlaps(rect, otherRect)) {
                                issues.push({ selector, boxIndex, a: child.tagName, b: other.tagName, rect, otherRect });
                            }
                        });
                    });
                });
                return issues;
            }

            function escapesContainer(selector, containerSelector) {
                const issues = [];
                document.querySelectorAll(selector).forEach((node, index) => {
                    const container = node.closest(containerSelector);
                    if (!container) return;
                    const rect = rectOf(node);
                    const parentRect = rectOf(container);
                    if (rect.left < parentRect.left - 2 || rect.right > parentRect.right + 2 || rect.top < parentRect.top - 2 || rect.bottom > parentRect.bottom + 2) {
                        issues.push({ selector, index, rect, parentRect });
                    }
                });
                return issues;
            }

            return {
                cardFootOverlaps: directChildOverlaps('.nx-dv-card-foot'),
                bookmarkRowOverlaps: directChildOverlaps('.nx-dv-bookmark-row'),
                escapingInputs: escapesContainer('.nx-dv-bookmark-row input, .nx-dv-bookmark-row select, .nx-dv-bookmark-row textarea', '.nx-dv-bookmark-row'),
                escapingCards: escapesContainer('.nx-dv-card-foot, .nx-dv-json pre, .nx-dv-json-link', '.nx-dv-panel, .nx-dv-micro'),
                microWidth: document.querySelector('.nx-dv-micro')?.getBoundingClientRect().width || 0
            };
        });

        assert(layoutReport.microWidth > 900, `Card internals popup should use the wider layout: ${JSON.stringify(layoutReport)}`);
        assert(layoutReport.cardFootOverlaps.length === 0, `Macro card footer children overlap: ${JSON.stringify(layoutReport.cardFootOverlaps)}`);
        assert(layoutReport.bookmarkRowOverlaps.length === 0, `Bookmark editor row children overlap: ${JSON.stringify(layoutReport.bookmarkRowOverlaps)}`);
        assert(layoutReport.escapingInputs.length === 0, `Bookmark editor fields escape their rows: ${JSON.stringify(layoutReport.escapingInputs)}`);
        assert(layoutReport.escapingCards.length === 0, `Datapack view source/link boxes escape containers: ${JSON.stringify(layoutReport.escapingCards)}`);
        if (pageErrors.length) {
            throw new Error(`Page errors during layout smoke: ${pageErrors.join(' | ')}`);
        }

        console.log('NEXUS_DATAPACK_VIEW_STATE_LAYOUT_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
