const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { launchChromiumOrConnect } = require('./playwright-browser');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

async function waitForStatus(url, timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const ok = await new Promise((resolve) => {
            const request = http.get(url, (response) => {
                response.resume();
                resolve(response.statusCode === 200);
            });
            request.on('error', () => resolve(false));
            request.setTimeout(1000, () => {
                request.destroy();
                resolve(false);
            });
        });
        if (ok) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

(async () => {
    const port = await getFreePort();
    const modularRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-matrix-store-'));
    const server = spawn('python', [
        'server/python-server.py',
        String(port),
        '--no-browser',
        '--modular-root',
        modularRoot
    ], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverStdout = '';
    let serverStderr = '';
    server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
    server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

    let browser = null;
    let context = null;

    try {
        await waitForStatus(`http://127.0.0.1:${port}/api/status`);
        ({ browser } = await launchChromiumOrConnect({ headless: true }));
        context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
        const page = await context.newPage();
        const pageUrl = `http://127.0.0.1:${port}/EveOS.html`;

        await page.goto(pageUrl, { waitUntil: 'load', timeout: 180000 });
        const matrixButton = page.locator('.top-right .topbar-matrix-btn');
        await matrixButton.waitFor({ state: 'visible', timeout: 180000 });

        const placement = await page.evaluate(() => {
            const mapButton = document.querySelector('.top-right .topbar-map-btn:not(.topbar-matrix-btn)');
            const matrixButton = document.querySelector('.top-right .topbar-matrix-btn');
            const matrixStyle = matrixButton ? getComputedStyle(matrixButton) : null;
            return {
                adjacent: !!(mapButton && matrixButton && mapButton.nextElementSibling === matrixButton),
                label: matrixButton?.textContent?.trim() || '',
                title: matrixButton?.getAttribute('title') || '',
                borderColor: matrixStyle?.borderColor || '',
                visible: !!matrixButton?.getClientRects().length
            };
        });

        if (!placement.adjacent || !placement.visible || placement.title !== 'Matrix Workshop' || !placement.label.includes('Matrix')) {
            throw new Error(`Matrix launcher placement mismatch: ${JSON.stringify(placement)}`);
        }

        const originalUrl = page.url();
        const originalPageCount = context.pages().length;
        await matrixButton.click();
        await page.waitForFunction(() => {
            const overlay = document.getElementById('matrix-workshop-overlay');
            const frame = document.getElementById('matrix-workshop-frame');
            return overlay?.classList.contains('is-open')
                && frame?.contentDocument?.readyState === 'complete'
                && frame.contentDocument.title === 'Matrix Code Rain v2.0';
        }, null, { timeout: 60000 });

        const matrixState = await page.evaluate(() => {
            const overlay = document.getElementById('matrix-workshop-overlay');
            const frame = document.getElementById('matrix-workshop-frame');
            const doc = frame?.contentDocument;
            const close = overlay?.querySelector('[data-matrix-close]');
            return {
                title: doc?.title || '',
                canvasCount: doc?.querySelectorAll('canvas').length || 0,
                toolbar: !!doc?.getElementById('toolbar'),
                toggle: !!doc?.getElementById('toggleToolbar'),
                framePath: frame?.contentWindow?.location?.pathname || '',
                overlayOpen: overlay?.classList.contains('is-open') || false,
                closeVisible: !!close?.getClientRects().length,
                launcherExpanded: document.querySelector('.topbar-matrix-btn')?.getAttribute('aria-expanded'),
                bodyLocked: document.body.style.overflow === 'hidden'
            };
        });

        if (
            matrixState.title !== 'Matrix Code Rain v2.0'
            || matrixState.canvasCount < 1
            || !matrixState.toolbar
            || !matrixState.toggle
            || !matrixState.framePath.endsWith('/tools/workshop/MatrixBackground-V2-Upgrading.html')
            || !matrixState.overlayOpen
            || !matrixState.closeVisible
            || matrixState.launcherExpanded !== 'true'
            || !matrixState.bodyLocked
            || page.url() !== originalUrl
            || context.pages().length !== originalPageCount
        ) {
            throw new Error(`Matrix workshop did not initialize from launcher: ${JSON.stringify(matrixState)}`);
        }

        await page.locator('[data-matrix-header-toggle]').click();
        const hiddenHeaderState = await page.evaluate(() => {
            const overlay = document.getElementById('matrix-workshop-overlay');
            const shell = overlay?.querySelector('.matrix-workshop-shell');
            const header = overlay?.querySelector('.matrix-workshop-header');
            const stage = overlay?.querySelector('.matrix-workshop-stage');
            const restore = overlay?.querySelector('[data-matrix-header-restore]');
            const shellRect = shell?.getBoundingClientRect();
            const stageRect = stage?.getBoundingClientRect();
            return {
                hidden: overlay?.classList.contains('is-header-hidden') || false,
                headerDisplay: header ? getComputedStyle(header).display : '',
                restoreVisible: !!restore?.getClientRects().length,
                heightDelta: Math.abs((shellRect?.height || 0) - (stageRect?.height || 0)),
                stored: localStorage.getItem('eveMatrixWorkshopHeaderHidden')
            };
        });
        if (
            !hiddenHeaderState.hidden
            || hiddenHeaderState.headerDisplay !== 'none'
            || !hiddenHeaderState.restoreVisible
            || hiddenHeaderState.heightDelta > 3
            || hiddenHeaderState.stored !== '1'
        ) {
            throw new Error(`Matrix header collapse mismatch: ${JSON.stringify(hiddenHeaderState)}`);
        }

        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('matrix-workshop-overlay')?.classList.contains('is-open'));
        await matrixButton.click();
        await page.waitForSelector('#matrix-workshop-overlay.is-open.is-header-hidden', { timeout: 15000 });
        await page.locator('[data-matrix-header-restore]').click();
        const restoredHeaderState = await page.evaluate(() => {
            const overlay = document.getElementById('matrix-workshop-overlay');
            const header = overlay?.querySelector('.matrix-workshop-header');
            return {
                hidden: overlay?.classList.contains('is-header-hidden') || false,
                headerDisplay: header ? getComputedStyle(header).display : '',
                stored: localStorage.getItem('eveMatrixWorkshopHeaderHidden')
            };
        });
        if (restoredHeaderState.hidden || restoredHeaderState.headerDisplay !== 'flex' || restoredHeaderState.stored !== '0') {
            throw new Error(`Matrix header restore mismatch: ${JSON.stringify(restoredHeaderState)}`);
        }

        const detachedPagePromise = context.waitForEvent('page');
        await page.locator('[data-matrix-detach]').click();
        const detachedPage = await detachedPagePromise;
        await detachedPage.waitForLoadState('load', { timeout: 60000 });
        const detachedState = {
            title: await detachedPage.title(),
            url: detachedPage.url(),
            canvasCount: await detachedPage.locator('canvas').count(),
            parent: await page.evaluate(() => ({
                open: document.getElementById('matrix-workshop-overlay')?.classList.contains('is-open') || false,
                frameSrc: document.getElementById('matrix-workshop-frame')?.getAttribute('src') || '',
                launcherExpanded: document.querySelector('.topbar-matrix-btn')?.getAttribute('aria-expanded'),
                bodyLocked: document.body.style.overflow === 'hidden'
            }))
        };
        if (
            detachedState.title !== 'Matrix Code Rain v2.0'
            || !detachedState.url.endsWith('/tools/workshop/MatrixBackground-V2-Upgrading.html')
            || detachedState.canvasCount < 1
            || detachedState.parent.open
            || detachedState.parent.frameSrc !== 'about:blank'
            || detachedState.parent.launcherExpanded !== 'false'
            || detachedState.parent.bodyLocked
            || page.url() !== originalUrl
        ) {
            throw new Error(`Matrix detach lifecycle mismatch: ${JSON.stringify(detachedState)}`);
        }
        await detachedPage.close();

        await matrixButton.click();
        await page.waitForSelector('#matrix-workshop-overlay.is-open', { timeout: 15000 });
        await page.locator('[data-matrix-close]').click();
        const closedState = await page.evaluate(() => ({
            open: document.getElementById('matrix-workshop-overlay')?.classList.contains('is-open') || false,
            frameSrc: document.getElementById('matrix-workshop-frame')?.getAttribute('src') || '',
            launcherExpanded: document.querySelector('.topbar-matrix-btn')?.getAttribute('aria-expanded'),
            bodyLocked: document.body.style.overflow === 'hidden'
        }));
        if (closedState.open || closedState.frameSrc !== 'about:blank' || closedState.launcherExpanded !== 'false' || closedState.bodyLocked) {
            throw new Error(`Matrix close lifecycle mismatch: ${JSON.stringify(closedState)}`);
        }

        await matrixButton.click();
        await page.waitForSelector('#matrix-workshop-overlay.is-open', { timeout: 15000 });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('matrix-workshop-overlay')?.classList.contains('is-open'));

        await page.setViewportSize({ width: 390, height: 844 });
        await matrixButton.click();
        await page.waitForSelector('#matrix-workshop-overlay.is-open', { timeout: 15000 });
        const mobileState = await page.evaluate(() => {
            const shell = document.querySelector('.matrix-workshop-shell');
            const close = document.querySelector('.matrix-workshop-close');
            const rect = shell?.getBoundingClientRect();
            return {
                shellX: rect?.x ?? -1,
                shellY: rect?.y ?? -1,
                shellWidth: rect?.width ?? 0,
                shellHeight: rect?.height ?? 0,
                borderRadius: shell ? getComputedStyle(shell).borderRadius : '',
                closeVisible: !!close?.getClientRects().length
            };
        });
        if (
            mobileState.shellX !== 0
            || mobileState.shellY !== 0
            || mobileState.shellWidth !== 390
            || mobileState.shellHeight !== 844
            || mobileState.borderRadius !== '0px'
            || !mobileState.closeVisible
        ) {
            throw new Error(`Matrix mobile wrapper mismatch: ${JSON.stringify(mobileState)}`);
        }
        await page.keyboard.press('Escape');

        console.log('MATRIX_WORKSHOP_LAUNCHER_BROWSER_SMOKE_OK', JSON.stringify({
            placement,
            matrixState,
            hiddenHeaderState,
            restoredHeaderState,
            detachedState,
            closedState,
            mobileState,
            urlPreserved: page.url() === originalUrl,
            pageCountPreserved: context.pages().length === originalPageCount
        }));
    } catch (error) {
        console.error(error && error.stack ? error.stack : error);
        console.error('--- SERVER STDOUT ---');
        console.error(serverStdout);
        console.error('--- SERVER STDERR ---');
        console.error(serverStderr);
        process.exitCode = 1;
    } finally {
        if (context) {
            try { await context.close(); } catch (error) {}
        }
        if (browser) {
            try { await browser.close(); } catch (error) {}
        }
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!server.killed) server.kill('SIGKILL');
        fs.rmSync(modularRoot, { recursive: true, force: true });
    }
})();
