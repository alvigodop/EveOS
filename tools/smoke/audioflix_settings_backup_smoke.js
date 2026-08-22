const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'js', 'modules', 'modals', 'modal-settings.audioflix-backup.js');
const assert = (condition, message) => { if (!condition) throw new Error(`ASSERT FAILED: ${message}`); };

const state = {
    soundboard: [{ id: 'sound-live', title: 'Airhorn', url: 'https://media.example/airhorn', classifiers: ['Live'] }],
    music: [{ id: 'music-live', title: 'Night Drive', url: 'https://media.example/night', classifiers: ['Current'] }],
    soundboardGroups: ['Current Sounds'], soundGroupMap: { 'sound-live': ['Current Sounds'] },
    musicGroups: ['Current Music'], musicGroupMap: { 'music-live': ['Current Music'] },
    musicPlaylists: [{ id: 'playlist-live', url: 'https://playlist.example/night', title: 'Night' }],
    scopeBindings: []
};
const statusNode = { textContent: '', dataset: {} };
let flushes = 0;
const window = {
    EveAudioflixState: {
        getSnapshot: () => JSON.parse(JSON.stringify(state)),
        ensure: () => state,
        replaceState(patch) {
            Object.keys(state).forEach((key) => delete state[key]);
            Object.assign(state, JSON.parse(JSON.stringify(patch)));
            return state;
        },
        flush: () => { flushes += 1; }
    },
    setTimeout,
    showToast() {}
};
const context = vm.createContext({
    window, console, Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, URL,
    Blob, setTimeout, clearTimeout,
    document: { getElementById: () => statusNode }
});
vm.runInContext(fs.readFileSync(SOURCE, 'utf8'), context, { filename: SOURCE });

function inputFor(tab, data) {
    const payload = JSON.stringify({ format: 'eveos-audioflix-tab', version: 1, tab, data });
    return { value: 'selected', files: [{ size: Buffer.byteLength(payload), text: async () => payload }] };
}

(async function main() {
    const soundInput = inputFor('soundboard', {
        soundboard: [
            { id: 'sound-old', title: 'Airhorn restored', url: 'https://media.example/airhorn', classifiers: ['Imported'] },
            { id: 'sound-new', title: 'Bell', url: 'C:/sounds/bell.wav' }
        ],
        soundboardGroups: ['Imported Sounds'],
        soundGroupMap: { 'sound-old': ['Imported Sounds'], 'sound-new': ['Imported Sounds'] },
        portVolumes: { 'sound-old': 0.4 },
        portHotkeys: { 'sound-old': 'ctrl+1' },
        scopeBindings: [{ audioType: 'sound', audioId: 'sound-old', scopeType: 'workspace', workspaceId: 'main' }]
    });
    await window.importAudioflixTabBackup(soundInput, 'soundboard');
    assert(state.soundboard.length === 2, 'sound import merges rather than replacing existing clips');
    assert(state.music.length === 1 && state.music[0].id === 'music-live', 'sound import cannot replace the music library');
    assert(state.soundboard.find((item) => item.id === 'sound-live').classifiers.includes('Imported'), 'same-URL sound merges into its retained ID');
    assert(state.soundGroupMap['sound-live'].includes('Imported Sounds'), 'sound group membership remaps to the retained ID');
    assert(state.portVolumes['sound-live'] === 0.4 && state.portHotkeys['sound-live'] === 'ctrl+1', 'per-sound settings remap to the retained ID');
    assert(state.scopeBindings.some((entry) => entry.audioId === 'sound-live'), 'Nexus scope binding remaps to the retained sound');
    assert(soundInput.value === '', 'sound file picker resets after import');

    const musicInput = inputFor('music', {
        music: [{
            id: 'music-old', title: 'Night Drive restored', url: 'https://media.example/night',
            playlistId: 'playlist-old', classifiers: ['Imported'], duration: 180
        }],
        musicGroups: ['Imported Music'],
        musicGroupMap: { 'music-old': ['Imported Music'] },
        musicPlaylists: [{ id: 'playlist-old', url: 'https://playlist.example/night', title: 'Imported Night' }],
        dupDismissedPairs: ['music-old|other'],
        scopeBindings: [{ audioType: 'music', audioId: 'music-old', scopeType: 'card', workspaceId: 'main', categoryName: 'Audio' }]
    });
    await window.importAudioflixTabBackup(musicInput, 'music');
    assert(state.soundboard.length === 2, 'music import cannot replace the soundboard');
    assert(state.music.length === 1 && state.music[0].id === 'music-live', 'same-URL music merges into its retained ID');
    assert(state.music[0].playlistId === 'playlist-live', 'playlist references remap to the retained playlist');
    assert(state.musicGroupMap['music-live'].includes('Imported Music'), 'music group membership remaps to the retained ID');
    assert(state.dupDismissedPairs.includes('music-live|other'), 'duplicate dismissals remap to the retained ID');
    assert(state.scopeBindings.some((entry) => entry.audioType === 'music' && entry.audioId === 'music-live'), 'Nexus scope binding remaps to the retained track');
    assert(flushes === 2, 'both imports force an immediate durable save');
    assert(statusNode.dataset.status === 'success', 'settings panel reports a successful merge');

    console.log('AUDIOFLIX_SETTINGS_BACKUP_SMOKE_OK');
})().catch((error) => { console.error(error); process.exit(1); });
