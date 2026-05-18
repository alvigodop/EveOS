const path = require('path');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const { browser } = await launchChromiumOrConnect({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
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

        await page.evaluate(() => window.openExpandedSearchModal({ autoSearch: false }));
        await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });

        const initial = await page.evaluate(() => ({
            jumpButtons: Array.from(document.querySelectorAll('.nx-jump-btn[data-nx-jump]')).map((button) => button.getAttribute('data-nx-jump')),
            hasQuerySection: !!document.getElementById('nxQuerySection'),
            hasVectorSection: !!document.getElementById('nxVectorSection'),
            hasResultsBody: !!document.getElementById('esResults')
        }));
        assert(initial.jumpButtons.join('|') === 'query|vectors|filters|debug|state|results', `Unexpected Nexus jump rail: ${JSON.stringify(initial)}`);
        assert(initial.hasQuerySection && initial.hasVectorSection && initial.hasResultsBody, `Missing Nexus navigation landmarks: ${JSON.stringify(initial)}`);

        await page.locator('[data-nx-jump="filters"]').click();
        await page.waitForFunction(() => document.getElementById('nxFiltersConfig')?.open, undefined, { timeout: 5000 });

        await page.locator('[data-nx-jump="debug"]').click();
        await page.waitForFunction(() => document.getElementById('nxDebugSection')?.open, undefined, { timeout: 5000 });

        await page.locator('[data-nx-jump="state"]').click();
        await page.waitForSelector('#nxDatapackViewPanel', { timeout: 10000 });

        await page.locator('[data-nx-jump="results"]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'esResults', undefined, { timeout: 5000 });

        await page.locator('[data-nx-jump="query"]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'esQuery', undefined, { timeout: 5000 });

        if (pageErrors.length) {
            throw new Error(`Page errors during Nexus navigation smoke: ${pageErrors.join(' | ')}`);
        }

        console.log('NEXUS_NAVIGATION_UI_SMOKE_OK');
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
