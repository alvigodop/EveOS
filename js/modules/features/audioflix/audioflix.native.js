window.EveAudioflixNative = window.EveAudioflixNative || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixNative;
    if (ns.ready) return;

    const DEFAULT_TIMEOUT_MS = 1600;
    const DEVICE_SCAN_TIMEOUT_MS = 7500;
    const PCM_SEND_TIMEOUT_MS = 2500;
    const MEDIA_PLAY_TIMEOUT_MS = 5000;

    let deviceCache = null;
    let lastStatus = { ok: false, message: 'Native bridge not checked yet.', devices: [], attempts: [] };

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function update(patch, reason) {
        return window.EveAudioflixState?.update?.(patch, reason) || state();
    }

    function candidateBases() {
        let saved = state().nativeBridgeBase;
        // "localhost" resolves to ::1 (IPv6) first on Windows; when the server only listens
        // on IPv4, every request eats a ~1-2s IPv6 connect timeout before falling back to
        // 127.0.0.1. That delay was making soundboard audio start late and stream choppily.
        // Always prefer 127.0.0.1 (the bridge allows CORS * so cross-origin is fine).
        if (saved && saved.includes('localhost')) {
            saved = saved.replace('localhost', '127.0.0.1');
        }
        const bases = [];
        if (saved) bases.push(saved);
        if (/^https?:$/.test(location.protocol)) {
            if (location.origin.includes('localhost')) {
                bases.push(location.origin.replace('localhost', '127.0.0.1'));
            }
            bases.push(location.origin);
        }
        ['8765', '3000'].forEach((port) => {
            bases.push(`http://127.0.0.1:${port}`);
            bases.push(`http://localhost:${port}`);
        });
        return [...new Set(bases.filter(Boolean))];
    }

    async function fetchFromBase(base, path, options = {}) {
        const controller = new AbortController();
        const timeout = Number(options.timeout) || DEFAULT_TIMEOUT_MS;
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(`${base}${path}`, Object.assign({}, options, {
                signal: controller.signal,
                headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
            }));
            if (!response.ok) {
                return {
                    ok: false,
                    base,
                    status: response.status,
                    message: response.status === 404
                        ? `Audioflix API is missing on ${base}. Restart that EveOS port so the native bridge endpoint loads.`
                        : `Native bridge request failed on ${base} (${response.status}).`
                };
            }
            const payload = await response.json();
            return Object.assign({ base }, payload || {});
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchJson(path, options = {}) {
        const attempts = [];
        for (const base of candidateBases()) {
            try {
                const payload = await fetchFromBase(base, path, options);
                if (!payload) {
                    attempts.push({ base, message: 'No native bridge response.' });
                    continue;
                }
                if (payload?.ok !== false) {
                    update({ nativeBridgeBase: base }, 'audioflix-native-bridge-base');
                    return payload;
                }
                attempts.push({ base, status: payload.status, message: payload.message });
                lastStatus = Object.assign({}, payload, { attempts });
            } catch (error) {
                attempts.push({
                    base,
                    message: error?.name === 'AbortError'
                        ? `Timed out after ${Number(options.timeout) || DEFAULT_TIMEOUT_MS}ms.`
                        : (error?.message || 'Request failed.')
                });
            }
        }
        lastStatus = Object.assign({}, lastStatus, {
            ok: false,
            devices: [],
            attempts,
            message: attempts.find((item) => item.status === 404)?.message
                || attempts[0]?.message
                || 'Native bridge unavailable. Start or restart an EveOS HTTP server.'
        });
        return lastStatus;
    }

    async function listSystemOutputs(force = false) {
        const payload = await listSystemDevices(force);
        return Object.assign({}, payload, { devices: (payload.devices || []).filter((device) => device.kind === 'output') });
    }

    async function listSystemInputs(force = false) {
        const payload = await listSystemDevices(force);
        return Object.assign({}, payload, { devices: (payload.devices || []).filter((device) => device.kind === 'input') });
    }

    async function listSystemDevices(force = false) {
        if (deviceCache && !force && Date.now() - deviceCache.at < 5000) return deviceCache.payload;
        const path = force ? '/api/audioflix/devices?refresh=1' : '/api/audioflix/devices';
        const payload = await fetchJson(path, { timeout: DEVICE_SCAN_TIMEOUT_MS });
        lastStatus = Object.assign({}, payload, { devices: payload.devices || [] });
        deviceCache = { at: Date.now(), payload: lastStatus };
        return lastStatus;
    }

    function selectNativeOutput(deviceId, label) {
        const enabled = !!deviceId;
        return update({
            nativeBridgeEnabled: enabled,
            nativeOutputId: String(deviceId || ''),
            nativeOutputLabel: String(label || '').trim(),
            routeMode: enabled ? 'native-bridge' : 'browser'
        }, 'audioflix-native-output');
    }

    function selectNativeInput(deviceId, label) {
        return update({
            nativeInputId: String(deviceId || ''),
            nativeInputLabel: String(label || '').trim()
        }, 'audioflix-native-input');
    }

    function setNativeBridgeEnabled(enabled) {
        const current = state();
        return update({
            nativeBridgeEnabled: enabled === true && !!current.nativeOutputId,
            routeMode: enabled === true && current.nativeOutputId ? 'native-bridge' : 'browser'
        }, 'audioflix-native-bridge-toggle');
    }

    function shouldSuppressBrowserPlayback() {
        const current = state();
        return current.nativeBridgeEnabled === true
            && current.nativeSuppressBrowserPlayback !== false
            && !!current.nativeOutputId;
    }

    async function sendGeminiChunk(audio, detail = {}) {
        const current = state();
        if (current.nativeBridgeEnabled !== true || !current.nativeOutputId || !audio) return false;
        const payload = await fetchJson('/api/audioflix/play-pcm', {
            method: 'POST',
            body: JSON.stringify({
                audio,
                deviceId: current.nativeOutputId,
                sampleRate: detail.sampleRate || 24000,
                channels: detail.channels || 1
            }),
            timeout: PCM_SEND_TIMEOUT_MS
        });
        lastStatus = payload;
        return payload?.ok === true;
    }

    // Send a COMPLETE clip as one mixable voice (soundboard layering). One POST per
    // press -> the bridge mixes overlapping voices cleanly (no chunk interleave) and
    // starts it on the next callback (low latency, smooth).
    async function playVoice(audio, detail = {}) {
        const current = state();
        if (current.nativeBridgeEnabled !== true || !current.nativeOutputId || !audio) return false;
        const payload = await fetchJson('/api/audioflix/play-voice', {
            method: 'POST',
            body: JSON.stringify({
                audio,
                deviceId: current.nativeOutputId,
                sampleRate: detail.sampleRate || 24000,
                channels: detail.channels || 1,
                volume: detail.volume ?? 1,
                voiceId: detail.voiceId || null
            }),
            timeout: PCM_SEND_TIMEOUT_MS
        });
        lastStatus = payload;
        return payload?.ok === true;
    }

    async function clearVoices(voiceId) {
        const current = state();
        if (current.nativeBridgeEnabled !== true || !current.nativeOutputId) return false;
        const payload = await fetchJson('/api/audioflix/clear-voices', {
            method: 'POST',
            body: JSON.stringify({ deviceId: current.nativeOutputId, sampleRate: 24000, voiceId: voiceId || null }),
            timeout: DEFAULT_TIMEOUT_MS
        }).catch(() => null);
        return payload?.ok === true;
    }

    async function sendTone(detail = {}) {
        const current = state();
        if (current.nativeBridgeEnabled !== true || !current.nativeOutputId) return false;
        const payload = await fetchJson('/api/audioflix/play-tone', {
            method: 'POST',
            body: JSON.stringify({
                deviceId: current.nativeOutputId,
                sampleRate: detail.sampleRate || 24000,
                frequency: detail.frequency || 660,
                seconds: detail.seconds || 0.55
            }),
            timeout: PCM_SEND_TIMEOUT_MS
        });
        lastStatus = payload;
        return payload;
    }

    async function playMediaItem(item, detail = {}) {
        const current = state();
        const safeItem = item && typeof item === 'object' ? item : {};
        if (current.nativeBridgeEnabled !== true || !current.nativeOutputId || !safeItem.url) return false;
        const payload = await fetchJson('/api/audioflix/play-media', {
            method: 'POST',
            body: JSON.stringify({
                deviceId: current.nativeOutputId,
                url: safeItem.url,
                title: safeItem.title || '',
                volume: safeItem.volume ?? 1,
                sampleRate: detail.sampleRate || 48000
            }),
            timeout: MEDIA_PLAY_TIMEOUT_MS
        });
        lastStatus = payload;
        return payload;
    }

    Object.assign(ns, {
        ready: true,
        listSystemDevices,
        listSystemOutputs,
        listSystemInputs,
        selectNativeOutput,
        selectNativeInput,
        setNativeBridgeEnabled,
        sendGeminiChunk,
        playVoice,
        clearVoices,
        sendTone,
        playMediaItem,
        shouldSuppressBrowserPlayback,
        getStatus: function () { return lastStatus; }
    });
})();
