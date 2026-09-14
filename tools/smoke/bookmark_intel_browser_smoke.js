/**
 * bookmark_intel_browser_smoke.js
 *
 * Playwright deterministic browser qualification for Bookmark Intel:
 * - Mounts EveOS in Chromium
 * - Opens card settings modal and navigates to Scraper
 * - Verifies Bookmark Intel button exists in Knowledge Bases cluster
 * - Performs real pointer click to activate Bookmark Intel
 * - Validates panel mounting, hero header, status badge, action controls, and DOM rects
 * - Verifies detached and expand/collapse workspace controls without reloading the iframe
 * - Verifies switching away restores the normal Scraper split layout
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

        await page.waitForFunction(() => (
            typeof window.openCategorySettings === 'function'
            && typeof window.switchCategoryTab === 'function'
            && !!document.getElementById('categorySettingsModal')
            && !!window.BookmarkIntelManager
        ), undefined, { timeout: 60000 });

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

        await page.waitForSelector('#categorySettingsModal .scraper-ui-wrapper', { timeout: 10000 });

        const biButton = await page.waitForSelector('.source-toggle-btn[data-source="bookmark-intel"]', { timeout: 10000 });
        if (!biButton) {
            throw new Error('Bookmark Intel source toggle button missing from Knowledge Bases');
        }

        const btnBox = await biButton.boundingBox();
        if (!btnBox || btnBox.width < 50 || btnBox.height < 20) {
            throw new Error(`Bookmark Intel button geometry collapsed: ${JSON.stringify(btnBox)}`);
        }

        await biButton.click();
        await page.waitForTimeout(400);

        const isActive = await page.evaluate(() => {
            const btn = document.querySelector('.source-toggle-btn[data-source="bookmark-intel"]');
            return btn ? btn.classList.contains('active') : false;
        });
        if (!isActive) {
            throw new Error('Bookmark Intel button did not receive active class after click');
        }

        const panelVisible = await page.evaluate(() => {
            const panel = document.getElementById('bookmarkIntelManagement');
            if (!panel) return false;
            return window.getComputedStyle(panel).display !== 'none';
        });
        if (!panelVisible) {
            throw new Error('#bookmarkIntelManagement panel is not displayed after tab switch');
        }

        const panelState = await page.evaluate(() => {
            const container = document.getElementById('bookmark-intel-scraper-panel-container');
            if (!container) return { ok: false, reason: 'container missing' };
            const title = container.querySelector('.api-scraper-provider-title')?.textContent?.trim() || '';
            const kicker = container.querySelector('.api-scraper-kicker')?.textContent?.trim() || '';
            const badge = container.querySelector('.bookmark-intel-badge')?.textContent?.trim() || '';
            const popout = container.querySelector('.btn-bi-popout');
            const popoutHref = popout?.getAttribute('href') || '';
            const popoutText = popout?.textContent?.trim() || '';
            const expand = container.querySelector('.btn-bi-expand');
            const expandText = expand?.textContent?.trim() || '';
            const expandPressed = expand?.getAttribute('aria-pressed') || '';
            const hasFrame = !!container.querySelector('#bookmark-intel-frame');
            const frameSrc = container.querySelector('#bookmark-intel-frame')?.getAttribute('src') || '';
            const hasOfflineCard = !!container.querySelector('.btn-bi-start-hero');

            return {
                ok: title === 'Bookmark Intel',
                title,
                kicker,
                badge,
                popoutHref,
                popoutText,
                expandText,
                expandPressed,
                hasFrame,
                frameSrc,
                hasOfflineCard
            };
        });

        if (!panelState.ok) {
            throw new Error(`Bookmark Intel panel rendered unexpected title: ${panelState.title}`);
        }
        if (!panelState.popoutHref.includes('9077')) {
            throw new Error(`Bookmark Intel detached link does not point to port 9077: ${panelState.popoutHref}`);
        }
        if (!/^Detached\s*↗?$/.test(panelState.popoutText)) {
            throw new Error(`Bookmark Intel popout control is not labelled Detached: ${panelState.popoutText}`);
        }
        if (!panelState.expandText.startsWith('Expand') || panelState.expandPressed !== 'false') {
            throw new Error(`Bookmark Intel expand control has unexpected initial state: ${panelState.expandText}/${panelState.expandPressed}`);
        }

        const containerBox = await page.locator('#bookmark-intel-scraper-panel-container').boundingBox();
        if (!containerBox || containerBox.width < 300 || containerBox.height < 200) {
            throw new Error(`Bookmark Intel container geometry collapsed: ${JSON.stringify(containerBox)}`);
        }

        const popoutButton = await page.waitForSelector('#bookmark-intel-scraper-panel-container .btn-bi-popout');
        const popoutBox = await popoutButton.boundingBox();
        if (!popoutBox || popoutBox.width < 30) {
            throw new Error(`Detached button geometry collapsed: ${JSON.stringify(popoutBox)}`);
        }

        const baseline = await page.evaluate(() => {
            const layout = document.querySelector('#categorySettingsModal .app-layout');
            const main = layout?.querySelector(':scope > .main-column');
            const sidebar = layout?.querySelector(':scope > .sidebar-column');
            const frame = document.getElementById('bookmark-intel-frame');
            return {
                sidebarWidth: sidebar?.getBoundingClientRect().width || 0,
                mainDisplay: main ? getComputedStyle(main).display : '',
                frameSrc: frame?.getAttribute('src') || ''
            };
        });

        const expandButton = await page.waitForSelector('#bookmark-intel-scraper-panel-container .btn-bi-expand');
        await expandButton.click();
        await page.waitForTimeout(120);

        const expanded = await page.evaluate(() => {
            const layout = document.querySelector('#categorySettingsModal .app-layout');
            const main = layout?.querySelector(':scope > .main-column');
            const sidebar = layout?.querySelector(':scope > .sidebar-column');
            const button = document.querySelector('#bookmark-intel-scraper-panel-container .btn-bi-expand');
            const frame = document.getElementById('bookmark-intel-frame');
            return {
                active: !!layout?.classList.contains('bookmark-intel-workspace-expanded'),
                mainDisplay: main ? getComputedStyle(main).display : '',
                sidebarWidth: sidebar?.getBoundingClientRect().width || 0,
                buttonText: button?.textContent?.trim() || '',
                pressed: button?.getAttribute('aria-pressed') || '',
                frameSrc: frame?.getAttribute('src') || ''
            };
        });

        if (!expanded.active || expanded.mainDisplay !== 'none') {
            throw new Error(`Bookmark Intel expanded layout did not hide result column: ${JSON.stringify(expanded)}`);
        }
        if (expanded.sidebarWidth <= baseline.sidebarWidth + 80) {
            throw new Error(`Bookmark Intel expanded layout did not gain meaningful width: ${baseline.sidebarWidth} -> ${expanded.sidebarWidth}`);
        }
        if (!expanded.buttonText.startsWith('Collapse') || expanded.pressed !== 'true') {
            throw new Error(`Bookmark Intel expand control did not switch to Collapse: ${expanded.buttonText}/${expanded.pressed}`);
        }
        if (baseline.frameSrc && expanded.frameSrc !== baseline.frameSrc) {
            throw new Error(`Expanding Bookmark Intel replaced/reloaded the iframe source: ${baseline.frameSrc} -> ${expanded.frameSrc}`);
        }

        await expandButton.click();
        await page.waitForTimeout(80);
        const collapsed = await page.evaluate(() => {
            const layout = document.querySelector('#categorySettingsModal .app-layout');
            const main = layout?.querySelector(':scope > .main-column');
            const button = document.querySelector('#bookmark-intel-scraper-panel-container .btn-bi-expand');
            return {
                active: !!layout?.classList.contains('bookmark-intel-workspace-expanded'),
                mainDisplay: main ? getComputedStyle(main).display : '',
                buttonText: button?.textContent?.trim() || '',
                pressed: button?.getAttribute('aria-pressed') || ''
            };
        });
        if (collapsed.active || collapsed.mainDisplay === 'none' || !collapsed.buttonText.startsWith('Expand') || collapsed.pressed !== 'false') {
            throw new Error(`Bookmark Intel Collapse did not restore split layout: ${JSON.stringify(collapsed)}`);
        }

        await expandButton.click();
        await page.waitForTimeout(60);
        await page.locator('.source-toggle-btn[data-source="wikipedia"]').click();
        await page.waitForTimeout(120);
        const restoredOnSwitch = await page.evaluate(() => {
            const layout = document.querySelector('#categorySettingsModal .app-layout');
            const main = layout?.querySelector(':scope > .main-column');
            return {
                expanded: !!layout?.classList.contains('bookmark-intel-workspace-expanded'),
                mainDisplay: main ? getComputedStyle(main).display : ''
            };
        });
        if (restoredOnSwitch.expanded || restoredOnSwitch.mainDisplay === 'none') {
            throw new Error(`Switching away from Bookmark Intel left expanded layout active: ${JSON.stringify(restoredOnSwitch)}`);
        }

        if (pageErrors.length > 0) {
            throw new Error(`Uncaught browser page errors during test: ${pageErrors.join(' | ')}`);
        }

        console.log(`BOOKMARK_INTEL_BROWSER_SMOKE_OK ${JSON.stringify({
            title: panelState.title,
            badge: panelState.badge,
            detachedHref: panelState.popoutHref,
            baselineWidth: baseline.sidebarWidth,
            expandedWidth: expanded.sidebarWidth,
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
