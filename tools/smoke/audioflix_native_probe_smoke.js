const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'js/modules/features/audioflix/audioflix.native.js'),
    'utf8'
);

let fetchCount = 0;
let nativeState = { nativeBridgeBase: 'http://127.0.0.1:8765' };
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

async function fakeFetch() {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
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
vm.runInContext(source, context, { filename: 'audioflix.native.js' });

(async () => {
    const [outputs, inputs] = await Promise.all([
        windowObject.EveAudioflixNative.listSystemOutputs(),
        windowObject.EveAudioflixNative.listSystemInputs()
    ]);

    if (fetchCount !== 1) throw new Error(`expected one shared device probe, got ${fetchCount}`);
    if (outputs.devices.length !== 1 || outputs.devices[0].kind !== 'output') {
        throw new Error('output device filtering failed');
    }
    if (inputs.devices.length !== 1 || inputs.devices[0].kind !== 'input') {
        throw new Error('input device filtering failed');
    }

    await windowObject.EveAudioflixNative.listSystemOutputs();
    if (fetchCount !== 1) throw new Error('cached device query unexpectedly probed the bridge again');

    console.log('AUDIOFLIX_NATIVE_PROBE_SMOKE_OK');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
