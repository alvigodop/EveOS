#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const feature = (name) => fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', name), 'utf8');
const TRACK = '4uLU6hMCjMI75M1A2tKUQC';
const EPISODE = '1ee3C7OGRCY8fK1qWUJwF9';

const ctx = vm.createContext({ window: {}, console });
vm.runInContext(feature('audioflix.state.schema.js'), ctx, { filename: 'audioflix.state.schema.js' });
vm.runInContext(feature('audioflix.state.groups.js'), ctx, { filename: 'audioflix.state.groups.js' });
const schema = ctx.window.EveAudioflixStateSchema;
const cleaner = schema.create({ text: schema.text, normalizeVolume: schema.normalizeVolume, id: schema.id });

const original = cleaner.cleanItem({
    id: 'music-identity-1',
    type: 'music',
    title: 'Mutable Media',
    url: `https://open.spotify.com/track/${TRACK}`,
    sourceProvider: 'spotify',
    sourceMediaType: 'track',
    sourceMediaId: TRACK,
    sourceUri: `spotify:track:${TRACK}`,
    sourcePlayable: true,
    sourceAvailability: 'playable',
    spotifyTrackId: TRACK,
    spotifyUri: `spotify:track:${TRACK}`
}, 'music');
const store = {
    music: [original],
    soundboard: [],
    musicFolders: [],
    localizeScopeDirs: {},
    musicPortConnections: []
};
let saves = 0;
const groups = ctx.window.EveAudioflixStateGroups.create({
    ensure: () => store,
    text: schema.text,
    scheduleSave: () => { saves += 1; },
    syncRootOrFallback: () => {}
});

const afterEpisode = groups.updateItem('music', original.id, {
    url: `https://open.spotify.com/episode/${EPISODE}`,
    sourceMediaType: 'episode',
    sourceMediaId: EPISODE,
    sourceUri: `spotify:episode:${EPISODE}`,
    sourceAvailability: 'metadata-only',
    // Deliberately stale values from a caller: updateItem must not persist them.
    sourcePlayable: true,
    spotifyTrackId: TRACK,
    spotifyUri: `spotify:track:${TRACK}`
}).music[0];

assert.equal(afterEpisode.id, original.id, 'editing identity must preserve the AudioFlix item ID');
assert.equal(afterEpisode.sourceMediaType, 'episode');
assert.equal(afterEpisode.sourceMediaId, EPISODE);
assert.equal(afterEpisode.sourceUri, `spotify:episode:${EPISODE}`);
assert.equal(afterEpisode.sourceAvailability, 'playable');
assert.equal(afterEpisode.sourcePlayable, true, 'derived episode playability is recomputed immediately at the mutation boundary');
assert.equal(afterEpisode.spotifyTrackId, '', 'track-only legacy alias is cleared immediately when media becomes an episode');
assert.equal(afterEpisode.spotifyUri, '', 'track-only legacy URI is cleared immediately when media becomes an episode');
assert.equal(saves, 1, 'one logical item edit schedules one durable save');

const afterTrack = groups.updateItem('music', original.id, {
    url: `https://open.spotify.com/track/${TRACK}`,
    sourceMediaType: 'track',
    sourceMediaId: TRACK,
    sourceUri: `spotify:track:${TRACK}`,
    sourceAvailability: 'playable'
}).music[0];
assert.equal(afterTrack.sourcePlayable, true);
assert.equal(afterTrack.spotifyTrackId, TRACK, 'legacy track alias is restored only for a real Spotify track');
assert.equal(afterTrack.spotifyUri, `spotify:track:${TRACK}`);
assert.deepEqual(
    JSON.parse(JSON.stringify(cleaner.cleanItem(afterTrack, 'music'))),
    JSON.parse(JSON.stringify(afterTrack)),
    'an item edited through updateItem is already canonical; a later normalize is a no-op'
);
assert.equal(saves, 2);

console.log('AUDIOFLIX_MEDIA_MUTATION_IDENTITY_SMOKE_OK');
