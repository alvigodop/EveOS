// Live PCM capture for the native EveOS route.
//
// Soundboard clips are short enough to decode up front (buffering is also what makes them
// mixable voices). A music track is not: decoding a whole song before the first sample is what
// put a lag between pressing play and hearing sound. This controller instead lets the media
// element play normally (instant start, seekable, progressive) while the LIVE signal is tapped
// from the Web Audio graph and streamed to the native bridge, with local speakers silenced so
// only the routed device hears it ("bypasser").
//
// The bridge mixes mono server-side (play_pcm keeps a single channel), so a stereo track is
// downmixed here rather than silently losing its right channel.
window.EveAudioflixAudioCapture = window.EveAudioflixAudioCapture || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioCapture;
    if (ns.ready) return;

    ns.createController = function createController(deps) {
        const getWaveform = deps.getWaveform;
        const getPlayer = deps.getPlayer;
        const getVolume = deps.getVolume;
        let active = false;

        function stop() {
            if (!active) return false;
            active = false;
            const waveform = getWaveform();
            waveform?.setFrameTap?.(null);
            waveform?.setSpeakerMuted?.(false);
            window.EveAudioflixNative?.stopStream?.().catch(() => {});
            return true;
        }

        function start() {
            const waveform = getWaveform();
            if (!waveform?.setFrameTap) return false;
            const rate = waveform.setFrameTap((inputBuffer, sampleRate) => {
                if (!active || getPlayer()?.paused) return;
                const left = inputBuffer.getChannelData(0);
                let mono = left;
                if (inputBuffer.numberOfChannels > 1) {
                    const right = inputBuffer.getChannelData(1);
                    mono = new Float32Array(left.length);
                    for (let index = 0; index < left.length; index += 1) mono[index] = (left[index] + right[index]) / 2;
                }
                const payload = window.EveAudioflixAudioBridge?.encodePcm?.(mono, 0, mono.length, getVolume());
                if (payload) window.EveAudioflixNative?.sendGeminiChunk?.(payload, { sampleRate, channels: 1 });
            });
            if (!rate) return false;
            active = true;
            waveform.setSpeakerMuted?.(true);
            return true;
        }

        return { start, stop, isActive: () => active };
    };

    ns.ready = true;
})();
