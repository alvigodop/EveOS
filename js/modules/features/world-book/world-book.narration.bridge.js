window.EveWorldBookNarrationBridge = window.EveWorldBookNarrationBridge || {};

(function (bridge) {
    'use strict';

    const SETTINGS_KEY = 'eveWorldBookNarrationSettings';
    const VOICE_ID = 'world-book-narration';
    const defaults = {
        enabled: true,
        engine: 'browser',
        browserVoice: '',
        geminiVoice: 'Aoede',
        rate: 1,
        pitch: 1,
        volume: 1,
        strictVerbatim: true,
        backgroundPrefetch: true,
        routeToAudioflix: false,
        cacheMb: 192,
        cacheDays: 30
    };
    let pendingReaderOpen = false;
    const pendingCommands = new Set();
    const readyTargets = new WeakSet();

    function clamp(value, min, max, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    }

    function normalize(value = {}) {
        return {
            ...defaults,
            ...value,
            enabled: value.enabled !== false,
            engine: value.engine === 'gemini' ? 'gemini' : 'browser',
            rate: clamp(value.rate, 0.5, 2, 1),
            pitch: clamp(value.pitch, 0, 2, 1),
            volume: clamp(value.volume, 0, 1, 1),
            strictVerbatim: value.strictVerbatim !== false,
            backgroundPrefetch: value.backgroundPrefetch !== false,
            routeToAudioflix: value.routeToAudioflix === true,
            cacheMb: clamp(value.cacheMb, 16, 1024, 192),
            cacheDays: clamp(value.cacheDays, 1, 365, 30)
        };
    }

    function settings() {
        try {
            return normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
        } catch (_error) {
            return normalize();
        }
    }

    function targets() {
        const values = [];
        const frame = document.querySelector('[data-world-book-frame]')?.contentWindow;
        const detached = window.EveWorldBook?.getDetachedWindow?.();
        if (frame) values.push(frame);
        if (detached && !detached.closed) values.push(detached);
        return values;
    }

    function isWorldBookMessage(event) {
        return targets().includes(event.source)
            && (event.origin === 'http://127.0.0.1:8766' || event.origin === 'http://localhost:8766');
    }

    function send(target, message) {
        try { target?.postMessage?.(message, '*'); } catch (_error) {}
    }

    function broadcastSettings() {
        const message = { type: 'eve-world-book-narration-settings', settings: settings() };
        targets().forEach(target => send(target, message));
        return message.settings;
    }

    function saveSettings(patch) {
        const next = normalize({ ...settings(), ...(patch || {}) });
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (_error) {}
        window.dispatchEvent(new CustomEvent('eve:world-book-narration-settings', { detail: next }));
        return next;
    }

    function broadcastCommand(action, options = {}) {
        const recipients = targets().filter(target => readyTargets.has(target));
        recipients.forEach(target => send(target, { type: 'eve-world-book-narration-command', action }));
        if (!recipients.length && options.queueIfUnavailable !== false) pendingCommands.add(action);
        return recipients.length;
    }

    function flushPendingCommands(target) {
        pendingCommands.forEach(action => {
            send(target, { type: 'eve-world-book-narration-command', action });
        });
        pendingCommands.clear();
    }

    async function handlePlayback(event, data) {
        let ok = false;
        let reason = '';
        try {
            ok = await window.EveAudioflixNative?.playVoice?.(data.audio, {
                sampleRate: data.sampleRate || 24000,
                channels: 1,
                volume: data.volume ?? 1,
                voiceId: VOICE_ID,
                replace: true
            }) === true;
            if (!ok) reason = 'Audioflix native routing is not active.';
        } catch (error) {
            reason = error.message || String(error);
        }
        send(event.source, {
            type: 'eve-world-book-narration-result',
            requestId: data.requestId,
            ok,
            reason
        });
        window.dispatchEvent(new CustomEvent('eve:world-book-narration-route', {
            detail: { ok, reason, sessionId: data.sessionId || '' }
        }));
    }

    function openReader() {
        pendingReaderOpen = true;
        void window.EveWorldBook?.open?.('world');
        if (broadcastCommand('open-reader', { queueIfUnavailable: false })) pendingReaderOpen = false;
    }

    window.addEventListener('message', event => {
        if (!isWorldBookMessage(event)) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'eve-world-book-narration-ready') {
            readyTargets.add(event.source);
            send(event.source, { type: 'eve-world-book-narration-settings', settings: settings() });
            flushPendingCommands(event.source);
            if (pendingReaderOpen) {
                pendingReaderOpen = false;
                send(event.source, { type: 'eve-world-book-narration-command', action: 'open-reader' });
            }
        } else if (data.type === 'eve-world-book-narration-settings-change') {
            saveSettings(data.settings);
        } else if (data.type === 'eve-world-book-narration-play') {
            void handlePlayback(event, data);
        } else if (data.type === 'eve-world-book-narration-stop') {
            void window.EveAudioflixNative?.clearVoices?.(VOICE_ID);
        } else if (data.type === 'eve-world-book-narration-state') {
            window.dispatchEvent(new CustomEvent('eve:world-book-narration-state', { detail: data.detail }));
        } else if (data.type === 'eve-world-book-narration-cache-stats') {
            window.dispatchEvent(new CustomEvent('eve:world-book-narration-cache-stats', { detail: data.stats }));
        }
    });

    window.addEventListener('eve:world-book-narration-settings', broadcastSettings);
    window.addEventListener('eve:world-book-frame-loading', event => {
        const target = event.detail?.target;
        if (target) readyTargets.delete(target);
    });

    Object.assign(bridge, {
        defaults: Object.freeze({ ...defaults }),
        settings,
        saveSettings,
        broadcastSettings,
        broadcastCommand,
        openReader
    });
})(window.EveWorldBookNarrationBridge);
