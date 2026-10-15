#!/usr/bin/env node
// Opt-in provider read + isolated canonical AudioFlix snapshot roundtrip. No account/library writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readBackendAudioflixSnapshot, assertBackendAudioflixUnchanged } from '../smoke/audioflix_spotify_live_isolation.shared.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const MODULES = ['audioflix.state.schema.js', 'audioflix.state.recovery.js', 'audioflix.state.groups.js',
    'audioflix.library.index.js', 'audioflix.state.mutations.js', 'audioflix.state.persistence.js', 'audioflix.state.js', 'audioflix.bulk.js',
    'audioflix.playlists.providers.js', 'audioflix.playlists.spotify.js', 'audioflix.playlists.wpl.js', 'audioflix.playlists.js'];
let latestArtifact = '';
function sourceDigest() {
    const hash = createHash('sha256');
    hash.update(fs.readFileSync(fileURLToPath(import.meta.url)));
    for (const name of MODULES) hash.update(name).update(fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', name)));
    return hash.digest('hex');
}
export function canonicalPlaylistUrl(raw) {
    let url;
    try { url = new URL(String(raw || '').trim()); } catch { throw Error('Input must contain a Spotify playlist URL.'); }
    const match = url.pathname.match(/^\/(?:embed\/)?playlist\/([A-Za-z0-9]{22})\/?$/);
    assert.ok(url.protocol === 'https:' && url.hostname === 'open.spotify.com' && !url.port
        && !url.username && !url.password && match, 'Input must identify one canonical Spotify playlist.');
    // Private invite/share parameters remain only in the input buffer, never sent or exported.
    return `https://open.spotify.com/playlist/${match[1]}`;
}
export function redact(value) {
    return String(value || '').replace(/(https?:\/\/[^\s"'<>?]+)\?[^\s"'<>]*/gi, '$1?[redacted]')
        .replace(/\b(?:pt|si|token|secret|csrf|clientToken|sessionId)\s*[:=]\s*[^\s,;]+/gi, '[redacted]');
}
function isolated(payload) {
    const memory = new Map(), timers = new Map();
    let timer = 0;
    const window = {
        eveState: { config: {} }, addEventListener() {}, dispatchEvent() {},
        saveConfig: async () => true,
        setTimeout(callback) { timers.set(++timer, callback); return timer; },
        clearTimeout(id) { timers.delete(id); },
        EveAudioflixNative: {
            listSpotifyPlaylist: async () => clone(payload),
            openSpotifySession: async () => { throw Error('Qualification cannot open login or invite approval.'); }
        }
    };
    const context = vm.createContext({ window, URL, console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
        localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        fetch: async () => { throw Error('Isolated validator cannot access network or saved library.'); }
    });
    for (const name of MODULES) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix', name), 'utf8'), context, { filename: name });
    }
    return { window, cleanup() { timers.clear(); memory.clear(); } };
}
function signatures(store) {
    return store.music.map(row => ({ sourceId: row.sourceId, provider: row.sourceProvider,
        type: row.sourceMediaType, id: row.sourceMediaId, uri: row.sourceUri,
        availability: row.sourceAvailability, playable: row.sourcePlayable,
        legacyTrackId: row.spotifyTrackId, legacyUri: row.spotifyUri })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
export async function validateMixedPlaylist(payload, url) {
    assert.ok(url === canonicalPlaylistUrl(url), 'Validator requires a canonical query-free playlist URL.');
    assert.equal(payload?.ok, true, 'Provider listing failed; login/invite approval is outside this driver.');
    assert.ok(Array.isArray(payload.entries) && payload.entries.length > 0, 'Provider returned no visible playlist rows.');
    const counts = { track: 0, episode: 0, local: 0, unknown: 0 };
    for (const entry of payload.entries) counts[Object.hasOwn(counts, entry.mediaType) ? entry.mediaType : 'unknown']++;
    assert.ok(counts.track > 0 && counts.episode > 0, 'Real listing must contain both a track and an episode; do not substitute synthetic rows.');
    const first = isolated(payload), second = isolated(payload);
    try {
        const P = first.window.EveAudioflixPlaylists, S = first.window.EveAudioflixState;
        const imported = await P.importPlaylist(url, { folder: 'Qualification only', group: 'Mixed playlist qualification' });
        assert.equal(imported.ok, true, 'Actual playlist import rejected the provider payload.');
        const before = clone(signatures(S.ensure()));
        assert.ok(before.some(row => row.type === 'track') && before.some(row => row.type === 'episode'));
        for (const entry of payload.entries) {
            if (!entry.sourceId) {
                assert.ok(!['track', 'episode'].includes(entry.mediaType), 'Playable provider row is missing its upstream identity.');
                continue;
            }
            const expected = first.window.EveAudioflixPlaylistProviders.entryPatch('spotify', entry);
            const row = S.ensure().music.find(item => item.sourceId === entry.sourceId);
            assert.ok(row, 'An extracted identity was lost during actual batch import.');
            assert.equal(row.sourceMediaType, expected.sourceMediaType);
            assert.ok(row.sourceMediaId === expected.sourceMediaId, 'Imported media identity differs from the real provider patch.');
            assert.ok(row.sourceUri === expected.sourceUri, 'Imported typed URI differs from the real provider patch.');
            if (row.sourceMediaType === 'episode') assert.equal(row.spotifyTrackId, '', 'Episode must not acquire a track alias.');
        }
        const synced = await P.syncPlaylist(imported.connection.id, true);
        assert.equal(synced.ok, true);
        assert.equal(synced.added, 0, 'Reconcile must not duplicate existing typed media.');
        assert.equal(synced.missing, 0);
        assert.ok(JSON.stringify(signatures(S.ensure())) === JSON.stringify(before), 'Reconcile rewrote typed identities.');
        // Canonical AudioFlix serializer/store restore, not a claim about a UI download click.
        const exported = JSON.stringify(S.durableSnapshot());
        const R = second.window.EveAudioflixState;
        R.replaceState(JSON.parse(exported), 'isolated-mixed-playlist-reimport');
        assert.ok(JSON.stringify(signatures(R.ensure())) === JSON.stringify(before), 'Snapshot export/reimport lost typed media.');
        assert.deepEqual(clone(R.ensure().musicGroupMap), clone(S.ensure().musicGroupMap));
        const reconciled = await second.window.EveAudioflixPlaylists.syncPlaylist(imported.connection.id, true);
        assert.equal(reconciled.ok, true);
        assert.equal(reconciled.added, 0);
        assert.equal(reconciled.missing, 0);
        assert.ok(JSON.stringify(signatures(R.ensure())) === JSON.stringify(before), 'Restored playlist reconcile duplicated or relabeled media.');
        const samples = payload.entries.flatMap(entry => {
            const patch = first.window.EveAudioflixPlaylistProviders.entryPatch('spotify', entry);
            if (!['track', 'episode'].includes(patch.sourceMediaType) || !patch.sourceMediaId || patch.sourceAvailability !== 'playable') return [];
            return [{ spotifyUri: patch.sourceUri, mediaType: patch.sourceMediaType, duration: Number(entry.duration) || 0 }];
        });
        return { extracted: payload.entries.length, imported: before.length, counts,
            mediaSamples: { firstTrack: samples.find(row => row.mediaType === 'track') || null,
                shortestEligibleEpisode: samples.filter(row => row.mediaType === 'episode' && row.duration > 60 && row.duration <= 1800)
                    .sort((a, b) => a.duration - b.duration)[0] || null,
                durationIsPlaylistMetadata: true, liveDurationNotVerified: true },
            importReconcile: true, canonicalSnapshotRoundtrip: true, restoredReconcile: true,
            fullUiBackupClaimed: false, savedLibraryWrites: 0, accountWrites: 0 };
    } finally { first.cleanup(); second.cleanup(); }
}
function inputFile(value) {
    if (value === '-') {
        const raw = fs.readFileSync(0, 'utf8');
        assert.ok(raw.length <= 4096, 'Standard input exceeds the bounded URL input size.');
        return raw;
    }
    assert.ok(value, 'Use --url-file <ignored input file>, or --url-file - for stdin.');
    const resolved = path.resolve(value);
    try { execFileSync('git', ['check-ignore', '-q', '--', resolved], { cwd: ROOT, stdio: 'pipe' }); }
    catch { throw Error('URL input must be in an ignored repository-local file; alternatively use stdin.'); }
    assert.ok(fs.statSync(resolved).size <= 4096, 'URL input file exceeds the bounded input size.');
    return fs.readFileSync(resolved, 'utf8');
}
async function main() {
    const args = process.argv.slice(2);
    const option = name => {
        const inline = args.find(arg => arg.startsWith(name + '='));
        const index = args.indexOf(name);
        return inline ? inline.slice(name.length + 1) : index >= 0 ? args[index + 1] : '';
    };
    const url = canonicalPlaylistUrl(inputFile(option('--url-file')));
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/eveos-ports.json'), 'utf8'));
    const base = new URL(option('--base') || `http://127.0.0.1:${registry.ports.EVEOS_WEB_PORT.port}`);
    assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
        && base.port && base.pathname === '/' && !base.search && !base.hash && !base.username && !base.password, 'Base must be an exact loopback HTTP origin.');
    const request = async (route, timeout = 10000) => {
        const response = await fetch(base.origin + route, { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
        assert.ok(response.ok, 'Canonical backend read failed.');
        const body = await response.text();
        assert.ok(body.length <= 20 * 1024 * 1024, 'Provider payload exceeds the bounded qualification size.');
        try { return JSON.parse(body); } catch { throw Error('Canonical backend returned malformed JSON.'); }
    };
    const backend = () => readBackendAudioflixSnapshot(() => request('/api/eve-state/modular/load'));
    const before = await backend(), status = await request('/api/audioflix/spotify-browser/status');
    assert.ok(status.helperReachable && status.sessionPresent && status.authState === 'signed-in',
        'Existing signed-in managed helper required. Driver will not start it, log in, or accept an invite.');
    const directory = path.join(ROOT, 'data/runtime/smoke-results');
    fs.mkdirSync(directory, { recursive: true });
    const artifact = path.join(directory, `audioflix-mixed-playlist-${Date.now()}.json`);
    latestArtifact = artifact;
    const record = { ok: false, realProviderRead: true, canonicalUrl: url,
        privateQuerySent: false, helperStarted: false, sourceDigest: sourceDigest(),
        sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() };
    try {
        // Canonical query-free URL only. Server invokes the existing in-process list_playlist manager.
        const payload = await request(`/api/audioflix/spotify-playlist?url=${encodeURIComponent(url)}&refresh=1`, 180000);
        assert.equal(payload?.ok, true, 'Canonical public playlist unavailable; private/invite/login approval is outside this driver.');
        assert.equal(payload.managedBrowserImport, true, 'Do not fall back to another profile/import runtime.');
        record.proof = await validateMixedPlaylist(payload, url);
        record.scrapeSource = redact(payload.scrapeSource);
        const after = await request('/api/audioflix/spotify-browser/status');
        assert.equal(after.sessionPresent, status.sessionPresent);
        assert.equal(after.authState, status.authState);
        assert.equal(after.transport?.generation, status.transport?.generation, 'Playlist read restarted playback generation.');
        assert.equal(after.transport?.spotifyUri, status.transport?.spotifyUri, 'Playlist read changed playback identity.');
        assert.equal(after.desiredVolume, status.desiredVolume, 'Playlist read changed current gain.');
        record.ok = true;
    } catch (error) { record.error = redact(error.message); throw error; }
    finally {
        try { assertBackendAudioflixUnchanged(before, await backend()); record.backendUnchanged = true; }
        catch (error) { record.ok = false; record.isolationError = redact(error.message); }
        record.sourceUnchanged = sourceDigest() === record.sourceDigest;
        record.finalHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
        record.sourceUnchanged &&= record.finalHead === record.sourceHead;
        if (!record.sourceUnchanged) record.ok = false;
        fs.writeFileSync(artifact, JSON.stringify(record, null, 2));
        if (!record.backendUnchanged) throw Error('Saved AudioFlix backend changed during qualification; see ignored artifact.');
        if (!record.sourceUnchanged) throw Error('AudioFlix source changed during qualification; rerun on one exact checkpoint.');
    }
    console.log(`AUDIOFLIX_MIXED_PLAYLIST_ACCEPTANCE_OK track=true episode=true roundtrip=true backend=unchanged artifact=${artifact}`);
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main().catch(error => {
    console.error(`AUDIOFLIX_MIXED_PLAYLIST_ACCEPTANCE_FAILED ${redact(error.message)}`);
    if (latestArtifact) console.error(`artifact=${latestArtifact}`);
    process.exitCode = 1;
});
