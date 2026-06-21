window.EveAudioflixNative = window.EveAudioflixNative || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixNative;
    if (ns.ready) return;

    const DEFAULT_TIMEOUT_MS = 1600;
    const DEVICE_SCAN_TIMEOUT_MS = 7500;
    const PCM_SEND_TIMEOUT_MS = 2500;

    let deviceCache = null;
    let lastStatus = { ok: false, message: 'Native bridge not checked yet.', devices: [], attempts: [] };

    function state() {
        return window.EveAudioflixState?.ensure?.() || {};
    }

    function update(patch, reason) {
        return window.EveAudioflixState?.update?.(patch, reason) || state();
    }

    function candidateBases() {
        const saved = state().nativeBridgeBase;
        const bases = [];
        if (saved) bases.push(saved);
        if (/^https?:$/.test(location.protocol)) bases.push(location.origin);
        ['8765', '3000'].forEach((port) => bases.push(`http://127.0.0.1:${port}`));
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
        if (deviceCache && !force && Date.now() - deviceCache.at < 5000) return deviceCache.payload;
        const path = force ? '/api/audioflix/devices?refresh=1' : '/api/audioflix/devices';
        const payload = await fetchJson(path, { timeout: DEVICE_SCAN_TIMEOUT_MS });
        const devices = (payload.devices || []).filter((device) => device.kind === 'output');
        lastStatus = Object.assign({}, payload, { devices });
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

    Object.assign(ns, {
        ready: true,
        listSystemOutputs,
        selectNativeOutput,
        setNativeBridgeEnabled,
        sendGeminiChunk,
        shouldSuppressBrowserPlayback,
        getStatus: function () { return lastStatus; }
    });
})();
