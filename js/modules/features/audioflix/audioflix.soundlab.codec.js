window.EveAudioflixSoundLabCodec = window.EveAudioflixSoundLabCodec || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabCodec;
    if (ns.ready) return;

    function decodeBase64(base64) {
        const clean = String(base64 || '').replace(/\s+/g, '');
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    }

    function pcm16ToAudioBuffer(context, base64, options) {
        const settings = Object.assign({ channels: 2, sampleRate: 48000 }, options || {});
        const bytes = decodeBase64(base64);
        const sampleCount = Math.floor(bytes.byteLength / 2);
        const channels = Math.max(1, Math.min(2, Number(settings.channels) || 2));
        const frameCount = Math.floor(sampleCount / channels);
        if (!frameCount) throw new Error('The music stream returned an empty PCM chunk.');

        const view = new DataView(bytes.buffer, bytes.byteOffset, frameCount * channels * 2);
        const buffer = context.createBuffer(channels, frameCount, settings.sampleRate);
        const targets = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
        for (let frame = 0; frame < frameCount; frame += 1) {
            for (let channel = 0; channel < channels; channel += 1) {
                const offset = (frame * channels + channel) * 2;
                targets[channel][frame] = Math.max(-1, view.getInt16(offset, true) / 32768);
            }
        }
        return buffer;
    }

    function bestRecordingMimeType() {
        if (!window.MediaRecorder) return '';
        return [
            'audio/webm;codecs=opus',
            'audio/ogg;codecs=opus',
            'audio/webm'
        ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
    }

    function safeFilename(value, extension) {
        const stem = String(value || 'Sonic Forge Session')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100) || 'Sonic Forge Session';
        return `${stem}.${String(extension || 'webm').replace(/^\./, '')}`;
    }

    Object.assign(ns, {
        ready: true,
        decodeBase64,
        pcm16ToAudioBuffer,
        bestRecordingMimeType,
        safeFilename
    });
})();
