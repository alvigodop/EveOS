const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await page.waitForFunction(() => (
            typeof window.BrowserEmulator?._renderWithIframe === 'function'
        ), undefined, { timeout: 120000 });

        const result = await page.evaluate(async () => {
            window.BrowserEmulator._setupIframeListeners();
            let forgedEvents = 0;
            const forgedListener = (event) => {
                if (event.detail?.renderKey === '__forged__') forgedEvents += 1;
            };
            document.addEventListener('browser-emulator-render-complete', forgedListener);
            window.postMessage({
                type: 'browser-emulator-render-complete',
                renderKey: '__forged__',
                content: '<script>forged</script>'
            }, '*');
            await new Promise((resolve) => setTimeout(resolve, 100));
            document.removeEventListener('browser-emulator-render-complete', forgedListener);

            const output = await window.BrowserEmulator._renderWithIframe(
                'about:blank',
                '__trusted__',
                { iframeTimeout: 5000 }
            );
            return {
                forgedEvents,
                trustedOutput: typeof output === 'string' && output.includes('__trusted__'),
                leakedFrames: document.querySelectorAll('iframe[data-browser-emulator-frame="1"]').length
            };
        });

        if (result.forgedEvents !== 0) {
            throw new Error(`Untrusted renderer message was accepted: ${JSON.stringify(result)}`);
        }
        if (!result.trustedOutput || result.leakedFrames !== 0) {
            throw new Error(`Trusted renderer path failed or leaked DOM: ${JSON.stringify(result)}`);
        }
        console.log(`BROWSER_EMULATOR_IFRAME_SECURITY_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
