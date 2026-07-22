window.EveAudioflixAudioTest = window.EveAudioflixAudioTest || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioTest;
    if (ns.ready) return;

    function makeToneUrl() {
        const rate = 24000;
        const count = Math.floor(rate * 0.55);
        const buffer = new ArrayBuffer(44 + count * 2);
        const view = new DataView(buffer);
        const write = (offset, value) => {
            for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
        };
        write(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); write(8, 'WAVEfmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, count * 2, true);
        for (let index = 0; index < count; index += 1) {
            const time = index / rate;
            const fade = Math.min(1, index / 900, (count - index) / 900);
            view.setInt16(44 + index * 2, Math.sin(2 * Math.PI * 880 * time) * 0.28 * fade * 32767, true);
        }
        return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    }

    function createController(deps) {
        return async function playTestSignal() {
            if (window.EveAudioflixNative?.shouldSuppressBrowserPlayback?.()) {
                const payload = await window.EveAudioflixNative?.sendTone?.({ frequency: 880, seconds: 0.55 });
                if (payload?.ok === true) {
                    const status = `Native route test tone -> ${deps.state().nativeOutputLabel || 'selected output'}`;
                    deps.setStatus(status);
                    deps.dispatch('eve:audioflix-playback', { status, native: true, payload });
                    return true;
                }
            }
            const url = makeToneUrl();
            try {
                await deps.playItem({ id: 'audioflix-test-signal', type: 'sound', title: 'Audioflix test signal', url, volume: 0.62 });
                return true;
            } finally {
                window.setTimeout(() => URL.revokeObjectURL(url), 5000);
            }
        };
    }

    Object.assign(ns, { ready: true, createController });
})();
