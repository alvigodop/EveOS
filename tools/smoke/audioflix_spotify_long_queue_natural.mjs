// Qualification-only contracts; no provider commands, scheduling, or library writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const observerCounters = ['watchJobs', 'watchRequests', 'progressRequests', 'retryTimers',
    'progressTimers', 'recoveryRequests', 'recoveryTimers'];
const nativeControllers = new WeakMap();

export function assertNativeControllerHidden(sample) {
    assert.equal(sample.ownVisibility, false, 'Visibility must not be replaced on the document');
    assert.equal(sample.nativeGetter, true, 'Visibility must come from the native browser getter');
    assert.equal(sample.visibility, 'hidden', 'Natural observation must remain genuinely backgrounded');
    assert.equal(sample.visibleViolations || 0, 0, 'Natural observation must not contain a visible interval');
    assert.equal(sample.nativeWindowError, undefined, 'Native window identity must remain inspectable');
    if (sample.coverWindowId !== undefined) {
        assert.equal(sample.coverWindowId, sample.windowId, 'Companion and controller must share their owned native window');
    }
}

export async function nativeControllerVisibility(page) {
    const owned = nativeControllers.get(page);
    const sample = await page.evaluate(() => ({ visibility: document.visibilityState, focus: document.hasFocus(),
        ownVisibility: Object.hasOwn(document, 'visibilityState'),
        nativeGetter: String(Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')?.get).includes('[native code]'),
        visibilityEvents: window.__eveNaturalVisibility?.events?.slice(-32) || [],
        visibleViolations: window.__eveNaturalVisibility?.visibleViolations || 0 }));
    const cdp = await page.context().newCDPSession(page);
    try {
        const { windowId } = await cdp.send('Browser.getWindowForTarget');
        const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
        let coverWindowId;
        if (owned) ({ windowId: coverWindowId } = await cdp.send('Browser.getWindowForTarget', { targetId: owned.coverTargetId }));
        return { ...sample, windowId, bounds, ...(owned ? { coverWindowId, hiddenAt: owned.hiddenAt } : {}) };
    } catch (error) {
        return { ...sample, nativeWindowError: String(error.message).slice(0, 600) };
    } finally { await cdp.detach(); }
}

export function assertObservers(observation, settled = false) {
    assert.ok(observation && typeof observation === 'object', 'Observer diagnostics required');
    for (const key of observerCounters) {
        assert.ok(Number.isInteger(observation[key]) && observation[key] >= 0 && observation[key] <= 1,
            `${key} must stay bounded to one`);
        if (settled) assert.equal(observation[key], 0, `${key} must settle after controller stop`);
    }
}

export function naturalPolicy(duration, currentTime, expectedDuration = 0, transitionTimeout = 25000) {
    assert.ok(Number.isFinite(duration) && duration > 60 && duration <= 1800,
        `Natural proof requires full playback >60s and <=1800s; got ${duration}s (preview/unsupported duration)`);
    assert.ok(Number.isFinite(currentTime) && currentTime >= 0 && currentTime <= 12,
        `Natural observation must begin within 12s of track start; got ${currentTime}s`);
    if (expectedDuration > 0) assert.ok(Math.abs(duration - expectedDuration) <= Math.max(5, expectedDuration * 0.02),
        `Provider duration ${duration}s differs from source duration ${expectedDuration}s (possible preview)`);
    const remainingSeconds = duration - currentTime;
    return { duration, initialTime: currentTime, expectedDuration: expectedDuration || null,
        minimumObservedSeconds: remainingSeconds - 5,
        timeoutMs: Math.ceil(remainingSeconds * 1000 + transitionTimeout + 60000) };
}

export function assertNaturalCompletion(policy, proof) {
    assert.ok(proof.ended && proof.ended.status === 'Ended', 'Natural completion requires an actual Ended event');
    assert.ok(proof.elapsedMs >= policy.minimumObservedSeconds * 1000,
        `Early completion: observed ${proof.elapsedMs / 1000}s, require ${policy.minimumObservedSeconds}s`);
    assert.ok(proof.maxTime >= policy.duration - 5, `Early completion: progress stopped at ${proof.maxTime}s/${policy.duration}s`);
    assert.ok(proof.providerSamples >= 2 && proof.providerMaxTime - proof.providerInitialTime >= policy.minimumObservedSeconds - 7,
        'Real managed provider progress did not cover the full track; preview or stale telemetry cannot qualify');
    assert.equal(proof.ended.itemId, proof.itemId, 'Ended must name the exact fixture item');
    assert.equal(proof.ended.run, proof.run, 'Ended must name the completed queue run');
    assert.equal(proof.ended.spotifyId, proof.spotifyId, 'Ended must name the expected Spotify identity');
    assert.equal(proof.ended.generation, proof.generation, 'Ended must name the expected engine generation');
    assert.ok(proof.ended.completionId, 'Ended must carry a durable provider completion identity');
    if (proof.hidden) assert.equal(proof.ended.visibility, 'hidden', 'Ended must execute while genuinely hidden');
}

export function assertProviderPlaying(status, spotifyId, generation) {
    assert.ok(status?.ok && status.helperReachable && status.sessionPresent && status.playingCount >= 1,
        'Actual managed Spotify media must be playing');
    assert.equal(status.authState, 'signed-in', 'Full natural playback requires the signed-in provider session');
    assert.deepEqual([...new Set(status.trackIds || [])], [spotifyId], 'Actual playing provider identity must match the fixture only');
    assert.equal(status.transport?.spotifyId, spotifyId, 'Managed transport must match the actual provider track');
    assert.equal(status.transport?.generation, generation, 'Managed transport must match the current generation');
    assert.ok(status.transport?.duration > 60, 'Managed transport is a preview, not full playback');
}

export function createQueueEvidence(mode, config) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const directory = path.join(root, 'data/runtime/smoke-results');
    fs.mkdirSync(directory, { recursive: true });
    const artifact = path.join(directory, `audioflix-spotify-long-queue-${mode}-${Date.now()}.json`);
    const latest = path.join(directory, `LAST-AUDIOFLIX-SPOTIFY-LONG-QUEUE-${mode.toUpperCase()}.json`);
    const data = { ok: false, mode, naturalRequested: mode === 'natural', naturalCompletionClaimed: false, seekAssisted: mode === 'seek',
        startedAt: new Date().toISOString(), phase: 'preflight', config, artifact, tracks: [], transitions: [], warnings: [] };
    try { data.head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
    const write = () => { const text = JSON.stringify(data, null, 2); fs.writeFileSync(artifact, text); fs.writeFileSync(latest, text); };
    write();
    return { data, write, artifact };
}

export async function hideNativeController(context, page, H) {
    const cdp = await context.newCDPSession(page);
    let cover, coverCdp;
    try {
        // Raw-CDP native launch avoids Playwright's always-focused launch flags. Explicitly disable
        // focus emulation before measurement and require the browser's real visibility signal.
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
        const { windowId } = await cdp.send('Browser.getWindowForTarget');
        await page.evaluate(() => {
            if (window.__eveNaturalVisibility) return;
            const proof = window.__eveNaturalVisibility = { events: [], measuring: false, visibleViolations: 0 };
            const note = () => {
                if (proof.measuring && document.visibilityState !== 'hidden') proof.visibleViolations++;
                proof.events.push({ at: Date.now(), visibility: document.visibilityState, focus: document.hasFocus() });
                if (proof.events.length > 32) proof.events.shift();
            };
            document.addEventListener('visibilitychange', note); note();
        });
        cover = nativeControllers.get(page)?.cover;
        if (!cover || cover.isClosed()) cover = await context.newPage();
        coverCdp = await context.newCDPSession(cover);
        const { targetInfo } = await coverCdp.send('Target.getTargetInfo');
        const coverWindow = await coverCdp.send('Browser.getWindowForTarget');
        assert.equal(coverWindow.windowId, windowId, 'Background companion must be a tab in the controller window');
        await cover.setContent('<title>AudioFlix background qualification companion</title><p>Disposable background-playback proof. No provider or library data.</p>');
        await cover.bringToFront();
        await page.evaluate(() => {
            if (document.visibilityState !== 'hidden') throw Error('Inactive controller tab did not become genuinely hidden');
            const proof = window.__eveNaturalVisibility;
            proof.events.length = 0; proof.visibleViolations = 0; proof.measuring = true;
        });
        nativeControllers.set(page, { cover, coverTargetId: targetInfo.targetId, hiddenAt: Date.now() });
        // A real inactive tab stays hidden even if the OS later restores this window.
        // Never re-hide a visible interval during measurement or fabricate its visibility.
        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    } catch (error) {
        await cover?.close().catch(() => {});
        nativeControllers.delete(page);
        throw error;
    } finally { await coverCdp?.detach(); await cdp.detach(); }
    await H.pollNode(async () => {
        const visibility = await page.evaluate(() => document.visibilityState);
        return { ok: visibility === 'hidden', reason: `Native controller visibility remained ${visibility}` };
    }, 8000, 250);
    assertNativeControllerHidden(await nativeControllerVisibility(page));
    return 'native-headed-minimized-window-with-inactive-controller-tab';
}

export async function installNaturalProbe(page, capacity) {
    await page.evaluate((limit) => {
        const events = [];
        const listener = (event) => {
            if (event.detail?.status !== 'Ended') return;
            const managed = window.EveAudioflixSpotifyAnyBrowser.snapshot();
            const relay = managed.relay.lastState || {}, engine = relay.engine || {};
            events.push({ at: Date.now(), status: 'Ended', itemId: String(event.detail.item?.id || ''),
                run: window.EveAudioflix.queueConnection.snapshot().playbackRunId, visibility: document.visibilityState,
                spotifyId: engine.spotifyId, generation: engine.generation, completionId: engine.completionId,
                currentTime: managed.playback.currentTime, duration: managed.playback.duration });
            if (events.length > limit) events.shift();
        };
        window.__eveNaturalQueueProbe = { events, listener };
        window.addEventListener('eve:audioflix-playback', listener);
    }, capacity);
}

export async function naturalSnapshot(page, H) {
    const value = await H.queueSnapshot(page);
    const detail = await page.evaluate(() => {
        const m = window.EveAudioflixSpotifyAnyBrowser.snapshot(), relay = m.relay.lastState || {};
        const playback = window.EveAudioflixAudio.getPlaybackState();
        return { observation: m.observation, volume: window.EveAudioflixSpotifyAnyBrowser.volumeDiagnostics(),
            visibleViolations: window.__eveNaturalVisibility?.visibleViolations || 0,
            itemId: String(playback.item?.id || ''), engine: relay.engine || {},
            queueViewOpen: window.EveAudioflixAudio.isInternalViewOpen()
                || window.EveAudioflixSpotifyEngineSurface?.snapshot?.().open === true,
            events: window.__eveNaturalQueueProbe?.events || [] };
    });
    return { ...value, ...detail };
}

function assertCurrent(snapshot, H, ids, index, ownerEpoch, run, engineEpoch, generation, hidden) {
    H.assertFixtureQueue(snapshot, ids, index);
    assert.equal(snapshot.queue.playbackRunId, run, 'Unexpected duplicate/restarted queue run');
    assert.equal(snapshot.managed.ownership.isOwner, true, 'Controller must retain ownership');
    assert.equal(snapshot.managed.ownership.ownerEpoch, ownerEpoch, 'Controller owner epoch changed');
    assert.equal(snapshot.managed.ownership.engineEpoch, engineEpoch, 'Engine restarted during qualification');
    assert.equal(snapshot.managed.ownership.trackGeneration, generation, 'Current track generation changed');
    assert.equal(snapshot.queue.repeatOne, false, 'Natural queue must not repeat one');
    assert.equal(snapshot.queue.loop, false, 'Natural queue must not loop');
    assert.equal(snapshot.queueViewOpen, false, 'Queue View must remain closed during endurance proof');
    assertObservers(snapshot.observation);
    for (const key of ['inFlight', 'pending']) assert.ok(Number.isInteger(snapshot.volume?.[key])
        && snapshot.volume[key] >= 0 && snapshot.volume[key] <= 1, `Volume ${key} must remain <=1`);
    if (hidden) assert.equal(snapshot.visibility, 'hidden', 'Controller stopped being genuinely hidden');
    if (hidden) assert.equal(snapshot.visibleViolations || 0, 0, 'Controller contained a visible interval');
}

export async function verifyCurrentVolume({ page, H, ids, index, ownerEpoch, expectedTrackId, hidden }) {
    const before = await naturalSnapshot(page, H);
    const run = before.queue.playbackRunId, { engineEpoch, trackGeneration } = before.managed.ownership;
    assertCurrent(before, H, ids, index, ownerEpoch, run, engineEpoch, trackGeneration, hidden);
    assert.equal(before.itemId, ids[index], 'Volume API must bind to the actual current fixture item');
    const providerBefore = await H.jsonRequest('/api/audioflix/spotify-browser/status');
    assertProviderPlaying(providerBefore, expectedTrackId, trackGeneration);
    const gain = index % 2 ? 0.06 : 0.04;
    const expectedGain = await page.evaluate(({ id, raw }) => {
        window.EveAudioflixAudio.updateItemVolume(id, raw);
        return window.EveAudioflixOutputPort?.effective?.(raw) ?? raw;
    }, { id: ids[index], raw: gain });
    const providerAfter = await H.pollNode(async () => {
        const after = await H.jsonRequest('/api/audioflix/spotify-browser/status');
        assertProviderPlaying(after, expectedTrackId, trackGeneration);
        const snapshot = await naturalSnapshot(page, H);
        assertCurrent(snapshot, H, ids, index, ownerEpoch, run, engineEpoch, trackGeneration, hidden);
        assert.equal(snapshot.itemId, ids[index], 'Volume mutation changed the active item');
        return { ok: Math.abs(Number(after.desiredVolume) - expectedGain) < 0.0001
            && after.lastAppliedAt > providerBefore.lastAppliedAt, value: after,
        reason: `Current-track volume API did not reach managed Spotify at index ${index}` };
    }, 10000, 250);
    return { surface: 'canonical-current-item-audio-api', queueViewUiClaimed: false, itemId: ids[index],
        spotifyId: expectedTrackId, run, engineEpoch, generation: trackGeneration, gain, expectedGain,
        appliedGain: providerAfter.desiredVolume, appliedAt: providerAfter.lastAppliedAt };
}

export async function awaitNaturalTrack({ page, H, ids, index, ownerEpoch, spotifyId, expectedDuration,
    nextSpotifyId, transitionTimeout, hidden, record, checkpoint }) {
    const initial = await naturalSnapshot(page, H);
    const run = initial.queue.playbackRunId, { engineEpoch, trackGeneration: generation } = initial.managed.ownership;
    assertCurrent(initial, H, ids, index, ownerEpoch, run, engineEpoch, generation, hidden);
    const policy = naturalPolicy(initial.managed.playback.duration, initial.managed.playback.currentTime,
        expectedDuration, transitionTimeout);
    const startedAt = Date.now(), deadline = startedAt + policy.timeoutMs;
    const proof = { itemId: ids[index], spotifyId, run, engineEpoch, generation, hidden,
        maxTime: policy.initialTime, providerSamples: 0, providerInitialTime: 0, providerMaxTime: 0,
        progress: [], policy, noManualSeek: true, volume: record.volume };
    Object.assign(record, proof); checkpoint();
    let nextProviderAt = 0, ended = null;
    while (Date.now() < deadline) {
        const snapshot = await naturalSnapshot(page, H), now = Date.now();
        H.assertFixtureQueue(snapshot, ids);
        assertObservers(snapshot.observation);
        assert.equal(snapshot.queueViewOpen, false, 'Queue View opened during natural playback');
        if (hidden) assert.equal(snapshot.visibility, 'hidden', 'Natural playback became visible');
        if (hidden) assert.equal(snapshot.visibleViolations || 0, 0, 'Natural playback contained a visible interval');
        ended = snapshot.events.find(event => event.itemId === ids[index] && event.run === run) || ended;
        if (snapshot.queue.currentIndex !== index || snapshot.queue.isPlaying === false) break;
        assertCurrent(snapshot, H, ids, index, ownerEpoch, run, engineEpoch, generation, hidden);
        proof.maxTime = Math.max(proof.maxTime, snapshot.managed.playback.currentTime);
        if (now >= nextProviderAt && !ended) {
            const provider = await H.jsonRequest('/api/audioflix/spotify-browser/status');
            // Provider may already have ended between controller snapshot and this independent read.
            if (provider.transport?.generation === generation && provider.transport?.status !== 'ended') {
                assertProviderPlaying(provider, spotifyId, generation);
                const time = Number(provider.transport.currentTime || 0);
                if (!proof.providerSamples) proof.providerInitialTime = time;
                proof.providerMaxTime = Math.max(proof.providerMaxTime, time); proof.providerSamples++;
            }
            proof.progress.push({ at: new Date(now).toISOString(), currentTime: snapshot.managed.playback.currentTime,
                paused: snapshot.managed.playback.paused, visibility: snapshot.visibility,
                observation: snapshot.observation, volume: snapshot.volume });
            if (proof.progress.length > 400) proof.progress.shift();
            nextProviderAt = now + 5000; Object.assign(record, proof, { elapsedMs: now - startedAt }); checkpoint();
        }
        await H.sleep(1000);
    }
    assert.ok(ended, `Track ${index + 1} did not deliver natural Ended within ${policy.timeoutMs}ms`);
    proof.ended = ended; proof.elapsedMs = ended.at - startedAt;
    Object.assign(record, proof); checkpoint();
    try { assertNaturalCompletion(policy, proof); }
    catch (error) {
        record.earlyCompletion = /Early completion|preview|full track/.test(error.message);
        record.rejection = error.message; checkpoint(); throw error;
    }
    const final = index === ids.length - 1;
    await H.pollNode(async () => {
        const snapshot = await naturalSnapshot(page, H);
        H.assertFixtureQueue(snapshot, ids);
        assert.ok(snapshot.queue.currentIndex === index || (!final && snapshot.queue.currentIndex === index + 1),
            'Natural handoff skipped an entry');
        const ready = final ? snapshot.queue.isPlaying === false : snapshot.queue.isPlaying === true
            && snapshot.queue.currentIndex === index + 1 && snapshot.managed.active && snapshot.managed.playback.paused === false;
        return { ok: ready, value: snapshot, reason: `Natural handoff ${index} never became ready` };
    }, transitionTimeout, 250);
    if (!final) {
        await H.waitForManagedPlayback(nextSpotifyId);
        const after = await naturalSnapshot(page, H);
        const nextGeneration = after.managed.ownership.trackGeneration;
        assert.ok(nextGeneration > generation, 'Natural handoff must advance the provider generation');
        assertCurrent(after, H, ids, index + 1, ownerEpoch, run + 1, engineEpoch, nextGeneration, hidden);
        assert.equal(after.itemId, ids[index + 1], 'Next playback item must match the next fixture');
    }
    const after = await naturalSnapshot(page, H);
    assert.equal(after.queue.playbackRunId, final ? run : run + 1, 'Completion created an unexpected queue run');
    assert.equal(after.managed.ownership.ownerEpoch, ownerEpoch, 'Completion changed controller ownership');
    assert.equal(after.managed.ownership.engineEpoch, engineEpoch, 'Completion restarted the provider engine');
    const latencyMs = Date.now() - ended.at;
    Object.assign(record, proof, { naturalElapsedMs: proof.elapsedMs, transitionLatencyMs: final ? null : latencyMs,
        finalCompletionLatencyMs: final ? latencyMs : null,
        naturalCompleted: true, earlyCompletion: false }); checkpoint();
    return { from: index, to: final ? 'complete' : index + 1, naturalElapsedMs: proof.elapsedMs,
        transitionLatencyMs: record.transitionLatencyMs, finalCompletionLatencyMs: record.finalCompletionLatencyMs, hidden };
}

export async function settleNaturalProbe(page, H) {
    await H.pollNode(async () => {
        const snapshot = await naturalSnapshot(page, H);
        assertObservers(snapshot.observation);
        return { ok: observerCounters.every(key => snapshot.observation[key] === 0)
            && snapshot.volume?.inFlight === 0 && snapshot.volume?.pending === 0,
        value: { observation: snapshot.observation, volume: snapshot.volume }, reason: 'Observer/volume resources did not settle to zero' };
    }, 10000, 250);
    const result = await naturalSnapshot(page, H);
    assertObservers(result.observation, true);
    await page.evaluate(() => {
        const probe = window.__eveNaturalQueueProbe;
        if (probe) window.removeEventListener('eve:audioflix-playback', probe.listener);
        delete window.__eveNaturalQueueProbe;
    });
    return { observation: result.observation, volume: result.volume, events: result.events };
}
