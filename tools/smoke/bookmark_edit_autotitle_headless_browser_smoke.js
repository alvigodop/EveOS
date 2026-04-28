const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.fetchTitle === 'function'
        && typeof window.getTitleFromUrl === 'function'
        && typeof window.getTitleFromUrlHeadless === 'function'
        && !!document.getElementById('newUrl')
        && !!document.getElementById('newTitle')
        && !!document.getElementById('newCoverImage')
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(async () => {
            const toastMessages = [];
            const originalShowToast = window.showToast;
            window.showToast = function (message, type) {
                toastMessages.push({ message, type });
                if (typeof originalShowToast === 'function') {
                    return originalShowToast.apply(this, arguments);
                }
            };

            let baseCalls = 0;
            let slowBaseCalls = 0;
            let headlessCalls = 0;
            let lastBaseOptions = null;
            const originalGetTitleFromUrl = window.getTitleFromUrl;
            const originalGetTitleFromUrlHeadless = window.getTitleFromUrlHeadless;

            window.getTitleFromUrl = async function (url, options) {
                baseCalls += 1;
                lastBaseOptions = JSON.parse(JSON.stringify(options || {}));
                return {
                    title: 'Correct Title',
                    source: 'Lightpanda',
                    isFallback: false,
                    coverUrl: 'https://example.com/thumbs/preview-small.jpg'
                };
            };

            window.getTitleFromUrlHeadless = async function () {
                headlessCalls += 1;
                return {
                    title: 'Correct Title',
                    source: 'Camofox',
                    coverUrl: 'https://example.com/poster/main-cover.jpg',
                    icon: 'https://example.com/favicon.ico'
                };
            };

            document.getElementById('newUrl').value = 'https://example.com/test-page';
            document.getElementById('newTitle').value = '';
            document.getElementById('newCoverImage').value = '';

            const button = document.querySelector('#addModal button[onclick="fetchTitle(this)"]');
            if (!button) {
                throw new Error('Auto-fetch button not found');
            }

            await window.fetchTitle(button);
            const fastDefault = {
                baseCalls,
                headlessCalls,
                lastBaseOptions,
                title: document.getElementById('newTitle').value,
                coverUrl: document.getElementById('newCoverImage').value
            };

            document.getElementById('newTitle').value = '';
            document.getElementById('newCoverImage').value = '';
            button.dataset.allowSlowAutotitle = 'true';
            window.getTitleFromUrl = async function (url, options) {
                slowBaseCalls += 1;
                lastBaseOptions = JSON.parse(JSON.stringify(options || {}));
                return {
                    title: 'Correct Title',
                    source: 'Lightpanda',
                    isFallback: false,
                    coverUrl: 'https://example.com/thumbs/preview-small.jpg'
                };
            };

            try {
                await window.fetchTitle(button);
            } finally {
                delete button.dataset.allowSlowAutotitle;
                window.getTitleFromUrl = originalGetTitleFromUrl;
                window.getTitleFromUrlHeadless = originalGetTitleFromUrlHeadless;
                window.showToast = originalShowToast;
            }

            return {
                fastDefault,
                slowBaseCalls,
                headlessCalls,
                title: document.getElementById('newTitle').value,
                coverUrl: document.getElementById('newCoverImage').value,
                lastToast: toastMessages[toastMessages.length - 1] || null
            };
        });

        if (result.fastDefault.baseCalls !== 1) {
            throw new Error(`Expected one default base autotitle call, saw ${result.fastDefault.baseCalls}`);
        }
        if (result.fastDefault.headlessCalls !== 0) {
            throw new Error(`Expected default auto-title to avoid headless follow-up, saw ${result.fastDefault.headlessCalls}`);
        }
        if (!result.fastDefault.lastBaseOptions?.fastTitleOnly || result.fastDefault.lastBaseOptions?.allowSlowCover) {
            throw new Error(`Expected default auto-title to request fast title mode, saw ${JSON.stringify(result.fastDefault.lastBaseOptions)}`);
        }
        if (result.fastDefault.title !== 'Correct Title') {
            throw new Error(`Expected fast default title to populate, saw ${result.fastDefault.title}`);
        }
        if (result.slowBaseCalls !== 1) {
            throw new Error(`Expected one slow opt-in base autotitle call, saw ${result.slowBaseCalls}`);
        }
        if (result.headlessCalls !== 1) {
            throw new Error(`Expected one headless follow-up call, saw ${result.headlessCalls}`);
        }
        if (result.title !== 'Correct Title') {
            throw new Error(`Expected title field to stay correct after headless merge, saw ${result.title}`);
        }
        if (result.coverUrl !== 'https://example.com/poster/main-cover.jpg') {
            throw new Error(`Expected Camofox cover to populate field, saw ${result.coverUrl}`);
        }

        console.log('BOOKMARK_EDIT_AUTOTITLE_HEADLESS_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
