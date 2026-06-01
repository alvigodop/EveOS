const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function buildPayload() {
    const links = [];
    const categoryOrder = [];
    for (let categoryIndex = 1; categoryIndex <= 6; categoryIndex += 1) {
        const category = `Hover Hydrate Cat ${categoryIndex}`;
        categoryOrder.push(category);
        for (let linkIndex = 1; linkIndex <= 900; linkIndex += 1) {
            links.push({
                id: `hover-hydrate-${categoryIndex}-${linkIndex}`,
                title: `${category} Link ${linkIndex}`,
                url: `https://hover-hydrate-${categoryIndex}-${linkIndex}.example/item`,
                workspace: 'main',
                category,
                done: false
            });
        }
    }

    return {
        links,
        bookmarkFolders: {},
        config: {
            activeWorkspace: 'main',
            viewMode: 'grid',
            workspaces: [{ id: 'main', name: 'Main', icon: 'M', subTabs: [] }],
            categoryOrder,
            collapsed: [],
            collapsedTabs: [],
            foldersCollapsed: [],
            linksCollapsed: [],
            hideStats: [],
            scrollableCategories: false
        }
    };
}

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const payload = buildPayload();
    await context.addInitScript((seed) => {
        localStorage.setItem('eveV22Data', JSON.stringify(seed.links));
        localStorage.setItem('eveV22Config', JSON.stringify(seed.config));
        localStorage.setItem('eveV22BookmarkFolders', JSON.stringify(seed.bookmarkFolders));
    }, payload);

    const page = await context.newPage();
    const warnings = [];
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) warnings.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => window.__eveCoreDataLoaded === true, undefined, { timeout: 180000 });
        await page.waitForFunction(() => document.querySelectorAll('.category-card[data-card-hydrate-on-demand="1"]').length >= 1, undefined, {
            timeout: 120000
        });
        await page.waitForTimeout(1200);

        const before = await page.evaluate(() => ({
            cards: document.querySelectorAll('.category-card').length,
            deferred: document.querySelectorAll('.category-card[data-card-hydrate-on-demand="1"]').length,
            links: document.querySelectorAll('[data-link-id]').length
        }));

        await page.locator('.category-card[data-card-hydrate-on-demand="1"]').first().hover({ timeout: 30000 });
        await page.waitForTimeout(4200);

        const after = await page.evaluate(() => ({
            cards: document.querySelectorAll('.category-card').length,
            deferred: document.querySelectorAll('.category-card[data-card-hydrate-on-demand="1"]').length,
            links: document.querySelectorAll('[data-link-id]').length,
            invisible: Array.from(document.querySelectorAll('.category-card')).filter((card) => {
                const style = getComputedStyle(card);
                return style.opacity === '0' || style.display === 'none' || card.offsetHeight === 0;
            }).length,
            hydrationErrors: document.querySelectorAll('[data-card-hydration-error="1"]').length
        }));

        if (after.cards !== before.cards) {
            throw new Error(`Expected hover hydration to preserve cards, got ${JSON.stringify({ before, after })}`);
        }
        if (after.invisible !== 0 || after.hydrationErrors !== 0) {
            throw new Error(`Expected no invisible/error cards, got ${JSON.stringify({ before, after })}`);
        }
        if (after.links <= before.links) {
            throw new Error(`Expected hover to hydrate links, got ${JSON.stringify({ before, after })}`);
        }

        const showMoreCount = await page.locator('.eve-show-more-btn').count();
        if (showMoreCount > 0) {
            await page.locator('.eve-show-more-btn').first().hover({ timeout: 30000 });
            await page.waitForTimeout(900);
            const afterShowMore = await page.evaluate(() => ({
                cards: document.querySelectorAll('.category-card').length,
                links: document.querySelectorAll('[data-link-id]').length,
                invisible: Array.from(document.querySelectorAll('.category-card')).filter((card) => {
                    const style = getComputedStyle(card);
                    return style.opacity === '0' || style.display === 'none' || card.offsetHeight === 0;
                }).length
            }));
            if (afterShowMore.cards !== before.cards || afterShowMore.invisible !== 0) {
                throw new Error(`Expected progressive hover to preserve cards, got ${JSON.stringify({ before, after, afterShowMore })}`);
            }
            after.afterShowMore = afterShowMore;
        }

        console.log('DEFERRED_CARD_HOVER_HYDRATION_BROWSER_SMOKE_OK', JSON.stringify({
            before,
            after,
            warnings: warnings.slice(-5)
        }));
    } finally {
        await context.close();
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
