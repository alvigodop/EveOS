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
    const smallIconCategory = 'Hover Tiny Icons';
    categoryOrder.push(smallIconCategory);
    for (let linkIndex = 1; linkIndex <= 9; linkIndex += 1) {
        links.push({
            id: `hover-tiny-icons-${linkIndex}`,
            title: `${smallIconCategory} Link ${linkIndex}`,
            url: linkIndex === 1
                ? 'https://hover-icons-cached.example/item'
                : `https://hover-tiny-icons-${linkIndex}.example/item`,
            workspace: 'main',
            category: smallIconCategory,
            icon: '\u{1F517}',
            done: false
        });
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
        const seededIconSrc = await page.evaluate(() => {
            const dataUri = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23ff5ab3%22/%3E%3Ctext x=%2250%25%22 y=%2254%25%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 font-family=%22Arial%22 font-size=%2218%22 font-weight=%22700%22 fill=%22%23000%22%3EH%3C/text%3E%3C/svg%3E';
            window.EveFaviconCacheCore?.memoryCache?.set?.('hover-icons-cached.example', dataUri);
            return dataUri;
        });
        await page.waitForTimeout(1200);

        const before = await page.evaluate(() => ({
            cards: document.querySelectorAll('.category-card').length,
            deferred: document.querySelectorAll('.category-card[data-card-hydrate-on-demand="1"]').length,
            links: document.querySelectorAll('[data-link-id]').length
        }));

        await page.locator('.category-card[data-card-category="Hover Tiny Icons"]').hover({ timeout: 30000 });
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
        const iconResult = await page.evaluate((expectedSrc) => {
            const card = document.querySelector('.category-card[data-card-category="Hover Tiny Icons"]');
            const image = card?.querySelector('li[data-link-id="hover-tiny-icons-1"] img[data-favicon-domain="hover-icons-cached.example"]');
            return {
                cardHydrated: !!card && card.getAttribute('data-card-hydrate-on-demand') !== '1',
                imageFound: !!image,
                src: image?.getAttribute('src') || '',
                currentSrc: image?.currentSrc || '',
                matchesSeededIcon: !!image && (image.getAttribute('src') === expectedSrc || image.currentSrc === expectedSrc),
                imageCount: card ? card.querySelectorAll('img[data-favicon-domain]').length : 0
            };
        }, seededIconSrc);

        if (after.cards !== before.cards) {
            throw new Error(`Expected hover hydration to preserve cards, got ${JSON.stringify({ before, after })}`);
        }
        if (after.invisible !== 0 || after.hydrationErrors !== 0) {
            throw new Error(`Expected no invisible/error cards, got ${JSON.stringify({ before, after })}`);
        }
        if (after.links <= before.links) {
            throw new Error(`Expected hover to hydrate links, got ${JSON.stringify({ before, after })}`);
        }
        if (!iconResult.cardHydrated || !iconResult.imageFound || !iconResult.matchesSeededIcon) {
            throw new Error(`Expected small hover-hydrated card to render and refresh cached favicon images, got ${JSON.stringify({ before, after, iconResult })}`);
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
            iconResult,
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
