#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourcePath = path.join(ROOT, 'js/modules/features/audioflix/audioflix.state.duplicates.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const detailsPath = path.join(path.dirname(sourcePath), 'audioflix.duplicates.details.js');
const libraryPath = path.join(path.dirname(sourcePath), 'audioflix.library.index.js');
const artifact = path.join(ROOT, 'data/runtime/smoke-results/audioflix-duplicate-details-scale.json');
const evidence = { ok: false, cases: [], measurements: {} };
let current = 'startup';

class SpyMap extends Map {
    static writes = 0;
    set(key, value) { SpyMap.writes += 1; return super.set(key, value); }
}

const copy = value => JSON.parse(JSON.stringify(value));
const shape = matches => copy(matches.map(({ item, level, reason, reasons }) => ({
    id: item.id, level, reason, reasons
})));

function fixture(music, { MapClass = Map, dismissed = [], withLibrary = false } = {}) {
    const queued = [], snapshot = { music, soundboard: [], dupDismissedPairs: [...dismissed] };
    let revision = 0;
    let libraryBuilds = 0;
    const window = {
        EveAudioflixDiagnostics: { increment(name) { if (name === 'index:builds') libraryBuilds += 1; } },
        EveAudioflixState: {
            ensure: () => snapshot,
            getRevision: () => revision,
            update(patch) {
                Object.assign(snapshot, patch);
                if (['music', 'soundboard'].some(key => Object.hasOwn(patch, key))) window.EveAudioflixLibraryIndex?.invalidate(snapshot);
                revision += 1;
                return snapshot;
            },
            updateItem(type, itemId, patch) {
                const item = snapshot[type === 'music' ? 'music' : 'soundboard'].find(row => row.id === itemId);
                Object.assign(item, patch);
                window.EveAudioflixLibraryIndex?.upsert(snapshot, type, item);
                revision += 1;
                return snapshot;
            }
        }
    };
    const context = vm.createContext({
        window, Map: MapClass, Set,
        queueMicrotask: fn => queued.push(fn),
        setTimeout: fn => queued.push(fn)
    });
    vm.runInContext(fs.readFileSync(detailsPath, 'utf8'), context, { filename: detailsPath });
    if (withLibrary) vm.runInContext(fs.readFileSync(libraryPath, 'utf8'), context, { filename: libraryPath });
    vm.runInContext(source, context, { filename: sourcePath });
    return { D: window.EveAudioflixDuplicates, S: window.EveAudioflixState, snapshot,
        library: window.EveAudioflixLibraryIndex, builds: () => libraryBuilds,
        flush() { while (queued.length) queued.shift()(); } };
}

function reference(rows, itemId) {
    const pairs = fixture(copy(rows)).D.findDuplicates('music');
    return copy(pairs.filter(pair => pair.items.some(item => item.id === itemId)).map(pair => {
        const item = pair.items.find(entry => entry.id !== itemId);
        return { id: item.id, level: pair.level, reason: pair.reason, reasons: pair.reasons };
    }));
}

function exactDetails(rows, itemId, options) {
    return shape(fixture(copy(rows), options).D.duplicateInfoFor('music', itemId));
}

function test(id, run) {
    current = id;
    run();
    evidence.cases.push(id);
}

try {
    test('unique-25000-avoids-full-index', () => {
        let titleReads = 0;
        const music = Array.from({ length: 25000 }, (_, index) => ({
            id: `unique-${index}`,
            get title() { titleReads += 1; return `Unique ${index}`; },
            url: `https://example.invalid/unique/${index}`
        }));
        const f = fixture(music, { MapClass: SpyMap });
        SpyMap.writes = 0;
        const matches = f.D.duplicateInfoFor('music', 'unique-12500');
        evidence.measurements.unique25000 = { titleReads, mapWrites: SpyMap.writes };
        assert.equal(matches.length, 0);
        assert.equal(SpyMap.writes, 0, 'ordinary details lookup built the full-library Map index');
        assert.ok(titleReads >= 25000 && titleReads <= 25001,
            `ordinary details lookup must scan descriptors once (title reads: ${titleReads})`);
    });

    test('indexed-25000-builds-once-and-warm-details-stay-bounded', () => {
        let titleReads = 0;
        const size = 25000;
        const music = Array.from({ length: size }, (_, index) => ({
            id: `indexed-${index}`,
            get title() { titleReads += 1; return `Indexed ${index}`; },
            url: `https://example.invalid/indexed/${index}`
        }));
        const f = fixture(music, { MapClass: SpyMap, withLibrary: true });
        SpyMap.writes = 0;
        assert.equal(f.D.duplicateInfoFor('music', 'indexed-12500').length, 0);
        const cold = { titleReads, mapWrites: SpyMap.writes, builds: f.builds() };
        assert.equal(cold.builds, 1, 'Cold details must build the canonical library index once');
        assert.ok(cold.titleReads >= size * 2 && cold.titleReads <= size * 2 + 3,
            'Cold details must stay within one library and one compact duplicate descriptor pass');
        assert.ok(cold.mapWrites > 0 && cold.mapWrites <= size * 5 + 50, 'Cold index writes must stay linear');
        titleReads = 0;
        SpyMap.writes = 0;
        const lookups = 10;
        for (let index = 0; index < lookups; index += 1) {
            f.flush();
            f.S.update({ durabilityRevision: index + 1 });
            assert.equal(f.D.duplicateInfoFor('music', `indexed-${12500 + index}`).length, 0);
        }
        const warm = { titleReads, mapWrites: SpyMap.writes, builds: f.builds(), lookups };
        evidence.measurements.indexed25000 = { cold, warm };
        assert.equal(warm.builds, 1, 'Global revisions and later turns must reuse the canonical library index');
        assert.equal(warm.mapWrites, 0, 'Warm detail reads must not rebuild any Map projection');
        assert.ok(warm.titleReads >= lookups && warm.titleReads <= lookups * 3,
            'Each warm detail read must describe at most three records, not scan the 25k library');
    });

    test('exact-reasons-order-and-reference-parity', () => {
        const rows = [
            { id: 'base-before', title: 'Base Before', url: 'D:/Archive/shared.mp3' },
            { id: 'title-before', title: 'Selected Song', url: 'https://example.invalid/title-before', duration: 90 },
            { id: 'selected', title: 'Selected Song', url: 'https://example.invalid/shared',
                localPath: 'C:/Music/shared.mp3', duration: 120, sourceProvider: 'instagram', sourceId: 'ABC' },
            { id: 'url-after', title: 'URL After', url: 'https://example.invalid/shared' },
            { id: 'source-after', title: 'Source After', url: 'https://example.invalid/source',
                sourceProvider: 'Instagram', sourceId: 'abc' },
            { id: 'path-after', title: 'Path After', url: 'https://example.invalid/path',
                localPath: 'c:\\music\\shared.mp3' },
            { id: 'base-after', title: 'Base After', url: 'E:/Else/shared.mp3' },
            { id: 'title-after', title: 'Selected Song', url: 'https://example.invalid/title-after', duration: 120 }
        ];
        const expected = [
            ['url-after', 'hard', 'matching URL'],
            ['source-after', 'hard', 'matching provider identity'],
            ['path-after', 'hard', 'matching local path'],
            ['base-before', 'soft', 'same file name'],
            ['title-before', 'soft', 'matching title, different duration'],
            ['base-after', 'soft', 'same file name'],
            ['title-after', 'soft', 'matching title']
        ].map(([id, level, reason]) => ({ id, level, reason, reasons: [reason] }));
        const details = exactDetails(rows, 'selected');
        assert.deepEqual(details, expected);
        assert.deepEqual(details, reference(rows, 'selected'),
            'unique-ID detail results diverged from the independent full report');
        assert.deepEqual(exactDetails(rows, 'selected', { withLibrary: true }), expected,
            'Indexed details must preserve the same full-report reasons and ordering');
    });

    test('typed-spotify-and-local-identity', () => {
        const ID = 'AbCdEfGhIjKlMnOpQrStUv', lower = ID.toLowerCase();
        const spotify = (id, type, mediaId, url) => ({ id, title: id, sourceProvider: 'spotify',
            sourceMediaType: type, sourceMediaId: mediaId, sourceId: mediaId,
            spotifyTrackId: type === 'track' ? mediaId : '', sourceUri: `spotify:${type}:${mediaId}`, url });
        const localUri = 'spotify:local:Artist:Album:Same+Metadata:240';
        const rows = [
            spotify('track', 'track', ID, `https://open.spotify.com/track/${ID}`),
            spotify('track-copy', 'track', ID, `https://open.spotify.com/embed/track/${ID}?si=copy`),
            spotify('episode', 'episode', ID, `https://open.spotify.com/episode/${ID}`),
            spotify('case-variant', 'track', lower, `https://open.spotify.com/track/${lower}`),
            { id: 'local-one', title: 'Local Metadata', sourceProvider: 'spotify',
                sourceMediaType: 'local', sourceIsLocal: true, sourceId: 'same', sourceUri: localUri, url: localUri },
            { id: 'local-two', title: 'Local Metadata', sourceProvider: 'spotify',
                sourceMediaType: 'local', sourceIsLocal: true, sourceId: 'same', sourceUri: localUri, url: localUri }
        ];
        const track = exactDetails(rows, 'track');
        assert.deepEqual(track, [{ id: 'track-copy', level: 'hard',
            reason: 'matching URL + matching provider identity',
            reasons: ['matching URL', 'matching provider identity'] }]);
        assert.deepEqual(track, reference(rows, 'track'));
        assert.deepEqual(exactDetails(rows, 'episode'), []);
        assert.deepEqual(exactDetails(rows, 'case-variant'), []);
        const local = exactDetails(rows, 'local-one');
        assert.deepEqual(local, [{ id: 'local-two', level: 'soft',
            reason: 'matching title', reasons: ['matching title'] }]);
        assert.deepEqual(local, reference(rows, 'local-one'));
        for (const itemId of ['track', 'episode', 'case-variant', 'local-one']) {
            assert.deepEqual(exactDetails(rows, itemId, { withLibrary: true }), exactDetails(rows, itemId),
                'Indexed Spotify details must preserve typed, case-sensitive and local metadata semantics');
        }
    });

    test('ambiguous-id-retains-indexed-fallback', () => {
        const rows = [
            { id: 'same', title: 'Alpha', url: 'https://example.invalid/a' },
            { id: 'same', title: 'Beta', url: 'https://example.invalid/b' },
            { id: 'a-match', title: 'Else', url: 'https://example.invalid/a' },
            { id: 'b-match', title: 'Beta', url: 'https://example.invalid/other' }
        ];
        const f = fixture(rows, { MapClass: SpyMap });
        SpyMap.writes = 0;
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'same')), [
            { id: 'a-match', level: 'hard', reason: 'matching URL', reasons: ['matching URL'] },
            { id: 'b-match', level: 'soft', reason: 'matching title', reasons: ['matching title'] }
        ]);
        assert.ok(SpyMap.writes > 0, 'ambiguous same-ID rows no longer use the indexed fallback');
    });

    test('same-array-edits-add-remove-stay-fresh', () => {
        const target = { id: 'target', title: 'Alpha', url: 'https://example.invalid/target',
            localPath: 'C:/Folder/a.mp3' };
        const peer = { id: 'peer', title: 'Beta', url: 'https://example.invalid/peer',
            localPath: 'C:/Folder/b.mp3' };
        const f = fixture([target, peer]);
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
        peer.title = 'Alpha';
        assert.equal(f.D.duplicateInfoFor('music', 'target')[0]?.reason, 'matching title');
        peer.title = 'Beta'; peer.localPath = 'c:\\folder\\a.mp3';
        assert.equal(f.D.duplicateInfoFor('music', 'target')[0]?.reason, 'matching local path');
        peer.localPath = 'C:/Folder/b.mp3';
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
        f.snapshot.music.push({ id: 'added', title: 'Added', url: target.url });
        assert.equal(f.D.duplicateInfoFor('music', 'target')[0]?.item.id, 'added');
        f.snapshot.music.pop();
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
    });

    test('dismissal-is-fresh-and-full-report-unchanged', () => {
        const f = fixture([
            { id: 'target', title: 'Target', url: 'https://example.invalid/shared' },
            { id: 'other', title: 'Other', url: 'https://example.invalid/shared' }
        ]);
        assert.equal(f.D.duplicateInfoFor('music', 'target').length, 1);
        assert.equal(f.D.dismissDuplicate('target', 'other').ok, true);
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
        assert.equal(f.D.findDuplicates('music').length, 1,
            'dismissal must not change full duplicate report semantics');
    });

    test('indexed-canonical-same-array-edits-and-dismissal-stay-fresh', () => {
        const target = { id: 'target', title: 'Alpha', url: 'https://example.invalid/target', localPath: 'C:/Folder/a.mp3' };
        const peer = { id: 'peer', title: 'Beta', url: 'https://example.invalid/peer', localPath: 'C:/Folder/b.mp3' };
        const f = fixture([target, peer], { withLibrary: true });
        const originalArray = f.snapshot.music;
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
        f.S.updateItem('music', 'peer', { title: 'Alpha' });
        assert.equal(f.snapshot.music, originalArray, 'Canonical edits must retain the same array');
        assert.equal(f.snapshot.music[1], peer, 'Canonical edits must retain the same item object');
        assert.equal(f.D.duplicateInfoFor('music', 'target')[0]?.reason, 'matching title');
        f.S.updateItem('music', 'peer', { title: 'Beta', localPath: 'c:\\folder\\a.mp3' });
        assert.equal(f.D.duplicateInfoFor('music', 'target')[0]?.reason, 'matching local path');
        f.S.updateItem('music', 'peer', { localPath: 'C:/Folder/b.mp3' });
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
        const added = { id: 'added', title: 'Added', url: target.url };
        f.snapshot.music.push(added);
        f.library.upsert(f.snapshot, 'music', added);
        assert.equal(f.D.duplicateInfoFor('music', 'target')[0]?.item.id, 'added');
        assert.equal(f.D.dismissDuplicate('target', 'added').ok, true);
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
        assert.equal(f.D.findDuplicates('music').length, 1, 'Indexed keep-both must preserve full report semantics');
        f.snapshot.music.pop();
        f.library.remove(f.snapshot, 'music', added.id);
        assert.deepEqual(shape(f.D.duplicateInfoFor('music', 'target')), []);
        assert.equal(f.builds(), 1, 'Canonical content edits must update the existing library index');
    });

    evidence.ok = true;
    console.log(`AUDIOFLIX_DUPLICATE_DETAILS_SCALE_SMOKE_OK PASS ${evidence.cases.length}/${evidence.cases.length} legacyMapWrites=0 indexedWarmReads=${evidence.measurements.indexed25000.warm.titleReads}`);
} catch (error) {
    evidence.error = { id: current, message: error.message, stack: error.stack };
    console.error(`AUDIOFLIX_DUPLICATE_DETAILS_SCALE_SMOKE_FAIL ${current}: ${error.message}\nArtifact: ${path.relative(ROOT, artifact)}`);
    process.exitCode = 1;
} finally {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
}
