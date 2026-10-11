#!/usr/bin/env node

import process from 'node:process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createLongQueueHarness, normalizeSpotify, spotifyTrackId } from './audioflix_spotify_long_queue_live_support.mjs';
import { validateBackendUrls, installBackendWriteBarrier, readBackendAudioflixSnapshot,
    assertBackendAudioflixUnchanged } from './audioflix_spotify_live_isolation.shared.js';
import { createQueueEvidence, hideNativeController, installNaturalProbe, naturalSnapshot,
    awaitNaturalTrack, verifyCurrentVolume, settleNaturalProbe } from './audioflix_spotify_long_queue_natural.mjs';

const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (name, fallback = '') => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const base = value('--base', 'http://127.0.0.1:8765').replace(/\/$/, '');
const controllerUrl = value('--controller', value('--page', `${base}/EveOS.html`));
const engineUrl = value('--engine', `${base}/tools/audioflix/spotify-engine.html`);
const count = Math.max(8, Math.min(40, Number(value('--count', '20')) || 20));
const tailSeconds = Math.max(1.25, Math.min(8, Number(value('--tail-seconds', '2.5')) || 2.5));
const transitionTimeout = Math.max(8000, Math.min(60000, Number(value('--transition-timeout', '25000')) || 25000));
const headless = has('--headless');
const allowVisible = has('--allow-visible-controller');
const shouldStart = has('--start');
const takeOver = has('--take-over');
const natural = has('--natural');
const verbose = has('--verbose');
const mode = natural ? 'natural' : 'seek';
const backgroundAt = Math.max(0, Math.min(count - 1, Number(value('--background-at', String(Math.max(2, Math.floor(count / 4))))) || 0));
const evidence = createQueueEvidence(mode, { count, base, controllerUrl, engineUrl, headless,
    backgroundAt, transitionTimeout, tailSeconds: natural ? null : tailSeconds });
const E = evidence.data;
let sampler = null;
const checkpoint = (phase) => {
    if (phase) E.phase = phase;
    if (sampler) E.resources = sampler.snapshot();
    evidence.write();
};
const groupName = `EveOS Live Queue ${Date.now().toString(36)}`;
const fixtureNonce = Date.now().toString(36);
const fixturePrefix = `live-queue-${fixtureNonce}-`;
const supplied = String(value('--tracks', process.env.EVE_AUDIOFLIX_SPOTIFY_LIVE_TRACKS || '') || '')
    .split(/[;,\n]+/).map(normalizeSpotify).filter(Boolean);
const single = normalizeSpotify(value('--track', process.env.EVE_AUDIOFLIX_SPOTIFY_LIVE_TRACK || ''));
if (!supplied.length && single) supplied.push(single);

const H = createLongQueueHarness({
    base, controllerUrl, engineUrl, groupName, fixturePrefix,
    transitionTimeout, tailSeconds, shouldStart, takeOver
});

async function main() {
    if (natural && (headless || allowVisible)) throw new Error('--natural requires the headed native controller and genuine hidden visibility; --headless/--allow-visible-controller cannot qualify it.');
    H.validateUrls();
    const backendUrls = [base, engineUrl];
    if (/^https?:$/.test(new URL(controllerUrl).protocol)) backendUrls.push(controllerUrl);
    validateBackendUrls(backendUrls);
    const readBackend = () => readBackendAudioflixSnapshot(async () => {
        const response = await fetch(`${base}/api/eve-state/modular/load`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
        if (!response.ok) throw new Error(`Backend Audioflix snapshot failed: HTTP ${response.status}`);
        return response.json();
    });
    const backendBefore = await readBackend();
    E.backendBefore = backendBefore; checkpoint('managed-engine-preflight');
    const managedPreflight = await H.ensureManagedEngine();
    E.enginePreflight = {
        pageUrl: managedPreflight.status.pageUrl,
        authState: managedPreflight.status.authState,
        browserChannel: managedPreflight.status.browserChannel,
        startedBySmoke: managedPreflight.startedBySmoke
    }; checkpoint('controller-launch');

    let browser = null, context = null, isolation = null, page = null, naturalProbeInstalled = false;
    let primaryError = null;
    let foreground = null;
    let hiddenMethod = '';
    let completed = null;
    let isolationEvidence = null;
    const pageErrors = [];
    // Surface silent queue skips: playQueueIndex logs "[Audioflix] Skipped <title>: <reason>" and
    // advances inside the same run, which otherwise only shows up as an index mismatch.
    const audioflixWarnings = [];
    try {
        if (natural) H.assert(managedPreflight.status.authState === 'signed-in', 'Natural full-duration proof requires signed-in Spotify');
        browser = natural ? await require('../qualification/lane3-native-controller.cjs').launch() : await chromium.launch({ headless });
        E.controllerDriver = natural ? 'headed native Chromium/raw CDP; no forced focus' : `Playwright Chromium (${headless ? 'headless' : 'headed'})`;
        context = await browser.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
        isolation = await installBackendWriteBarrier(context, backendUrls);
        page = await context.newPage();
        page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
        page.on('console', message => {
            const text = message.text();
            if (!/\[Audioflix\]/.test(text) || !['warning', 'error', 'info'].includes(message.type())) return;
            audioflixWarnings.push({ at: new Date().toISOString(), type: message.type(), text: text.slice(0, 400) });
            if (audioflixWarnings.length > 40) audioflixWarnings.shift();
        });
        const cdp = await browser.newBrowserCDPSession();
        const processes = await cdp.send('SystemInfo.getProcessInfo'); await cdp.detach();
        sampler = require('../qualification/lane3-runtime-metrics.cjs').createRuntimeSampler({
            backendPort: Number(new URL(base).port), controllerRootPids: processes.processInfo
                .filter(item => item.type === 'browser').map(item => item.id), intervalMs: 15000,
            maxSamples: Math.ceil(count * 1800000 / 15000) + 20 });
        await sampler.start(mode); checkpoint('controller-hydration');
        await page.goto(controllerUrl, { waitUntil: 'load', timeout: 180000 });
        await page.waitForFunction(() => window.EveAudioflix?.ready
            && window.EveAudioflixState?.ready
            && window.EveAudioflixSpotifyAnyBrowser?.ready
            && window.EveAudioflixDiagnostics?.ready
            && window.__eveCoreDataLoaded === true, undefined, { timeout: 120000 });
        const hydration = await H.waitForControllerHydration(page);
        E.hydration = hydration;
        await isolation.proveBlocked(page);
        if (natural) { await installNaturalProbe(page, count * 3); naturalProbeInstalled = true; }

        const initialQueue = await H.queueSnapshot(page);
        if (initialQueue.queue?.isPlaying) {
            throw new Error(
                `Disposable controller already has a live queue (${initialQueue.queue.groupName || 'unnamed'}). `
                + 'Close competing AudioFlix playback before running the live proof.'
            );
        }
        E.fixtureOptions = await page.evaluate(() => {
            const q = window.EveAudioflix.queueConnection, before = q.snapshot();
            if (before.repeatOne) q.action('repeat-one');
            if (before.loop) q.action('loop-music-group');
            if (before.shuffle && !before.entries.length) q.action('shuffle-music-group');
            const after = q.snapshot();
            return { repeatOne: after.repeatOne, loop: after.loop, shuffle: after.shuffle };
        });
        H.assert(Object.values(E.fixtureOptions).every(flag => flag === false), 'Disposable fixture must disable repeat, group loop, and shuffle before Play Group');

        const librarySources = await page.evaluate(() => (window.EveAudioflixState?.ensure?.().music || [])
            .map(item => ({ url: String(item.spotifyUrl || item.url || item.originalUrl || ''),
                duration: Number(item.duration || item.resolvedDuration || (Number(item.durationMs) / 1000) || 0) })));
        const sourceDuration = new Map(librarySources.map(item => [spotifyTrackId(item.url), item.duration]));
        let sourceTracks = [...supplied];
        if (!sourceTracks.length) {
            sourceTracks = librarySources.map(item => normalizeSpotify(item.url)).filter(Boolean);
        }
        sourceTracks = [...new Set(sourceTracks)].slice(0, 8);
        if (!sourceTracks.length) {
            throw new Error('No Spotify-linked track exists in this EveOS controller state. Pass --track=<Spotify URL/ID> or --tracks=<a;b;c>.');
        }
        const urls = Array.from({ length: count }, (_, index) => sourceTracks[index % sourceTracks.length]);
        const expectedTrackIds = urls.map(spotifyTrackId);
        H.assert(expectedTrackIds.every(Boolean), `fixture contains an invalid Spotify track: ${JSON.stringify(urls)}`);
        const expectedIds = Array.from({ length: count }, (_, index) => `${fixturePrefix}${index}`);
        E.sourceTrackCount = sourceTracks.length;
        E.distinctSourceCount = new Set(expectedTrackIds).size;
        E.sources = sourceTracks.map(url => ({ spotifyId: spotifyTrackId(url), duration: sourceDuration.get(spotifyTrackId(url)) || null }));
        E.fixtureIds = expectedIds; E.expectedTrackIds = expectedTrackIds; checkpoint('fixture-start');

        await page.evaluate(({ tracks, group, nonce }) => {
            const S = window.EveAudioflixState;
            S.addMusicGroup(group);
            tracks.forEach((url, index) => {
                const added = S.addItem('music', {
                    id: `live-queue-${nonce}-${index}`,
                    title: `Live Queue ${String(index + 1).padStart(2, '0')}`,
                    url,
                    spotifyUrl: url,
                    sourceProvider: 'spotify',
                    type: 'music',
                    volume: 0.05
                });
                S.toggleMusicGroup(added.id, group, true);
            });
            S.update({
                musicViewMode: 'frontend',
                activeFrontendMusicGroup: group,
                activeFrontendMusicArtist: '',
                activeFrontendMusicClassifier: '',
                activeMusicFolderScope: ''
            }, 'audioflix-live-long-queue-fixture');
        }, { tracks: urls, group: groupName, nonce: fixtureNonce });

        await page.click('.topbar-audioflix-btn');
        await page.waitForSelector('#audioflix-overlay:not([hidden]) .audioflix-panel', { timeout: 15000 });
        await page.click('[data-af-action="tab"][data-af-tab="music"]');
        await page.waitForFunction((group) => {
            const grid = document.querySelector('.audioflix-item-grid[data-af-active-group]');
            return grid?.dataset.afActiveGroup === group;
        }, groupName, { timeout: 15000 });
        const playGroup = page.locator('.audioflix-frontend-subhead [data-af-action="play-music-group"]:visible');
        const playCount = await playGroup.count();
        H.assert(playCount === 1,
            `expected exactly one Play Group button for temporary group "${groupName}", found ${playCount}`);
        await playGroup.click();

        await H.waitForFixtureQueue(page, expectedIds);
        const ownership = await H.waitForOwnership(page, expectedIds);
        const ownerEpoch = Number(ownership.ownerEpoch || 0);
        H.assert(ownerEpoch > 0, 'Spotify ownership epoch is unavailable after fixture start');
        await H.waitForTrackReady(page, 0, expectedIds, ownerEpoch, expectedTrackIds[0]);
        await H.waitForManagedPlayback(expectedTrackIds[0]);
        const initialRun = (await H.queueSnapshot(page)).queue.playbackRunId;
        E.ownerEpoch = ownerEpoch; E.initialRun = initialRun;

        const transitions = [];
        let hiddenObserved = false;

        for (let index = 0; index < count; index += 1) {
            checkpoint(`track-${index + 1}-ready`);
            const track = await H.waitForTrackReady(page, index, expectedIds, ownerEpoch, expectedTrackIds[index]);
            const run = (await H.queueSnapshot(page)).queue.playbackRunId;
            H.assert(run === initialRun + index, `queue run changed unexpectedly at index ${index}: ${run}`);

            if (!hiddenObserved && index === backgroundAt && natural) {
                hiddenMethod = await hideNativeController(context, page, H); hiddenObserved = true;
                E.hidden = { method: hiddenMethod, atIndex: index, verifiedAt: new Date().toISOString() };
            } else if (!foreground && index === backgroundAt && !natural) {
                foreground = await context.newPage();
                await foreground.setContent('<title>EveOS long queue foreground guard</title><p>Controller intentionally backgrounded.</p>');
                await foreground.bringToFront();
                const waitHidden = (ms) => H.pollNode(async () => {
                    const visibility = await page.evaluate(() => document.visibilityState);
                    return { ok: visibility === 'hidden', value: visibility, reason: `controller visibility remained ${visibility}` };
                }, ms, 100);
                try {
                    try { await waitHidden(2000); hiddenMethod = 'background-tab'; }
                    catch {
                        // Playwright tabs can stay "visible" behind a sibling tab (focus emulation),
                        // so fall back to a real OS-level minimize of the controller window via CDP.
                        const cdp = await context.newCDPSession(page);
                        const { windowId } = await cdp.send('Browser.getWindowForTarget');
                        await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
                        await waitHidden(5000);
                        hiddenMethod = 'minimized-window';
                    }
                    hiddenObserved = true;
                } catch {
                    if (!allowVisible) {
                        throw new Error('Controller tab did not become hidden. Re-run headed, or pass --allow-visible-controller for environments without real tab visibility.');
                    }
                }
            }

            if (natural) {
                const record = { index, expectedTrackId: expectedTrackIds[index], naturalCompleted: false,
                    earlyCompletion: false, noManualSeek: true,
                    reportedDuration: track.duration, sourceDuration: sourceDuration.get(expectedTrackIds[index]) || null };
                E.tracks.push(record);
                record.volume = await verifyCurrentVolume({ page, H, ids: expectedIds, index, ownerEpoch,
                    expectedTrackId: expectedTrackIds[index], hidden: hiddenObserved });
                const transition = await awaitNaturalTrack({ page, H, ids: expectedIds, index, ownerEpoch,
                    spotifyId: expectedTrackIds[index], expectedDuration: record.sourceDuration,
                    nextSpotifyId: expectedTrackIds[index + 1],
                    transitionTimeout, hidden: hiddenObserved, record, checkpoint });
                transitions.push(transition); E.transitions = transitions; checkpoint(`track-${index + 1}-completed`);
                if (verbose) console.log(`LIVE_QUEUE_NATURAL_STEP ${index + 1}/${count} played=${transition.naturalElapsedMs}ms ${transition.to === 'complete' ? 'final' : 'handoff'}=${transition.transitionLatencyMs ?? transition.finalCompletionLatencyMs}ms hidden=${hiddenObserved}`);
                continue;
            }

            const startedAt = Date.now();
            await page.evaluate(async ({ duration, tail }) => {
                await window.EveAudioflixAudio.seek(Math.max(0, duration - tail));
            }, { duration: track.duration, tail: tailSeconds });
            const landed = await H.waitForSeekLanding(
                page, index, expectedIds, ownerEpoch, track.duration, expectedTrackIds[index]
            );

            if (index < count - 1) {
                if (!landed.advanced) {
                    await H.pollNode(async () => {
                        const snapshot = await H.queueSnapshot(page);
                        // Queue identity/order must stay exact while currentIndex is allowed to
                        // remain on the old track until the completion handoff actually lands.
                        H.assertFixtureQueue(snapshot, expectedIds);
                        const currentOwnership = snapshot.managed?.ownership;
                        H.assert(currentOwnership?.isOwner === true && Number(currentOwnership.ownerEpoch || 0) === ownerEpoch,
                            `Spotify ownership changed during transition ${index} -> ${index + 1}`);
                        const ok = snapshot.queue?.isPlaying === true && snapshot.queue.currentIndex === index + 1;
                        return { ok, value: snapshot, reason: `queue did not advance from ${index} to ${index + 1}; last=${JSON.stringify(snapshot)}` };
                    });
                }
                await H.sleep(250);
                const after = await H.queueSnapshot(page);
                H.assertFixtureQueue(after, expectedIds, index + 1);
            } else {
                await H.pollNode(async () => {
                    const snapshot = await H.queueSnapshot(page);
                    H.assertFixtureQueue(snapshot, expectedIds, count - 1);
                    return { ok: snapshot.queue?.isPlaying === false, value: snapshot, reason: `final queue item never completed; last=${JSON.stringify(snapshot)}` };
                });
            }

            const elapsedMs = Date.now() - startedAt;
            transitions.push({ from: index, to: index < count - 1 ? index + 1 : 'complete', elapsedMs, hidden: hiddenObserved });
            E.transitions = transitions; checkpoint(`track-${index + 1}-completed`);
            if (verbose) console.log(`LIVE_QUEUE_SEEK_STEP ${index + 1}/${count} -> ${index < count - 1 ? index + 2 : 'complete'} ${elapsedMs}ms hidden=${hiddenObserved}`);
        }

        const result = await page.evaluate(() => ({
            queue: window.EveAudioflix.queueConnection.snapshot(),
            diagnostics: window.EveAudioflixDiagnostics.snapshot(),
            managed: window.EveAudioflixSpotifyAnyBrowser.snapshot()
        }));
        H.assertFixtureQueue({ queue: result.queue }, expectedIds, count - 1);
        H.assert(result.queue.isPlaying === false, 'long queue did not finish coherently');
        H.assert((result.diagnostics.summary['queue:between-songs']?.count || 0) >= count - 1,
            'diagnostics did not observe every between-song handoff');
        H.assert((result.diagnostics.summary['spotify:status-watch']?.count || 0) >= count,
            'status-watch did not remain active across the long queue');
        if (!allowVisible && !headless) H.assert(hiddenObserved, 'headed proof never observed a hidden controller tab');
        H.assert(pageErrors.length === 0, `controller page emitted errors: ${pageErrors.join(' | ')}`);
        H.assert(!audioflixWarnings.some(entry => /Skipped /.test(entry.text)), 'queue skipped a fixture start');

        const handoffs = transitions.filter(entry => entry.to !== 'complete');
        const timings = handoffs.map(entry => natural ? entry.transitionLatencyMs : entry.elapsedMs).sort((a, b) => a - b);
        const finalTransition = transitions.at(-1);
        completed = {
            ok: true,
            trackCount: count,
            sourceTrackCount: sourceTracks.length,
            distinctSourceCount: new Set(expectedTrackIds).size,
            mode, naturalCompletionClaimed: natural, seekAssisted: !natural,
            controllerUrl,
            engineUrl,
            ownerEpoch,
            hiddenControllerProved: hiddenObserved,
            hiddenMethod,
            naturalElapsedMs: natural ? transitions.reduce((sum, entry) => sum + entry.naturalElapsedMs, 0) : null,
            handoffCount: handoffs.length,
            finalCompletionLatencyMs: natural ? finalTransition.finalCompletionLatencyMs : finalTransition.elapsedMs,
            maxTransitionMs: Math.max(...timings),
            p50TransitionMs: timings[Math.floor(timings.length / 2)],
            p95TransitionMs: timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)],
            diagnostics: result.diagnostics.summary
        };
    } catch (error) {
        primaryError = error; E.failurePhase = E.phase;
        const helper = await H.jsonRequest('/api/audioflix/spotify-browser/status').catch(() => null);
        if (helper) E.helperFailure = {
            state: helper.state, playingCount: helper.playingCount, mediaCount: helper.mediaCount,
            diagnostics: helper.diagnostics, transport: helper.transport
        };
        const diagnostics = await H.controllerDiagnostics(page).catch(() => null);
        if (diagnostics) E.controllerFailure = diagnostics;
        E.error = String(error?.stack || error); checkpoint();
        throw error;
    } finally {
        checkpoint('controller-teardown');
        await H.disposeControllerProbe(page).catch(() => {});
        try {
            await page.evaluate(async () => {
                const stopButton = document.querySelector('[data-af-action="stop-music-group"]');
                if (stopButton) {
                    stopButton.click();
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                try { await window.EveAudioflixAudio?.stopAll?.(); } catch {}
            });
        } catch {}
        let resourceError = null;
        if (naturalProbeInstalled) E.cleanup = await settleNaturalProbe(page, H).catch(error => { resourceError = error; return { ok: false, error: error.message }; });
        if (managedPreflight.startedBySmoke) {
            await H.jsonRequest('/api/audioflix/spotify-browser/stop', 'POST', {}).catch(() => {});
        }
        let closeError = null;
        if (browser) await browser.close().catch((error) => { closeError = error; });
        if (sampler) E.resources = await sampler.stop();
        const backendAfter = await readBackend();
        E.backendAfter = backendAfter;
        assertBackendAudioflixUnchanged(backendBefore, backendAfter);
        isolationEvidence = { before: backendBefore, after: backendAfter, ...isolation?.summary() };
        E.isolation = isolationEvidence; E.pageErrors = pageErrors; E.warnings = audioflixWarnings; checkpoint();
        E.teardownErrors = [closeError, resourceError].filter(Boolean).map(error => error.message);
        if (!primaryError && (closeError || resourceError)) throw closeError || resourceError;
    }
    Object.assign(E, completed, { finishedAt: new Date().toISOString(), phase: 'complete' }); evidence.write();
    console.log(`AUDIOFLIX_SPOTIFY_LONG_QUEUE_LIVE_OK ${count}/${count} mode=${mode} sources=${completed.distinctSourceCount} hidden=${completed.hiddenControllerProved} backend=unchanged blocked=${isolationEvidence.blockedCount} artifact=${evidence.artifact}`);
}

main().catch((error) => {
    E.ok = false; E.error = String(error?.stack || error); E.finishedAt = new Date().toISOString(); evidence.write();
    console.error(`AUDIOFLIX_SPOTIFY_LONG_QUEUE_LIVE_FAIL mode=${mode} phase=${E.failurePhase || E.phase} artifact=${evidence.artifact}`);
    console.error(E.error.split(/\r?\n/).slice(0, 40).join('\n'));
    process.exit(1);
});
