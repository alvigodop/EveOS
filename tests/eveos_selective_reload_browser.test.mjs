#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedClient = fs.readFileSync(path.join(ROOT, 'js/modules/core/eveos-service-reload.js'), 'utf8');
const sharedUi = fs.readFileSync(path.join(ROOT, 'js/modules/core/eveos-service-reload-ui.js'), 'utf8');
const updateUi = fs.readFileSync(path.join(ROOT, 'js/modules/gemini/search_monitor/searchMonitorUpdates.js'), 'utf8');
const spotifySurface = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.spotify.engine-surface.js'), 'utf8');
const watchFusionReload = fs.readFileSync(path.join(ROOT, 'js/modules/features/watchfusion/watchfusion.reload.js'), 'utf8');

const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html><body>
        <div class="gemini-monitor-shell-toolbar">
            <div class="gemini-monitor-toolbar-actions">
                <button type="button" data-search-monitor-reload-ui>Reload EveOS UI</button>
            </div>
        </div>
        <section data-ai-home-workspace><p class="gemini-monitor-workspace-note">Workspace</p></section>
    </body>`);
    await page.addInitScript(() => sessionStorage.clear());
    await page.evaluate(() => {
        window.__reloadFixture = { restartCalls: [], applied: new Set(), updateChecks: 0 };
        const makePlan = () => {
            const actions = [
                { component: 'web', action: 'restartService', label: 'Restart EveOS web' },
                { component: 'browser', action: 'reloadPage', label: 'Reload EveOS page' },
                { component: 'review', action: 'reviewRequired', label: 'Review required' }
            ].filter(item => !window.__reloadFixture.applied.has(item.component));
            return { ok: true, changed: actions.length > 0, actions, reviewRequired: actions.some(item => item.component === 'review') };
        };
        window.EveOSLocalControl = {
            health: async () => true,
            baseUrl: () => 'http://127.0.0.1:9082',
            fetchJson: async (url, options = {}) => {
                const parsed = new URL(url);
                if (parsed.pathname === '/api/services/updates/check') {
                    window.__reloadFixture.updateChecks += 1;
                    return makePlan();
                }
                if (parsed.pathname === '/api/eveos-server/status') return { ok: true, running: true, state: 'running', port: 8765 };
                if (parsed.pathname === '/api/services/restart') {
                    const body = JSON.parse(options.body || '{}');
                    window.__reloadFixture.restartCalls.push({ service: body.service, port: parsed.searchParams.get('port') || '' });
                    await new Promise(resolve => setTimeout(resolve, 80));
                    return { ok: true, serviceKey: body.service, serviceRestarted: true, state: 'running', running: true };
                }
                if (parsed.pathname === '/api/services/updates/applied') {
                    const body = JSON.parse(options.body || '{}');
                    (body.components || []).forEach(component => window.__reloadFixture.applied.add(component));
                    return makePlan();
                }
                if (parsed.pathname === '/api/control-plane/health') {
                    return { ok: true, running: true, instanceId: 'fixture-control', sourceFingerprint: 'fixture-source', scopedStartup: true };
                }
                throw new Error(`Unexpected fixture request: ${parsed.pathname}`);
            }
        };
    });
    await page.addScriptTag({ content: sharedClient });
    await page.addScriptTag({ content: sharedUi });
    await page.addScriptTag({ content: updateUi });

    const check = page.getByRole('button', { name: 'Check updates' });
    await check.waitFor();
    await check.click();
    await page.waitForFunction(() => document.querySelector('[data-update-stage]')?.textContent === 'Review');
    assert.match(await page.locator('[data-update-summary]').textContent(), /3 affected components/);
    assert.match(await page.locator('[data-update-warning]').textContent(), /unknown runtime mapping/i);
    assert.equal(await page.locator('[data-search-monitor-reload-ui]').getAttribute('aria-label'), 'Reload EveOS page');

    const restartSelected = page.getByRole('button', { name: 'Restart selected running services' });
    await restartSelected.click();
    assert.equal(await page.evaluate(() => window.__reloadFixture.restartCalls.length), 0,
        'first pointer click must only arm the interruption confirmation');
    assert.match(await page.locator('[data-update-warning]').textContent(), /interrupt only: Restart EveOS web/i);
    await page.getByRole('button', { name: 'Confirm selected restarts' }).click();
    await page.waitForFunction(() => window.__reloadFixture.restartCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__reloadFixture.restartCalls), [{ service: 'web', port: '' }]);
    await page.waitForFunction(() => document.querySelector('[data-update-stage]')?.textContent === 'Review');
    assert.equal(await page.evaluate(() => window.__reloadFixture.applied.has('web')), true,
        'verified web replacement must advance only the web fingerprint baseline');

    // Prove the shared client itself collapses concurrent duplicate requests into one operation.
    const beforeDuplicate = await page.evaluate(() => window.__reloadFixture.restartCalls.length);
    await page.evaluate(async () => {
        await Promise.all([
            window.EveOSServiceReload.restart('web', { port: 8765 }),
            window.EveOSServiceReload.restart('web', { port: 8765 })
        ]);
    });
    const duplicateCalls = await page.evaluate(() => window.__reloadFixture.restartCalls.slice());
    assert.equal(duplicateCalls.length, beforeDuplicate + 1, 'concurrent duplicate restarts must share one operation');
    assert.deepEqual(duplicateCalls.at(-1), { service: 'web', port: '8765' });

    // Settings individual Restart controls must name the service and require an in-site second click
    // before their existing lifecycle handler is allowed to run.
    await page.evaluate(() => {
        const row = document.createElement('div');
        row.dataset.consoleService = 'gemini';
        const button = document.createElement('button');
        button.dataset.eveosServiceRestart = 'gemini';
        button.title = 'Restart only the running Gemini Live Link service';
        button.textContent = 'Restart';
        button.addEventListener('click', () => { window.__reloadFixture.settingsDispatches = (window.__reloadFixture.settingsDispatches || 0) + 1; });
        row.appendChild(button);
        document.body.appendChild(row);
    });
    const settingsRestart = page.locator('[data-eveos-service-restart="gemini"]');
    await settingsRestart.click();
    assert.equal(await page.evaluate(() => window.__reloadFixture.settingsDispatches || 0), 0,
        'Settings first pointer click must not dispatch a restart');
    assert.equal(await settingsRestart.getAttribute('aria-label'), 'Confirm restart Gemini Live Link');
    assert.match(await settingsRestart.getAttribute('title'), /interrupts only Gemini Live Link/i);
    await settingsRestart.click();
    assert.equal(await page.evaluate(() => window.__reloadFixture.settingsDispatches || 0), 1,
        'Settings confirmation must dispatch exactly one existing restart handler');

    // WatchFusion owns Start/Stop presentation, but selective Restart must use the same shared
    // lifecycle client and preserve all unrelated services. Its service controller owns the
    // effective port, so the shared route does not need a redundant port query parameter.
    await page.evaluate(() => {
        const overlay = document.createElement('section');
        overlay.id = 'watchfusion-overlay';
        overlay.innerHTML = '<header><div class="watchfusion-head-actions"><button data-wf-action="stop">Stop</button></div></header><span data-wf-message></span>';
        document.body.appendChild(overlay);
        window.__reloadFixture.watchRefreshes = 0;
        window.EveWatchFusion = {
            ready: true,
            async open() { return true; },
            async refresh() { window.__reloadFixture.watchRefreshes += 1; return { running: true }; },
            getState: () => ({ running: true, state: 'running', port: 9087 })
        };
    });
    await page.addScriptTag({ content: watchFusionReload });
    const watchRestart = page.getByRole('button', { name: 'Restart WatchFusion' });
    await watchRestart.waitFor();
    const beforeWatch = await page.evaluate(() => window.__reloadFixture.restartCalls.length);
    await watchRestart.click();
    assert.equal(await page.evaluate(() => window.__reloadFixture.restartCalls.length), beforeWatch,
        'WatchFusion first click must only arm interruption confirmation');
    assert.match(await page.locator('#watchfusion-overlay [data-wf-message]').textContent(), /interrupts WatchFusion only/i);
    await page.getByRole('button', { name: 'Confirm restart WatchFusion' }).click();
    await page.waitForFunction(before => window.__reloadFixture.restartCalls.length === before + 1, beforeWatch);
    assert.deepEqual(await page.evaluate(() => window.__reloadFixture.restartCalls.at(-1)),
        { service: 'watchFusion', port: '' });
    await page.waitForFunction(() => /restarted and verified ready/i.test(document.querySelector('#watchfusion-overlay [data-wf-message]')?.textContent || ''));

    // Add the managed Spotify Internal Player surface and prove its helper-only restart is a
    // real two-click pointer confirmation that produces exactly one shared lifecycle request.
    await page.evaluate(() => {
        const item = {
            id: 'spotify-fixture', type: 'music', sourceProvider: 'spotify', title: 'Fixture Spotify',
            spotifyUrl: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', volume: 0.4
        };
        const host = document.createElement('div');
        host.id = 'spotify-restart-fixture';
        document.body.appendChild(host);
        const view = {
            open() { return host; }, hide() {}, isOpen() { return true; }, setStatus(value) { host.dataset.status = String(value); },
            setVisualVisible() {}, sync() {}, setVolume() {}, setQueue() {}
        };
        window.EveAudioflixInternalPlayer = { createController: () => view };
        window.EveAudioflixSpotifyRemote = {
            snapshot: () => ({ connected: true, base: 'http://127.0.0.1:8765', lastState: { managed: { presentation: 'hidden' }, engine: { status: 'playing' } } }),
            send: async () => ({ ok: true })
        };
        window.EveAudioflixSpotifyAnyBrowser = {
            ready: true,
            snapshot: () => ({ active: true, item, playback: { item, paused: false, currentTime: 10, duration: 180 } })
        };
        window.EveAudioflix = { queueConnection: { snapshot: () => ({ entries: [item], currentIndex: 0 }), step() {}, jump() {} } };
        window.EveAudioflixState = { setItemVolume() {} };
        window.EveAudioflixAudio = {
            ready: true, openInternalView: async () => true, pause: async () => true,
            playItem: async () => true, seek: async () => true, stopAll: async () => true, updateItemVolume() {}
        };
    });
    await page.addScriptTag({ content: spotifySurface });
    await page.evaluate(() => window.EveAudioflixAudio.openInternalView({
        id: 'spotify-fixture', type: 'music', sourceProvider: 'spotify', title: 'Fixture Spotify',
        spotifyUrl: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', volume: 0.4
    }));
    const restartEngine = page.getByRole('button', { name: 'Restart engine' });
    await restartEngine.waitFor();
    const beforeSpotify = await page.evaluate(() => window.__reloadFixture.restartCalls.length);
    await restartEngine.click();
    assert.equal(await page.evaluate(() => window.__reloadFixture.restartCalls.length), beforeSpotify,
        'Spotify helper first click must only confirm the interruption');
    assert.match(await page.locator('#spotify-restart-fixture').getAttribute('data-status'), /will stop and will not auto-resume/i);
    await page.getByRole('button', { name: 'Confirm restart' }).click();
    await page.waitForFunction(before => window.__reloadFixture.restartCalls.length === before + 1, beforeSpotify);
    const spotifyCall = await page.evaluate(() => window.__reloadFixture.restartCalls.at(-1));
    assert.deepEqual(spotifyCall, { service: 'spotifyEngine', port: '8765' });
    await page.waitForFunction(() => /restarted and is idle/i.test(document.querySelector('#spotify-restart-fixture')?.dataset.status || ''));

    console.log('EVEOS_SELECTIVE_RELOAD_BROWSER_OK pointerConfirm=true duplicateSingleFlight=true settingsConfirm=true watchFusionShared=true spotifyHelperOnly=true');
} finally {
    await browser.close();
}
