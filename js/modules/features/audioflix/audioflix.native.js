window.EveAudioflixNative = window.EveAudioflixNative || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixNative;
    if (ns.ready) return;

    let deviceCache = null;
    let lastStatus = { ok: false, message: 'Native bridge not checked yet.', devices: [] };

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
        const timer = setTimeout(() => controller.abort(), options.timeout || 900);
        try {
            const response = await fetch(`${base}${path}`, Object.assign({}, options, {
                signal: controller.signal,
                headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
            }));
            if (!response.ok) return null;
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchJson(path, options = {}) {
        for (const base of candidateBases()) {
            try {
                const payload = await fetchFromBase(base, path, options);
                if (!payload) continue;
                if (payload?.ok !== false) {
                    update({ nativeBridgeBase: base }, 'audioflix-native-bridge-base');
                    return payload;
                }
                lastStatus = payload;
            } catch {
                // Try the next known local EveOS server port.
            }
        }
        return lastStatus;
    }

    async function listSystemOutputs(force = false) {
        if (deviceCache && !force && Date.now() - deviceCache.at < 5000) return deviceCache.payload;
        const payload = await fetchJson('/api/audioflix/devices');
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
            timeout: 1200
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
