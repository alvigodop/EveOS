const path = require('path');
const { chromium } = require('playwright');
const { probeRainHandoff } = require('./matrix-rain-handoff.shared');

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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 },
        screen: { width: 1920, height: 1200 } });
    await page.addInitScript(() => Object.defineProperty(window.screen, 'height', {
        configurable: true, get: () => 1200
    }));
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
        const freshPage = await browser.newPage({ viewport: { width: 1280, height: 800 },
            screen: { width: 1920, height: 1200 } });
        try {
            await freshPage.addInitScript(() => {
                Object.defineProperty(window.screen, 'height', {
                    configurable: true, get: () => 1200
                });
                window.requestAnimationFrame = () => 1;
                window.cancelAnimationFrame = () => {};
            });
            for (let load = 0; load < 2; load++) {
                if (load) await freshPage.reload({ waitUntil: 'load' });
                else await freshPage.goto(FILE_URL.split('?')[0], { waitUntil: 'load' });
                const positions = await freshPage.evaluate(() => rainDrops.slice());
                assert(positions.length > 10 && positions.every(position => position === 1),
                `fresh Matrix rain did not restart as one opening wave on load ${load}: ${positions.slice(0, 12)}`);
            }

            const rainHandoff = await probeRainHandoff(freshPage);
            assert(rainHandoff.openingFinished && rainHandoff.postOpeningPhases === 1,
                `opening wave did not finish as one wave before normal rain: ${JSON.stringify(rainHandoff)}`);
            assert(rainHandoff.openingChangedChars > 10,
                `opening waterfall kept fixed per-column glyphs: ${JSON.stringify(rainHandoff)}`);
            assert(rainHandoff.edgeInk > 0,
                `opening wave no longer reaches the physical bottom edge: ${JSON.stringify(rainHandoff)}`);
            assert(rainHandoff.independentlyRestarted === 1
                && rainHandoff.stillWaitingBelow === rainHandoff.columnCount - 1,
                `normal rain handoff mass-reseeded into a second waterfall: ${JSON.stringify(rainHandoff)}`);

            await freshPage.setViewportSize({ width: 1200, height: 600 });
            await freshPage.locator('#toggleToolbar').click();
            await freshPage.locator('#system-section .section-header').click();
            const shortPanel = await freshPage.evaluate(() => {
                const toolbar = document.getElementById('toolbar');
                toolbar.scrollTop = toolbar.scrollHeight;
                const button = document.getElementById('resetButton');
                const rect = button.getBoundingClientRect();
                return {
                    bottom: toolbar.getBoundingClientRect().bottom,
                    buttonBottom: rect.bottom,
                    visible: document.elementFromPoint(rect.left + rect.width / 2,
                        rect.top + rect.height / 2) === button
                };
            });
            assert(shortPanel.bottom <= 600 && shortPanel.buttonBottom <= 600
                && shortPanel.visible,
            `expanded System Controls were unreachable in short window: ${JSON.stringify(shortPanel)}`);
        } finally {
            await freshPage.close();
        }
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
        const initialPhases = await page.evaluate(() =>
            new Set(rainDrops.map(drop => Math.floor(drop))).size);
        assert(initialPhases === 1,
            `initial Matrix wave was not synchronized: ${initialPhases} phases`);

        await page.click('#toggleToolbar');
        const panelGeometry = await page.evaluate(() => {
            const toolbar = document.getElementById('toolbar');
            toolbar.scrollTop = toolbar.scrollHeight;
            return {
                bottom: toolbar.getBoundingClientRect().bottom,
                viewportBottom: window.innerHeight,
                systemBottom: document.getElementById('system-section').getBoundingClientRect().bottom
            };
        });
        assert(panelGeometry.bottom <= panelGeometry.viewportBottom
            && panelGeometry.systemBottom <= panelGeometry.viewportBottom,
        `Matrix settings bottom was unreachable: ${JSON.stringify(panelGeometry)}`);
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

        const beforeFullscreenWidth = await page.evaluate(() => {
            paused = true;
            rainDrops[0] = 37;
            rainDrops[6] = 20;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(98, 100, 12, 30);
            return { count: rainDrops.length, backingHeight: canvas.height };
        });
        await page.setViewportSize({ width: 1920, height: 1200 });
        await page.waitForFunction(() => viewWidth === 1920 && viewHeight === 1200);
        const expanded = await page.evaluate((oldCount) => {
            const pixels = ctx.getImageData(1280, 0, 640, 1200).data;
            let newRegionInk = 0;
            for (let index = 3; index < pixels.length; index += 4) {
                if (pixels[index] > 0) newRegionInk++;
            }
            return {
                oldCount,
                count: rainDrops.length,
                keptDrop: rainDrops[0],
                newDrops: rainDrops.slice(oldCount),
            newRegionInk,
            phaseCount: columnPhases.length,
            mappedFrameRed: ctx.getImageData(104, 270, 1, 1).data[0],
            oldFrameRed: ctx.getImageData(104, 110, 1, 1).data[0],
                scaledFrameRed: ctx.getImageData(165, 165, 1, 1).data[0]
            };
        }, beforeFullscreenWidth.count);
        assert(expanded.count > expanded.oldCount && expanded.oldFrameRed > 200
            && expanded.scaledFrameRed === 0 && expanded.mappedFrameRed === 0
            && Math.abs(expanded.keptDrop - 37) < 0.01,
            `fullscreen expansion moved an existing stream or blurred its trail: ${JSON.stringify(expanded)}`);
        assert(new Set(expanded.newDrops.map(Math.floor)).size > 1,
            `new fullscreen columns all started in the same phase: ${JSON.stringify(expanded)}`);
        assert(expanded.newRegionInk > 200 && expanded.phaseCount === expanded.count,
            `new fullscreen area lacked active rain/column state: ${JSON.stringify(expanded)}`);

        await page.setViewportSize({ width: 1280, height: 801 });
        await page.waitForFunction(() => viewWidth === 1280 && viewHeight === 801);
        const returned = await page.evaluate(() => ({
            count: rainDrops.length,
            drop: rainDrops[0],
            markerRed: ctx.getImageData(104, 110, 1, 1).data[0],
            backingHeight: canvas.height
        }));
        assert(returned.count === beforeFullscreenWidth.count
            && Math.abs(returned.drop - 37) < 0.01
            && returned.markerRed > 200
            && returned.backingHeight === beforeFullscreenWidth.backingHeight,
            `window height drag lost existing rain history: ${JSON.stringify(returned)}`);

        await page.evaluate(() => {
            ctx.clearRect(0, 0, viewWidth, viewHeight);
            rainDrops[6] = 37;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(104, 110, 1, 1);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.25)';
            ctx.fillRect(106, 112, 1, 1);
        });
        for (const height of [943, 862, 1021, 701, 943, 801]) {
            await page.setViewportSize({ width: 1280, height });
            await page.waitForFunction((expected) => viewHeight === expected, height);
        }
        const repeatedResize = await page.evaluate(() => {
            const pixels = ctx.getImageData(100, 100, 12, 22).data;
            let redPixels = 0;
            let peakRed = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index] > 20) redPixels++;
                peakRed = Math.max(peakRed, pixels[index]);
            }
            return {
                redPixels, peakRed, drop: rainDrops[6],
                originalPixel: ctx.getImageData(104, 110, 1, 1).data[0],
                trailAlpha: ctx.getImageData(106, 112, 1, 1).data[3]
            };
        });
        assert(repeatedResize.redPixels === 1 && repeatedResize.peakRed === 255
            && repeatedResize.originalPixel === 255 && repeatedResize.trailAlpha === 64
            && Math.abs(repeatedResize.drop - 37) < 0.01,
            `repeated resizing blurred a sharp rain pixel: ${JSON.stringify(repeatedResize)}`);

        await page.setViewportSize({ width: 1280, height: 801 });
        await page.waitForFunction(() => viewHeight === 801);
        const beforeGrow = await page.evaluate(() => {
            ctx.clearRect(0, 0, viewWidth, rainBufferHeight);
            rainDrops[6] = 39;
            return { head: rainDrops[6], backingHeight: canvas.height };
        });
        for (let height = 821; height <= 1001; height += 20) {
            await page.setViewportSize({ width: 1280, height });
            await page.waitForFunction((expected) => viewHeight === expected, height);
        }
        const newBottom = await page.evaluate(() => {
            const preserved = rainDrops[6] === 39;
            rainDrops[6] = 60;
            paused = false;
            draw();
            paused = true;
            return { height: viewHeight, backingHeight: canvas.height, preserved,
                ink: ctx.getImageData(96, 940, 16, 40).data
                    .filter((_value, index) => index % 4 === 1 && _value > 20).length };
        });
        assert(newBottom.ink > 0 && newBottom.backingHeight > beforeGrow.backingHeight
            && newBottom.preserved,
            `newly exposed space did not accept a continuous stream: ${JSON.stringify(newBottom)}`);
        await page.evaluate(() => { paused = false; });

        const scaledContext = await browser.newContext({
            viewport: { width: 1280, height: 801 },
            screen: { width: 1920, height: 1200 }, deviceScaleFactor: 1.25
        });
        try {
            await scaledContext.addInitScript(() => Object.defineProperty(window.screen,
                'height', { configurable: true, get: () => 1200 }));
            const scaledPage = await scaledContext.newPage();
            await scaledPage.goto(FILE_URL, { waitUntil: 'load', timeout: 120000 });
            await scaledPage.evaluate(() => {
                paused = true;
                ctx.clearRect(0, 0, viewWidth, viewHeight);
                rainDrops[6] = 37;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(130, 138, 1, 1);
                ctx.restore();
            });
            for (const height of [943, 862, 1021, 701, 943, 801]) {
                await scaledPage.setViewportSize({ width: 1280, height });
                await scaledPage.waitForFunction((expected) => viewHeight === expected, height);
            }
            const scaled = await scaledPage.evaluate(() => {
                const pixels = ctx.getImageData(125, 125, 15, 25).data;
                let redPixels = 0;
                for (let index = 0; index < pixels.length; index += 4) {
                    if (pixels[index] > 20) redPixels++;
                }
                return {
                    dpr: window.devicePixelRatio, backingWidth: canvas.width,
                    redPixels, originalPixel: ctx.getImageData(130, 138, 1, 1).data[0]
                };
            });
            assert(scaled.dpr === 1.25 && scaled.backingWidth === 1600
                && scaled.redPixels === 1 && scaled.originalPixel === 255,
                `high-DPI resize softened or displaced a rain pixel: ${JSON.stringify(scaled)}`);
            await scaledPage.evaluate(() => {
                Object.defineProperty(window, 'devicePixelRatio', {
                    configurable: true, value: 1.5
                });
            });
            await scaledPage.waitForFunction(() => canvas.width === 1920, null, { timeout: 3000 });
        } finally {
            await scaledContext.close();
        }

        console.log('MATRIX_DETACHED_WINDOW_MODE_BROWSER_SMOKE_OK', JSON.stringify({
            boot, rapidWrites: controlCalls.length, entered, exited, resized,
            fullscreenColumns: expanded.count, returned, repeatedResize, newBottom
        }));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
