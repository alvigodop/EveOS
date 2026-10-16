// Real-provider natural-duration proof; callers supply isolated, approved controllers.
import assert from 'node:assert/strict';
import { naturalPolicy, assertNaturalCompletion, hideNativeController, nativeControllerVisibility, assertObservers } from '../smoke/audioflix_spotify_long_queue_natural.mjs';

export function typedEntrypoints(base, fileUrl, requested = 'both') {
    assert.ok(['both', 'http', 'file'].includes(requested), '--entrypoint must be http, file or both');
    return [...(requested === 'file' ? [] : [base + '/EveOS.html']), ...(requested === 'http' ? [] : [fileUrl])];
}

export function validateTypedCompletion(media, event) {
    assert.equal(event.spotifyUri, media.spotifyUri, 'Natural Ended must name the full typed URI');
    assert.equal(event.mediaType, media.mediaType, 'Natural Ended must preserve the media namespace');
}

export function assertTypedResources(observation, volume, settled = false) {
    assertObservers(observation, settled);
    for (const key of ['inFlight', 'pending']) {
        assert.ok(Number.isInteger(volume?.[key]) && volume[key] >= 0 && volume[key] <= 1,
            `Volume ${key} must remain bounded to one`);
        if (settled) assert.equal(volume[key], 0, `Volume ${key} must settle after owned stop`);
    }
}

export async function awaitTypedNaturalEnd({ page, H, media, itemId, initial, checkpoint }) {
    const startStatus = await H.jsonRequest('/api/audioflix/spotify-browser/status');
    assert.equal(startStatus.transport?.spotifyUri, media.spotifyUri);
    assert.equal(startStatus.transport?.generation, initial.current.engine.generation);
    const firstTime = Number(startStatus.transport.currentTime);
    const policy = naturalPolicy(initial.current.playback.duration, firstTime);
    const started = Date.now(), deadline = started + policy.timeoutMs;
    const proof = { itemId, spotifyId: media.spotifyId, spotifyUri: media.spotifyUri,
        run: initial.current.queue.playbackRunId, generation: initial.current.engine.generation,
        hidden: true, maxTime: firstTime, providerInitialTime: firstTime,
        providerMaxTime: firstTime, providerSamples: 0, ended: null };
    while (Date.now() < deadline) {
        const current = await page.evaluate(() => ({
            visibility: document.visibilityState,
            visibleViolations: window.__eveNaturalVisibility?.visibleViolations || 0,
            queue: window.EveAudioflix.queueConnection.snapshot(),
            relay: window.EveAudioflixSpotifyAnyBrowser.snapshot().relay.lastState,
            events: window.__eveTypedMediaProbe?.events || [],
            volume: window.EveAudioflixSpotifyAnyBrowser.volumeDiagnostics(),
            observation: window.EveAudioflixSpotifyAnyBrowser.snapshot().observation
        }));
        if (current.visibility !== 'hidden' || current.visibleViolations > 0) {
            checkpoint?.({ policy, proof: { ...proof }, elapsedMs: Date.now() - started,
                visibilityFailure: await nativeControllerVisibility(page).catch(error => ({ error: String(error.message) })) });
        }
        assert.equal(current.visibility, 'hidden', 'Natural observation must remain genuinely backgrounded');
        assert.equal(current.visibleViolations, 0, 'Natural observation must not contain a visible interval');
        assert.equal(current.relay?.isOwner, true);
        assert.equal(current.relay.ownerEpoch, initial.current.ownerEpoch);
        assert.equal(current.relay.engineEpoch, initial.current.engineEpoch);
        assertTypedResources(current.observation, current.volume);
        const event = current.events.find(entry => entry.itemId === itemId
            && entry.run === proof.run && entry.generation === proof.generation);
        if (event) {
            validateTypedCompletion(media, event);
            proof.ended = { ...event, status: 'Ended' };
            break;
        }
        const status = await H.jsonRequest('/api/audioflix/spotify-browser/status');
        const transport = status.transport || {};
        if (transport.spotifyUri !== media.spotifyUri || transport.generation !== proof.generation) {
            // A legitimate handoff can occur between the page/event read and this helper read.
            // Accept only an already-recorded Ended for the exact old identity/run/generation.
            const raced = await page.evaluate(({ itemId, run, generation }) =>
                (window.__eveTypedMediaProbe?.events || []).find(entry => entry.itemId === itemId
                    && entry.run === run && entry.generation === generation), proof);
            if (raced) {
                validateTypedCompletion(media, raced);
                proof.ended = { ...raced, status: 'Ended' };
                break;
            }
        }
        assert.equal(transport.spotifyUri, media.spotifyUri, 'Provider must not switch before this natural Ended');
        assert.equal(transport.mediaType, media.mediaType);
        assert.equal(transport.generation, proof.generation);
        assert.equal(status.authState, 'signed-in');
        assert.equal(current.queue.playbackRunId, proof.run, 'No new queue run before natural Ended');
        assert.equal(current.queue.isPlaying, true);
        const time = Number(transport.currentTime || 0);
        proof.maxTime = Math.max(proof.maxTime, time);
        proof.providerMaxTime = Math.max(proof.providerMaxTime, time);
        proof.providerSamples += 1;
        proof.lastObservation = current.observation;
        proof.lastVolume = current.volume;
        if (proof.providerSamples % 15 === 0) checkpoint?.({ policy, proof: { ...proof }, elapsedMs: Date.now() - started });
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    proof.elapsedMs = Date.now() - started;
    assertNaturalCompletion(policy, proof);
    return { policy, proof, seekAssisted: false, naturalCompletionClaimed: true };
}

export async function qualifyTypedNaturalSequence({ page, context, H, ids, episode, track,
    initial, ready, volume, snapshot, checkpoint }) {
    const result = { seekAssisted: false, naturalCompletionClaimed: false,
        hiddenMethod: await hideNativeController(context, page, H) };
    result.episode = await awaitTypedNaturalEnd({ page, H, media: episode, itemId: ids[0], initial,
        checkpoint: progress => checkpoint('natural-episode', progress) });
    const next = await ready(page, H, ids, 1, track, initial.current);
    assert.ok(next.current.engine.generation > initial.current.engine.generation);
    assert.equal(next.current.queue.playbackRunId, initial.current.queue.playbackRunId + 1);
    assert.equal(await page.evaluate(() => window.EveAudioflix.queueConnection.action('repeat-one')), true);
    result.trackVolume = await volume(page, H, track, ids[1]);
    result.trackRepeatOn = await awaitTypedNaturalEnd({ page, H, media: track, itemId: ids[1], initial: next,
        checkpoint: progress => checkpoint('natural-track-repeat-on', progress) });
    const repeated = await ready(page, H, ids, 1, track, initial.current);
    assert.ok(repeated.current.engine.generation > next.current.engine.generation);
    assert.equal(repeated.current.queue.playbackRunId, next.current.queue.playbackRunId + 1);
    assert.equal(await page.evaluate(() => window.EveAudioflix.queueConnection.action('repeat-one')), false);
    result.repeatedVolume = await volume(page, H, track, ids[1]);
    result.trackRepeatOff = await awaitTypedNaturalEnd({ page, H, media: track, itemId: ids[1], initial: repeated,
        checkpoint: progress => checkpoint('natural-track-repeat-off', progress) });
    const deadline = Date.now() + 20000;
    let terminal;
    while (Date.now() < deadline) {
        terminal = await snapshot(page);
        if (!terminal.queue.isPlaying) break;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(terminal.queue.isPlaying, false, 'Final natural Ended must terminate the queue');
    assert.equal(terminal.events.filter(event => event.itemId === ids[0]).length, 1);
    assert.equal(terminal.events.filter(event => event.itemId === ids[1]).length, 2);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.audioflix-frontend-subhead [data-af-action="stop-music-group"]').length), 0);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.audioflix-frontend-subhead [data-af-action="play-music-group"]').length), 1);
    result.terminal = terminal;
    result.naturalCompletionClaimed = true;
    return result;
}
