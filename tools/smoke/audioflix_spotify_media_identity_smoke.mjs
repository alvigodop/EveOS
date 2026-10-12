#!/usr/bin/env node
// Checkpoint B contracts: typed Spotify media identity (track | episode | local | unknown),
// lossless migration, metadata-only retention, mixed playlist extraction, and placement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const feature = (name) => fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', name), 'utf8');
const core = require('../../server_modules/audioflix_spotify_scrape_core.js');

const TRACK = '4uLU6hMCjMI75M1A2tKUQC';
const EPISODE = '1ee3C7OGRCY8fK1qWUJwF9';
const LOCAL_URI = 'spotify:local:Drift:Basement+Arc:My+Weird+Unreleased+Song:201';

// ---------- schema: identity, migration, retention ----------
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(feature('audioflix.state.schema.js'), ctx);
const schema = ctx.window.EveAudioflixStateSchema;
const cleaner = schema.create({ text: schema.text, normalizeVolume: schema.normalizeVolume, id: schema.id });
const clean = (item) => JSON.parse(JSON.stringify(cleaner.cleanItem(item, 'music')));

const legacy = clean({ id: 'm1', title: 'Old', url: `https://open.spotify.com/track/${TRACK}?si=x`, sourceProvider: 'spotify', spotifyTrackId: TRACK });
assert.equal(legacy.sourceMediaType, 'track');
assert.equal(legacy.sourceMediaId, TRACK);
assert.equal(legacy.sourceUri, `spotify:track:${TRACK}`);
assert.equal(legacy.sourcePlayable, true);
assert.equal(legacy.sourceAvailability, 'playable');
assert.equal(legacy.spotifyTrackId, TRACK, 'legacy alias kept for tracks');
assert.equal(legacy.spotifyUri, `spotify:track:${TRACK}`);
assert.deepEqual(clean(legacy), legacy, 'normalization is idempotent for tracks');

const urlOnly = clean({ id: 'm2', title: 'URL only', url: `https://open.spotify.com/intl-de/track/${TRACK}` });
assert.equal(urlOnly.sourceProvider, 'spotify', 'bare Spotify track URLs migrate to provider identity');
assert.equal(urlOnly.sourceMediaId, TRACK);

const episode = clean({ id: 'm3', title: 'Ep', url: `https://open.spotify.com/episode/${EPISODE}?si=3e35`, sourceProvider: 'spotify', sourceMediaType: 'episode' });
assert.equal(episode.sourceMediaType, 'episode');
assert.equal(episode.sourceUri, `spotify:episode:${EPISODE}`);
assert.equal(episode.spotifyTrackId, '', 'episodes never populate the track-only alias');
assert.equal(episode.spotifyUri, '');
assert.equal(episode.sourcePlayable, true, 'typed episode playback is now supported');
assert.equal(episode.sourceAvailability, 'playable');
assert.deepEqual(clean(episode), episode, 'normalization is idempotent for episodes');

const local = clean({ id: 'm4', title: 'My Weird Unreleased Song', artist: 'Drift', album: 'Basement Arc', sourceProvider: 'spotify', sourceMediaType: 'local', sourceUri: LOCAL_URI, sourceId: 'local:abc' });
assert.equal(local.url, '', 'no URL is invented for a Spotify-local file');
assert.equal(local.sourceIsLocal, true);
assert.equal(local.sourceAvailability, 'metadata-only');
assert.equal(schema.isRetained(local), true, 'metadata-only local rows survive');
assert.deepEqual(clean(local), local, 'normalization is idempotent for locals');
const linked = clean({ ...local, localPath: 'C:/Music/song.mp3' });
assert.equal(linked.sourcePlayable, true, 'linking a file makes a local row playable');

const future = clean({ id: 'm5', title: 'Audiobook chapter', sourceProvider: 'spotify', sourceMediaType: 'audiobook', sourceId: 'x1' });
assert.equal(future.sourceMediaType, 'unknown', 'unknown future media types degrade, never crash');
assert.equal(schema.isRetained(future), true);

const matched = clean({ id: 'm6', title: 'Matched', url: 'https://www.youtube.com/watch?v=abc', sourceProvider: 'spotify' });
assert.equal(matched.sourcePlayable, true, 'a Spotify row matched to another stream still plays');

assert.equal(schema.isRetained({ title: 'Nothing' }), false, 'a title alone is never identity');
assert.equal(schema.isRetained({ title: 'Prov only', sourceProvider: 'spotify' }), false);
assert.notEqual(schema.identityKey({ sourceProvider: 'spotify', sourceMediaType: 'track', sourceMediaId: 'ABCDEFGHIJ' }),
    schema.identityKey({ sourceProvider: 'spotify', sourceMediaType: 'episode', sourceMediaId: 'ABCDEFGHIJ' }),
    'track and episode IDs are separate namespaces');
const yt = clean({ id: 'm7', title: 'YT', url: 'https://youtu.be/abc', sourceProvider: 'youtube' });
assert.equal(yt.sourceProvider, 'youtube');
assert.equal(yt.spotifyTrackId, '');

const kept = cleaner.boundedItems([legacy, episode, local, future, { id: 'drop', title: 'No identity' }], 'music', 10000);
assert.deepEqual(kept.map((item) => item.id), ['m1', 'm3', 'm4', 'm5'], 'store keeps every real item, drops only identity-less junk');

// ---------- bulk replaceMusic: lossless above 10k and keeps metadata-only rows ----------
const bulkStore = { music: [], musicGroupMap: {} };
const bctx = vm.createContext({ console, window: {
    EveAudioflixStateSchema: schema,
    EveAudioflixState: { ensure: () => bulkStore, update: (patch) => Object.assign(bulkStore, patch) }
} });
vm.runInContext(feature('audioflix.bulk.js'), bctx);
const big = Array.from({ length: 10050 }, (_, i) => ({ id: `b${i}`, title: `T${i}`, url: `https://example.invalid/${i}.mp3` }));
const bulkResult = bctx.window.EveAudioflixBulk.replaceMusic([...big, local, episode], {}, 'smoke');
assert.equal(bulkResult.ok, true);
assert.equal(bulkStore.music.length, 10052, 'playlist batch replacement must not truncate libraries above 10k');
assert.equal(bulkStore.music[0].id, 'b0', 'oldest song survives a bulk replacement');

// ---------- client adapter: one extracted row -> AudioFlix fields ----------
const actx = vm.createContext({ console, window: { EveAudioflixStateSchema: schema } });
vm.runInContext(feature('audioflix.playlists.spotify.js'), actx);
const patch = (entry) => JSON.parse(JSON.stringify(actx.window.EveAudioflixSpotify.entryPatch(entry)));
const pt = patch({ id: TRACK, url: `https://open.spotify.com/track/${TRACK}`, mediaType: 'track' });
assert.equal(pt.sourceMediaType, 'track'); assert.equal(pt.spotifyTrackId, TRACK);
const legacyRow = patch({ id: TRACK, url: `https://open.spotify.com/track/${TRACK}` });
assert.equal(legacyRow.sourceMediaType, 'track', 'rows from an older bridge without mediaType stay tracks');
const pe = patch({ id: EPISODE, url: `https://open.spotify.com/episode/${EPISODE}`, mediaType: 'episode', show: 'The Show' });
assert.equal(pe.sourceMediaType, 'episode'); assert.equal(pe.spotifyTrackId, ''); assert.equal(pe.artist, 'The Show');
const pl = patch({ mediaType: 'local', uri: LOCAL_URI, title: 'My Weird Unreleased Song' });
assert.equal(pl.sourceMediaType, 'local'); assert.equal(pl.sourceUri, LOCAL_URI); assert.equal(pl.spotifyTrackId, '');
const pu = patch({ id: TRACK, url: `https://open.spotify.com/track/${TRACK}`, mediaType: 'track', available: false });
assert.equal(pu.sourceAvailability, 'unavailable');

// ---------- server extraction: mixed network payload ----------
const network = new Map();
core.scanValue({ items: [
    { item: { __typename: 'Track', uri: `spotify:track:${TRACK}`, name: 'Song A', artists: { items: [{ profile: { name: 'Artist A' } }] }, duration: { totalMilliseconds: 180000 } } },
    { item: { __typename: 'Episode', uri: `spotify:episode:${EPISODE}`, name: 'Episode 12', podcastV2: { data: { name: 'Pod Show', uri: 'spotify:show:SHOW123456' } }, duration: { totalMilliseconds: 3600000 } } },
    { item: { __typename: 'LocalTrack', uri: LOCAL_URI, name: 'My Weird Unreleased Song' } },
    { item: { __typename: 'Track', uri: 'spotify:track:5UnavailableXYZ0000000', name: 'Gone', playability: { playable: false } } },
    { item: null }, { item: { __typename: 'Audiobook', uri: 'spotify:audiobook:AB1234567890', name: 'Book' } }
] }, network);
const rows = [...network.values()];
const byType = (type) => rows.filter((row) => row.mediaType === type);
assert.equal(byType('track').length, 2);
assert.equal(byType('episode').length, 1);
assert.equal(byType('episode')[0].url, `https://open.spotify.com/episode/${EPISODE}`);
assert.equal(byType('episode')[0].artist, 'Pod Show');
assert.equal(byType('local').length, 1);
assert.equal(byType('local')[0].url, '', 'no Spotify page is invented for a local file');
assert.equal(byType('local')[0].album, 'Basement Arc', 'local URI metadata fills gaps');
assert.equal(rows.find((row) => row.title === 'Gone').available, false, 'unavailable rows are kept and flagged');

// DOM row for the local file (no link) merges with the network local row by metadata.
const dom = [
    { id: TRACK, mediaType: 'track', title: 'Song A', artists: ['Artist A'], url: `https://open.spotify.com/track/${TRACK}`, durationText: '3:00' },
    { id: EPISODE, mediaType: 'episode', title: 'Episode 12', artists: ['Pod Show'], url: `https://open.spotify.com/episode/${EPISODE}`, durationText: '60:00' },
    { id: '', mediaType: 'unknown', title: 'My Weird Unreleased Song', artists: ['Drift'], url: '', durationText: '3:21' }
];
const merged = core.mergePlaylistRows(dom, network, 3);
assert.equal(merged.length, 3);
assert.equal(merged[2].mediaType, 'local', 'DOM local row adopts the network local classification');
const ids = merged.map((row, i) => core.stableId(row, i + 1));
assert.equal(ids[0], TRACK, 'track sourceId stays the bare ID existing libraries reconcile on');
assert.equal(ids[1], `episode:${EPISODE}`);
assert.match(ids[2], /^local:/);
assert.equal(new Set(ids).size, 3);
assert.equal(core.playlistCount('Playlist • 12 items, about 2 hr 10 min'), 12);

// ---------- playlist placement: Folder != Group, custom group survives sync ----------
let upstream = { ok: true, playlistId: 'PL1', title: 'Liked Weird Stuff', entries: [
    { sourceId: TRACK, id: TRACK, mediaType: 'track', title: 'Song A', url: `https://open.spotify.com/track/${TRACK}` },
    { sourceId: `episode:${EPISODE}`, id: EPISODE, mediaType: 'episode', title: 'Episode 12', show: 'Pod Show', url: `https://open.spotify.com/episode/${EPISODE}` },
    { sourceId: 'local:abc', mediaType: 'local', uri: LOCAL_URI, title: 'My Weird Unreleased Song', url: '' }
] };
const pstore = { music: [], musicPlaylists: [], musicGroups: [], musicGroupMap: {} };
let renamed = [];
const pctx = vm.createContext({ console, Date, Math, window: {} });
const pw = pctx.window;
pw.EveAudioflixStateSchema = schema;
pw.EveAudioflixState = {
    ensure: () => pstore,
    update: (next) => Object.assign(pstore, next),
    addMusicGroup: (name) => { if (!pstore.musicGroups.includes(name)) pstore.musicGroups.push(name); },
    updateItem: (type, id, next) => { const item = pstore.music.find((entry) => entry.id === id); if (item) Object.assign(item, next); },
    toggleMusicGroup: (id, group, on) => { const set = new Set(pstore.musicGroupMap[id] || []); on ? set.add(group) : set.delete(group); pstore.musicGroupMap[id] = [...set]; },
    renameGroup: (type, from, to) => renamed.push([from, to])
};
pw.EveAudioflixNative = { listSpotifyPlaylist: async () => JSON.parse(JSON.stringify(upstream)) };
vm.runInContext(feature('audioflix.playlists.providers.js'), pctx);
vm.runInContext(feature('audioflix.playlists.spotify.js'), pctx);
vm.runInContext(feature('audioflix.bulk.js'), pctx);
vm.runInContext(feature('audioflix.playlists.wpl.js'), pctx);
vm.runInContext(feature('audioflix.playlists.js'), pctx);
const PL = pw.EveAudioflixPlaylists;
const url = 'https://open.spotify.com/playlist/PL1';
const imported = await PL.importPlaylist(url, { folder: 'Spotify Imports', group: 'Night Music' });
assert.equal(imported.ok, true, imported.reason);
assert.equal(imported.connection.folder, 'Spotify Imports');
assert.equal(imported.connection.group, 'Night Music');
assert.equal(pstore.music.length, 3, 'track + episode + local all imported');
assert.ok(pstore.music.every((item) => item.folder === 'Spotify Imports'));
assert.ok(pstore.music.every((item) => (pstore.musicGroupMap[item.id] || []).includes('Night Music')));
assert.equal(pstore.music.find((item) => item.sourceMediaType === 'local').url, '');
assert.match(imported.media.text, /1 podcast episode/);
assert.match(imported.media.text, /1 Spotify local file/);

upstream = { ...upstream, title: 'Renamed Upstream' };
const synced = await PL.syncPlaylist(imported.connection.id, true);
assert.equal(synced.ok, true);
assert.equal(synced.connection.group, 'Night Music', 'custom group survives an upstream rename');
assert.equal(synced.connection.folder, 'Spotify Imports', 'custom folder survives sync');
assert.equal(renamed.length, 0, 'no group rename for customized placement');
assert.equal(pstore.music.length, 3, 'resync does not duplicate any media kind');

// Default group follows the playlist title until the user customizes it.
const followStore = pstore.musicPlaylists.find((entry) => entry.id === imported.connection.id);
followStore.group = 'Renamed Upstream';
upstream = { ...upstream, title: 'Third Title' };
const follow = await PL.syncPlaylist(imported.connection.id, true);
assert.equal(follow.connection.group, 'Third Title', 'title-following group tracks upstream renames');

// Re-importing the same URL with an explicit Group moves the connection there.
const again = await PL.importPlaylist(url, { folder: '', group: 'Gym' });
assert.equal(again.ok, true);
assert.equal(again.connection.group, 'Gym');

console.log('AUDIOFLIX_SPOTIFY_MEDIA_IDENTITY_SMOKE_OK');
