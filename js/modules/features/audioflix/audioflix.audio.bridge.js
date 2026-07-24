window.EveAudioflixAudioBridge = window.EveAudioflixAudioBridge || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixAudioBridge;
    if (ns.ready) return;

    const CHUNK_SECONDS = 0.5;
    const LEAD_SECONDS = 3.0;
    const PUMP_DELAY_MS = 50;
    const PROGRESS_INTERVAL_MS = 120;

    const now = () => (window.performance?.now?.() ?? Date.now());
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function normalizeVolume(value) {
        if (typeof window.EveAudioflixState?.normalizeVolume === 'function') {
            return window.EveAudioflixState.normalizeVolume(value, 1);
        }
        const numeric = Number(value);
        return clamp(Number.isFinite(numeric) ? numeric : 1, 0, 1);
    }

    function encodeChunk(samples, start, count, volume) {
        const pcm = new Int16Array(count);
        for (let index = 0; index < count; index += 1) {
            const sample = clamp(samples[start + index] * volume, -1, 1);
            pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        const bytes = new Uint8Array(pcm.buffer);
        let binary = '';
        const step = 0x8000;
        for (let index = 0; index < bytes.length; index += step) {
            binary += String.fromCharCode.apply(null, bytes.subarray(index, index + step));
        }
        return btoa(binary);
    }

    function createTimeline(options = {}) {
        const duration = Math.max(0, Number(options.duration || 0) || 0);
        const startAt = clamp(Number(options.startAt || 0) || 0, 0, duration || Infinity);
        const startedAt = now();
        let stopped = false;
        let timer = 0;

        const currentTime = () => stopped
            ? startAt
            : clamp(startAt + ((now() - startedAt) / 1000), 0, duration || Infinity);

        const finish = () => {
            if (stopped) return;
            stopped = true;
            if (timer) window.clearInterval(timer);
            options.onProgress?.(duration, duration);
            options.onEnded?.();
        };

        if (duration > 0) {
            timer = window.setInterval(() => {
                const current = currentTime();
                options.onProgress?.(current, duration);
                if (current >= duration) finish();
            }, PROGRESS_INTERVAL_MS);
            options.onProgress?.(startAt, duration);
        }

        return {
            currentTime,
            duration,
            stop() {
                if (stopped) return;
                stopped = true;
                if (timer) window.clearInterval(timer);
            }
        };
    }

    function createStream(options = {}) {
        const buffer = options.buffer;
        const sampleRate = Math.max(1, Number(buffer?.sampleRate || options.sampleRate || 24000));
        const samples = buffer?.getChannelData?.(0);
        if (!samples) throw new Error('Native stream requires a decoded AudioBuffer.');

        const duration = samples.length / sampleRate;
        const startAt = clamp(Number(options.startAt || 0) || 0, 0, duration);
        const chunkSize = Math.max(1, Math.floor(sampleRate * CHUNK_SECONDS));
        const startedAt = now();
        let offset = Math.floor(startAt * sampleRate);
        let sentThrough = offset / sampleRate;
        let volume = normalizeVolume(options.volume);
        let stopped = false;
        let pumpTimer = 0;
        let progressTimer = 0;
        let endTimer = 0;
        let pumping = false;

        const currentTime = () => clamp(startAt + ((now() - startedAt) / 1000), 0, duration);
        const clearTimers = () => {
            if (pumpTimer) window.clearTimeout(pumpTimer);
            if (progressTimer) window.clearInterval(progressTimer);
            if (endTimer) window.clearTimeout(endTimer);
            pumpTimer = progressTimer = endTimer = 0;
        };

        const finish = () => {
            if (stopped) return;
            stopped = true;
            clearTimers();
            options.onProgress?.(duration, duration);
            options.onEnded?.();
        };

        const scheduleFinish = () => {
            if (endTimer || stopped) return;
            endTimer = window.setTimeout(finish, Math.max(0, duration - currentTime()) * 1000);
        };

        const pump = async () => {
            if (stopped || pumping) return;
            pumping = true;
            try {
                while (!stopped && offset < samples.length && sentThrough < currentTime() + LEAD_SECONDS) {
                    const chunkStart = offset;
                    const count = Math.min(chunkSize, samples.length - chunkStart);
                    offset += count;
                    sentThrough = offset / sampleRate;
                    const accepted = await options.sendChunk?.(
                        encodeChunk(samples, chunkStart, count, volume),
                        { sampleRate, channels: 1 }
                    );
                    if (accepted !== true) throw new Error('Native bridge rejected an audio chunk.');
                }
                if (offset >= samples.length) scheduleFinish();
            } catch (error) {
                stopped = true;
                clearTimers();
                options.onError?.(error);
            } finally {
                pumping = false;
                if (!stopped && offset < samples.length) {
                    pumpTimer = window.setTimeout(pump, PUMP_DELAY_MS);
                }
            }
        };

        const ready = (async () => {
            if (options.clearBeforeStart !== false) await options.stopRemote?.();
            if (stopped) return false;
            progressTimer = window.setInterval(() => {
                const current = currentTime();
                options.onProgress?.(current, duration);
                if (current >= duration) finish();
            }, PROGRESS_INTERVAL_MS);
            options.onProgress?.(startAt, duration);
            await pump();
            return !stopped;
        })();

        return {
            ready,
            duration,
            currentTime,
            setVolume(next) { volume = normalizeVolume(next); },
            async stop(detail = {}) {
                if (!stopped) {
                    stopped = true;
                    clearTimers();
                }
                if (detail.clearRemote !== false) await options.stopRemote?.();
            }
        };
    }

    Object.assign(ns, {
        ready: true,
        createStream,
        createTimeline,
        // Exposed for the live-capture music route, which encodes real-time frames straight from
        // the player instead of pre-decoding a whole track (see audioflix.audio.js).
        encodePcm: encodeChunk
    });
})();
