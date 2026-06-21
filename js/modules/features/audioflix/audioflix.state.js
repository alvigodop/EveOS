window.EveAudioflixState = window.EveAudioflixState || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixState;
    if (ns.ready) return;

    const STORAGE_KEY = 'eveAudioflixFallbackState';
    const SAVE_DELAY_MS = 500;
    const MAX_SOUNDBOARD = 240;
    const MAX_MUSIC = 500;
    const MAX_RECENT = 60;
    let saveTimer = 0;

    const DEFAULTS = {
        schemaVersion: 1,
        enabled: true,
        routeMode: 'browser',
        preferredSinkId: '',
        preferredSinkLabel: '',
        nativeBridgeEnabled: false,
        nativeOutputId: '',
        nativeOutputLabel: '',
        nativeInputId: '',
        nativeInputLabel: '',
        nativeSuppressBrowserPlayback: true,
        nativeBridgeBase: '',
        geminiVoicePortEnabled: false,
        geminiVoiceMonitorEnabled: true,
        geminiVoiceMonitorSinkId: '',
        geminiVoiceMonitorSinkLabel: '',
        geminiVoiceMonitorVolume: 0.75,
        geminiConversationMode: 'direct-live',
        soundboard: [],
        music: [],
        recentPlays: [],
        ports: [],
        portVolumes: {},
        exposedPortedSounds: {},
        soundboardViewMode: 'backend',
        counters: {
            plays: 0,
            routedGeminiEvents: 0
        }
    };

    function getConfigRoot() {
        if (window.eveState?.config && typeof window.eveState.config === 'object') return window.eveState.config;
        if (typeof config !== 'undefined' && config && typeof config === 'object') return config;
        return null;
    }

    function fallbackRead() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    function fallbackWrite(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn('[Audioflix] fallback state write failed:', error);
        }
    }

    function text(value, fallback) {
        const normalized = String(value ?? '').trim();
        return normalized || String(fallback ?? '').trim();
    }

    function bool(value) {
        return value === true;
    }

    function id(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function cleanItem(item, type) {
        const source = item && typeof item === 'object' ? item : {};
        return {
            id: text(source.id, id(type)),
            type,
            title: text(source.title, type === 'music' ? 'Untitled Track' : 'Sound Clip'),
            url: text(source.url, ''),
            artist: text(source.artist, ''),
            card: text(source.card, ''),
            folder: text(source.folder, ''),
            category: text(source.category, ''),
            volume: Math.max(0, Math.min(1, Number(source.volume ?? 1) || 1)),
            exposed: source.exposed === true,
            createdAt: Number(source.createdAt || 0) || Date.now(),
            lastPlayedAt: Number(source.lastPlayedAt || 0) || 0
        };
    }

    function cleanPort(port) {
        const src = port && typeof port === 'object' ? port : {};
        return {
            id: text(src.id, id('port')),
            nickname: text(src.nickname, 'Unnamed Port'),
            path: text(src.path, '')
        };
    }

    function boundedItems(list, type, max) {
        return (Array.isArray(list) ? list : [])
            .map((item) => cleanItem(item, type))
            .filter((item) => !!item.url)
            .slice(-max);
    }

    function normalize(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            schemaVersion: 1,
            enabled: source.enabled !== false,
            routeMode: ['browser', 'browser-selective', 'vb-cable', 'manual', 'native-bridge'].includes(source.routeMode) ? source.routeMode : 'browser',
            preferredSinkId: text(source.preferredSinkId, ''),
            preferredSinkLabel: text(source.preferredSinkLabel, ''),
            nativeBridgeEnabled: bool(source.nativeBridgeEnabled),
            nativeOutputId: text(source.nativeOutputId, ''),
            nativeOutputLabel: text(source.nativeOutputLabel, ''),
            nativeInputId: text(source.nativeInputId, ''),
            nativeInputLabel: text(source.nativeInputLabel, ''),
            nativeSuppressBrowserPlayback: source.nativeSuppressBrowserPlayback !== false,
            nativeBridgeBase: text(source.nativeBridgeBase, ''),
            geminiVoicePortEnabled: bool(source.geminiVoicePortEnabled),
            geminiVoiceMonitorEnabled: source.geminiVoiceMonitorEnabled !== false,
            geminiVoiceMonitorSinkId: text(source.geminiVoiceMonitorSinkId, ''),
            geminiVoiceMonitorSinkLabel: text(source.geminiVoiceMonitorSinkLabel, ''),
            geminiVoiceMonitorVolume: Math.max(0, Math.min(1, Number(source.geminiVoiceMonitorVolume ?? 0.75) || 0.75)),
            geminiConversationMode: source.geminiConversationMode === 'text-brain-live-voice'
                ? 'text-brain-live-voice'
                : 'direct-live',
            soundboard: boundedItems(source.soundboard, 'sound', MAX_SOUNDBOARD),
            music: boundedItems(source.music, 'music', MAX_MUSIC),
            recentPlays: (Array.isArray(source.recentPlays) ? source.recentPlays : []).slice(-MAX_RECENT),
            ports: (Array.isArray(source.ports) ? source.ports : []).map(cleanPort),
            portVolumes: source.portVolumes && typeof source.portVolumes === 'object' ? source.portVolumes : {},
            exposedPortedSounds: source.exposedPortedSounds && typeof source.exposedPortedSounds === 'object' ? source.exposedPortedSounds : {},
            soundboardViewMode: ['backend', 'frontend'].includes(source.soundboardViewMode) ? source.soundboardViewMode : 'backend',
            counters: {
                plays: Number(source.counters?.plays || 0) || 0,
                routedGeminiEvents: Number(source.counters?.routedGeminiEvents || 0) || 0
            }
        };
    }

    function ensure() {
        const root = getConfigRoot();
        if (!root) {
            return normalize(fallbackRead());
        }
        root.audioflix = normalize(root.audioflix || fallbackRead());
        return root.audioflix;
    }

    function scheduleSave(reason) {
        const state = ensure();
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = window.setTimeout(function () {
            saveTimer = 0;
            const root = getConfigRoot();
            if (root) root.audioflix = normalize(state);
            fallbackWrite(state);
            if (typeof window.saveConfig === 'function') {
                window.saveConfig({
                    source: reason || 'audioflix',
                    meta: { skipEditHistory: true }
                });
            }
            window.dispatchEvent(new CustomEvent('eve:audioflix-state-changed', { detail: { reason } }));
        }, SAVE_DELAY_MS);
    }

    function update(patch, reason) {
        const state = ensure();
        Object.assign(state, patch || {});
        const root = getConfigRoot();
        if (root) root.audioflix = normalize(state);
        scheduleSave(reason);
        return ensure();
    }

    function addItem(type, item) {
        const state = ensure();
        const key = type === 'music' ? 'music' : 'soundboard';
        const max = type === 'music' ? MAX_MUSIC : MAX_SOUNDBOARD;
        state[key] = boundedItems([...(state[key] || []), item], type === 'music' ? 'music' : 'sound', max);
        scheduleSave(`audioflix-add-${type}`);
        return state[key][state[key].length - 1];
    }

    function removeItem(type, itemId) {
        const state = ensure();
        const key = type === 'music' ? 'music' : 'soundboard';
        state[key] = (state[key] || []).filter((item) => item.id !== itemId);
        scheduleSave(`audioflix-remove-${type}`);
        return ensure();
    }

    function addPort(port) {
        const state = ensure();
        state.ports = [...(state.ports || []), cleanPort(port)].filter((p) => !!p.path);
        scheduleSave('audioflix-add-port');
        return state.ports[state.ports.length - 1];
    }

    function removePort(portId) {
        const state = ensure();
        state.ports = (state.ports || []).filter((p) => p.id !== portId);
        scheduleSave('audioflix-remove-port');
        return ensure();
    }

    function recordPlay(item) {
        const state = ensure();
        const played = cleanItem(item, item?.type === 'music' ? 'music' : 'sound');
        played.lastPlayedAt = Date.now();
        state.recentPlays = [...(state.recentPlays || []), {
            id: played.id,
            type: played.type,
            title: played.title,
            at: played.lastPlayedAt
        }].slice(-MAX_RECENT);
        state.counters.plays += 1;
        const listKey = played.type === 'music' ? 'music' : 'soundboard';
        state[listKey] = (state[listKey] || []).map((entry) => entry.id === played.id
            ? Object.assign({}, entry, { lastPlayedAt: played.lastPlayedAt })
            : entry);
        scheduleSave('audioflix-play');
    }

    function recordGeminiAudioEvent() {
        const state = ensure();
        state.counters.routedGeminiEvents += 1;
        scheduleSave('audioflix-gemini-audio');
    }

    function clearGeminiAudioEvents() {
        const state = ensure();
        state.counters.routedGeminiEvents = 0;
        scheduleSave('audioflix-clear-gemini-events');
        return ensure();
    }

    function setItemVolume(type, itemId, volume) {
        const state = ensure();
        const key = type === 'music' ? 'music' : 'soundboard';
        if (state[key]) {
            state[key] = state[key].map(entry => entry.id === itemId ? Object.assign({}, entry, { volume }) : entry);
        }
        state.portVolumes = state.portVolumes || {};
        state.portVolumes[itemId] = volume;
        scheduleSave('audioflix-volume');
        return ensure();
    }

    function setItemExposed(type, itemId, exposed) {
        const state = ensure();
        const key = type === 'music' ? 'music' : 'soundboard';
        if (state[key]) {
            state[key] = state[key].map(entry => entry.id === itemId ? Object.assign({}, entry, { exposed }) : entry);
        }
        state.exposedPortedSounds = state.exposedPortedSounds || {};
        state.exposedPortedSounds[itemId] = exposed;
        scheduleSave('audioflix-exposed');
        return ensure();
    }

    Object.assign(ns, {
        ready: true,
        ensure,
        update,
        addItem,
        removeItem,
        addPort,
        removePort,
        recordPlay,
        recordGeminiAudioEvent,
        clearGeminiAudioEvents,
        setItemVolume,
        setItemExposed,
        getSnapshot: function () { return JSON.parse(JSON.stringify(ensure())); },
        isTextBrainMode: function () { return ensure().geminiConversationMode === 'text-brain-live-voice'; }
    });
})();
