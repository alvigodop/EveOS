#!/usr/bin/env node
// Slow deferred boot can initialize discovery against either emergency event-bus facade.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, 'js/modules/features/scraper', file), 'utf8');
const output = path.join(root, 'data/runtime/smoke-results/scraper-event-bus-boot');
fs.mkdirSync(output, { recursive: true });
const evidence = { ok: false, cases: [] };
let browser, page;
try {
    browser = await chromium.launch({ headless: true });
    for (const fallback of ['normal', 'emergency']) {
        const context = await browser.newContext();
        await context.route('http://event-bus.invalid/**', route => route.fulfill({
            contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
        page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error.stack || error)));
        await page.goto('http://event-bus.invalid/boot');
        await page.addScriptTag({ content: read(fallback === 'normal'
            ? 'core/global-fix-components/core.js' : 'core/emergency-fallbacks/components/ef-core.js') });
        await page.evaluate(kind => {
            if (kind === 'normal') window.GlobalFixCore.applyGlobalFixes();
            else window.EmergencyFallbacksCore._ensureEventBus();
        }, fallback);
        await page.addScriptTag({ content: read('discovery/wikipedia-internal/wd-core.js') });
        await page.evaluate(() => {
            window.__eventBusReceived = [];
            window.WDSearch = { discover(query) { window.__eventBusReceived.push(query); } };
            window.WDCore.init();
            window.EventBus.publish('discovery:search', { source: 'wikipedia', query: 'before-load' });
            window.__fallbackBus = window.EventBus;
            window.__legacyHandler = data => window.__eventBusReceived.push(data);
            window.__fallbackBus.on('legacy-event', window.__legacyHandler);
        });
        await page.addScriptTag({ content: read('utils/event-bus.js') });
        const state = await page.evaluate(() => {
            window.EventBus.publish('discovery:search', { source: 'wikipedia', query: 'after-load' });
            window.EventBus.emit('legacy-event', 'canonical-alias');
            window.EventBus.unsubscribe('legacy-event', window.__legacyHandler);
            window.__fallbackBus.emit('legacy-event', 'must-not-run');
            return { received: window.__eventBusReceived, methods: ['on', 'off', 'emit', 'subscribe', 'publish', 'unsubscribe']
                .every(method => typeof window.EventBus[method] === 'function') };
        });
        assert.deepEqual(state.received, ['before-load', 'after-load', 'canonical-alias']);
        assert.equal(state.methods, true);
        assert.deepEqual(errors, []);
        evidence.cases.push({ fallback, preservedListeners: true, aliases: true, errors: 0 });
        await context.close();
    }
    evidence.ok = true;
    console.log('SCRAPER_EVENT_BUS_BOOT_BROWSER_OK fallbacks=2 listenerHandoff=true aliases=true');
} catch (error) {
    evidence.error = String(error.stack || error);
    if (page && !page.isClosed()) {
        await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(output, 'failure.html'), await page.content().catch(() => 'unavailable'));
    }
    console.error('SCRAPER_EVENT_BUS_BOOT_BROWSER_FAIL ' + String(error.message));
    process.exitCode = 1;
} finally {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
    await browser?.close();
}
