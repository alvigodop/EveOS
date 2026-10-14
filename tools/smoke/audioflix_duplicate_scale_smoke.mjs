#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.state.duplicates.js'), 'utf8');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-duplicate-scale.json');
const evidence = { ok: false, cases: [], measurements: [] };
let current = 'startup';

function fixture(music) {
    const microtasks = [], snapshot = { music, soundboard: [], dupDismissedPairs: [] };
    let revision = 0;
    const window = { EveAudioflixState: {
        ensure: () => snapshot, getRevision: () => revision,
        update(patch) { Object.assign(snapshot, patch); revision += 1; },
        updateItem(type, id, patch) {
            const key = type === 'music' ? 'music' : 'soundboard';
            snapshot[key] = snapshot[key].map(item => item.id === id ? { ...item, ...patch } : item); revision += 1;
        },
        removeItem(type, id) {
            const key = type === 'music' ? 'music' : 'soundboard';
            snapshot[key] = snapshot[key].filter(item => item.id !== id); revision += 1;
        }
    } };
    vm.runInNewContext(source, { window, queueMicrotask: fn => microtasks.push(fn), setTimeout: fn => microtasks.push(fn) });
    return { D: window.EveAudioflixDuplicates, S: window.EveAudioflixState, snapshot,
        thaw() { while (microtasks.length) microtasks.shift()(); } };
}

function test(id, run) { current = id; run(); evidence.cases.push(id); }

try {
    for (const size of [200, 25000]) test(`linear-unique-${size}`, () => {
        let titleReads = 0;
        const music = Array.from({ length: size }, (_, i) => {
            let title = `Unique ${i}`;
            return { id: `unique-${i}`, get title() { titleReads += 1; return title; },
                set title(value) { title = value; }, url: `https://example.invalid/${i}.mp3` };
        });
        const f = fixture(music), started = performance.now(), queryCount = Math.min(size, 20);
        for (let i = 0; i < queryCount; i += 1) assert.equal(f.D.duplicateLevelFor('music', `unique-${i}`), '');
        assert.ok(titleReads <= size * 2, 'per-card duplicate badges must index once, not classify every library pair');
        assert.equal(f.D.findDuplicates('music').length, 0);
        // Badge construction reads N descriptors and each query describes its selected item once;
        // the independent full report then reads N descriptors, for an exact 2N + queryCount ceiling.
        const linearReadBound = (size * 2) + queryCount;
        assert.ok(titleReads <= linearReadBound, 'explicit report must classify only plausible bucket candidates');
        evidence.measurements.push({ size, queryCount, titleReads, linearReadBound, badgeAndReportMs: performance.now() - started });
        f.S.update({ music: [...music, { id: 'mirror', title: 'Mirror', url: 'https://example.invalid/5.mp3' }] });
        assert.equal(f.D.duplicateLevelFor('music', 'unique-5'), 'hard', 'same-turn mutation invalidates descriptor cache');
        assert.equal(f.D.dismissDuplicate('unique-5', 'mirror').ok, true);
        assert.equal(f.D.duplicateLevelFor('music', 'unique-5'), '', 'dismissal updates badges immediately');
        assert.equal(f.D.findDuplicates('music').length, 1, 'explicit report retains original keep-both pair semantics');
        f.S.removeItem('music', 'mirror');
        f.snapshot.music[6].title = 'Unique 7';
        f.thaw();
        assert.equal(f.D.duplicateLevelFor('music', 'unique-7'), 'soft', 'next microtask observes direct field mutation');
    });

    test('same-key-badge-without-full-pairs', () => {
        let reads = 0;
        const f = fixture(Array.from({ length: 25000 }, (_, i) => ({ id: `same-${i}`,
            get title() { reads += 1; return 'Same title'; }, url: `https://example.invalid/${i}.mp3` })));
        const started = performance.now();
        for (let i = 0; i < 20; i += 1) assert.equal(f.D.duplicateLevelFor('music', `same-${i}`), 'soft');
        assert.ok(reads <= 50000, 'badge queries must not materialize the all-same-title quadratic report');
        evidence.measurements.push({ size: 25000, sameTitle: true, titleReads: reads, badgesMs: performance.now() - started });
    });

    test('typed-case-sensitive-spotify-and-local-metadata', () => {
        const ID = 'A' + '1'.repeat(21), LOWER = 'a' + '1'.repeat(21);
        const track = (id, mediaId = ID) => ({ id, title: id, sourceProvider: 'spotify', sourceMediaType: 'track',
            sourceMediaId: mediaId, sourceId: mediaId, url: `https://open.spotify.com/track/${mediaId}` });
        const f = fixture([track('track'), track('case', LOWER), { id: 'episode', title: 'Podcast', sourceProvider: 'spotify',
            sourceMediaType: 'episode', sourceMediaId: ID, sourceId: ID, url: `https://open.spotify.com/episode/${ID}` }]);
        assert.equal(f.D.findDuplicates('music').length, 0, 'same ID across track/episode or base62 case cannot hard-collide');
        f.S.update({ music: [...f.snapshot.music, { ...track('track-copy'), url: `https://open.spotify.com/embed/track/${ID}?si=x` }] });
        assert.equal(f.D.duplicateLevelFor('music', 'track'), 'hard');
        assert.equal(f.D.duplicateLevelFor('music', 'case'), '');
        assert.equal(f.D.duplicateLevelFor('music', 'episode'), '');
        const localUri = 'spotify:local:Artist:Album:Different+files:240';
        const local = fixture(['a', 'b'].map(id => ({ id, title: 'Same metadata', sourceProvider: 'spotify',
            sourceMediaType: 'local', sourceIsLocal: true, sourceMediaId: localUri, sourceUri: localUri,
            sourceId: 'same-metadata', url: localUri })));
        assert.equal(local.D.findDuplicates('music')[0].level, 'soft', 'Spotify-local metadata/URI is not hard recording identity');
    });

    test('legacy-reasons-order-and-shared-path', () => {
        const f = fixture([
            { id: 'a', title: 'Song', url: 'https://example.invalid/one', duration: 300 },
            { id: 'b', title: 'Song', url: 'C:/Music/song.mp3', duration: 30 },
            { id: 'c', title: 'Other', url: 'https://example.invalid/one' },
            { id: 'd', title: 'Mirror', url: 'file:///c:/music/song.mp3' },
            { id: 'e', title: 'Provider', url: 'https://example.invalid/two', sourceProvider: 'instagram', sourceId: 'ABC' },
            { id: 'f', title: 'Provider2', url: 'https://example.invalid/three', sourceProvider: 'Instagram', sourceId: 'abc' }
        ]);
        const pairs = JSON.parse(JSON.stringify(f.D.findDuplicates('music')));
        assert.deepEqual(pairs.map(pair => [pair.items.map(item => item.id).join('|'), pair.level, pair.reason]), [
            ['a|c', 'hard', 'matching URL'], ['b|d', 'hard', 'matching local path'],
            ['e|f', 'hard', 'matching provider identity'], ['a|b', 'soft', 'matching title, different duration']
        ]);
        assert.deepEqual(Array.from(f.D.duplicatesFor('music', 'a'), item => item.id), ['c', 'b']);
    });

    test('spotify-uri-merge-is-not-a-fake-local-file', () => {
        const uri = `spotify:track:${'1'.repeat(22)}`;
        const f = fixture([{ id: 'keep', title: 'One', sourceProvider: 'spotify', url: uri },
            { id: 'drop', title: 'Two', sourceProvider: 'spotify', url: uri }]);
        assert.equal(f.D.mergeDuplicates('music', 'keep', ['drop']).ok, true);
        assert.equal(f.snapshot.music[0].localPath, undefined, 'remote Spotify URI cannot be manufactured into a filesystem path');
        assert.equal(f.snapshot.music[0].url, uri);
    });
    evidence.ok = true;
    console.log(`AUDIOFLIX_DUPLICATE_SCALE_SMOKE_OK ${evidence.cases.length}/${evidence.cases.length} linear25000=true typedIdentity=true`);
} catch (error) {
    evidence.error = { id: current, message: error.message, stack: error.stack };
    console.error(`AUDIOFLIX_DUPLICATE_SCALE_SMOKE_FAIL ${current}: ${error.message}\nArtifact: ${path.relative(ROOT, artifact)}`);
    process.exitCode = 1;
} finally {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
}
