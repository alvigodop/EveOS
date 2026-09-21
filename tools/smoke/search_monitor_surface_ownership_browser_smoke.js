const path = require('path');
const { runBrowserSmoke } = require('./browser-smoke-diagnostics.shared');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\\\/g, '/');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function monitorCompact(page, expected, label) {
    await page.waitForFunction((wanted) => {
        const indicator = document.getElementById('loadingIndicator');
        return !!indicator && indicator.classList.contains('compact') === wanted;
    }, expected, { timeout: 10000 }).catch(async () => {
        const state = await page.evaluate(() => ({
            compact: document.getElementById('loadingIndicator')?.classList.contains('compact') ?? null,
            indicatorClass: document.getElementById('loadingIndicator')?.className || ''
        }));
        throw new Error(`${label}: Search Monitor compact state mismatch: ${JSON.stringify(state)}`);
    });
}

async function pointerClick(page, selector) {
    const locator = page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Missing pointer geometry for ${selector}`);
    const x = box.x + (box.width / 2);
    const y = box.y + (box.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
}

async function readState(page) {
    return page.evaluate(() => {
        const indicator = document.getElementById('loadingIndicator');
        const surface = document.getElementById('surface-ownership-smoke');
        return {
            compact: indicator?.classList.contains('compact') ?? null,
            clicks: window.__surfaceOwnershipClicks || 0,
            owner: surface?.dataset?.surfaceOwner || '',
            owned: surface?.dataset?.searchMonitorOwned || '',
            present: !!surface
        };
    });
}

async function main() {
    await runBrowserSmoke({
        name: 'search-monitor-surface-ownership',
        viewport: { width: 1600, height: 1200 }
    }, async ({ page }) => {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 240000 });
        await page.waitForFunction(() => (
            !!window.SearchMonitorBoot?.registerSurface
            && !!window.SearchMonitorBoot?.unregisterSurface
            && !!window.LoadingIndicator?._initialized
            && !!document.getElementById('loadingIndicator')
        ), undefined, { timeout: 180000 });

        await page.evaluate(() => window.SearchMonitorBoot.expand());
        await monitorCompact(page, false, 'initial expand');

        await page.evaluate(() => {
            document.getElementById('surface-ownership-smoke')?.remove();
            window.__surfaceOwnershipClicks = 0;

            const surface = document.createElement('section');
            surface.id = 'surface-ownership-smoke';
            surface.style.cssText = [
                'position:fixed',
                'top:80px',
                'right:40px',
                'width:260px',
                'height:120px',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'background:#fff',
                'z-index:2147483647',
                'pointer-events:auto'
            ].join(';');

            const button = document.createElement('button');
            button.id = 'surface-ownership-smoke-button';
            button.type = 'button';
            button.textContent = 'Surface ownership probe';
            button.style.cssText = 'width:220px;height:64px;pointer-events:auto;';
            button.addEventListener('click', () => {
                window.__surfaceOwnershipClicks = (window.__surfaceOwnershipClicks || 0) + 1;
            });

            surface.appendChild(button);
            document.body.appendChild(surface);
            window.SearchMonitorBoot.registerSurface({
                element: surface,
                owner: 'search-monitor'
            });
        });

        const registeredBefore = await readState(page);
        assert(registeredBefore.present, `Registered test surface missing: ${JSON.stringify(registeredBefore)}`);
        assert(
            registeredBefore.owner === 'search-monitor' && registeredBefore.owned === 'true',
            `registerSurface did not stamp ownership markers: ${JSON.stringify(registeredBefore)}`
        );

        await pointerClick(page, '#surface-ownership-smoke-button');
        await page.waitForTimeout(100);

        const registeredAfter = await readState(page);
        assert(
            registeredAfter.clicks === 1 && registeredAfter.compact === false,
            `Registered portaled click did not survive top-layer gate: ${JSON.stringify(registeredAfter)}`
        );

        await page.evaluate(() => {
            const surface = document.getElementById('surface-ownership-smoke');
            window.SearchMonitorBoot.unregisterSurface(surface);
        });

        const unregisteredBefore = await readState(page);
        assert(
            unregisteredBefore.owner === '' && unregisteredBefore.owned === '',
            `unregisterSurface left stale ownership markers: ${JSON.stringify(unregisteredBefore)}`
        );

        await pointerClick(page, '#surface-ownership-smoke-button');
        await monitorCompact(page, true, 'unregistered real click');
        await page.waitForTimeout(100);

        const intercepted = await readState(page);
        assert(
            intercepted.clicks === 1 && intercepted.compact === true,
            `Unregistered portaled click leaked through top-layer gate: ${JSON.stringify(intercepted)}`
        );

        await pointerClick(page, '#surface-ownership-smoke-button');
        await page.waitForTimeout(100);

        const compactClick = await readState(page);
        assert(
            compactClick.clicks === 2 && compactClick.compact === true,
            `Underlying surface did not receive the next click after monitor collapse: ${JSON.stringify(compactClick)}`
        );

        await page.evaluate(() => document.getElementById('surface-ownership-smoke')?.remove());

        console.log('SEARCH_MONITOR_SURFACE_OWNERSHIP_BROWSER_SMOKE_OK ' + JSON.stringify({
            registeredBefore,
            registeredAfter,
            unregisteredBefore,
            intercepted,
            compactClick
        }));
    });
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});
