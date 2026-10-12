#!/usr/bin/env node
// Opt-in real provider proof. Fresh controller contexts never write the saved library.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createLongQueueHarness } from '../smoke/audioflix_spotify_long_queue_live_support.mjs';
import { validateBackendUrls, installBackendWriteBarrier, readBackendAudioflixSnapshot,
    assertBackendAudioflixUnchanged } from '../smoke/audioflix_spotify_live_isolation.shared.js';
import { approveOwnFileSession } from './audioflix_file_pairing.shared.mjs';
import { qualifyTypedNaturalSequence } from './audioflix_typed_natural.shared.mjs';
import { settleNaturalProbe } from '../smoke/audioflix_spotify_long_queue_natural.mjs';

const require = createRequire(import.meta.url);
const ROOT = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const { parseMedia } = require('../../server_modules/audioflix_spotify_media_identity.js');
const args = process.argv.slice(2);
const natural = args.includes('--natural');
const value = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1) || '';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const E = { ok: false, realSpotify: true, seekAssisted: !natural, naturalCompletionClaimed: false,
    phase: 'arguments', cases: [], startedAt: new Date().toISOString() };
let artifact;
function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, field]) =>
        [key, /^(?:sessionId|clientToken|token|secret|csrf|pairId|approvalUrl)$/i.test(key) ? '[redacted]' : redact(field)]));
    return typeof value === 'string' ? value.replace(/([?&](?:pair|token|csrf|secret)=)[^&#\s]+/gi, '$1[redacted]') : value;
}
function checkpoint(phase) {
    if (phase) E.phase = phase;
    if (artifact) fs.writeFileSync(artifact, JSON.stringify(redact(E), null, 2));
}
function publicHelper(status) {
    return { ok: status.ok, helperReachable: status.helperReachable, sessionPresent: status.sessionPresent,
        authState: status.authState, state: status.state, playingCount: status.playingCount,
        mediaUris: status.mediaUris, desiredVolume: status.desiredVolume, lastAppliedAt: status.lastAppliedAt,
        transport: status.transport, lastError: status.lastError };
}
async function until(check, milliseconds = 60000) {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) { const result = await check(); if (result) return result; await sleep(300); }
    throw Error(`Typed media qualification timed out at ${E.phase} after ${milliseconds}ms`);
}
function assertIdentity(engine, media) {
    assert.equal(engine?.spotifyUri, media.spotifyUri, 'Full typed engine URI must match');
    assert.equal(engine?.mediaType, media.mediaType, 'Engine media namespace must match');
    assert.equal(engine?.spotifyId, media.spotifyId, 'Engine media ID must match');
}
async function snapshot(page) {
    return page.evaluate(() => {
        const managed = window.EveAudioflixSpotifyAnyBrowser.snapshot(), relay = managed.relay.lastState || {};
        return { queue: window.EveAudioflix.queueConnection.snapshot(), active: managed.active,
            itemId: managed.item?.id, playback: managed.playback, engine: relay.engine,
            isOwner: relay.isOwner, ownerEpoch: relay.ownerEpoch, engineEpoch: relay.engineEpoch,
            volume: window.EveAudioflixSpotifyAnyBrowser.volumeDiagnostics(), observation: managed.observation,
            queueViewOpen: window.EveAudioflixAudio.isInternalViewOpen()
                || window.EveAudioflixSpotifyEngineSurface?.snapshot?.().open === true,
            events: window.__eveTypedMediaProbe?.events || [], lastVolume: window.__eveTypedMediaProbe?.lastVolume };
    });
}
async function installProbe(page) {
    await page.evaluate(() => {
        const remote = window.EveAudioflixSpotifyRemote, original = remote.send;
        const probe = window.__eveTypedMediaProbe = { events: [], lastVolume: null };
        probe.listener = event => {
            if (event.detail?.status !== 'Ended') return;
            const engine = remote.snapshot().lastState?.engine || {};
            probe.events.push({ itemId: event.detail.item?.id, spotifyId: engine.spotifyId, spotifyUri: engine.spotifyUri,
                mediaType: engine.mediaType, generation: engine.generation, completionId: engine.completionId,
                run: window.EveAudioflix.queueConnection.snapshot().playbackRunId,
                visibility: document.visibilityState });
            if (probe.events.length > 12) probe.events.shift();
        };
        window.addEventListener('eve:audioflix-playback', probe.listener);
        // Observation only: preserve original command payload, receiver, result and rejection.
        probe.originalSend = original;
        probe.send = async function (action, payload, options) {
            const result = await original.call(remote, action, payload, options);
            if (action === 'volume') {
                const applied = result?.volumeResult || {};
                probe.lastVolume = { payload: { ...payload }, ok: result?.ok,
                    result: { ok: applied.ok, volume: applied.volume, reached: applied.reached,
                        held: applied.held, playingVolumes: applied.playingVolumes } };
            }
            return result;
        };
        remote.send = probe.send;
    });
}
async function ready(page, H, expectedIds, index, media, owner = null) {
    let firstTime = null;
    return until(async () => {
        const current = await snapshot(page);
        if (current.queue?.currentIndex !== index || !current.active || !current.isOwner
            || current.itemId !== expectedIds[index] || current.engine?.spotifyUri !== media.spotifyUri) return false;
        H.assertFixtureQueue(current, expectedIds, index);
        assert.equal(current.itemId, expectedIds[index]);
        assert.equal(current.queueViewOpen, false, 'Play Group qualification never opens Queue View');
        assertIdentity(current.engine, media);
        if (owner) {
            assert.equal(current.ownerEpoch, owner.ownerEpoch, 'Queue handoff must retain controller ownership');
            assert.equal(current.engineEpoch, owner.engineEpoch, 'Engine must not restart during queue handoff');
        }
        const status = await H.jsonRequest('/api/audioflix/spotify-browser/status');
        E.currentHelper = publicHelper(status);
        assert.equal(status.authState, 'signed-in', 'Signed-in provider session required');
        assertIdentity(status.transport, media);
        if (status.playingCount < 1 || status.transport?.paused !== false) return false;
        assert.deepEqual([...new Set(status.mediaUris || [])], [media.spotifyUri], 'Actual playing iframe media URI must match only the fixture');
        assert.equal(status.transport.generation, current.engine.generation, 'Provider and controller generation must agree');
        const time = Number(status.transport.currentTime || 0);
        if (firstTime === null) firstTime = time;
        if (time - firstTime < 1 || current.playback.paused !== false) return false;
        return { current, helper: publicHelper(status), observedAdvanceSeconds: time - firstTime };
    });
}
async function volume(page, H, media, itemId) {
    checkpoint('current-item-volume');
    const before = await H.jsonRequest('/api/audioflix/spotify-browser/status');
    const expected = await page.evaluate(({ id, gain }) => {
        window.EveAudioflixAudio.updateItemVolume(id, gain);
        return window.EveAudioflixOutputPort?.effective?.(gain) ?? gain;
    }, { id: itemId, gain: 0.04 });
    const proof = await until(async () => {
        const current = await snapshot(page), applied = current.lastVolume;
        if (!applied || current.volume.inFlight || current.volume.pending) return false;
        assertIdentity(applied.payload, media);
        assert.equal(applied.ok, true, 'Canonical volume lane must receive success');
        assert.equal(applied.result.held, true, 'Provider must report the playing element retained volume');
        assert.ok(applied.result.reached >= 1, 'Volume must reach an actual media element');
        assert.ok(applied.result.playingVolumes?.length > 0, 'Readback requires an actual playing media element');
        assert.ok(applied.result.playingVolumes.every(gain => Math.abs(gain - expected) <= 0.011));
        const status = await H.jsonRequest('/api/audioflix/spotify-browser/status');
        assertIdentity(status.transport, media);
        assert.ok(status.lastAppliedAt > before.lastAppliedAt);
        assert.ok(Math.abs(status.desiredVolume - expected) < 0.0001);
        return { expected, applied, helper: publicHelper(status), audibleChangeClaimed: false };
    }, 10000);
    return proof;
}
async function qualify(browser, base, controllerUrl, episode, track, ordinal) {
    const groupName = `Typed media isolated ${Date.now()}-${ordinal}`, fixturePrefix = `typed-media-${Date.now()}-${ordinal}-`;
    const expectedIds = [fixturePrefix + '0', fixturePrefix + '1'];
    const H = createLongQueueHarness({ base, controllerUrl, engineUrl: base + '/tools/audioflix/spotify-engine.html',
        groupName, fixturePrefix, transitionTimeout: 60000, tailSeconds: 3, shouldStart: true, takeOver: true });
    H.validateUrls();
    const result = { entrypoint: new URL(controllerUrl).protocol, controllerUrl, fixtureIds: expectedIds, ok: false };
    E.cases.push(result);
    let context, page, barrier, preflight, sampler;
    try {
        checkpoint('managed-preflight');
        preflight = await H.ensureManagedEngine();
        assert.equal(preflight.status.authState, 'signed-in', 'Log into the normal managed Spotify profile before qualification');
        result.preflight = { signedIn: true, startedByDriver: preflight.startedBySmoke };
        context = await browser.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
        barrier = await installBackendWriteBarrier(context, [base]);
        page = await context.newPage();
        if (natural) {
            const cdp = await browser.newBrowserCDPSession();
            const processes = await cdp.send('SystemInfo.getProcessInfo'); await cdp.detach();
            sampler = require('./lane3-runtime-metrics.cjs').createRuntimeSampler({
                backendPort: Number(new URL(base).port), controllerRootPids: processes.processInfo
                    .filter(item => item.type === 'browser').map(item => item.id), intervalMs: 15000, maxSamples: 300 });
            await sampler.start('typed-natural');
        }
        result.pageErrors = []; result.warnings = [];
        page.on('pageerror', error => result.pageErrors.push(String(error.message)));
        page.on('console', message => {
            if (/\[Audioflix\].*Skipped /.test(message.text())) result.warnings.push(message.text().slice(0, 500));
        });
        checkpoint('controller-hydration');
        await page.goto(controllerUrl, { waitUntil: 'load', timeout: 180000 });
        await page.bringToFront();
        await page.waitForFunction(() => window.__eveCoreDataLoaded === true && window.EveAudioflix?.ready
            && window.EveAudioflixState?.ready && window.EveAudioflixSpotifyAnyBrowser?.ready,
        undefined, { timeout: 120000 });
        await H.waitForControllerHydration(page);
        await barrier.proveBlocked(page);
        await installProbe(page);
        await page.evaluate(({ media, ids, group }) => {
            const S = window.EveAudioflixState, q = window.EveAudioflix.queueConnection;
            const flags = q.snapshot();
            if (flags.isPlaying) throw Error('Disposable controller already has an active queue');
            for (const [key, action] of [['repeatOne', 'repeat-one'], ['loop', 'loop-music-group'], ['shuffle', 'shuffle-music-group']]) {
                if (flags[key]) q.action(action);
            }
            S.addMusicGroup(group);
            media.forEach((entry, index) => {
                const item = S.addItem('music', { id: ids[index], title: `Typed ${entry.mediaType} fixture`,
                    type: 'music', url: `https://open.spotify.com/${entry.mediaType}/${entry.spotifyId}`,
                    sourceProvider: 'spotify', sourceMediaType: entry.mediaType, sourceMediaId: entry.spotifyId,
                    sourceUri: entry.spotifyUri, volume: 0.02 });
                S.toggleMusicGroup(item.id, group, true);
            });
            S.update({ musicViewMode: 'frontend', activeFrontendMusicGroup: group, activeMusicFolderScope: '',
                activeFrontendMusicArtist: '', activeFrontendMusicClassifier: '' }, 'isolated-typed-media-fixture');
        }, { media: [episode, track], ids: expectedIds, group: groupName });
        await page.locator('.topbar-audioflix-btn').click();
        await page.locator('[data-af-action="tab"][data-af-tab="music"]').click();
        await page.waitForFunction(group => document.querySelector('.audioflix-item-grid[data-af-active-group]')?.dataset.afActiveGroup === group,
            groupName, { timeout: 15000 });
        const playGroup = page.locator('.audioflix-frontend-subhead [data-af-action="play-music-group"]:visible');
        assert.equal(await playGroup.count(), 1);
        checkpoint('episode-start');
        await playGroup.click();
        if (new URL(controllerUrl).protocol === 'file:') result.pairing = await approveOwnFileSession({ browser, page, base,
            helperIdle: async () => { const status = await H.jsonRequest('/api/audioflix/spotify-browser/status');
                return status.ok === true && status.sessionPresent === true && status.playingCount === 0 && status.transport?.paused === true; } });
        const initial = await ready(page, H, expectedIds, 0, episode);
        result.episode = initial;
        result.episodeVolume = await volume(page, H, episode, expectedIds[0]);
        if (natural) {
            result.natural = await qualifyTypedNaturalSequence({ page, context, H, ids: expectedIds,
                episode, track, initial, ready, volume, snapshot,
                checkpoint: (phase, progress) => { result.progress = progress; checkpoint(phase); } });
            assert.equal(result.pageErrors.length, 0);
            assert.equal(result.warnings.length, 0);
            result.ok = true;
            return;
        }
        checkpoint('episode-pause-resume-seek');
        await page.evaluate(() => window.EveAudioflixAudio.pause());
        const paused = await until(async () => {
            const status = await H.jsonRequest('/api/audioflix/spotify-browser/status');
            assertIdentity(status.transport, episode);
            return status.transport.paused === true && status.playingCount === 0 ? publicHelper(status) : false;
        }, 12000);
        await page.evaluate(() => window.EveAudioflixAudio.playItem(window.EveAudioflixSpotifyAnyBrowser.snapshot().item));
        const resumed = await ready(page, H, expectedIds, 0, episode, initial.current);
        assert.ok(resumed.current.playback.duration > 15, 'Episode is too short for transport qualification');
        await page.evaluate(() => window.EveAudioflixAudio.seek(5));
        const seeked = await until(async () => {
            const status = await H.jsonRequest('/api/audioflix/spotify-browser/status');
            assertIdentity(status.transport, episode);
            return status.transport.currentTime >= 4 && status.transport.currentTime <= 10 ? publicHelper(status) : false;
        }, 10000);
        result.controls = { paused, resumed, seeked };
        checkpoint('seek-assisted-episode-to-track');
        const beforeTail = await snapshot(page);
        assert.ok(beforeTail.playback.duration > 15);
        await page.evaluate(duration => window.EveAudioflixAudio.seek(duration - 3), beforeTail.playback.duration);
        const next = await ready(page, H, expectedIds, 1, track, initial.current);
        assert.equal(next.current.queue.playbackRunId, initial.current.queue.playbackRunId + 1);
        const ends = next.current.events.filter(event => event.itemId === expectedIds[0]);
        assert.equal(ends.length, 1, 'One provider Ended must advance the canonical queue exactly once');
        assertIdentity(ends[0], episode);
        assert.ok(ends[0].completionId);
        result.transition = { seekAssisted: true, naturalCompletionClaimed: false, ended: ends[0], next };
        result.trackVolume = await volume(page, H, track, expectedIds[1]);
        assert.equal(result.pageErrors.length, 0);
        assert.equal(result.warnings.length, 0, 'Provider failures/skipped starts cannot qualify');
        result.ok = true;
    } catch (error) {
        result.error = String(error.stack || error);
        result.failurePhase = E.phase;
        result.controllerFailure = await snapshot(page).catch(() => null);
        result.providerFailure = publicHelper(await H.jsonRequest('/api/audioflix/spotify-browser/status').catch(() => ({})));
        throw error;
    } finally {
        if (sampler) {
            try { result.resources = await sampler.stop(); }
            catch (error) { result.cleanupError = `Runtime sampling: ${error.message}`; }
        }
        await page?.evaluate(async () => {
            await window.EveAudioflix?.queueConnection?.action?.('stop-music-group');
            await window.EveAudioflixAudio?.stopAll?.();
            const probe = window.__eveTypedMediaProbe, remote = window.EveAudioflixSpotifyRemote;
            if (probe?.listener) window.removeEventListener('eve:audioflix-playback', probe.listener);
            if (probe && remote?.send === probe.send) remote.send = probe.originalSend;
        }).catch(error => { result.cleanupError = String(error.message); });
        if (natural && page && !page.isClosed()) {
            try { result.observerCleanup = await settleNaturalProbe(page, H); }
            catch (error) { result.cleanupError = `Observer cleanup: ${error.message}`; }
        }
        await H.disposeControllerProbe(page).catch(() => {});
        result.isolation = barrier?.summary();
        await context?.close();
        if (preflight?.startedBySmoke) await H.jsonRequest('/api/audioflix/spotify-browser/stop', 'POST', {}).catch(error => {
            result.cleanupError = String(error.message);
        });
        if (result.cleanupError) { result.ok = false; throw Error(result.cleanupError); }
        checkpoint();
    }
}
async function main() {
    assert.ok(args.includes('--take-over'), '--take-over is required: this test intentionally stops current managed Spotify playback');
    const episode = parseMedia(value('--episode')), track = parseMedia(value('--track') || '4cOdK2wGLETKBW3PvgPWqT');
    assert.equal(episode?.mediaType, 'episode', '--episode=<Spotify episode URI/URL> is required; bare IDs are tracks only');
    assert.equal(track?.mediaType, 'track', '--track must identify a Spotify track');
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/eveos-ports.json'), 'utf8'));
    const requestedBase = new URL(value('--base') || `http://127.0.0.1:${registry.ports.EVEOS_WEB_PORT.port}`);
    validateBackendUrls([requestedBase.href]);
    assert.ok(!requestedBase.username && !requestedBase.password && !requestedBase.search && !requestedBase.hash
        && requestedBase.pathname === '/', '--base must be an exact loopback origin');
    const base = requestedBase.origin;
    const backend = () => readBackendAudioflixSnapshot(async () => {
        const response = await fetch(base + '/api/eve-state/modular/load', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
        assert.ok(response.ok); return response.json();
    });
    const directory = path.join(ROOT, 'data/runtime/smoke-results');
    fs.mkdirSync(directory, { recursive: true });
    artifact = path.join(directory, `audioflix-typed-media-acceptance-${Date.now()}.json`);
    E.head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    E.episode = episode; E.track = track;
    E.backendBefore = await backend(); checkpoint('live-start');
    const browser = natural ? await require('./lane3-native-controller.cjs').launch({ nativeVisibility: true })
        : await chromium.launch({ headless: false });
    try {
        for (const [index, entry] of [base + '/EveOS.html', pathToFileURL(path.join(ROOT, 'EveOS.html')).href].entries()) {
            await qualify(browser, base, entry, episode, track, index);
        }
        E.ok = true;
        E.naturalCompletionClaimed = natural && E.cases.every(test => test.natural?.naturalCompletionClaimed === true);
    } finally {
        await browser.close();
        E.backendAfter = await backend();
        assertBackendAudioflixUnchanged(E.backendBefore, E.backendAfter);
        E.backendUnchanged = true; E.finishedAt = new Date().toISOString(); checkpoint('complete');
    }
    console.log(`AUDIOFLIX_TYPED_MEDIA_ACCEPTANCE_OK http=true file=true episode=true volumeReadback=true queue=${natural ? 'natural-repeat-hidden' : 'seek-assisted'} backend=unchanged artifact=${artifact}`);
}
main().catch(error => {
    E.ok = false; E.error = String(error.stack || error); checkpoint();
    console.error(`AUDIOFLIX_TYPED_MEDIA_ACCEPTANCE_FAILED phase=${E.phase}: ${redact(error.message)}`);
    if (artifact) console.error(`artifact=${artifact}`);
    process.exitCode = 1;
});
