'use strict';

// Opt-in native Windows proof; never loads EveOS, Spotify, saved profiles or library data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('../qualification/lane3-native-controller.cjs');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'data/runtime/smoke-results');
const artifact = path.join(directory, 'audioflix-native-visibility-browser.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, page;
const E = { ok: false, realNativeBrowser: true, spotifyLoaded: false, cases: [] };
const record = async name => {
    const sample = await page.evaluate(() => ({ visibility: document.visibilityState, focus: document.hasFocus(),
        ownVisibility: Object.hasOwn(document, 'visibilityState'),
        nativeGetter: String(Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')?.get).includes('[native code]'),
        ticks: window.__nativeVisibilityProbe.ticks, clicks: window.__nativeVisibilityProbe.clicks,
        events: window.__nativeVisibilityProbe.events.slice() }));
    assert.equal(sample.ownVisibility, false); assert.equal(sample.nativeGetter, true);
    E.cases.push({ name, ...sample }); return sample;
};

(async () => {
    assert.equal(process.platform, 'win32', 'Native visibility qualification requires the Windows desktop');
    const { hideNativeController } = await import('./audioflix_spotify_long_queue_natural.mjs');
    const { createLongQueueHarness } = await import('./audioflix_spotify_long_queue_live_support.mjs');
    const H = createLongQueueHarness({ transitionTimeout: 8000 });
    browser = await launch({ nativeVisibility: true });
    assert.equal(browser.__eveNativeController.nativeVisibility, true);
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block' });
    page = await context.newPage();
    await page.setContent('<title>Disposable AudioFlix native visibility proof</title><p>No Spotify or library writes.</p><button id="pointer">Pointer check</button>');
    await page.evaluate(() => {
        const probe = window.__nativeVisibilityProbe = { ticks: 0, clicks: 0, events: [] };
        document.querySelector('#pointer').addEventListener('click', () => probe.clicks++);
        probe.listener = () => probe.events.push({ visibility: document.visibilityState, at: Date.now() });
        document.addEventListener('visibilitychange', probe.listener);
        probe.timer = setInterval(() => probe.ticks++, 200);
    });
    await page.bringToFront();
    await page.waitForFunction(() => document.visibilityState === 'visible', null, { timeout: 8000 });
    const bounds = await page.locator('#pointer').boundingBox();
    assert.ok(bounds && bounds.width > 0 && bounds.height > 0);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    assert.equal((await record('foreground-real-pointer')).clicks, 1);
    E.hiddenMethod = await hideNativeController(context, page, H);
    const hidden = await record('minimized-after-cdp-detach');
    assert.equal(hidden.visibility, 'hidden');
    const cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    E.minimizedBounds = (await cdp.send('Browser.getWindowBounds', { windowId })).bounds;
    assert.equal(E.minimizedBounds.windowState, 'minimized');
    await cdp.detach();
    await sleep(3000);
    const settled = await record('hidden-javascript-still-running');
    assert.equal(settled.visibility, 'hidden');
    assert.ok(settled.ticks > hidden.ticks, 'Hidden is not a frozen or script-disabled page');
    const restore = await context.newCDPSession(page);
    await restore.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await restore.detach(); await page.bringToFront();
    await page.waitForFunction(() => document.visibilityState === 'visible', null, { timeout: 8000 });
    const foreground = await record('native-restore');
    assert.ok(foreground.events.some(event => event.visibility === 'hidden'));
    assert.equal(foreground.events.at(-1)?.visibility, 'visible');
    E.forcedFocusSuppressed = browser.__eveNativeController.forcedFocusSuppressed;
    assert.ok(Number.isInteger(E.forcedFocusSuppressed) && E.forcedFocusSuppressed >= 1);
    E.ok = true;
})().catch(async error => {
    E.error = String(error.stack || error); process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(directory, 'audioflix-native-visibility-failure.png') }).catch(() => {});
}).finally(async () => {
    if (page) await page.evaluate(() => {
        const probe = window.__nativeVisibilityProbe;
        if (probe) { clearInterval(probe.timer); document.removeEventListener('visibilitychange', probe.listener); }
    }).catch(() => {});
    try { await browser?.close(); }
    catch (error) { E.ok = false; E.cleanupError = String(error.message); process.exitCode = 1; }
    fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(E, null, 2) + '\n');
    console.log(E.ok ? 'AUDIOFLIX_NATIVE_VISIBILITY_BROWSER_OK pointer=true minimized=true hidden=true javascriptActive=true restored=true noVisibilitySpoof=true'
        : `AUDIOFLIX_NATIVE_VISIBILITY_BROWSER_FAIL ${String(E.error || E.cleanupError || 'cleanup failed').split('\n')[0]} artifact=${artifact}`);
});
