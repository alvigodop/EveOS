import assert from 'node:assert/strict';
import { validateTypedCompletion, assertTypedResources } from '../qualification/audioflix_typed_natural.shared.mjs';
import { naturalPolicy, assertNaturalCompletion, observerCounters } from './audioflix_spotify_long_queue_natural.mjs';
const id = '4cOdK2wGLETKBW3PvgPWqT';
const media = { spotifyId: id, spotifyUri: `spotify:episode:${id}`, mediaType: 'episode' };
validateTypedCompletion(media, { ...media });
assert.throws(() => validateTypedCompletion(media, { ...media, spotifyUri: `spotify:track:${id}`, mediaType: 'track' }));
const policy = naturalPolicy(120, 2);
const proof = { itemId: 'episode', spotifyId: id, run: 4, generation: 7, hidden: true,
    elapsedMs: 118000, maxTime: 119, providerSamples: 100, providerInitialTime: 2, providerMaxTime: 119,
    ended: { status: 'Ended', itemId: 'episode', spotifyId: id, run: 4, generation: 7,
        completionId: '7:1', visibility: 'hidden' } };
assertNaturalCompletion(policy, proof);
for (const bad of [{ elapsedMs: 30000 }, { providerMaxTime: 30 }, { maxTime: 30 },
    { ended: { ...proof.ended, visibility: 'visible' } }, { ended: { ...proof.ended, run: 3 } }]) {
    assert.throws(() => assertNaturalCompletion(policy, { ...proof, ...bad }));
}
assert.throws(() => naturalPolicy(30, 0), /preview/);
assert.throws(() => naturalPolicy(120, 115), /within 12s/);
const settled = Object.fromEntries(observerCounters.map(key => [key, 0]));
assertTypedResources(settled, { inFlight: 0, pending: 0 }, true);
assert.throws(() => assertTypedResources({ ...settled, watchRequests: 2 }, { inFlight: 0, pending: 0 }));
assert.throws(() => assertTypedResources(settled, { inFlight: 2, pending: 0 }));
assert.throws(() => assertTypedResources(settled, { inFlight: 1, pending: 0 }, true));
console.log('AUDIOFLIX_TYPED_NATURAL_CONTRACT_SMOKE_OK typed=true previewRejected=true seekTailRejected=true hidden=true');
