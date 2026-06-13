const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 520, height: 700 } });
    const pageErrors = [];
    let mockRunning = false;
    let credentialSaves = 0;

    page.on('pageerror', (error) => {
        pageErrors.push(error?.stack || String(error));
    });

    await page.addInitScript(() => {
        window.__geminiSmokeSends = [];
        class MockWebSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;

            constructor(url) {
                this.url = url;
                this.readyState = MockWebSocket.CONNECTING;
                setTimeout(() => {
                    this.readyState = MockWebSocket.OPEN;
                    this.onopen?.({ type: 'open' });
                }, 20);
            }

            send(payload) {
                window.__geminiSmokeSends.push(String(payload));
            }

            close() {
                this.readyState = MockWebSocket.CLOSED;
                this.onclose?.({ code: 1000, reason: 'smoke', wasClean: true });
            }
        }
        window.WebSocket = MockWebSocket;
        try {
            localStorage.setItem('eve.geminiMonitorView', 'summary');
            localStorage.setItem('geminiConnectionEnabled', 'false');
            localStorage.setItem('geminiApiKey', 'browser-smoke-key-1234567890');
        } catch (error) {
            // file:// storage may be restricted in some browser builds.
        }
    });

    await page.route(/http:\/\/127\.0\.0\.1:(?:3000|8765)\/api\/gemini-server\/(?:status|start|stop)/, async (route) => {
        const url = route.request().url();
        if (url.endsWith('/start')) mockRunning = true;
        if (url.endsWith('/stop')) mockRunning = false;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                running: mockRunning,
                state: mockRunning ? 'running' : 'stopped',
                message: mockRunning ? 'Gemini server is running.' : 'Gemini server stopped.'
            })
        });
    });
    await page.route('http://127.0.0.1:9084/status', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: mockRunning ? 'running' : 'stopped' })
        });
    });
    await page.route(/http:\/\/127\.0\.0\.1:(?:3000|8765)\/api\/gemini-credentials(?:\/status)?/, async (route) => {
        const isSave = route.request().method() === 'POST';
        if (isSave) credentialSaves += 1;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                configured: isSave || credentialSaves > 0,
                protection: 'windows-dpapi'
            })
        });
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await page.waitForFunction(() => (
            !!window.SearchMonitorBoot
            && !!window.GeminiServerControl
            && !!document.querySelector('[data-gemini-server-toggle]')
        ), undefined, { timeout: 120000 });

        await page.evaluate(() => window.SearchMonitorBoot.expand());
        await page.click('[data-gemini-server-toggle]');
        await page.click('[data-gemini-monitor-view-btn="full"]');

        await page.waitForFunction(() => (
            !!window.__GEMINI_WORKSPACE_READY
            && !!window.__GEMINI_SOCKET_READY
            && document.getElementById('textInput')?.dataset.geminiTextInputBound === '1'
            && document.getElementById('sendButton')?.dataset.geminiTextInputBound === '1'
            && ['requesting', 'requested', 'connected', 'initializing'].includes(
                document.querySelector('[data-gemini-server-control]')?.dataset.connectionPhase
            )
        ), undefined, { timeout: 120000 });

        await page.fill('#textInput', 'Gemini lifecycle smoke');
        await page.click('#sendButton');
        await page.waitForFunction(() => (
            window.__geminiSmokeSends.some((payload) => payload.includes('Gemini lifecycle smoke'))
        ), undefined, { timeout: 10000 });

        await page.click('.monitor-wide-toggle');
        const wideClass = await page.locator('#loadingIndicator').getAttribute('class');
        if (!wideClass.includes('wide-mode')) {
            throw new Error(`Wide control did not activate: ${wideClass}`);
        }

        await page.click('.monitor-fullscreen-toggle');
        const fullscreenClass = await page.locator('#loadingIndicator').getAttribute('class');
        if (!fullscreenClass.includes('fullscreen-mode') || fullscreenClass.includes('wide-mode')) {
            throw new Error(`Fullscreen control did not activate exclusively: ${fullscreenClass}`);
        }

        const narrowLayout = await page.evaluate(() => {
            const indicator = document.getElementById('loadingIndicator');
            const root = document.getElementById('gemini-ui-root');
            const indicatorBox = indicator.getBoundingClientRect();
            const rootBox = root.getBoundingClientRect();
            return {
                viewport: { width: innerWidth, height: innerHeight },
                indicator: {
                    left: indicatorBox.left,
                    top: indicatorBox.top,
                    right: indicatorBox.right,
                    bottom: indicatorBox.bottom
                },
                root: {
                    top: rootBox.top,
                    bottom: rootBox.bottom,
                    clientHeight: root.clientHeight,
                    scrollHeight: root.scrollHeight,
                    overflowY: getComputedStyle(root).overflowY
                },
                sends: window.__geminiSmokeSends.length,
                promptSends: window.__geminiSmokeSends.filter((payload) => payload.includes('Gemini lifecycle smoke')).length,
                inputValue: document.getElementById('textInput').value
            };
        });

        if (narrowLayout.indicator.left < -3 || narrowLayout.indicator.top < -3
            || narrowLayout.indicator.right > narrowLayout.viewport.width + 1
            || narrowLayout.indicator.bottom > narrowLayout.viewport.height + 1) {
            throw new Error(`Search Monitor escaped the narrow viewport: ${JSON.stringify(narrowLayout)}`);
        }
        if (narrowLayout.root.bottom > narrowLayout.viewport.height + 1
            || narrowLayout.root.overflowY !== 'auto'
            || narrowLayout.root.scrollHeight <= narrowLayout.root.clientHeight) {
            throw new Error(`Gemini workspace does not have a bounded scroll area: ${JSON.stringify(narrowLayout)}`);
        }
        if (narrowLayout.promptSends !== 1 || narrowLayout.inputValue !== '') {
            throw new Error(`Gemini Send handler was not functional: ${JSON.stringify(narrowLayout)}`);
        }
        if (credentialSaves < 1) {
            throw new Error('Saved browser credentials were not synchronized before Gemini startup.');
        }

        await page.setViewportSize({ width: 768, height: 720 });
        await page.waitForTimeout(300);
        const mediumLayout = await page.evaluate(() => {
            const indicator = document.getElementById('loadingIndicator');
            const root = document.getElementById('gemini-ui-root');
            const input = document.getElementById('textInput');
            root.scrollTop = root.scrollHeight;
            const indicatorBox = indicator.getBoundingClientRect();
            const inputBox = input.getBoundingClientRect();
            return {
                viewport: { width: innerWidth, height: innerHeight },
                indicatorRight: indicatorBox.right,
                indicatorBottom: indicatorBox.bottom,
                inputTop: inputBox.top,
                inputBottom: inputBox.bottom,
                rootScrollTop: root.scrollTop,
                rootScrollHeight: root.scrollHeight,
                rootClientHeight: root.clientHeight
            };
        });
        if (mediumLayout.indicatorRight > mediumLayout.viewport.width + 1
            || mediumLayout.indicatorBottom > mediumLayout.viewport.height + 1
            || mediumLayout.inputBottom > mediumLayout.viewport.height + 1
            || mediumLayout.inputTop < -1
            || mediumLayout.rootScrollTop <= 0) {
            throw new Error(`Gemini workspace was not usable at medium size: ${JSON.stringify(mediumLayout)}`);
        }

        await page.setViewportSize({ width: 1600, height: 1100 });
        await page.waitForTimeout(500);
        const wideLayout = await page.evaluate(() => {
            const indicator = document.getElementById('loadingIndicator').getBoundingClientRect();
            return {
                viewport: { width: innerWidth, height: innerHeight },
                left: indicator.left,
                top: indicator.top,
                right: indicator.right,
                bottom: indicator.bottom
            };
        });
        if (wideLayout.left < -3 || wideLayout.top < -3
            || wideLayout.right > wideLayout.viewport.width + 1
            || wideLayout.bottom > wideLayout.viewport.height + 1) {
            throw new Error(`Search Monitor escaped the wide viewport: ${JSON.stringify(wideLayout)}`);
        }
        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }

        console.log(`GEMINI_DYNAMIC_LIFECYCLE_BROWSER_SMOKE_OK ${JSON.stringify({
            narrowLayout,
            mediumLayout,
            credentialSaves,
            wideLayout
        })}`);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
});
