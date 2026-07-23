// Music-route sink resolution smoke.
//
// Music plays as one continuous browser stream, so the output control layer routes it by
// resolving a BROWSER sink: the explicitly picked browser output when set, otherwise the
// browser device whose name matches the armed Native Bridge output (host-API suffix and MME
// truncation ignored). Drives the real EveAudioflixAudioOutput controller with mocked
// device enumeration and asserts every routing decision, including the guards against
// matching "Default - ..." pseudo devices or the wrong CABLE direction.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..', '..');

let browserOutputs = [];
const stateRef = { value: {} };

const context = vm.createContext({
    console, Date, JSON,
    setTimeout, clearTimeout,
    navigator: {
        mediaDevices: {
            enumerateDevices: async () => browserOutputs.map((device) => ({ kind: 'audiooutput', ...device }))
        }
    },
    window: {}
});
context.window.window = context.window;
context.window.navigator = context.navigator;
context.window.isSecureContext = true;

vm.runInContext(
    fs.readFileSync(path.join(repo, 'js/modules/features/audioflix/audioflix.audio.output.js'), 'utf8'),
    context,
    { filename: 'audioflix.audio.output.js' }
);

const controller = context.window.EveAudioflixAudioOutput.createController({
    ensureAudio: () => ({ setSinkId: async () => {}, sinkId: '' }),
    getAudioContext: () => null,
    state: () => stateRef.value,
    dispatch: () => {},
    runtime: {}
});

function assert(condition, message) {
    if (!condition) {
        console.error('ASSERT_FAILED:', message);
        process.exit(1);
    }
}

(async () => {
    // 1. An explicitly picked browser sink always wins.
    stateRef.value = { preferredSinkId: 'sink-picked', preferredSinkLabel: 'CABLE Input (VB-Audio Virtual Cable)' };
    let routed = await controller.resolvePlaybackSink();
    assert(routed?.deviceId === 'sink-picked' && routed.source === 'browser-selective',
        'picked browser sink was not used for music routing');

    // 2. Native Bridge armed: the browser device matching the native output name is used,
    //    despite the host-API suffix and the MME 31-char name truncation.
    browserOutputs = [
        { deviceId: 'dev-default', label: 'Default - Speakers (Realtek(R) Audio)' },
        { deviceId: 'dev-speakers', label: 'Speakers (Realtek(R) Audio)' },
        { deviceId: 'dev-cable-out', label: 'CABLE Output (VB-Audio Virtual Cable)' },
        { deviceId: 'dev-cable-in', label: 'CABLE Input (VB-Audio Virtual Cable)' }
    ];
    stateRef.value = {
        preferredSinkId: '',
        nativeBridgeEnabled: true,
        nativeOutputId: 'sd:7',
        nativeOutputLabel: 'CABLE Input (VB-Audio Virtual C (MME)'
    };
    routed = await controller.resolvePlaybackSink();
    assert(routed?.deviceId === 'dev-cable-in' && routed.source === 'native-label-match',
        `native CABLE output did not resolve to the matching browser sink (got ${JSON.stringify(routed)})`);

    // 3. Same shape for a non-CABLE endpoint (exact name, WASAPI suffix).
    stateRef.value = {
        preferredSinkId: '',
        nativeBridgeEnabled: true,
        nativeOutputId: 'sd:2',
        nativeOutputLabel: 'Speakers (Realtek(R) Audio) (Windows WASAPI)'
    };
    routed = await controller.resolvePlaybackSink();
    assert(routed?.deviceId === 'dev-speakers' && routed.source === 'native-label-match',
        'native speakers output did not label-match the concrete browser device');

    // 4. Native armed but the endpoint has no browser twin (labels locked or device missing):
    //    the caller must learn it is unmatched instead of silently playing on default.
    stateRef.value = {
        preferredSinkId: '',
        nativeBridgeEnabled: true,
        nativeOutputId: 'sd:9',
        nativeOutputLabel: 'Focusrite USB Audio (MME)'
    };
    routed = await controller.resolvePlaybackSink();
    assert(routed && routed.deviceId === '' && routed.source === 'native-unmatched',
        'unmatched native output was not reported as native-unmatched');

    // 5. Nothing armed: no routing (music stays on the default device by design).
    stateRef.value = { preferredSinkId: '', nativeBridgeEnabled: false, nativeOutputId: '' };
    routed = await controller.resolvePlaybackSink();
    assert(routed === null, 'idle route produced a sink even though nothing is armed');

    console.log('AUDIOFLIX_MUSIC_ROUTE_SMOKE_OK (cases=5)');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
