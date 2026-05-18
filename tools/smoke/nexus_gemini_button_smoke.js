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
            && !!window.EveOS?.SearchAdvanced?.Modules?.createUiFormHelpers
            && !!document.getElementById('loadingIndicator')
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => {
            const indicator = document.getElementById('loadingIndicator');
            indicator.classList.add('compact');
            indicator.classList.remove('visible');
            indicator.style.display = 'none';
            if (window.LoadingIndicator) window.LoadingIndicator._loadingIndicatorCompact = true;
            window.openExpandedSearchModal({ autoSearch: false });
        });
        await page.waitForSelector('#expandedSearchModal', { timeout: 10000 });
        await page.locator('#nxGeminiLinkBtn').click();

        await page.waitForFunction(() => {
            const indicator = document.getElementById('loadingIndicator');
            const root = document.getElementById('gemini-ui-root');
            return !!indicator
                && indicator.style.display !== 'none'
                && indicator.classList.contains('visible')
                && !indicator.classList.contains('compact')
                && !!root;
        }, undefined, { timeout: 15000 });

        const result = await page.evaluate(() => {
            const indicator = document.getElementById('loadingIndicator');
            const root = document.getElementById('gemini-ui-root');
            const fullBtn = root?.querySelector('[data-gemini-monitor-view-btn="full"]');
            return {
                display: indicator?.style.display || '',
                visible: !!indicator?.classList.contains('visible'),
                compact: !!indicator?.classList.contains('compact'),
                rootExists: !!root,
                monitorView: root?.dataset.geminiMonitorView || '',
                fullActive: !!fullBtn?.classList.contains('active'),
                bootRequested: !!window.__GEMINI_BOOT_REQUESTED
            };
        });

        assert(result.visible && !result.compact && result.display !== 'none', `Search Monitor did not open: ${JSON.stringify(result)}`);
        assert(result.rootExists, `Gemini root did not exist after button click: ${JSON.stringify(result)}`);
        assert(result.monitorView === 'full' || result.fullActive || result.bootRequested, `Gemini workspace was not requested: ${JSON.stringify(result)}`);

        if (pageErrors.length) {
            throw new Error(`Page errors during Nexus Gemini button smoke: ${pageErrors.join(' | ')}`);
        }

        console.log('NEXUS_GEMINI_BUTTON_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
