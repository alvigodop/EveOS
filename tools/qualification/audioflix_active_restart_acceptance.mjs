import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLongQueueHarness, normalizeSpotify, spotifyTrackId } from '../smoke/audioflix_spotify_long_queue_live_support.mjs';
import { installBackendWriteBarrier, readBackendAudioflixSnapshot,
    assertBackendAudioflixUnchanged } from '../smoke/audioflix_spotify_live_isolation.shared.js';
import { lifecycleWriteAllowed, preferenceHashes, listenerInventory, branded, helperReady, playing,
    advancing, idleHelper, stoppedController, restartReceipt, preserve, deterministicCheck } from './audioflix_active_restart_contract.mjs';
import { approveOwnFileSession } from './audioflix_file_pairing.shared.mjs';

const ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const require = createRequire(import.meta.url), args = process.argv.slice(2);
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/eveos-ports.json'), 'utf8')).ports;
const ports = Object.fromEntries(Object.entries(registry).map(([key, value]) => [key, Number(value.port)]));
const webPort = ports.EVEOS_WEB_PORT, controlBase = `http://127.0.0.1:${ports.GEMINI_CONTROL_PORT}`;
const base = `http://127.0.0.1:${webPort}`, engineUrl = base + '/tools/audioflix/spotify-engine.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const redact = (value, limit = 1200) => String(value || '').replace(/([?&](?:token|key|api_key|pair|secret)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, limit);
const safeUrl = value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return redact(value); } };
let E, directory, browser, context, page, H, barrier, permit, fixture;
let fixtureSources = [];
const save = () => fs.writeFileSync(path.join(directory, 'acceptance.json'), JSON.stringify(E, (key, value) =>
    /token|secret|sessionId|cookie|profile/i.test(key) ? '[redacted]' : typeof value === 'string' ? redact(value, 24000) : value, 2) + '\n');
const push = (field, value) => { if (E[field].length < 500) E[field].push(value); };

async function request(url, method = 'GET') {
    const response = await fetch(url, { method, signal: AbortSignal.timeout(15000), cache: 'no-store' });
    assert.ok(response.ok, `${safeUrl(url)} HTTP ${response.status}`);
    return response.json();
}
const backend = () => readBackendAudioflixSnapshot(() => request(base + '/api/eve-state/modular/load'));
async function snapshot() {
    const [control, web, consoles, helper] = await Promise.all([
        request(controlBase + '/api/control-plane/health'), request(base + '/api/status'),
        request(controlBase + `/api/control-plane/consoles?port=${webPort}`),
        request(base + '/api/audioflix/spotify-browser/status')
    ]);
    branded(control, 'eveos-control-plane', ports.GEMINI_CONTROL_PORT);
    branded(web, 'eveos-local-server', webPort); helperReady(helper, engineUrl);
    assert.equal(consoles.ok, true); assert.equal(consoles.default, false, 'Existing headed consoles required');
    assert.equal(consoles.envForced, false, 'Hidden service override blocks qualification');
    assert.equal(consoles.services.find(service => service.key === 'web')?.headless, false);
    return { control, web, consoles, helper, preferences: preferenceHashes(ROOT), listeners: listenerInventory(ports) };
}
async function until(check, milliseconds = 90000) {
    const deadline = Date.now() + milliseconds;
    let last;
    do {
        try { const value = await check(); if (value) return value; } catch (error) { last = error.message; }
        await sleep(500);
    } while (Date.now() < deadline);
    throw Error(`${E.phase} timed out: ${last || 'required state did not converge'}`);
}
async function pointer(selector) {
    const button = page.locator(selector);
    // Render replacement may invalidate preparation; never retry an actual pointer input.
    const bounds = await until(async () => {
        await button.waitFor({ state: 'visible', timeout: 2000 });
        assert.equal(await button.count(), 1, `Expected one real production control: ${selector}`);
        await button.scrollIntoViewIfNeeded({ timeout: 2000 });
        const rect = await button.evaluate(element => {
            const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { x: r.x, y: r.y, width: r.width, height: r.height,
                hit: element === hit || element.contains(hit), visible: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        }, undefined, { timeout: 2000 });
        assert.ok(rect.width > 0 && rect.height > 0 && rect.hit && rect.visible, `Control is not pointer reachable: ${selector}`);
        return rect;
    }, 15000);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return bounds;
}
async function controllerState() {
    return page.evaluate(() => {
        const queue = window.EveAudioflix.queueConnection.snapshot(), managed = window.EveAudioflixSpotifyAnyBrowser.snapshot();
        const relay = managed.relay?.lastState || {}, audio = window.EveAudioflixAudio.getPlaybackState();
        const retired = managed.relay?.connected === false && managed.relay?.lastState === null;
        return { queue, managed: { active: managed.active, ended: managed.ended, currentTime: managed.playback?.currentTime,
            paused: managed.playback?.paused, isOwner: retired ? false : relay.isOwner, ownerPresent: Boolean(relay.ownerClientId),
            observation: managed.observation, status: relay.engine?.status }, audioItemId: audio?.item?.id || '',
            events: window.__activeRestartEvents || [] };
    });
}
async function attach(mode) {
    const entry = mode === 'file' ? pathToFileURL(path.join(ROOT, 'EveOS.html')).href : base + '/EveOS.html';
    const nonce = `${mode}-${Date.now().toString(36)}`;
    fixture = { group: `Active restart isolated ${nonce}`, prefix: `active-restart-${nonce}-` };
    H = createLongQueueHarness({ base, controllerUrl: entry, engineUrl, groupName: fixture.group,
        fixturePrefix: fixture.prefix, transitionTimeout: 90000, tailSeconds: 3, shouldStart: false, takeOver: true });
    H.validateUrls();
    E.current.preflightNotices = [];
    const originalWarn = console.warn;
    let preflight;
    try { console.warn = (...values) => E.current.preflightNotices.push(values.map(value => redact(value)).join(' '));
        preflight = await H.ensureManagedEngine(); }
    finally { console.warn = originalWarn; }
    helperReady(preflight.status, engineUrl);
    context = await browser.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
    barrier = await installBackendWriteBarrier(context, [base, controlBase, engineUrl]);
    await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.pathname === '/api/audioflix/spotify-client/command' && req.method() === 'POST') {
            let action; try { action = req.postDataJSON()?.command?.action; } catch {}
            push('playbackCommands', { mode, phase: E.phase, at: Date.now(), action });
        }
        if (!['/api/services/restart', '/api/services/updates/check'].includes(url.pathname)) return route.fallback();
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.fallback();
        let body; try { body = req.postDataJSON(); } catch {}
        const allowed = lifecycleWriteAllowed(req.method(), req.url(), body, { controlBase, webPort, permit });
        const detail = { mode, phase: E.phase, method: req.method(), url: safeUrl(req.url()), allowed };
        push(url.pathname === '/api/services/restart' ? 'restartRequests' : 'updateRequests', detail); save();
        if (!allowed) return route.fulfill({ status: 403, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ ok: false, blockedBy: 'active-restart-write-permit' }) });
        if (url.pathname === '/api/services/restart') permit.remaining = 0;
        return route.continue();
    });
    page = await context.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror', error => push('pageErrors', { mode, phase: E.phase, message: redact(error.message) }));
    page.on('console', message => {
        if (['error', 'warning'].includes(message.type())) push('console', { mode, phase: E.phase, type: message.type(), text: redact(message.text()) });
    });
    page.on('requestfailed', req => push('requestFailures', { mode, phase: E.phase,
        url: safeUrl(req.url()), message: redact(req.failure()?.errorText) }));
    await page.goto(entry, { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => window.EveAudioflix?.ready && window.EveAudioflixState?.ready
        && window.EveAudioflixSpotifyAnyBrowser?.ready && window.EveOSServiceReloadUI?.ready
        && window.EveOSConsolePanel && window.__eveCoreDataLoaded === true);
    await H.waitForControllerHydration(page); await barrier.proveBlocked(page);
    assert.equal(await page.evaluate(() => window.EveOSLocalControl.baseUrl()), controlBase);
    if (mode === 'file') {
        const discovery = await page.evaluate(async () => {
            const c = window.EveOSLocalControl, response = await c.fetchJson(c.baseUrl() + '/api/eveos-server/status', null, 15000);
            return response?.payload || response;
        });
        assert.equal(discovery.running, true); assert.equal(discovery.port, webPort);
        E.current.fileDiscovery = discovery;
    }
    const existing = await H.queueSnapshot(page);
    assert.notEqual(existing.queue?.isPlaying, true, 'Disposable controller already has active playback');
    const supplied = args.find(arg => arg.startsWith('--track='))?.slice(8) || process.env.EVE_AUDIOFLIX_SPOTIFY_LIVE_TRACK;
    let tracks = supplied ? [normalizeSpotify(supplied)] : fixtureSources.length ? [...fixtureSources] : await page.evaluate(() => (window.EveAudioflixState.ensure().music || [])
        .map(item => item.spotifyUrl || item.url || item.originalUrl || '')
        .filter(url => /(?:spotify:track:|open\.spotify\.com\/(?:embed\/)?track\/)[A-Za-z0-9]{22}/i.test(url)).slice(0, 3));
    tracks = tracks.map(normalizeSpotify).filter(Boolean);
    assert.ok(tracks.length, 'Need a real Spotify-linked source; supply --track=<URL/ID> if the library has none');
    fixtureSources = [...tracks];
    fixture.urls = Array.from({ length: 3 }, (_, index) => tracks[index % tracks.length]);
    fixture.ids = fixture.urls.map((_, index) => fixture.prefix + index); fixture.trackId = spotifyTrackId(fixture.urls[0]);
    await page.evaluate(({ urls, group, prefix }) => {
        const S = window.EveAudioflixState; S.addMusicGroup(group);
        urls.forEach((url, index) => { const item = S.addItem('music', { id: prefix + index, title: `Restart fixture ${index + 1}`,
            url, spotifyUrl: url, sourceProvider: 'spotify', type: 'music', volume: 0.04 }); S.toggleMusicGroup(item.id, group, true); });
        S.update({ musicViewMode: 'frontend', activeFrontendMusicGroup: group, activeFrontendMusicArtist: '',
            activeFrontendMusicClassifier: '', activeMusicFolderScope: '' }, 'active-restart-disposable-fixture');
        window.__activeRestartEvents = [];
        window.addEventListener('eve:audioflix-playback', event => {
            const events = window.__activeRestartEvents;
            events.push({ at: Date.now(), status: String(event.detail?.status || ''), released: event.detail?.released === true,
                itemId: String(event.detail?.item?.id || ''), index: window.EveAudioflix.queueConnection.snapshot().currentIndex });
            if (events.length > 120) events.shift();
        });
    }, { urls: fixture.urls, group: fixture.group, prefix: fixture.prefix });
    await page.evaluate(() => window.EveAudioflix.open());
    await pointer('[data-af-action="tab"][data-af-tab="music"]:visible');
    await page.waitForFunction(group => document.querySelector('.audioflix-item-grid[data-af-active-group]')?.dataset.afActiveGroup === group, fixture.group);
    E.current.playGroupGeometry = await pointer('.audioflix-frontend-subhead [data-af-action="play-music-group"]:visible');
    if (mode === 'file') E.current.pairing = await approveOwnFileSession({ browser, page, base,
        helperIdle: async () => { idleHelper(await request(base + '/api/audioflix/spotify-browser/status'), engineUrl); return true; },
        audit: approvalPage => approvalPage.on('pageerror', error => push('pageErrors', { mode, phase: E.phase, message: redact(error.message) })) });
    await H.waitForFixtureQueue(page, fixture.ids);
    const owner = await H.waitForOwnership(page, fixture.ids);
    await H.waitForTrackReady(page, 0, fixture.ids, owner.ownerEpoch, fixture.trackId);
    const first = await H.waitForManagedPlayback(fixture.trackId); playing(first, engineUrl, fixture.trackId);
    const second = await until(async () => {
        const helper = await request(base + '/api/audioflix/spotify-browser/status');
        advancing(first, helper, engineUrl, fixture.trackId); H.assertFixtureQueue(await H.queueSnapshot(page), fixture.ids, 0);
        return helper;
    }, 15000);
    fixture.startedRun = (await H.queueSnapshot(page)).queue.playbackRunId;
    E.current.playingProof = { first, second, advancedSeconds: second.transport.currentTime - first.transport.currentTime };
    E.current.entry = entry; E.current.fixture = fixture; E.current.preflight = preflight; save();
}
async function qualify(mode) {
    E.phase = `${mode}-active-playback`; E.current = { mode }; save();
    await attach(mode);
    const plan = await page.evaluate(() => window.EveOSServiceReload.checkUpdates());
    assert.match(String(plan.componentFingerprints?.web || ''), /^[a-f0-9]{64}$/);
    // Reach the real Settings surface through its public API; do not manufacture a restart control.
    await page.evaluate(() => { window.EveAudioflix.close(); window.openSettings(); });
    const selector = '#settingsModal [data-eveos-service-restart="web"]:visible';
    await page.locator(selector).waitFor(); await page.waitForFunction(() => {
        const button = document.querySelector('#settingsModal [data-eveos-service-restart="web"]'); return button && !button.disabled;
    });
    const before = await snapshot(); playing(before.helper, engineUrl, fixture.trackId);
    E.current.before = before; E.current.plan = plan;
    const initialCount = E.restartRequests.length;
    E.phase = `${mode}-confirm-arm`;
    E.current.firstPointerGeometry = await pointer(selector); await sleep(350);
    assert.equal(await page.locator(selector).getAttribute('data-eveos-restart-confirm'), 'true');
    assert.equal(await page.locator(selector).textContent(), 'Confirm restart');
    assert.equal(E.restartRequests.length, initialCount, 'First pointer dispatched a restart request');
    E.current.firstPointerSentNoRestart = true; save();
    E.phase = `${mode}-confirmed-restart`; permit = { remaining: 1 };
    E.current.commandOffset = E.playbackCommands.length;
    const responsePromise = page.waitForResponse(response => new URL(response.url()).origin === controlBase
        && new URL(response.url()).pathname === '/api/services/restart' && response.request().method() === 'POST', { timeout: 150000 });
    E.current.secondPointerGeometry = await pointer(selector);
    const response = await responsePromise;
    E.current.receipt = await response.json(); assert.equal(response.status(), 200);
    assert.equal(permit.remaining, 0); permit = null;
    assert.equal(E.restartRequests.length, initialCount + 1, 'Second pointer must dispatch exactly one restart');
    restartReceipt(E.current.receipt, before, plan.componentFingerprints.web, webPort, engineUrl); save();
    E.phase = `${mode}-idle-convergence`;
    E.current.stoppedController = await until(async () => { const value = await controllerState(); stoppedController(value, fixture); return value; });
    const idleStarted = Date.now(); E.current.idleSamples = [];
    do {
        const [helper, controller] = await Promise.all([request(base + '/api/audioflix/spotify-browser/status'), controllerState()]);
        idleHelper(helper, engineUrl); stoppedController(controller, fixture);
        // Observation must not reconnect/re-authorize a retired file-tab grant merely to inspect it.
        const relay = await page.evaluate(() => window.EveAudioflixSpotifyRemote.snapshot());
        assert.equal(relay.connected, false); assert.equal(relay.connecting, false);
        assert.equal(relay.approvalRequired, false); assert.equal(relay.lastState, null);
        E.current.idleSamples.push({ at: new Date().toISOString(), helper, controller, clientGrantRetired: true });
        await sleep(500);
    } while (Date.now() - idleStarted < 5000);
    const after = await snapshot(); preserve(before, after, webPort);
    assert.equal(after.web.instanceId, E.current.receipt.instanceId);
    assert.equal(after.web.sourceFingerprint, plan.componentFingerprints.web);
    assert.equal(E.restartRequests.length, initialCount + 1, 'A delayed duplicate restart was dispatched');
    E.current.commandsAfterRestart = E.playbackCommands.slice(E.current.commandOffset);
    assert.ok(!E.current.commandsAfterRestart.some(command => ['play', 'resume', 'restart'].includes(command.action)),
        'Restart produced an automatic playback command');
    E.current.after = after; E.current.barrier = barrier.summary();
    assert.equal(E.pageErrors.filter(error => error.mode === mode).length, 0, 'Application page errors occurred');
    await H.disposeControllerProbe(page); await context.close(); context = null; page = null;
    const libraryAfter = await backend(); assertBackendAudioflixUnchanged(E.libraryBefore, libraryAfter);
    E.current.libraryAfterCleanup = libraryAfter;
    E.cases.push({ name: `${mode}-playing-settings-web-restart`, ok: true, details: E.current }); save();
}
async function main() {
    assert.ok(args.includes('--restart') && args.includes('--take-over'),
        'Live qualification requires both --restart --take-over (exclusive Spotify stop/reset and two web replacements)');
    assert.equal(process.platform, 'win32', 'Windows listener PID/start-time proof required');
    const { launchChromiumOrConnect, getCdpEndpoint } = require('../smoke/playwright-browser.js');
    assert.equal(getCdpEndpoint(), '', 'Fresh disposable controller required; existing user/CDP browser prohibited');
    directory = path.join(ROOT, 'data/runtime/smoke-results', `audioflix-active-restart-${Date.now()}`);
    fs.mkdirSync(directory, { recursive: true });
    E = { schemaVersion: 1, ok: false, phase: 'preflight', startedAt: new Date().toISOString(), realSpotify: true,
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
        worktree: execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim(),
        cases: [], pageErrors: [], console: [], requestFailures: [], restartRequests: [], updateRequests: [], playbackCommands: [] }; save();
    const discovery = await request(controlBase + '/api/eveos-server/status');
    assert.equal(discovery.running, true); assert.equal(discovery.port, webPort, 'Registered running web port required');
    E.initial = await snapshot(); E.libraryBefore = await backend(); save();
    const launch = await launchChromiumOrConnect({ headless: args.includes('--headless'), browserName: 'chromium',
        channel: args.includes('--edge') ? 'msedge' : undefined });
    assert.equal(launch.mode, 'launch'); browser = launch.browser;
    for (const mode of ['http', 'file']) await qualify(mode);
    E.final = await snapshot();
    preserve(E.initial, E.final, webPort);
    idleHelper(E.final.helper, engineUrl); E.ok = true;
}

if (args.includes('--help')) {
    console.log('Usage: node tools/qualification/audioflix_active_restart_acceptance.mjs --restart --take-over [--edge] [--headless] [--track=URL/ID]\n'
        + 'Requires existing branded Local Control/web and a signed-in canonical managed Spotify helper; leaves the restored helper idle.\n'
        + '--check is deterministic and starts no browser, endpoints, artifacts or services.');
} else if (args.includes('--check')) {
    try { console.log(deterministicCheck()); } catch (error) { console.error(`AUDIOFLIX_ACTIVE_RESTART_CONTRACT_FAIL ${redact(error.message)}`); process.exitCode = 1; }
} else {
    try { await main(); }
    catch (error) {
        if (E) {
            E.error = { message: redact(error.message), stack: redact(error.stack, 24000) };
            E.failureHelper = await request(base + '/api/audioflix/spotify-browser/status').catch(() => null);
            if (page) {
                E.failureController = await controllerState().catch(() => null);
                await page.screenshot({ path: path.join(directory, 'failure.png') }).catch(() => {});
                E.failureSettings = await page.locator('#settingsModal').innerText().then(value => redact(value, 6000)).catch(() => 'unavailable');
            }
            save();
        }
        console.error(`AUDIOFLIX_ACTIVE_RESTART_ACCEPTANCE_FAIL ${redact(error.message)}`); process.exitCode = 1;
    } finally {
        permit = null;
        // Collect failure state before stopping only the attributable disposable fixture, never delete the helper profile.
        if (page && fixture) await page.evaluate(async prefix => {
            const queue = window.EveAudioflix?.queueConnection?.snapshot?.();
            if (queue?.entries?.length && queue.entries.every(item => String(item.id).startsWith(prefix)))
                await window.EveAudioflixAudio?.stopAll?.();
        }, fixture.prefix).catch(() => {});
        await H?.disposeControllerProbe(page).catch(() => {});
        await context?.close().catch(() => {}); await browser?.close().catch(() => {});
        if (E) {
            try {
                E.libraryAfterCleanup = await backend(); assertBackendAudioflixUnchanged(E.libraryBefore, E.libraryAfterCleanup);
                E.preferencesAfterCleanup = preferenceHashes(ROOT); assert.deepEqual(E.preferencesAfterCleanup, E.initial?.preferences);
            } catch (error) { E.ok = false; E.cleanupError = redact(error.message); process.exitCode = 1; }
            E.finishedAt = new Date().toISOString(); save();
            console.log(`${E.ok ? 'AUDIOFLIX_ACTIVE_RESTART_ACCEPTANCE_OK 2/2' : 'EVIDENCE'} ${path.relative(ROOT, directory)}`);
        }
    }
}
