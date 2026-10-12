'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sanitizePayload } = require('../../server_modules/audioflix_spotify_browser_transport.js');
const artifact = path.resolve(__dirname, '../../data/runtime/smoke-results/audioflix-spotify-typed-transport.json');
const id = '1'.repeat(22), evidence = { ok: false, cases: [] };
let current = 'episode-uri-preserved';
try {
    const episode = sanitizePayload({ spotifyId: id, spotifyUri: `spotify:episode:${id}`, mediaType: 'episode' });
    assert.equal(episode.spotifyUri, `spotify:episode:${id}`);
    assert.equal(episode.mediaType, 'episode');
    evidence.cases.push(current);
    current = 'direct-episode-url';
    assert.equal(sanitizePayload({ url: `https://open.spotify.com/episode/${id}?si=test` }).spotifyUri, `spotify:episode:${id}`);
    evidence.cases.push(current);
    current = 'legacy-bare-track';
    assert.equal(sanitizePayload({ spotifyId: id }).spotifyUri, `spotify:track:${id}`);
    evidence.cases.push(current);
    current = 'local-rejected';
    assert.throws(() => sanitizePayload({ spotifyId: id, mediaType: 'local' }), /Spotify media identity/);
    evidence.cases.push(current);
    current = 'conflicting-namespace-rejected';
    assert.throws(() => sanitizePayload({ spotifyId: id, mediaType: 'track', spotifyUri: `spotify:episode:${id}` }), /Spotify media identity/);
    evidence.cases.push(current);
    current = 'invalid-embedded-id-rejected';
    assert.throws(() => sanitizePayload({ spotifyId: `spotify:local:artist:album:${id}` }), /Spotify media identity/);
    evidence.cases.push(current);
    current = 'no-identity-controls-preserved';
    assert.equal(sanitizePayload({ seconds: 5 }).seconds, 5);
    evidence.cases.push(current);
    current = 'all-type-hints-consistent';
    for (const hint of ['episode', 'local']) {
        assert.throws(() => sanitizePayload({ spotifyId: id, mediaType: 'track', sourceMediaType: hint }), /Spotify media identity/);
    }
    evidence.cases.push(current);
    evidence.ok = true;
} catch (error) { evidence.error = { id: current, stack: error.stack }; process.exitCode = 1; }
finally {
    fs.mkdirSync(path.dirname(artifact), { recursive: true }); fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
    if (evidence.ok) console.log(`AUDIOFLIX_SPOTIFY_TYPED_TRANSPORT_OK ${evidence.cases.length}/${evidence.cases.length}`);
    else { console.error(`AUDIOFLIX_SPOTIFY_TYPED_TRANSPORT_FAIL ${current} artifact=${artifact}`);
        console.error(evidence.error.stack.split(/\r?\n/).slice(0, 30).join('\n')); }
}
