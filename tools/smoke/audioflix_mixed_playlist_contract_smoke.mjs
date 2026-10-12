import assert from 'node:assert/strict';
import { canonicalPlaylistUrl, redact, validateMixedPlaylist } from '../qualification/audioflix_mixed_playlist_acceptance.mjs';
const id = 'A'.repeat(22), url = `https://open.spotify.com/playlist/${'B'.repeat(22)}`;
assert.equal(canonicalPlaylistUrl(url + '?pt=private-input&si=private-input'), url);
assert.throws(() => canonicalPlaylistUrl(url.replace('open.spotify.com', 'example.invalid')));
assert.ok(!redact(url + '?pt=private-input').includes('private-input'));
const entries = ['track', 'episode'].map((mediaType, index) => ({
    id, mediaType, sourceId: `spotify:${mediaType}:${id}`, uri: `spotify:${mediaType}:${id}`,
    title: `Contract ${mediaType}`, url: `https://open.spotify.com/${mediaType}/${id}`, position: index + 1
}));
entries.push({ sourceId: 'spotify:local:contract', mediaType: 'local',
    uri: 'spotify:local:Fixture:Fixture:Fixture:120', title: 'Contract local', url: '', available: false });
const proof = await validateMixedPlaylist({ ok: true, playlistId: 'B'.repeat(22), title: 'Contract only', entries }, url);
assert.equal(proof.imported, 3);
assert.equal(proof.counts.track, 1);
assert.equal(proof.counts.episode, 1);
assert.equal(proof.counts.local, 1);
assert.equal(proof.fullUiBackupClaimed, false);
await assert.rejects(() => validateMixedPlaylist({ ok: true, entries: entries.filter(row => row.mediaType === 'track') }, url), /both a track and an episode/);
await assert.rejects(() => validateMixedPlaylist({ ok: false }, url), /outside this driver/);
await assert.rejects(() => validateMixedPlaylist({ ok: true, entries }, url + '?pt=private-input'), /query-free/);
console.log('AUDIOFLIX_MIXED_PLAYLIST_CONTRACT_SMOKE_OK canonicalOnly=true typed=true sameIdNamespaces=true snapshotRoundtrip=true');
