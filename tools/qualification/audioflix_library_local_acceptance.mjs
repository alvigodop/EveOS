#!/usr/bin/env node
// Opt-in, disposable-profile library qualification. Audio is synthetic; no provider is played.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { installBackendWriteBarrier, readBackendAudioflixSnapshot, assertBackendAudioflixUnchanged } from '../smoke/audioflix_spotify_live_isolation.shared.js';
import { installLibrarySoakInstrumentation, attachSoakConsole, runLibrarySoak, scaleSoakFixture } from './audioflix_library_soak.mjs';
import { verifyQualificationSource, attachBrowserSourceIdentity } from './audioflix_source_identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), sourceArg = args[args.indexOf('--source') + 1];
const entrypoint = args.find(arg => arg.startsWith('--entrypoint='))?.split('=')[1] || 'both';
const scaleOnly = args.includes('--scale-only');
const soak = args.includes('--soak') || args.includes('--soak-only'), soakOnly = args.includes('--soak-only');
const soakIterations = Number(args.find(arg => arg.startsWith('--soak-iterations='))?.split('=')[1] || 500);
assert.ok(['both', 'http', 'file'].includes(entrypoint));
assert.ok(args.includes('--source') && sourceArg && !sourceArg.startsWith('--'), 'Explicit --source <backup JSON> is required');
const source = fs.realpathSync(sourceArg);
const OUT = path.join(ROOT, 'data/runtime/smoke-results', `audioflix-library-local-${Date.now()}`);
fs.mkdirSync(OUT, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHash = sha(fs.readFileSync(source));
const backup = path.join(OUT, 'source-backup.json');
execFileSync('git', ['check-ignore', '--quiet', backup], { cwd: ROOT });
fs.copyFileSync(source, backup, fs.constants.COPYFILE_EXCL);
assert.equal(sha(fs.readFileSync(backup)), sourceHash, 'Recoverable backup must be byte identical');
const raw = JSON.parse(fs.readFileSync(backup, 'utf8'));
const data = raw.data || raw;
assert.ok(Array.isArray(data.music) && data.music.length, 'Music backup required');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/eveos-ports.json'), 'utf8'));
const base = `http://127.0.0.1:${registry.ports.EVEOS_WEB_PORT.port}`;
const report = { ok: false, syntheticAudio: true, providerPlaybackClaimed: false,
    sourceHash, backupVerified: true, backupPath: backup,
    baselineScope: 'renderer-only: old render factory on current state/index/transport; not an old whole-branch runtime',
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    sourceCounts: { music: data.music.length, groups: data.musicGroups?.length || 0, folders: data.musicFolders?.length || 0 },
    entrypoints: [], scales: [], soaks: [], errors: [], browserErrors: [], monitorAdjustments: [], boots: [] };
const resultPath = path.join(OUT, 'result.json');
const write = () => fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
const stats = list => { const sorted = [...list].sort((a, b) => a - b); return { count: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * .5)] || 0, p95: sorted[Math.ceil((sorted.length - 1) * .95)] || 0, max: sorted.at(-1) || 0 }; };
const backend = () => readBackendAudioflixSnapshot(async () => {
    const response = await fetch(base + '/api/eve-state/modular/load', { signal: AbortSignal.timeout(15000) });
    assert.ok(response.ok, 'Verified web backend must already be running'); return response.json();
});
let browser, currentPage, backendBefore;
async function isolatedContext() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const barrier = await installBackendWriteBarrier(context, [base]);
    let providerBlocked = 0, playbackBlocked = 0; const blockedRequests = [];
    await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.protocol === 'file:' || url.protocol === 'data:') return route.fallback();
        if (url.origin !== base) { providerBlocked += 1; if (blockedRequests.length < 256) blockedRequests.push(request.url()); return route.abort(); }
        if (url.pathname.startsWith('/api/')) {
            if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
                if (/\/spotify-|\/native\//.test(url.pathname)) { playbackBlocked += 1; return route.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"qualificationBlocked":true}' }); }
                return route.fallback();
            }
            return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, state: null, items: [], sounds: [], folders: [], running: false }) });
        }
        return route.fallback();
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    if (soak) await context.addInitScript(installLibrarySoakInstrumentation);
    await context.addInitScript(() => {
        window.__eveSmokeNoAutoGemini = true;
        window.__libraryLongTasks = [];
        window.__libraryWindowErrors = [];
        window.addEventListener('error', event => {
            if (event.message && window.__libraryWindowErrors.length < 20) window.__libraryWindowErrors.push({
                message: event.message, filename: event.filename, line: event.lineno, stack: event.error?.stack || '',
                eventBusKeys: Object.keys(window.EventBus || {}), subscribe: typeof window.EventBus?.subscribe,
                isStub: window.EventBus?._isStub === true, isEmergency: window.EventBus?._isEmergencyImplementation === true });
        }, true);
        try { new PerformanceObserver(list => { window.__libraryLongTasks.push(...list.getEntries().map(entry => entry.duration)); if (window.__libraryLongTasks.length > 2048) window.__libraryLongTasks.splice(0, window.__libraryLongTasks.length - 2048); }).observe({ type: 'longtask', buffered: true }); } catch {}
        // Capture the real factory's context; do not replace render, events, or their ownership.
        let renderNamespace; const wrappedNamespaces = new WeakSet();
        Object.defineProperty(window, 'EveAudioflixUiRender', { configurable: true,
            get: () => renderNamespace,
            set: value => {
                renderNamespace = value;
                if (wrappedNamespaces.has(value)) return;
                wrappedNamespaces.add(value);
                const wrap = factory => function (ctx) { window.__libraryRenderCtx = ctx; return factory.call(value, ctx); };
                let create = typeof value.create === 'function' ? wrap(value.create) : value.create;
                Object.defineProperty(value, 'create', { configurable: true, get: () => create,
                    set: factory => { create = wrap(factory); } });
            }
        });
    });
    return { context, barrier, blockedRequests, counters: () => ({ ...barrier.summary(), providerBlocked, playbackBlocked }) };
}

async function boot(url, payload, scale = false) {
    report.phase = `boot-${new URL(url).protocol}`; write();
    const isolated = await isolatedContext(), page = await isolated.context.newPage(); currentPage = page;
    const sourceIdentity = attachBrowserSourceIdentity(page, report.sourceIdentity, url);
    const consoleProbe = soak ? attachSoakConsole(page) : null;
    const pageErrors = [];
    const requestFailures = [];
    page.on('requestfailed', request => {
        const url = new URL(request.url());
        if (requestFailures.length < 64) requestFailures.push({ url: `${url.protocol}//${url.host}${url.pathname}`, error: request.failure()?.errorText || '' });
    });
    page.on('pageerror', error => {
        const stack = error.stack || String(error); pageErrors.push(stack);
        report.browserErrors.push({ phase: report.phase, stack }); write();
    });
    const started = performance.now();
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.EveAudioflix?.ready && window.__libraryRenderCtx && window.__EVE_DEFERRED_SCRIPT_STATE?.completedAt, undefined, { timeout: 120000 });
    const loadedSource = await sourceIdentity.verifyLoaded();
    assert.deepEqual(loadedSource.unobservedFiles, [], 'Every critical candidate module must actually load in the qualified browser');
    const bootMs = performance.now() - started;
    const runtime = await page.evaluate(() => ({ eventBusKeys: Object.keys(window.EventBus || {}),
        subscribe: typeof window.EventBus?.subscribe, lexicalSubscribe: typeof EventBus === 'undefined' ? 'undefined' : typeof EventBus.subscribe,
        isStub: window.EventBus?._isStub === true, isEmergency: window.EventBus?._isEmergencyImplementation === true,
        eventBusScript: [...document.scripts].filter(script => /event-bus\.js/.test(script.src)).map(script => script.src) }));
    report.boots.push({ phase: report.phase, bootMs, runtime, requestFailures, loadedSource }); write();
    const bootErrors = await page.evaluate(() => window.__libraryWindowErrors);
    if (bootErrors.length) { report.browserErrors.push(...bootErrors.map(error => ({ phase: report.phase, ...error }))); write(); }
    assert.deepEqual(bootErrors, [], 'No bootstrap errors may be hidden by Search Monitor error handling');
    await settleMonitor(page);
    await isolated.barrier.proveBlocked(page);
    const libraryStarted = performance.now();
    const installed = await page.evaluate(({ input, scale }) => {
        const started = performance.now();
        window.EveAudioflixState.replaceState({ ...input, musicViewMode: 'backend' }, 'local-library-disposable-qualification', { authoritative: true });
        const st = window.EveAudioflixState.ensure();
        const groups = [...new Set(st.music.map(item => String(item.folder || item.card || '').trim() || 'Ungrouped'))];
        Object.assign(window.__libraryRenderCtx.getCollapsedGroups(), Object.fromEntries(groups.map(group => [group, true])));
        const audio = window.EveAudioflixAudio, fake = window.__librarySyntheticAudio = { item: null, paused: true, volume: 1 };
        const emitSyntheticPlayback = (status, item, paused) => {
            const detail = { status, item, synthetic: true };
            window.dispatchEvent(new CustomEvent('eve:audioflix-playback', { detail }));
            window.dispatchEvent(new CustomEvent('eve:audioflix-progress', { detail: {
                item, currentTime: paused ? 0 : 12, duration: paused ? 0 : 120, paused, synthetic: true
            } }));
        };
        audio.playItem = async item => {
            Object.assign(fake, { item, paused: false, volume: item.volume ?? 1 });
            emitSyntheticPlayback(`Playing ${item.title || 'audio'}`, item, false);
            return true;
        };
        audio.stopItemLayers = async id => {
            if (String(fake.item?.id) === String(id)) {
                const stopped = fake.item;
                Object.assign(fake, { item: null, paused: true });
                emitSyntheticPlayback('Stopped', stopped, true);
            }
            return true;
        };
        audio.stopAll = async () => {
            const stopped = fake.item;
            Object.assign(fake, { item: null, paused: true });
            if (stopped) emitSyntheticPlayback('Stopped', stopped, true);
            return true;
        };
        audio.getPlaybackState = () => ({ ...fake, duration: fake.paused ? 0 : 120, currentTime: fake.paused ? 0 : 12, browserOnly: false });
        audio.updateItemVolume = (id, volume) => { if (String(fake.item?.id) === String(id)) fake.volume = volume; };
        audio.attachWaveform = () => {};
        if (scale) window.EveAudioflix.open(); else window.EveAudioflix.openNexus('music', true);
        return { installMs: performance.now() - started, music: st.music.length, groups: st.musicGroups.length, folders: st.musicFolders.length };
    }, { input: payload, scale });
    assert.equal(installed.music, payload.music.length, 'No record may be silently truncated');
    if (scale) await page.locator('[data-af-tab="music"]').click();
    await page.waitForSelector('.audioflix-group-title');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const libraryUsableMs = performance.now() - libraryStarted;
    assert.equal(await page.locator('.audioflix-item-card').count(), 0, 'Collapsed initial library has no mounted song cards');
    return { ...isolated, page, pageErrors, bootMs, libraryUsableMs, installed, consoleProbe, sourceIdentity };
}

async function settleMonitor(page) {
    const state = await page.evaluate(() => {
        const indicator = document.getElementById('loadingIndicator');
        return { expanded: !!indicator && !indicator.classList.contains('compact'), error: indicator?.classList.contains('error') === true,
            message: indicator?.querySelector('#searchStatus')?.textContent || '', errors: window.__libraryWindowErrors };
    });
    if (state.errors.length) { report.browserErrors.push(...state.errors.map(error => ({ phase: report.phase, ...error }))); write(); }
    assert.deepEqual(state.errors, [], 'No bootstrap error may be suppressed by the application error monitor');
    assert.equal(state.error, false, `Search Monitor reported a real bootstrap error: ${state.message}`);
    if (!state.expanded) return;
    // The normal user Escape action collapses an unrelated peer panel; never hide it with CSS.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('loadingIndicator')?.classList.contains('compact'), undefined, { timeout: 2000 });
    report.monitorAdjustments.push({ phase: report.phase, action: 'native-Escape', compact: true });
}

async function topology(page) {
    return page.evaluate(() => {
        const st = window.EveAudioflixState.ensure();
        return { music: st.music.map(item => [item.id, item.folder, item.card, item.playlistId, item.sourceId]),
            folders: st.musicFolders, groups: st.musicGroups, parents: st.musicGroupParents, map: st.musicGroupMap,
            playlists: st.musicPlaylists, ports: st.musicPortConnections, bindings: st.scopeBindings };
    });
}

async function qualifyReal(url, entrypoint) {
    const run = await boot(url, data), { page } = run;
    try {
        const before = await topology(page);
        assert.deepEqual(before.music.map(item => item[0]), data.music.map(item => item.id), 'Real-library IDs and order survive load');
        const target = await page.evaluate(() => {
            const st = window.EveAudioflixState.ensure(), groups = new Map();
            for (const item of st.music) { const key = String(item.folder || item.card || '').trim() || 'Ungrouped'; groups.set(key, (groups.get(key) || 0) + 1); }
            const direct = item => (item.localPath && !item.missingLocal) || !/spotify/i.test(String(item.url || item.sourceProvider || ''));
            const [group, count] = [...groups].sort((a, b) => b[1] - a[1]).find(([name]) => st.music.some(item => (String(item.folder || item.card || '').trim() || 'Ungrouped') === name && direct(item)));
            const item = st.music.filter(item => (String(item.folder || item.card || '').trim() || 'Ungrouped') === group && direct(item)).at(-1);
            return { id: item.id, group, count, volume: item.volume, query: item.title, largestGroupCount: Math.max(...groups.values()) };
        });
        const header = page.locator(`.audioflix-group-title[data-af-group="${CSSSafe(target.group)}"]`);
        const expansion = [];
        for (let i = 0; i < 3; i += 1) {
            await settleMonitor(page);
            const at = performance.now(); await header.click();
            assert.equal(await page.locator('.audioflix-item-card').count(), target.count);
            expansion.push(performance.now() - at); await header.click();
            assert.equal(await page.locator('.audioflix-item-card').count(), 0);
        }
        const input = page.locator('[data-af-nexus-search][data-af-type="music"]');
        const searchAt = performance.now(); await input.fill(target.query);
        const exactJump = page.locator(`[data-af-action="nexus-jump-card"][data-af-id="${CSSSafe(target.id)}"]`);
        await exactJump.waitFor({ timeout: 15000 });
        const searchMs = performance.now() - searchAt;
        await exactJump.click();
        const play = page.locator(`.audioflix-item-card [data-af-action="play"][data-af-type="music"][data-af-id="${CSSSafe(target.id)}"]`);
        await play.waitFor(); await play.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000); // Let Jump-to-card's existing smooth scroll settle before measuring.
        await page.evaluate(id => {
            const button = [...document.querySelectorAll('.audioflix-item-card [data-af-action="play"]')].find(button => button.dataset.afId === String(id));
            window.__libraryPointerNode = button.closest('.audioflix-item-card');
            window.__libraryScroll = document.querySelector('.audioflix-panel').scrollTop;
        }, target.id);
        const playAt = performance.now(); await play.click();
        await page.waitForFunction(id => String(window.__librarySyntheticAudio.item?.id) === String(id) && !window.__librarySyntheticAudio.paused, target.id);
        const playMs = performance.now() - playAt;
        const slider = page.locator(`.audioflix-volume-slider[data-af-id="${CSSSafe(target.id)}"]`);
        await slider.focus(); const box = await slider.boundingBox(); assert.ok(box && box.width > 0 && box.height > 0);
        const volumeAt = performance.now();
        await page.mouse.move(box.x + box.width * .25, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + box.width * .7, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
        const volumeDragMs = performance.now() - volumeAt;
        const pointer = await page.evaluate(id => {
            const button = [...document.querySelectorAll('.audioflix-item-card [data-af-action="play"]')].find(button => button.dataset.afId === String(id));
            const value = Number(document.activeElement?.value);
            return { sameNode: window.__libraryPointerNode === button.closest('.audioflix-item-card'),
                focus: document.activeElement?.classList.contains('audioflix-volume-slider'), liveVolume: window.__librarySyntheticAudio.volume,
                stateVolume: window.EveAudioflixState.ensure().music.find(item => String(item.id) === String(id)).volume,
                sliderVolume: value, scrollDelta: Math.abs(document.querySelector('.audioflix-panel').scrollTop - window.__libraryScroll) };
        }, target.id);
        assert.equal(pointer.sameNode, true); assert.equal(pointer.focus, true);
        assert.ok(Math.abs(pointer.liveVolume - pointer.sliderVolume) < .001 && Math.abs(pointer.stateVolume - pointer.sliderVolume) < .001);
        assert.ok(pointer.scrollDelta <= 2, 'Deep controls must retain scroll position');
        const stopAt = performance.now();
        await page.locator(`.audioflix-item-card [data-af-action="stop-item"][data-af-id="${CSSSafe(target.id)}"]`).click();
        await page.waitForFunction(() => window.__librarySyntheticAudio.paused === true);
        const stopMs = performance.now() - stopAt;
        assert.equal(await input.inputValue(), target.query, 'Main Nexus query remains after jump and playback controls');
        await settleMonitor(page);
        await page.evaluate(({ id, volume }) => window.EveAudioflixState.updateItem('music', id, { volume }), target);
        const after = await topology(page);
        assert.equal(sha(JSON.stringify(after)), sha(JSON.stringify(before)), 'UI exercise preserves every ID and structural relationship');
        assert.deepEqual(run.pageErrors, []);
        const barrier = run.counters(); assert.equal(barrier.allowedPlaybackCount, 0, 'No provider-control mutation may escape the isolated fixture');
        report.entrypoints.push({ entrypoint, ...run.installed, bootMs: run.bootMs, expansion: stats(expansion), searchMs, playMs, volumeDragMs, stopMs,
            pointer, topologyUnchanged: true, idsPreserved: true, initialMountedCards: 0, largestRealGroupCount: target.largestGroupCount, pointerGroupCount: target.count,
            longTasks: stats(await page.evaluate(() => window.__libraryLongTasks)), barrier });
        write();
    } catch (error) { await failureEvidence(page); throw error; }
    finally { await run.context.close(); }
}
function CSSSafe(value) { return String(value).replace(/[\\"]/g, '\\$&'); }
async function failureEvidence(page) {
    const debug = await page.evaluate(() => window.__soakDebug || null).catch(() => null);
    if (debug) fs.writeFileSync(path.join(OUT, 'soak-debug.json'), JSON.stringify(debug, null, 2));
    const soakFailure = await page.evaluate(() => window.__librarySoak ? { resources: window.__librarySoak.snapshot(),
        calls: window.__soakCalls, search: window.__soakSearchDebug, searchTrace: window.__soakSearchTrace,
        diagnostics: window.EveAudioflixDiagnostics?.snapshot?.(), revision: window.EveAudioflixState?.getRevision?.() } : null).catch(() => null);
    if (soakFailure) fs.writeFileSync(path.join(OUT, 'soak-failure-diagnostics.json'), JSON.stringify(soakFailure, null, 2));
    await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(OUT, 'failure.html'), await page.content().catch(() => 'unavailable'));
}
async function bounded(work, ms, label) {
    let timer;
    try { return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms; test-owned browser only`)), ms); })]); }
    finally { clearTimeout(timer); }
}

async function frontendProbe(run, count) {
    report.phase = `frontend-all-groups-${count}`; write();
    const { page } = run, cdp = await run.context.newCDPSession(page);
    const resources = async () => ({ dom: await cdp.send('Memory.getDOMCounters'), heap: await cdp.send('Runtime.getHeapUsage') });
    try {
        const before = await resources();
        const longTaskStart = await page.evaluate(() => window.__libraryLongTasks.length);
        await settleMonitor(page);
        const at = performance.now();
        await bounded(async () => {
            await page.locator('[data-af-action="toggle-view-mode"][data-af-type="music"]').click({ timeout: 30000 });
            await page.waitForFunction(() => document.querySelectorAll('#audioflix-overlay .audioflix-item-card').length === 200, undefined, { timeout: 30000 });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }, 60000, `Frontend All Groups ${count} render/layout`);
        const renderLayoutMs = performance.now() - at;
        const mountedCards = await page.locator('.audioflix-item-card').count(); assert.equal(mountedCards, 200);
        const grid = page.locator('.audioflix-item-grid[data-af-active-group]');
        assert.match(await grid.locator('.audioflix-card-pages').textContent(), new RegExp(`of ${count} tracks`));
        const tail = page.locator('.audioflix-item-card').last();
        await tail.scrollIntoViewIfNeeded();
        const identity = await tail.locator('[data-af-action="play"]').getAttribute('data-af-id');
        await tail.evaluate(card => { window.__frontendCard = card; window.__frontendScroll = document.querySelector('.audioflix-panel').scrollTop; });
        const inputAt = performance.now(); await tail.locator('[data-af-action="play"]').click();
        await page.waitForFunction(id => String(window.__librarySyntheticAudio.item?.id) === id, identity);
        const playMs = performance.now() - inputAt;
        const slider = tail.locator('.audioflix-volume-slider'); await slider.focus();
        await page.keyboard.press('ArrowLeft');
        const pointer = await page.evaluate(id => {
            const card = [...document.querySelectorAll('.audioflix-item-card')].find(card => card.querySelector('[data-af-action="play"]')?.dataset.afId === id);
            return { sameNode: card === window.__frontendCard, focused: document.activeElement?.classList.contains('audioflix-volume-slider'),
                scrollDelta: Math.abs(document.querySelector('.audioflix-panel').scrollTop - window.__frontendScroll),
                liveVolume: window.__librarySyntheticAudio.volume, sliderVolume: Number(document.activeElement?.value) };
        }, identity);
        assert.equal(pointer.sameNode, true); assert.equal(pointer.focused, true); assert.ok(pointer.scrollDelta <= 2);
        assert.ok(Math.abs(pointer.liveVolume - pointer.sliderVolume) < .001);
        await tail.locator('[data-af-action="stop-item"]').click();
        await grid.locator('[data-af-window-step="1"]').click();
        assert.equal(await grid.locator('.audioflix-item-card').count(), 200);
        assert.equal(await grid.locator('[data-af-action="play"]').first().getAttribute('data-af-id'), `local_scale_${count}_200`);
        await grid.locator('[data-af-window-step="-1"]').click();
        assert.equal(await grid.locator('[data-af-action="play"]').first().getAttribute('data-af-id'), `local_scale_${count}_0`);
        const farId = `local_scale_${count}_${count - 1}`;
        await page.locator('[data-af-action="open-nexus-quick"][data-af-type="music"]').click();
        await page.locator('.audioflix-nexus-quick input[type="search"]').fill(`Scale Track ${count - 1}`);
        await page.locator(`.audioflix-nexus-quick [data-quick-action="jump"][data-af-id="${farId}"]`).click({ timeout: 10000 });
        await page.waitForFunction(id => document.querySelector('.is-nexus-jump-target [data-af-action="play"]')?.dataset.afId === id, farId);
        assert.equal(await grid.locator('[data-af-action="play"]').last().getAttribute('data-af-id'), farId);
        assert.equal(await grid.locator('.audioflix-item-card').count(), 200);
        await page.locator('[data-af-action="toggle-nexus"][data-af-type="music"]').click();
        const search = page.locator('[data-af-nexus-search][data-af-type="music"]');
        await search.fill('Scale Track 0');
        await page.locator(`[data-af-action="nexus-jump-card"][data-af-id="local_scale_${count}_0"]`).click();
        await page.waitForFunction(id => document.querySelector('.is-nexus-jump-target [data-af-action="play"]')?.dataset.afId === id, `local_scale_${count}_0`);
        assert.equal(await search.inputValue(), 'Scale Track 0');
        assert.equal(await page.locator('.audioflix-nexus-panel').count(), 1);
        assert.equal(await page.evaluate(() => window.EveAudioflixState.ensure().musicViewMode), 'frontend');
        await page.locator('[data-af-action="play-music-group"]').click();
        await page.waitForFunction(size => window.EveAudioflix.queueConnection.snapshot().entries.length === size, count);
        const fullScope = await page.evaluate(size => {
            const state = window.EveAudioflixState.ensure(), queue = window.EveAudioflix.queueConnection.snapshot();
            return { stateCount: state.music.length, queueCount: queue.entries.length, folderCount: state.musicFolders.length,
                stateIdsIntact: state.music.every((item, i) => item.id === `local_scale_${size}_${i}`),
                queueIdsIntact: queue.entries.every((item, i) => item.id === `local_scale_${size}_${i}`),
                queuePlaying: queue.isPlaying };
        }, count);
        assert.equal(fullScope.stateCount, count); assert.equal(fullScope.queueCount, count); assert.equal(fullScope.folderCount, 50);
        assert.equal(fullScope.stateIdsIntact, true); assert.equal(fullScope.queueIdsIntact, true); assert.equal(fullScope.queuePlaying, true);
        assert.equal(await page.locator('.audioflix-item-card').count(), 200);
        await page.locator('[data-af-action="stop-music-group"]').click();
        assert.equal(await page.evaluate(() => window.EveAudioflix.queueConnection.snapshot().isPlaying), false);
        await settleMonitor(page);
        return { scope: 'real current Frontend All Groups; synthetic media only', renderLayoutMs, mountedCards, pageSize: 200, playMs, pointer, fullScope,
            navigation: { next: true, previous: true, offPageFastTrack: true, offPageMainNexus: true, mainQueryPreserved: true },
            resourcesBefore: before, resourcesAfter: await resources(),
            longTasks: stats(await page.evaluate(start => window.__libraryLongTasks.slice(start), longTaskStart)) };
    } finally { await cdp.detach().catch(() => {}); }
}

async function qualifyScale(count, baselineSource) {
    const fixture = { music: Array.from({ length: count }, (_, i) => ({ id: `local_scale_${count}_${i}`, title: `Scale Track ${i}`, folder: `Scale ${i % 50}`, artist: `Artist ${i % 100}`, url: `https://media.invalid/${i}.mp3`, duration: 120, exposed: true })),
        musicFolders: Array.from({ length: 50 }, (_, i) => `Scale ${i}`), musicGroups: [], musicGroupMap: {}, musicPlaylists: [] };
    const run = await boot(base + '/EveOS.html', fixture, true), { page } = run;
    try {
        const benchmark = await page.evaluate(({ baselineSource, count }) => {
            const ctx = window.__libraryRenderCtx, sandbox = {};
            const proxy = new Proxy(window, { get: (target, key) => key === 'EveAudioflixUiRender' ? sandbox : Reflect.get(target, key, target) });
            new Function('window', baselineSource.slice(baselineSource.indexOf('(function () {')))(proxy);
            const baseline = sandbox.create(ctx), candidate = window.EveAudioflixUiRender.create(ctx);
            const st = window.EveAudioflixState.ensure(), rows = [];
            for (const [name, render] of [['baseline', baseline], ['candidate', candidate]]) for (let i = 0; i < 3; i += 1) {
                const at = performance.now(), html = render.renderItems(st.music, 'music');
                const renderMs = performance.now() - at, host = document.createElement('div'), domAt = performance.now();
                host.innerHTML = html;
                rows.push({ name, renderMs, mountMs: performance.now() - domAt, cards: host.querySelectorAll('.audioflix-item-card').length, nodes: host.querySelectorAll('*').length, htmlBytes: html.length });
                host.replaceChildren();
            }
            return { count, rows };
        }, { count, baselineSource });
        const old = benchmark.rows.filter(row => row.name === 'baseline'), next = benchmark.rows.filter(row => row.name === 'candidate');
        assert.ok(old.every(row => row.cards === count)); assert.ok(next.every(row => row.cards === 0));
        const expand = []; const header = page.locator('.audioflix-group-title').first();
        for (let i = 0; i < 3; i += 1) {
            const at = performance.now(); await header.click();
            assert.equal(await page.locator('.audioflix-item-card').count(), count / 50 > 400 ? 200 : count / 50); expand.push(performance.now() - at);
            await header.click(); assert.equal(await page.locator('.audioflix-item-card').count(), 0);
        }
        assert.deepEqual(run.pageErrors, []);
        const barrier = run.counters(); assert.equal(barrier.allowedPlaybackCount, 0);
        const row = { count, layout: 'backend 50 equally-sized folders; measured current Frontend All Groups separately', ...run.installed, baseline: { renderMs: stats(old.map(row => row.renderMs)), mountMs: stats(old.map(row => row.mountMs)), mountedCards: count, nodes: old[0].nodes },
            candidate: { renderMs: stats(next.map(row => row.renderMs)), mountMs: stats(next.map(row => row.mountMs)), mountedCards: 0, nodes: next[0].nodes }, largestGroupExpansion: stats(expand), largestGroupCanonicalMembers: count / 50, largestExpandedGroupCards: count / 50 > 400 ? 200 : count / 50,
            frontend: null, longTasks: stats(await page.evaluate(() => window.__libraryLongTasks)), barrier };
        report.scales.push(row); write();
        row.frontend = await frontendProbe(run, count); write();
    } catch (error) { await failureEvidence(page); throw error; }
    finally { await run.context.close(); }
}

async function qualifySoak(url, payload, label) {
    report.phase = `soak-${label}`;
    const run = await boot(url, payload, true);
    try {
        const row = await runLibrarySoak(run, { label, topology, settleMonitor, hash: sha, iterations: soakIterations, onProgress: progress => { report.soakProgress = progress; write(); } });
        row.loadedSource = await run.sourceIdentity.verifyLoaded();
        assert.deepEqual(run.pageErrors, []); assert.equal(run.counters().allowedPlaybackCount, 0);
        report.soaks.push({ ...row, barrier: run.counters(), bootMs: run.bootMs, libraryUsableMs: run.libraryUsableMs }); write();
    } catch (error) { await failureEvidence(run.page); throw error; }
    finally { await run.context.close(); }
}

try {
    report.sourceIdentity = await verifyQualificationSource({ root: ROOT, base, expectedHead: report.head }); write();
    backendBefore = await backend(); report.backendBefore = backendBefore;
    browser = await chromium.launch({ headless: true });
    if (!soakOnly && !scaleOnly && entrypoint !== 'file') await qualifyReal(base + '/EveOS.html', 'http');
    if (!soakOnly && !scaleOnly && entrypoint !== 'http') await qualifyReal(pathToFileURL(path.join(ROOT, 'EveOS.html')).href, 'file');
    if (!soakOnly && !args.includes('--skip-scale')) {
        const baseline = execFileSync('git', ['show', '967f8cc3e:js/modules/features/audioflix/audioflix.ui.render.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 2 ** 20 });
        report.baselineRevision = '967f8cc3e';
        await qualifyScale(10000, baseline); await qualifyScale(25000, baseline);
    }
    if (soak) {
        if (!scaleOnly && entrypoint !== 'file') await qualifySoak(base + '/EveOS.html', data, 'real-http');
        if (!scaleOnly && entrypoint !== 'http') await qualifySoak(pathToFileURL(path.join(ROOT, 'EveOS.html')).href, data, 'real-file');
        if (!args.includes('--skip-scale')) await qualifySoak(base + '/EveOS.html', scaleSoakFixture(25000), 'synthetic-25000');
        const failures = report.soaks.filter(row => !row.budgetPassed);
        assert.equal(failures.length, 0, `Soak timing targets failed: ${failures.map(row => row.label).join(',')}; see recorded phase measurements`);
    }
    report.ok = true;
} catch (error) {
    report.errors.push(String(error.stack || error)); process.exitCode = 1;
    if (currentPage && !currentPage.isClosed()) {
        await currentPage.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
        fs.writeFileSync(path.join(OUT, 'failure.html'), await currentPage.content().catch(() => 'unavailable'));
    }
} finally {
    if (browser) await browser.close();
    try { if (report.sourceIdentity) report.sourceIdentityAfter = await verifyQualificationSource({ root: ROOT, base, expectedHead: report.head }); }
    catch (error) { report.errors.push(String(error.stack || error)); report.ok = false; process.exitCode = 1; }
    report.sourceUnchanged = sha(fs.readFileSync(source)) === sourceHash;
    try { const after = await backend(); report.backendAfter = after; if (backendBefore) assertBackendAudioflixUnchanged(backendBefore, after); report.backendUnchanged = backendBefore ? true : null; }
    catch (error) { report.errors.push(String(error.stack || error)); report.ok = false; process.exitCode = 1; }
    if (!report.sourceUnchanged) { report.ok = false; process.exitCode = 1; report.errors.push('Source backup changed externally during qualification; no source was restored.'); }
    write();
}
if (report.ok) console.log(`AUDIOFLIX_LIBRARY_LOCAL_ACCEPTANCE_OK entrypoints=${report.entrypoints.map(row => row.entrypoint).join(',')} realTracks=${data.music.length} scale=${report.scales.map(row => row.count).join(',') || 'SKIPPED'} soak=${report.soaks.map(row => row.label).join(',') || 'SKIPPED'} syntheticAudio=true result=${resultPath}`);
else console.error('AUDIOFLIX_LIBRARY_LOCAL_ACCEPTANCE_FAIL\n' + report.errors.join('\n').split('\n').slice(0, 38).join('\n') + '\nresult=' + resultPath);
