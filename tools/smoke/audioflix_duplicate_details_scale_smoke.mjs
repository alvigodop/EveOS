#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourcePath = path.join(ROOT, 'js/modules/features/audioflix/audioflix.state.duplicates.js');
const source = fs.readFileSync(sourcePath, 'utf8');
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

function fixture(music, { MapClass = Map, dismissed = [] } = {}) {
    const queued = [], snapshot = { music, soundboard: [], dupDismissedPairs: [...dismissed] };
    let revision = 0;
    const window = {
        EveAudioflixState: {
            ensure: () => snapshot,
            getRevision: () => revision,
            update(patch) { Object.assign(snapshot, patch); revision += 1; return snapshot; }
        }
    };
    vm.runInNewContext(source, {
        window, Map: MapClass, Set,
        queueMicrotask: fn => queued.push(fn),
        setTimeout: fn => queued.push(fn)
    }, { filename: sourcePath });
    return { D: window.EveAudioflixDuplicates, snapshot };
}

function reference(rows, itemId) {
    const pairs = fixture(copy(rows)).D.findDuplicates('music');
    return copy(pairs.filter(pair => pair.items.some(item => item.id === itemId)).map(pair => {
        const item = pair.items.find(entry => entry.id !== itemId);
        return { id: item.id, level: pair.level, reason: pair.reason, reasons: pair.reasons };
    }));
}

function exactDetails(rows, itemId) {
    return shape(fixture(copy(rows)).D.duplicateInfoFor('music', itemId));
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

    evidence.ok = true;
    console.log(`AUDIOFLIX_DUPLICATE_DETAILS_SCALE_SMOKE_OK PASS ${evidence.cases.length}/${evidence.cases.length} unique25000MapWrites=0`);
} catch (error) {
    evidence.error = { id: current, message: error.message, stack: error.stack };
    console.error(`AUDIOFLIX_DUPLICATE_DETAILS_SCALE_SMOKE_FAIL ${current}: ${error.message}\nArtifact: ${path.relative(ROOT, artifact)}`);
    process.exitCode = 1;
} finally {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, JSON.stringify(evidence, null, 2));
}
