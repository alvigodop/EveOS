#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.library.next.js'), 'utf8');

const storage = new Map();
const windowListeners = new Map();
const documentListeners = new Map();
const item = {
    id: 'spotify-track-1',
    type: 'music',
    title: 'Provider Contract',
    url: 'https://open.spotify.com/track/1234567890123456789012',
    sourceProvider: 'spotify',
    sourceMediaType: 'track',
    sourceMediaId: '1234567890123456789012',
    sourceUri: 'spotify:track:1234567890123456789012',
    sourcePlayable: true,
    sourceAvailability: 'playable'
};

const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
};
const document = {
    readyState: 'loading',
    body: {},
    head: { appendChild: () => {} },
    addEventListener: (name, fn) => documentListeners.set(name, fn),
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [] })
};
class MutationObserver {
    observe() {}
    disconnect() {}
}

const context = vm.createContext({
    console,
    URL,
    Date,
    Promise,
    Blob,
    localStorage,
    location: { hostname: 'localhost', href: 'http://localhost/' },
    document,
    MutationObserver,
    fetch: async () => { throw new Error('network must not be used by provider-health semantics smoke'); },
    setInterval: () => 1,
    setTimeout,
    clearInterval: () => {},
    window: {
        EveAudioflixState: { ensure: () => ({ music: [item], musicGroupMap: {}, musicPlaylists: [] }) },
        EveAudioflixAudio: {
            playItem: async () => true,
            getPlaybackState: () => ({ item: null })
        },
        EveAudioflixUrlProviders: { providerFor: () => 'spotify' },
        EveAudioflixDiagnostics: { record: () => {} },
        addEventListener: (name, fn) => windowListeners.set(name, fn),
        dispatchEvent: () => true
    }
});
context.window.window = context.window;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/modules/features/audioflix/audioflix.library.health-view.js'), 'utf8'), context);
vm.runInContext(source, context, { filename: 'audioflix.library.next.js' });
const lib = context.window.EveAudioflixLibraryNext;
assert.equal(lib?.ready, true, 'library-next health module should load');

assert.equal(lib.providerFor(item), 'spotify', 'provider identity is retained');
assert.equal(lib.providerManagedHealth(item)?.status, 'provider', 'provider ownership starts neutral, not healthy');
assert.equal(lib.prefs(item.id).showProviderHealthOnCard, false, 'provider health marker is hidden by default');
assert.equal(lib.markerDescriptor(item), null, 'hidden provider health must not render on the song card');

lib.setPrefs(item.id, { showProviderHealthOnCard: true });
let descriptor = lib.markerDescriptor(item);
assert.equal(descriptor?.className.includes('is-provider'), true, 'visible unverified provider uses a neutral class');
assert.equal(descriptor?.className.includes('is-healthy'), false, 'provider identity alone must never produce a green healthy marker');
assert.match(descriptor?.text || '', /Unverified/, 'neutral provider marker explicitly says it is unverified');

lib.boot();
const playbackListener = windowListeners.get('eve:audioflix-playback');
assert.equal(typeof playbackListener, 'function', 'provider health should listen to AudioFlix playback evidence');
playbackListener({ detail: { item, status: 'Playing' } });
assert.equal(lib.effectiveHealth(item)?.status, 'healthy', 'successful provider playback is evidence of health');
descriptor = lib.markerDescriptor(item);
assert.equal(descriptor?.className.includes('is-healthy'), true, 'verified provider playback can render green');
assert.match(descriptor?.text || '', /Healthy/, 'verified marker says healthy');

playbackListener({ detail: { item, status: 'Playback failed', error: true } });
assert.equal(lib.effectiveHealth(item)?.status, 'error', 'provider playback failure overrides prior healthy evidence');
descriptor = lib.markerDescriptor(item);
assert.equal(descriptor?.className.includes('is-error'), true, 'failed provider playback renders an error state, not green');

lib.setPrefs(item.id, { showProviderHealthOnCard: false });
assert.equal(lib.markerDescriptor(item), null, 'per-song preference hides even a known provider status');

lib.setPrefs(item.id, { showProviderHealthOnCard: true });
for (const status of ['live', 'healthy', 'down', 'error']) {
    lib.setHealth(item.id, { status, source: 'generic-resolver' });
    const storedBefore = localStorage.getItem('eveAudioflixUrlHealthV1');
    assert.equal(lib.effectiveHealth(item).status, 'provider', 'generic cached status is not Spotify playback evidence');
    assert.equal(lib.markerDescriptor(item).className.includes('is-provider'), true);
    assert.equal(localStorage.getItem('eveAudioflixUrlHealthV1'), storedBefore, 'derived health never rewrites durable cache');
}
lib.setHealth(item.id, { status: 'healthy', source: 'spotify-import' });
assert.equal(lib.effectiveHealth(item).status, 'provider', 'successful metadata import alone cannot award health');
lib.setHealth(item.id, { status: 'checking', source: 'spotify-playback-start' });
assert.equal(lib.markerDescriptor(item).className.includes('is-checking'), true);
lib.setHealth(item.id, { status: 'down', source: 'spotify-provider-error' });
assert.equal(lib.effectiveHealth(item).status, 'down', 'provider-owned failures remain visible');
storage.set('eveAudioflixUrlHealthV1', JSON.stringify({ [item.id]: {
    status: 'healthy', source: 'spotify-playback', checkedAt: Date.now() - 7 * 60 * 60 * 1000
} }));
assert.equal(lib.effectiveHealth(item).status, 'stale', 'verified playback expires through the existing TTL');
assert.equal(lib.markerDescriptor(item).className.includes('is-stale'), true);
const episode = { ...item, id: 'episode-health', sourceMediaType: 'episode',
    url: 'https://open.spotify.com/episode/1234567890123456789012' };
assert.equal(lib.effectiveHealth(episode).status, 'provider', 'episodes retain neutral provider presentation');
const direct = { id: 'direct-health', sourceProvider: 'direct', url: 'https://example.com/audio.mp3' };
lib.setHealth(direct.id, { status: 'live', source: 'generic-resolver' });
lib.setPrefs(direct.id, { showLive: true });
assert.equal(lib.effectiveHealth(direct).status, 'live', 'non-Spotify cache semantics remain unchanged');
assert.equal(lib.markerDescriptor(direct).className.includes('is-live'), true);

console.log('AUDIOFLIX_PROVIDER_HEALTH_SEMANTICS_SMOKE_OK');
