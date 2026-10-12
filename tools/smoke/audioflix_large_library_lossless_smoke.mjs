#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.state.schema.js'), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context, { filename: 'audioflix.state.schema.js' });
const schema = context.window.EveAudioflixStateSchema;
assert.equal(schema?.ready, true, 'state schema should load');
const cleaners = schema.create({ text: schema.text, normalizeVolume: schema.normalizeVolume, id: schema.id });

function fixture(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: `music_${String(index).padStart(6, '0')}`,
        type: 'music',
        title: `Synthetic Track ${index}`,
        url: `https://example.invalid/audio/${index}.mp3`,
        artist: `Artist ${index % 97}`,
        album: `Album ${index % 211}`,
        folder: `Folder ${index % 41}`,
        sourceProvider: index % 3 === 0 ? 'spotify' : 'synthetic',
        playlistId: `playlist_${index % 13}`,
        sourceId: `source_${index}`,
        createdAt: 1700000000000 + index
    }));
}

for (const size of [10001, 25000]) {
    const input = fixture(size);
    // Pass the historical 10k cap deliberately. Music normalization must retain every item.
    const output = cleaners.boundedItems(input, 'music', 10000);
    assert.equal(output.length, size, `music normalization must not truncate ${size} items`);
    assert.equal(output[0].id, input[0].id, 'first ID must survive');
    assert.equal(output.at(-1).id, input.at(-1).id, 'last ID must survive');
    assert.equal(output[1234].folder, input[1234].folder, 'folder metadata must survive');
    assert.equal(output[4321].playlistId, input[4321].playlistId, 'playlist identity must survive');
    assert.equal(output[4321].sourceId, input[4321].sourceId, 'source identity must survive');
    const roundTrip = JSON.parse(JSON.stringify(output));
    assert.equal(roundTrip.length, size, 'JSON round-trip must remain lossless');
    assert.deepEqual(roundTrip.map((item) => item.id), output.map((item) => item.id), 'ID order must remain stable');
}

// Soundboard still has an intentional bounded retention policy.
const sounds = Array.from({ length: 5 }, (_, index) => ({ id: `sound_${index}`, url: `file:///sound/${index}.wav` }));
assert.equal(cleaners.boundedItems(sounds, 'sound', 3).length, 3, 'soundboard bound should remain intact');

console.log('AUDIOFLIX_LARGE_LIBRARY_LOSSLESS_SMOKE_OK sizes=10001,25000');
