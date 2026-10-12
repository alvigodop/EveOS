#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.state.schema.js'), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context, { filename: 'audioflix.state.schema.js' });
const schema = context.window.EveAudioflixStateSchema;
const cleaners = schema.create({ text: schema.text, normalizeVolume: schema.normalizeVolume, id: schema.id });

function fixture(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: `bench_music_${index}`,
        title: `Benchmark Track ${index}`,
        url: `https://example.invalid/${index}.mp3`,
        artist: `Artist ${index % 100}`,
        album: `Album ${index % 250}`,
        folder: `Folder ${index % 50}`,
        playlistId: `playlist_${index % 20}`,
        sourceId: `source_${index}`,
        createdAt: 1700000000000 + index
    }));
}

function timed(fn) {
    const started = performance.now();
    const value = fn();
    return { value, ms: Number((performance.now() - started).toFixed(3)) };
}

const results = [];
for (const size of [10000, 25000]) {
    const raw = fixture(size);
    const normalized = timed(() => cleaners.boundedItems(raw, 'music', 10000));
    assert.equal(normalized.value.length, size, 'benchmark refuses to measure a truncated library');

    const serialized = timed(() => JSON.stringify(normalized.value));
    const indexed = timed(() => new Map(normalized.value.map((item) => [item.id, item])));
    const query = 'benchmark track 249';
    const searched = timed(() => normalized.value.filter((item) => `${item.title} ${item.artist} ${item.album} ${item.folder}`.toLowerCase().includes(query)));

    results.push({
        size,
        normalizeMs: normalized.ms,
        serializeMs: serialized.ms,
        serializedBytes: Buffer.byteLength(serialized.value),
        indexBuildMs: indexed.ms,
        indexSize: indexed.value.size,
        searchMs: searched.ms,
        searchMatches: searched.value.length
    });
}

console.log(JSON.stringify({ benchmark: 'audioflix-scale-v1', gating: false, results }, null, 2));
console.log('AUDIOFLIX_SCALE_BENCHMARK_OK');
