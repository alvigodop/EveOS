const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TOKEN = 'MatrixWindowModeSmoke12';
const CONTROL_PORT = 61234;
const FILE_URL = 'file:///' + path.join(
    REPO_ROOT, 'tools', 'workshop', 'MatrixBackground-V2-Upgrading.html'
).replace(/\\/g, '/') + `?eveMatrixDetached=1&eveMatrixWindowToken=${TOKEN}&eveMatrixControlPort=${CONTROL_PORT}`;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const controlCalls = [];

    await page.route(`http://127.0.0.1:${CONTROL_PORT}/api/matrix-window/control`, async (route) => {
        const body = route.request().postDataJSON();
        controlCalls.push(body);
        if (body.action === 'immersive-taskbar' && body.enabled) {
            await new Promise(resolve => setTimeout(resolve, 40));
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                supported: true,
                backgroundLocked: body.action === 'background-lock' && body.enabled === true,
                taskbarAutoHide: body.action === 'immersive-taskbar' && body.enabled === true,
                message: body.enabled ? 'enabled' : 'disabled'
            })
        });
    });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => !!window.EveMatrixWindowMode, null, { timeout: 30000 });
        await page.waitForTimeout(100);

        const boot = await page.evaluate(() => ({
            detached: window.EveMatrixWindowMode.isDetached(),
            token: window.EveMatrixWindowMode.getWindowToken(),
            title: document.title,
            checkbox: !!document.getElementById('matrixBackgroundLockCheckbox'),
            fullscreenButton: !!document.getElementById('matrixImmersiveFullscreenButton')
        }));
        assert(boot.detached && boot.token === TOKEN, `detached mode metadata mismatch: ${JSON.stringify(boot)}`);
        assert(boot.title.includes(TOKEN), `detached title was not uniquely tagged: ${boot.title}`);
        assert(boot.checkbox && boot.fullscreenButton, `window-mode controls missing: ${JSON.stringify(boot)}`);

        await page.click('#toggleToolbar');
        await page.click('#system-section .section-header');
        controlCalls.length = 0;

        await page.check('#matrixBackgroundLockCheckbox');
        await page.waitForFunction(() => window.EveMatrixWindowMode.isBackgroundLocked() === true);
        assert(
            controlCalls.some(call => (
                call.token === TOKEN
                && call.action === 'background-lock'
                && call.enabled === true
            )),
            `background-lock POST missing: ${JSON.stringify(controlCalls)}`
        );

        await page.uncheck('#matrixBackgroundLockCheckbox');
        await page.waitForFunction(() => window.EveMatrixWindowMode.isBackgroundLocked() === false);
        assert(
            controlCalls.some(call => (
                call.token === TOKEN
                && call.action === 'background-lock'
                && call.enabled === false
            )),
            `background-unlock POST missing: ${JSON.stringify(controlCalls)}`
        );

        await page.evaluate(() => {
            window.__matrixFakeFullscreen = false;
            window.__matrixFullscreenOptions = null;
            Object.defineProperty(document, 'fullscreenElement', {
                configurable: true,
                get() { return window.__matrixFakeFullscreen ? document.documentElement : null; }
            });
            Object.defineProperty(document.documentElement, 'requestFullscreen', {
                configurable: true,
                value: async (options) => {
                    window.__matrixFullscreenOptions = options || null;
                    window.__matrixFakeFullscreen = true;
                    document.dispatchEvent(new Event('fullscreenchange'));
                }
            });
            Object.defineProperty(document, 'exitFullscreen', {
                configurable: true,
                value: async () => {
                    window.__matrixFakeFullscreen = false;
                    document.dispatchEvent(new Event('fullscreenchange'));
                }
            });
        });

        await page.click('#matrixImmersiveFullscreenButton');
        const entered = await page.evaluate(() => ({
            active: !!document.fullscreenElement,
            navigationUI: window.__matrixFullscreenOptions?.navigationUI || '',
            bodyClass: document.body.classList.contains('matrix-immersive-fullscreen'),
            label: document.getElementById('matrixImmersiveFullscreenButton')?.textContent || ''
        }));
        assert(
            entered.active && entered.navigationUI === 'hide' && entered.bodyClass
                && /Exit Immersive/.test(entered.label),
            `immersive fullscreen entry mismatch: ${JSON.stringify(entered)}`
        );
        await page.waitForFunction(() => (
            window.EveMatrixWindowMode?.isTaskbarAutoHideActive?.() === true
        ));
        assert(
            controlCalls.some(call => (
                call.token === TOKEN
                && call.action === 'immersive-taskbar'
                && call.enabled === true
            )),
            `immersive taskbar enable POST missing: ${JSON.stringify(controlCalls)}`
        );

        await page.click('#matrixImmersiveFullscreenButton');
        const exited = await page.evaluate(() => ({
            active: !!document.fullscreenElement,
            bodyClass: document.body.classList.contains('matrix-immersive-fullscreen'),
            label: document.getElementById('matrixImmersiveFullscreenButton')?.textContent || ''
        }));
        assert(!exited.active && !exited.bodyClass && /Immersive Fullscreen/.test(exited.label),
            `immersive fullscreen exit mismatch: ${JSON.stringify(exited)}`);
        await page.waitForFunction(() => (
            window.EveMatrixWindowMode?.isTaskbarAutoHideActive?.() === false
        ));
        assert(
            controlCalls.some(call => (
                call.token === TOKEN
                && call.action === 'immersive-taskbar'
                && call.enabled === false
            )),
            `immersive taskbar restore POST missing: ${JSON.stringify(controlCalls)}`
        );

        controlCalls.length = 0;
        await page.evaluate(async () => {
            await Promise.all([
                window.EveMatrixWindowMode.syncImmersiveTaskbar(true),
                window.EveMatrixWindowMode.syncImmersiveTaskbar(false)
            ]);
        });
        assert(controlCalls.length === 2 && controlCalls[0].enabled && !controlCalls[1].enabled,
            `rapid immersive transition reordered native writes: ${JSON.stringify(controlCalls)}`);
        assert(await page.evaluate(() => !window.EveMatrixWindowMode.isTaskbarAutoHideActive()),
            'rapid immersive exit left the client showing taskbar auto-hide');

        await page.evaluate(() => { rainDrops[0] = 37; });
        await page.setViewportSize({ width: 1280, height: 801 });
        await page.waitForFunction(() => viewHeight === 801);
        const resized = await page.evaluate(() => ({ drop: rainDrops[0], height: canvas.height }));
        assert(resized.drop >= 37 && resized.height > 0,
            `focus/viewport resize restarted Matrix rain: ${JSON.stringify(resized)}`);

        console.log('MATRIX_DETACHED_WINDOW_MODE_BROWSER_SMOKE_OK', JSON.stringify({
            boot, rapidWrites: controlCalls.length, entered, exited, resized
        }));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
