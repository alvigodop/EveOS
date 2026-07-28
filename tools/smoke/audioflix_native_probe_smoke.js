const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MODULE_DIR = path.resolve(__dirname, '..', '..', 'js/modules/features/audioflix');
const readModule = (file) => fs.readFileSync(path.join(MODULE_DIR, file), 'utf8');
// audioflix.native.js delegates its localize/probe half to a sibling factory, so that has to be
// in the context before it loads.
const localizeSource = readModule('audioflix.native.localize.js');
const spotifySource = readModule('audioflix.native.spotify.js');
const source = readModule('audioflix.native.js');

let fetchCount = 0;
let nativeState = { nativeBridgeBase: '' };
const windowObject = {
    location: { protocol: 'file:', origin: 'null' },
    EveAudioflixNative: {},
    EveAudioflixState: {
        ensure: () => nativeState,
        update: (patch) => {
            nativeState = Object.assign({}, nativeState, patch);
            return nativeState;
        }
    }
};

async function fakeFetch(url) {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (String(url).startsWith('http://127.0.0.1:8765')) {
        return { ok: false, status: 404 };
    }
    if (String(url).includes('/api/audioflix/spotify-playlist')) {
        return {
            ok: true,
            status: 200,
            json: async () => ({ ok: false, reason: 'Spotify playlist is private.' })
        };
    }
    return {
        ok: true,
        status: 200,
        json: async () => ({
            ok: true,
            devices: [
                { id: 'out-1', kind: 'output', name: 'CABLE Input' },
                { id: 'in-1', kind: 'input', name: 'CABLE Output' }
            ]
        })
    };
}

const context = vm.createContext({
    window: windowObject,
    location: windowObject.location,
    fetch: fakeFetch,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    Date,
    JSON
});
vm.runInContext(localizeSource, context, { filename: 'audioflix.native.localize.js' });
vm.runInContext(spotifySource, context, { filename: 'audioflix.native.spotify.js' });
vm.runInContext(source, context, { filename: 'audioflix.native.js' });

(async () => {
    const [outputs, inputs] = await Promise.all([
        windowObject.EveAudioflixNative.listSystemOutputs(),
        windowObject.EveAudioflixNative.listSystemInputs()
    ]);

    if (fetchCount !== 2) throw new Error(`expected 8765 then 8766 through one shared probe, got ${fetchCount} requests`);
    if (outputs.devices.length !== 1 || outputs.devices[0].kind !== 'output') {
        throw new Error('output device filtering failed');
    }
    if (inputs.devices.length !== 1 || inputs.devices[0].kind !== 'input') {
        throw new Error('input device filtering failed');
    }
    if (nativeState.nativeBridgeBase !== 'http://127.0.0.1:8766') {
        throw new Error(`file-mode bridge did not retain the live fallback port: ${nativeState.nativeBridgeBase}`);
    }

    await windowObject.EveAudioflixNative.listSystemOutputs();
    if (fetchCount !== 2) throw new Error('cached device query unexpectedly probed the bridge again');

    const unavailable = await windowObject.EveAudioflixNative.listSpotifyPlaylist('https://open.spotify.com/playlist/private');
    if (unavailable.ok !== false || unavailable.reason !== 'Spotify playlist is private.') {
        throw new Error('application-level bridge failure was discarded instead of reaching the caller');
    }
    if (fetchCount !== 3) throw new Error('application-level bridge failure incorrectly scanned additional ports');

    console.log('AUDIOFLIX_NATIVE_PROBE_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
