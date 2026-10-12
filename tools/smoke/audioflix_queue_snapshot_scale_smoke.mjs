// Execute the actual UI snapshot expression with its real queue bridge, without a DOM/player.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = name => fs.readFileSync(path.join(root, 'js/modules/features/audioflix', name), 'utf8');
const ui = source('audioflix.ui.js');
const start = ui.indexOf('ns.queueConnection = '), end = ui.indexOf('    Object.assign(ns,', start);
assert.ok(start >= 0 && end > start, 'Actual public queue connection must remain discoverable');

let idReads = 0, lookups = 0;
const count = 25000;
const music = Array.from({ length: count }, (_, i) => ({
    get id() { idReads += 1; return `snapshot-${i}`; }, title: `Track ${i}`
}));
const state = () => ({ music });
const activeMusicQueue = { groupName: 'Scale', currentIndex: 0,
    isPlaying: true, shuffle: false, loop: false, items: music.map(track => track.id) };
const context = vm.createContext({ window: { EveAudioflixAudio: { setQueueBridge() {} } },
    document: {}, console, ns: {}, state, activeMusicQueue, queueRunId: 4, repeatCurrent: false });
vm.runInContext(source('audioflix.queue.completion.js'), context);
const bridge = context.window.EveAudioflixQueueCompletion.createBridge({ state,
    queue: () => activeMusicQueue, playIndex: async () => true });
context.queueRuntime = bridge;
context.queueTrackAt = index => { lookups += 1; return bridge.trackAt(index); };
vm.runInContext(ui.slice(start, end), context);
idReads = 0;
const snapshot = context.ns.queueConnection.snapshot();
assert.equal(snapshot.entries.length, count);
assert.equal(snapshot.entries.at(-1).title, `Track ${count - 1}`);
assert.ok(idReads <= count * 3, `Snapshot must be linear, not queue × library: ${idReads} ID reads`);
assert.equal(lookups, 0, 'Snapshot must not perform a library search for each queue entry');
activeMusicQueue.items = [activeMusicQueue.items.at(-1), activeMusicQueue.items[0], 'missing'];
activeMusicQueue.currentIndex = 1;
const reordered = context.ns.queueConnection.snapshot();
assert.equal(reordered.entries[0].title, `Track ${count - 1}`);
assert.equal(reordered.entries[1].title, 'Track 0');
assert.equal(reordered.entries[2].title, 'Untitled');
assert.equal(reordered.currentIndex, 1);
assert.equal(reordered.playbackRunId, 4);
console.log('AUDIOFLIX_QUEUE_SNAPSHOT_SCALE_SMOKE_OK linear=true reorder=true missing=true');
