const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

(async () => {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => (
            !!window.EveFaviconCacheCore
            && typeof window.EveFaviconCache?.fetchAndCache === 'function'
            && typeof window.EveFaviconUtils?.getFallbackSrc === 'function'
        ), undefined, { timeout: 120000 });

        const result = await page.evaluate(async () => {
            const core = window.EveFaviconCacheCore;
            const domain = 'late-cache-dom-update.eveos.local';
            const expectedSrc = [
                'data:image/svg+xml;charset=UTF-8,',
                encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">'
                    + '<rect width="32" height="32" rx="7" fill="#11c5d9"/>'
                    + '<path d="M8 16h16" stroke="#071317" stroke-width="4"/>'
                    + '</svg>'
                )
            ].join('');
            const fixture = document.createElement('div');
            fixture.id = 'favicon-late-cache-smoke-fixture';
            const oldDiskLoaded = core.diskLoaded;
            const oldDiskLoadPromise = core.diskLoadPromise;
            const oldDiskCache = core.diskCache;

            try {
                // The old updater abandoned all icon replacements once the page had
                // more than 2,500 images, which is realistic for large EveOS packs.
                const imageLoad = document.createDocumentFragment();
                for (let index = 0; index < 2501; index += 1) {
                    imageLoad.appendChild(document.createElement('img'));
                }
                fixture.appendChild(imageLoad);

                const dockIcon = document.createElement('img');
                dockIcon.className = 'dock-icon';
                dockIcon.dataset.faviconDomain = domain;
                dockIcon.dataset.faviconSize = '32';
                dockIcon.src = window.EveFaviconUtils.getFallbackSrc(domain, 32);
                fixture.appendChild(dockIcon);
                document.body.appendChild(fixture);

                core.memoryCache.delete(domain);
                core.diskLoaded = false;
                core.diskCache = Object.assign({}, oldDiskCache);
                core.diskLoadPromise = new Promise((resolve) => {
                    setTimeout(() => {
                        core.memoryCache.set(domain, expectedSrc);
                        core.diskLoaded = true;
                        resolve(core.diskCache);
                    }, 30);
                });

                const resolvedSrc = await window.EveFaviconCache.fetchAndCache(domain, 32);
                await new Promise((resolve) => setTimeout(resolve, 360));

                return {
                    resolvedSrc,
                    renderedSrc: dockIcon.getAttribute('src') || '',
                    currentSrc: dockIcon.currentSrc || '',
                    imageCount: document.images.length,
                    fallbackApplied: dockIcon.dataset.fallbackApplied || '',
                    updatedWithoutReload: (
                        dockIcon.getAttribute('src') === expectedSrc
                        || dockIcon.currentSrc === expectedSrc
                    )
                };
            } finally {
                fixture.remove();
                core.memoryCache.delete(domain);
                core.diskLoaded = oldDiskLoaded;
                core.diskLoadPromise = oldDiskLoadPromise;
                core.diskCache = oldDiskCache;
            }
        });

        if (result.resolvedSrc !== result.renderedSrc || !result.updatedWithoutReload) {
            throw new Error(`Expected late cache hydration to update the visible icon without reload, got ${JSON.stringify(result)}`);
        }
        if (result.imageCount <= 2500) {
            throw new Error(`Expected the regression fixture to exceed the former image-count cutoff, got ${JSON.stringify(result)}`);
        }

        console.log('FAVICON_LATE_CACHE_DOM_UPDATE_BROWSER_SMOKE_OK');
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
