#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { naturalPolicy, assertNaturalCompletion, assertProviderPlaying, assertObservers, observerCounters,
    awaitNaturalTrack, verifyCurrentVolume } from './audioflix_spotify_long_queue_natural.mjs';

const require = createRequire(import.meta.url);
const { cpuClockMs, cpuDelta } = require('../qualification/lane3-runtime-metrics.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = path.join(root, 'data/runtime/smoke-results/audioflix-spotify-natural-harness.json');
const E = { ok: false, deterministic: true, realProviderClaimed: false, cases: [] };
let current = 'startup';
const check = async (id, run) => { current = id; await run(); E.cases.push({ id, ok: true }); };
const observations = (active = true) => Object.fromEntries(observerCounters.map(key => [key, active && key === 'watchJobs' ? 1 : 0]));
const first = '1'.repeat(22), next = '2'.repeat(22), ids = ['fixture-0', 'fixture-1'];
const provider = () => ({ ok: true, helperReachable: true, sessionPresent: true, playingCount: 1,
    authState: 'signed-in', trackIds: [first], transport: { spotifyId: first, generation: 7, duration: 92, currentTime: 1 } });
const completion = () => ({ elapsedMs: 91000, maxTime: 91, providerSamples: 19, providerInitialTime: 1,
    providerMaxTime: 91, itemId: ids[0], run: 1, spotifyId: first, generation: 7, hidden: true,
    ended: { status: 'Ended', itemId: ids[0], run: 1, spotifyId: first, generation: 7,
        completionId: '7:40', visibility: 'hidden' } });

// Execute the real qualification loop with an advancing virtual clock and an independent provider.
// These cases prove acceptance/rejection logic, never native visibility or live Spotify playback.
async function simulate({ duration = 92, early = null, duplicate = false, final = false, visibleEnd = false } = {}) {
    const originalNow = Date.now;
    let time = 10000, changed = false, checkpoints = 0;
    const started = time, generation = 7, nextGeneration = 12;
    const list = final ? [ids[0]] : ids;
    const H = {
        async queueSnapshot() {
            changed = time - started >= (early ?? duration - 1) * 1000;
            return { queue: { groupName: 'fixture', entries: list.map(id => ({ id })), currentIndex: changed && !final ? 1 : 0,
                playbackRunId: changed && !final ? (duplicate ? 3 : 2) : 1, isPlaying: !changed || !final,
                repeatOne: false, loop: false }, visibility: 'hidden', managed: { active: true,
                playback: { duration, currentTime: changed ? 1 : 1 + (time - started) / 1000, paused: false },
                ownership: { isOwner: true, ownerEpoch: 4, engineEpoch: 3, trackGeneration: changed && !final ? nextGeneration : generation } } };
        },
        assertFixtureQueue(snapshot, expected, index = null) {
            assert.deepEqual(snapshot.queue.entries.map(entry => entry.id), expected);
            if (index !== null) assert.equal(snapshot.queue.currentIndex, index);
        },
        async jsonRequest() { return { ...provider(), transport: { ...provider().transport, duration,
            currentTime: 1 + (time - started) / 1000 } }; },
        async sleep(ms) { time += ms; },
        async pollNode(run) { const result = await run(); assert.ok(result.ok, result.reason); return result.value; },
        async waitForManagedPlayback(id) { assert.equal(id, next); }
    };
    const page = { async evaluate() { return { observation: observations(), volume: { inFlight: 0, pending: 0 },
        itemId: changed && !final ? ids[1] : ids[0], engine: {}, queueViewOpen: false,
        events: changed ? [{ ...completion().ended, visibility: visibleEnd ? 'visible' : 'hidden',
            at: started + (early ?? duration - 1) * 1000 }] : [] }; } };
    Date.now = () => time;
    try {
        const record = {};
        const result = await awaitNaturalTrack({ page, H, ids: list, index: 0, ownerEpoch: 4, spotifyId: first,
            nextSpotifyId: next, expectedDuration: duration, transitionTimeout: 25000, hidden: true,
            record, checkpoint() { checkpoints++; } });
        assert.ok(checkpoints > 2); assert.ok(record.progress.length > 1);
        assert.equal(record.noManualSeek, true); assert.equal(record.naturalCompleted, true);
        return result;
    } finally { Date.now = originalNow; }
}

async function main() {
    const policy = naturalPolicy(92, 1, 92);
    await check('472s-duration-aware-deadline', () => assert.ok(naturalPolicy(472, 1, 472).timeoutMs > 472000));
    await check('30s-preview-rejected', () => assert.throws(() => naturalPolicy(30, 0), /preview/));
    await check('short-provider-duration-rejected', () => assert.throws(() => naturalPolicy(92, 1, 472), /differs/));
    await check('late-start-rejected', () => assert.throws(() => naturalPolicy(472, 20), /within 12s/));
    await check('full-natural-proof-accepted', () => assertNaturalCompletion(policy, completion()));
    await check('early-wall-completion-rejected', () => assert.throws(() => assertNaturalCompletion(policy,
        { ...completion(), elapsedMs: 30000 }), /Early completion/));
    await check('early-position-completion-rejected', () => assert.throws(() => assertNaturalCompletion(policy,
        { ...completion(), maxTime: 30 }), /Early completion/));
    await check('stale-provider-progress-rejected', () => assert.throws(() => assertNaturalCompletion(policy,
        { ...completion(), providerMaxTime: 10 }), /Real managed provider progress/));
    await check('missing-ended-rejected', () => assert.throws(() => assertNaturalCompletion(policy,
        { ...completion(), ended: null }), /actual Ended/));
    await check('wrong-ended-identity-rejected', () => assert.throws(() => assertNaturalCompletion(policy,
        { ...completion(), ended: { ...completion().ended, spotifyId: next } }), /expected Spotify identity/));
    await check('real-provider-accepted', () => assertProviderPlaying(provider(), first, 7));
    await check('signed-out-provider-rejected', () => assert.throws(() => assertProviderPlaying(
        { ...provider(), authState: 'signed-out' }, first, 7), /signed-in/));
    await check('competing-provider-track-rejected', () => assert.throws(() => assertProviderPlaying(
        { ...provider(), trackIds: [first, next] }, first, 7), /fixture only/));
    await check('observer-bounds', () => { assertObservers(observations()); assert.throws(() =>
        assertObservers({ ...observations(), watchRequests: 2 }), /bounded to one/); });
    await check('cleanup-zero-resources', () => { assertObservers(observations(false), true);
        assert.throws(() => assertObservers(observations(), true), /settle/); });
    await check('natural-loop-next-generation-can-advance-more-than-one', async () =>
        assert.equal((await simulate()).to, 1));
    await check('natural-loop-472s', async () => assert.equal((await simulate({ duration: 472 })).naturalElapsedMs, 471000));
    await check('natural-loop-final-completion', async () => assert.equal((await simulate({ final: true })).to, 'complete'));
    await check('natural-loop-early-jump-rejected', () => assert.rejects(simulate({ early: 30 }), /Early completion/));
    await check('natural-loop-duplicate-run-rejected', () => assert.rejects(simulate({ duplicate: true }), /Unexpected duplicate/));
    await check('natural-loop-false-hidden-ended-rejected', () => assert.rejects(simulate({ visibleEnd: true }), /genuinely hidden/));
    await check('current-item-volume-api-reaches-provider', async () => {
        let gain = 0.05, appliedAt = 1;
        const H = { async queueSnapshot() { return { queue: { entries: ids.map(id => ({ id })), currentIndex: 0,
            playbackRunId: 1, repeatOne: false, loop: false }, managed: { ownership: { isOwner: true,
                ownerEpoch: 4, engineEpoch: 3, trackGeneration: 7 } }, visibility: 'hidden' }; },
        assertFixtureQueue(snapshot, expected, index) { assert.deepEqual(snapshot.queue.entries.map(entry => entry.id), expected);
            assert.equal(snapshot.queue.currentIndex, index); },
        async jsonRequest() { return { ...provider(), desiredVolume: gain, lastAppliedAt: appliedAt }; },
        async pollNode(run) { const value = await run(); assert.ok(value.ok); return value.value; } };
        const page = { async evaluate(_fn, input) { if (input) { assert.equal(input.id, ids[0]);
            gain = input.raw; appliedAt++; return gain; } return { observation: observations(),
            volume: { inFlight: 0, pending: 0 }, itemId: ids[0], queueViewOpen: false }; } };
        const result = await verifyCurrentVolume({ page, H, ids, index: 0, ownerEpoch: 4, expectedTrackId: first, hidden: true });
        assert.equal(result.itemId, ids[0]); assert.equal(result.appliedGain, 0.04);
        assert.equal(result.queueViewUiClaimed, false);
    });
    await check('cpu-clock-parsing', () => { assert.equal(cpuClockMs('02:03'), 123000);
        assert.equal(cpuClockMs('1-02:03:04'), 93784000); assert.equal(cpuClockMs('bad'), null); });
    await check('cpu-delta-elapsed-not-lifetime', () => assert.deepEqual(cpuDelta(
        [{ pid: 1, startedAt: 'a', cpuTimeMs: 1000 }], [{ pid: 1, startedAt: 'a', cpuTimeMs: 1500 }], 1000),
        { cpuDeltaMs: 500, cpuPercentOneCore: 50, cpuMatchedProcesses: 1 }));
    await check('cpu-pid-reuse-remains-unknown', () => assert.equal(cpuDelta(
        [{ pid: 1, startedAt: 'a', cpuTimeMs: 1000 }], [{ pid: 1, startedAt: 'b', cpuTimeMs: 1500 }], 1000).cpuDeltaMs, null));
    await check('natural-path-never-manually-seeks', () => {
        const source = fs.readFileSync(path.join(root, 'tools/smoke/audioflix_spotify_long_queue_live_smoke.mjs'), 'utf8').replace(/\r\n/g, '\n');
        const naturalBranch = source.slice(source.indexOf('if (natural) {\n                const record'), source.indexOf('const startedAt = Date.now();'));
        assert.ok(naturalBranch.includes('continue;')); assert.ok(!naturalBranch.includes('.seek('));
        assert.ok(source.includes("require('../qualification/lane3-native-controller.cjs').launch({ nativeVisibility: true })"));
        assert.ok(source.includes('browser.__eveNativeController?.nativeVisibility === true'));
    });
    await check('legacy-native-callers-use-real-visibility', () => {
        for (const name of ['audioflix_lane3_runtime_acceptance.mjs', 'audioflix_lane3_file_acceptance.mjs']) {
            const source = fs.readFileSync(path.join(root, 'tools/qualification', name), 'utf8');
            assert.ok(source.includes("require('./lane3-native-controller.cjs').launch({ nativeVisibility: true })"), name);
        }
    });
    E.ok = true;
}

main().catch(error => { E.error = { id: current, stack: String(error?.stack || error) }; process.exitCode = 1; })
    .finally(() => {
        fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(E, null, 2));
        if (E.ok) console.log(`AUDIOFLIX_SPOTIFY_NATURAL_HARNESS_OK ${E.cases.length}/${E.cases.length}`);
        else { console.error(`AUDIOFLIX_SPOTIFY_NATURAL_HARNESS_FAIL ${current} artifact=${artifact}`);
            console.error(E.error.stack.split(/\r?\n/).slice(0, 40).join('\n')); }
    });
