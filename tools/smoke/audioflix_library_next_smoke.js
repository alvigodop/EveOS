const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const featurePath = path.join(root, 'js/modules/features/audioflix/audioflix.library.next.js');
const healthViewPath = path.join(root, 'js/modules/features/audioflix/audioflix.library.health-view.js');
const uiPath = path.join(root, 'js/modules/features/audioflix/audioflix.library.next.ui.js');
const sharedPath = path.join(root, 'js/modules/features/audioflix/audioflix.ui.shared.js');

for (const file of [featurePath, healthViewPath, uiPath, sharedPath]) {
    const source = fs.readFileSync(file, 'utf8');
    new vm.Script(source, { filename: file });
    assert.ok(source.length > 200, `${path.basename(file)} should not be empty`);
}

const healthStore = {};
const sandbox = {
    window: {
        EveAudioflixUrlProviders: {
            providerFor(url) {
                return /open\.spotify\.com\/track\//i.test(String(url || '')) ? 'spotify' : 'direct';
            }
        }
    },
    document: { readyState: 'loading', addEventListener() {}, createElement() { return {}; }, head: { appendChild() {} } },
    localStorage: {
        getItem(key) { return JSON.stringify(healthStore[key] || {}); },
        setItem(key, value) { healthStore[key] = JSON.parse(value); }
    },
    indexedDB: undefined,
    URL,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    MutationObserver: class {}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(healthViewPath, 'utf8'), sandbox, { filename: healthViewPath });
vm.runInContext(fs.readFileSync(featurePath, 'utf8'), sandbox, { filename: featurePath });
const api = sandbox.window.EveAudioflixLibraryNext;
const featureSource = fs.readFileSync(featurePath, 'utf8');
const uiSource = fs.readFileSync(uiPath, 'utf8');
assert.equal(api.ready, true);
assert.match(featureSource, /Queue progression has one owner/);
assert.doesNotMatch(featureSource, /status !== 'Ended'[\s\S]{0,900}querySelector\('\[data-af-action="play"\]'\)\?\.click/);
assert.match(featureSource, /provider === 'spotify'.*providerManaged: true/s,
    'Spotify URL health must bypass the generic resolver');
assert.ok(uiSource.includes('next.markerDescriptor(musicItem(id))'),
    'card health presentation delegates to the canonical provider descriptor');
assert.equal(api.earliest([
    { id: 'new', createdAt: 3000 },
    { id: 'old', createdAt: 1000 },
    { id: 'mid', createdAt: 2000 }
]).id, 'old');
assert.equal(api.numericRename('Song', new Set(['song', 'song (2)'])), 'Song (3)');

const spotify = { id: 'spotify-track', url: 'https://open.spotify.com/track/1WZGaNYzreZrvteuUEfp8X' };
api.setHealth(spotify.id, { status: 'down', source: '' });
assert.equal(api.effectiveHealth(spotify).status, 'provider',
    'stale resolver failures must not keep an official Spotify track marked URL Down');
api.setHealth(spotify.id, { status: 'down', source: 'spotify-provider-error' });
assert.equal(api.effectiveHealth(spotify).status, 'down',
    'a real Spotify provider playback error should remain visible as down');

const loadedScripts = [];
const lazyWindow = {};
const lazyContext = vm.createContext({ window: lazyWindow, document: {
    createElement: () => ({}), head: { appendChild: script => loadedScripts.push(script) }
} });
vm.runInContext(fs.readFileSync(sharedPath, 'utf8'), lazyContext, { filename: sharedPath });
assert.equal(loadedScripts.length, 1);
assert.ok(loadedScripts[0].src.includes('audioflix.library.health-view.js'), 'standalone UI loads presentation dependency first');
lazyWindow.EveAudioflixLibraryHealthView = { ready: true };
loadedScripts[0].onload();
assert.ok(loadedScripts[1].src.includes('audioflix.library.next.js'), 'library facade loads only after helper completion');
let libraryBoots = 0;
lazyWindow.EveAudioflixLibraryNext = { boot: () => libraryBoots++ };
loadedScripts[1].onload();
assert.equal(libraryBoots, 1);
assert.ok(loadedScripts[2].src.includes('audioflix.library.next.ui.js'), 'UI decorator follows the library facade');

console.log('audioflix library next smoke: PASS');
