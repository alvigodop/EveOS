/**
 * bookmark_intel_browser_smoke.js
 *
 * Playwright deterministic browser qualification for Bookmark Intel:
 * - Mounts EveOS in Chromium
 * - Opens card settings modal and navigates to Scraper
 * - Verifies Bookmark Intel button exists in Knowledge Bases cluster
 * - Performs real pointer click to activate Bookmark Intel
 * - Validates panel mounting, hero header, status badge, action controls, and DOM rects
 * - Verifies no page errors or geometry collapse
 */

const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];

    page.on('pageerror', (error) => {
        pageErrors.push(error?.stack || String(error));
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });

        // Wait for core application methods
        await page.waitForFunction(() => (
            typeof window.openCategorySettings === 'function'
            && typeof window.switchCategoryTab === 'function'
            && !!document.getElementById('categorySettingsModal')
            && !!window.BookmarkIntelManager
        ), undefined, { timeout: 60000 });

        // Open Category Settings modal for a test card workspace
        await page.evaluate(async () => {
            const categories = window.StorageManager?.getCategories?.() || [];
            const targetCategory = categories[0] || 'Default';
            if (window.openCategorySettings) {
                window.openCategorySettings(targetCategory);
            }
            if (window.switchCategoryTab) {
                window.switchCategoryTab('scraper');
            }
        });

        // Wait for scraper panel to mount
        await page.waitForSelector('#categorySettingsModal .scraper-ui-wrapper', { timeout: 10000 });

        // Locate Bookmark Intel toggle button
        const biButton = await page.waitForSelector('.source-toggle-btn[data-source="bookmark-intel"]', { timeout: 10000 });
        if (!biButton) {
            throw new Error('Bookmark Intel source toggle button missing from Knowledge Bases');
        }

        // Verify button bounding box is healthy (not collapsed)
        const btnBox = await biButton.boundingBox();
        if (!btnBox || btnBox.width < 50 || btnBox.height < 20) {
            throw new Error(`Bookmark Intel button geometry collapsed: ${JSON.stringify(btnBox)}`);
        }

        // Real pointer click on Bookmark Intel button
        await biButton.click();
        await page.waitForTimeout(400);

        // Verify button is marked active
        const isActive = await page.evaluate(() => {
            const btn = document.querySelector('.source-toggle-btn[data-source="bookmark-intel"]');
            return btn ? btn.classList.contains('active') : false;
        });
        if (!isActive) {
            throw new Error('Bookmark Intel button did not receive active class after click');
        }

        // Verify #bookmarkIntelManagement is visible
        const panelVisible = await page.evaluate(() => {
            const panel = document.getElementById('bookmarkIntelManagement');
            if (!panel) return false;
            return window.getComputedStyle(panel).display !== 'none';
        });
        if (!panelVisible) {
            throw new Error('#bookmarkIntelManagement panel is not displayed after tab switch');
        }

        // Verify panel content and header rendered by BookmarkIntelManager
        const panelState = await page.evaluate(() => {
            const container = document.getElementById('bookmark-intel-scraper-panel-container');
            if (!container) return { ok: false, reason: 'container missing' };
            const title = container.querySelector('.api-scraper-provider-title')?.textContent?.trim() || '';
            const kicker = container.querySelector('.api-scraper-kicker')?.textContent?.trim() || '';
            const badge = container.querySelector('.bookmark-intel-badge')?.textContent?.trim() || '';
            const popout = container.querySelector('.btn-bi-popout');
            const popoutHref = popout?.getAttribute('href') || '';
            const hasFrame = !!container.querySelector('#bookmark-intel-frame');
            const hasOfflineCard = !!container.querySelector('.btn-bi-start-hero');

            return {
                ok: title === 'Bookmark Intel',
                title,
                kicker,
                badge,
                popoutHref,
                hasFrame,
                hasOfflineCard
            };
        });

        if (!panelState.ok) {
            throw new Error(`Bookmark Intel panel rendered unexpected title: ${panelState.title}`);
        }
        if (!panelState.popoutHref.includes('9077')) {
            throw new Error(`Bookmark Intel popout link does not point to port 9077: ${panelState.popoutHref}`);
        }

        // Measure container DOM rect
        const containerBox = await page.locator('#bookmark-intel-scraper-panel-container').boundingBox();
        if (!containerBox || containerBox.width < 300 || containerBox.height < 200) {
            throw new Error(`Bookmark Intel container geometry collapsed: ${JSON.stringify(containerBox)}`);
        }

        // Test pointer interaction with popout link existence
        const popoutButton = await page.waitForSelector('#bookmark-intel-scraper-panel-container .btn-bi-popout');
        const popoutBox = await popoutButton.boundingBox();
        if (!popoutBox || popoutBox.width < 30) {
            throw new Error(`Popout button geometry collapsed: ${JSON.stringify(popoutBox)}`);
        }

        if (pageErrors.length > 0) {
            throw new Error(`Uncaught browser page errors during test: ${pageErrors.join(' | ')}`);
        }

        console.log(`BOOKMARK_INTEL_BROWSER_SMOKE_OK ${JSON.stringify({
            title: panelState.title,
            badge: panelState.badge,
            popoutHref: panelState.popoutHref,
            containerWidth: containerBox.width,
            containerHeight: containerBox.height
        })}`);
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
