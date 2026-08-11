window.EveAudioflixSoundLabCodec = window.EveAudioflixSoundLabCodec || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixSoundLabCodec;
    if (ns.ready) return;

    function decodeBase64(base64) {
        // google-genai's Python JSON serializer emits bytes as unpadded Base64URL,
        // while the browser SDK returns conventional Base64. Accept both wire forms.
        const clean = String(base64 || '')
            .replace(/\s+/g, '')
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    }

    function channelGains(bytes, channels, gain, stereoBalance) {
        const gains = Array.from({ length: channels }, () => gain);
        if (!stereoBalance || channels !== 2) return gains;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const sums = [0, 0];
        const frames = Math.floor(bytes.byteLength / 4);
        for (let frame = 0; frame < frames; frame += 1) {
            for (let channel = 0; channel < 2; channel += 1) {
                const sample = view.getInt16((frame * 2 + channel) * 2, true) / 32768;
                sums[channel] += sample * sample;
            }
        }
        const levels = sums.map((sum) => Math.sqrt(sum / Math.max(1, frames)));
        const loud = levels[0] >= levels[1] ? 0 : 1;
        const quiet = 1 - loud;
        if (levels[loud] > 0.01 && levels[loud] / Math.max(0.001, levels[quiet]) > 1.35) {
            gains[loud] *= Math.max(0.2, Math.min(1, (levels[quiet] * 1.2) / levels[loud]));
        }
        return gains;
    }

    function encodeBase64(bytes) {
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
    }

    function transformPcm16Base64(base64, options) {
        const settings = Object.assign({
            channels: 2,
            gain: 1,
            stereoBalance: false
        }, options || {});
        const bytes = decodeBase64(base64);
        const channels = Math.max(1, Math.min(2, Number(settings.channels) || 2));
        const gain = Math.max(0, Math.min(1, Number(settings.gain) || 0));
        const gains = channelGains(bytes, channels, gain, settings.stereoBalance === true);
        const output = new Uint8Array(bytes);
        const inputView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const outputView = new DataView(output.buffer);
        const sampleCount = Math.floor(bytes.byteLength / 2);
        for (let index = 0; index < sampleCount; index += 1) {
            const sample = inputView.getInt16(index * 2, true);
            const scaled = Math.max(-32768, Math.min(32767, Math.round(sample * gains[index % channels])));
            outputView.setInt16(index * 2, scaled, true);
        }
        return encodeBase64(output);
    }

    function float32ToPcm16Base64(samples, gain = 1) {
        const source = samples instanceof Float32Array ? samples : new Float32Array(samples || 0);
        const output = new Uint8Array(source.length * 2);
        const view = new DataView(output.buffer);
        const safeGain = Math.max(0, Math.min(2, Number(gain) || 0));
        for (let index = 0; index < source.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, source[index] * safeGain));
            view.setInt16(index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
        }
        return encodeBase64(output);
    }

    function pcm16ToAudioBuffer(context, base64, options) {
        const settings = Object.assign({
            channels: 2,
            sampleRate: 48000,
            stereoBalance: false
        }, options || {});
        const bytes = decodeBase64(base64);
        const sampleCount = Math.floor(bytes.byteLength / 2);
        const channels = Math.max(1, Math.min(2, Number(settings.channels) || 2));
        const frameCount = Math.floor(sampleCount / channels);
        if (!frameCount) throw new Error('The music stream returned an empty PCM chunk.');

        const view = new DataView(bytes.buffer, bytes.byteOffset, frameCount * channels * 2);
        const gains = channelGains(bytes, channels, 1, settings.stereoBalance === true);
        const buffer = context.createBuffer(channels, frameCount, settings.sampleRate);
        const targets = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
        for (let frame = 0; frame < frameCount; frame += 1) {
            for (let channel = 0; channel < channels; channel += 1) {
                const offset = (frame * channels + channel) * 2;
                targets[channel][frame] = Math.max(
                    -1,
                    Math.min(1, (view.getInt16(offset, true) / 32768) * gains[channel])
                );
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
        float32ToPcm16Base64,
        transformPcm16Base64,
        pcm16ToAudioBuffer,
        bestRecordingMimeType,
        safeFilename
    });
})();
