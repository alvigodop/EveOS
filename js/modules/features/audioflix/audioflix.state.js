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
        geminiConversationMode: 'text-brain-live-voice',
        geminiModeDefaultV2Applied: true,
        soundboard: [],
        music: [],
        recentPlays: [],
        ports: [],
        // Metadata mirror of the browser-granted folders (FileSystemDirectoryHandle records live
        // in a separate IndexedDB that cannot be serialized). Carrying id/nickname here lets a
        // backup remember the folder so restore can surface it for a one-click re-grant.
        browserFolders: [],
        portVolumes: {},
        exposedPortedSounds: {},
        portHotkeys: {},
        soundboardViewMode: 'backend',
        soundboardGroups: [],
        soundGroupMap: {},
        activeFrontendGroup: '',
        musicViewMode: 'backend',
        // Live connections to external playlists (YouTube etc.). Each imported playlist becomes
        // a music group; tracks keep a sourceId so a re-sync can tell which upstream entries are
        // gone (greyed, never auto-deleted).
        musicPlaylists: [],
        musicGroups: [],
        musicGroupMap: {},
        activeFrontendMusicGroup: '',
        activeMusicFolderScope: '',
        hotkeyBypassCombo: '',
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

    function normalizeVolume(value, fallback = 1) {
        if (value === '' || value == null) return fallback;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback;
    }

    function id(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Per-item cleaners live in a sibling module (audioflix.state.schema.js) so this store stays
    // under the line cap; they run against the same coerce/clamp/id primitives.
    const { cleanItem, cleanPort, boundedItems } = window.EveAudioflixStateSchema.create({ text, normalizeVolume, id });

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
            geminiVoiceMonitorVolume: normalizeVolume(source.geminiVoiceMonitorVolume, 0.75),
            // Mode 2 (Text Brain -> Live Voice) is the DEFAULT conversation mode: the 1M-token
            // text brain does the thinking and holds the relayed EveOS context; the live model
            // just voices its reply. One-time migration: states saved BEFORE this default carried
            // 'direct-live' merely as the old default, so 'direct-live' is only respected once
            // the migration flag exists (i.e. the user re-chose it after the switch).
            geminiConversationMode: source.geminiModeDefaultV2Applied === true
                ? (source.geminiConversationMode === 'direct-live' ? 'direct-live' : 'text-brain-live-voice')
                : 'text-brain-live-voice',
            geminiModeDefaultV2Applied: true,
            soundboard: boundedItems(source.soundboard, 'sound', MAX_SOUNDBOARD),
            music: boundedItems(source.music, 'music', MAX_MUSIC),
            recentPlays: (Array.isArray(source.recentPlays) ? source.recentPlays : []).slice(-MAX_RECENT),
            ports: (Array.isArray(source.ports) ? source.ports : []).map(cleanPort),
            browserFolders: (Array.isArray(source.browserFolders) ? source.browserFolders : [])
                .map((folder) => ({
                    id: text(folder?.id, ''),
                    nickname: text(folder?.nickname, 'Sound folder'),
                    addedAt: Number(folder?.addedAt || 0) || 0
                }))
                .filter((folder) => !!folder.id),
            portVolumes: source.portVolumes && typeof source.portVolumes === 'object' ? source.portVolumes : {},
            exposedPortedSounds: source.exposedPortedSounds && typeof source.exposedPortedSounds === 'object' ? source.exposedPortedSounds : {},
            portHotkeys: source.portHotkeys && typeof source.portHotkeys === 'object' ? source.portHotkeys : {},
            soundboardViewMode: ['backend', 'frontend'].includes(source.soundboardViewMode) ? source.soundboardViewMode : 'backend',
            soundboardGroups: Array.isArray(source.soundboardGroups)
                ? [...new Set(source.soundboardGroups.map((g) => text(g, '')).filter(Boolean))]
                : [],
            soundGroupMap: source.soundGroupMap && typeof source.soundGroupMap === 'object'
                ? Object.fromEntries(Object.entries(source.soundGroupMap)
                    .map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v.map((g) => text(g, '')).filter(Boolean))] : []])
                    .filter(([, v]) => v.length))
                : {},
            activeFrontendGroup: text(source.activeFrontendGroup, ''),
            musicViewMode: ['backend', 'frontend'].includes(source.musicViewMode) ? source.musicViewMode : 'backend',
            musicPlaylists: (Array.isArray(source.musicPlaylists) ? source.musicPlaylists : [])
                .map((entry) => ({
                    id: text(entry?.id, ''),
                    url: text(entry?.url, ''),
                    playlistId: text(entry?.playlistId, ''),
                    title: text(entry?.title, 'Playlist'),
                    provider: text(entry?.provider, 'youtube'),
                    group: text(entry?.group, ''),
                    folder: text(entry?.folder, ''),
                    lastSyncedAt: Number(entry?.lastSyncedAt || 0) || 0,
                    trackCount: Number(entry?.trackCount || 0) || 0
                }))
                .filter((entry) => !!entry.id && !!entry.url),
            musicPortConnections: (Array.isArray(source.musicPortConnections) ? source.musicPortConnections : [])
                .map((entry) => ({
                    id: text(entry?.id, ''),
                    path: text(entry?.path, ''),
                    folder: text(entry?.folder, ''),
                    lastSyncedAt: Number(entry?.lastSyncedAt || 0) || 0,
                    trackCount: Number(entry?.trackCount || 0) || 0
                }))
                .filter((entry) => !!entry.id && !!entry.path),
            musicGroups: Array.isArray(source.musicGroups)
                ? [...new Set(source.musicGroups.map((g) => text(g, '')).filter(Boolean))]
                : [],
            musicGroupMap: source.musicGroupMap && typeof source.musicGroupMap === 'object'
                ? Object.fromEntries(Object.entries(source.musicGroupMap)
                    .map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v.map((g) => text(g, '')).filter(Boolean))] : []])
                    .filter(([, v]) => v.length))
                : {},
            activeFrontendMusicGroup: text(source.activeFrontendMusicGroup, ''),
            activeMusicFolderScope: text(source.activeMusicFolderScope, ''),
            // "Keep both" duplicate acknowledgements: sorted "idA|idB" pair keys left as separate items.
            dupDismissedPairs: Array.isArray(source.dupDismissedPairs) ? [...new Set(source.dupDismissedPairs.map((p) => text(p, '')).filter(Boolean))].slice(-2000) : [],
            // Manual music classifier definitions (names). Automatic classifiers are derived.
            musicClassifiers: Array.isArray(source.musicClassifiers)
                ? [...new Set(source.musicClassifiers.map((c) => text(c, '')).filter(Boolean))].slice(0, 200)
                : [],
            // Playlist provenance markers (⚡ Local / removed-upstream) live in the track settings
            // panel by default; flip this on to also show them on the song card.
            showPlaylistMarkersOnCard: source.showPlaylistMarkersOnCard === true,
            localizeDir: text(source.localizeDir, ''), // last folder used to save localized mp3s (reused as the prompt default)
            // Per-scope remembered localization folders, keyed "scope:key" (e.g. "folder:Chill").
            // Without this in normalize the per-scope path memory was stripped on every ensure().
            localizeScopeDirs: (source.localizeScopeDirs && typeof source.localizeScopeDirs === 'object' && !Array.isArray(source.localizeScopeDirs))
                ? Object.fromEntries(Object.entries(source.localizeScopeDirs).map(([k, v]) => [text(k), text(v)]).filter(([k, v]) => k && v))
                : {},
            hotkeyBypassCombo: text(source.hotkeyBypassCombo, ''),
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
        const hasDatapackState = Object.prototype.hasOwnProperty.call(root, 'audioflix');
        root.audioflix = normalize(hasDatapackState ? root.audioflix : fallbackRead());
        return root.audioflix;
    }

    function persistNow(reason) {
        const state = ensure();
        if (saveTimer) window.clearTimeout(saveTimer);
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
    }

    function scheduleSave(reason) {
        if (saveTimer) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => persistNow(reason), SAVE_DELAY_MS);
    }

    function syncRootOrFallback(state) {
        const root = getConfigRoot();
        if (root) root.audioflix = normalize(state);
        else fallbackWrite(state);
    }

    function update(patch, reason) {
        const state = ensure();
        Object.assign(state, patch || {});
        syncRootOrFallback(state);
        scheduleSave(reason);
        return ensure();
    }

    function replaceState(rawState, reason) {
        const next = normalize(rawState);
        const root = getConfigRoot();
        if (root) root.audioflix = next;
        if (window.config && typeof window.config === 'object' && window.config !== root) {
            window.config.audioflix = next;
        }
        fallbackWrite(next);
        scheduleSave(reason || 'audioflix-replace');
        return next;
    }

    function replaceDatapackState(rawState, reason) {
        if (rawState && typeof rawState === 'object') return replaceState(rawState, reason);
        const current = ensure();
        return replaceState(Object.assign({}, current, {
            soundboard: [],
            music: [],
            recentPlays: [],
            ports: [],
            browserFolders: [],
            portVolumes: {},
            exposedPortedSounds: {},
            portHotkeys: {},
            soundboardGroups: [],
            soundGroupMap: {},
            activeFrontendGroup: '',
            musicGroups: [],
            musicGroupMap: {},
            musicPlaylists: [],
            activeFrontendMusicGroup: '',
            activeMusicFolderScope: '',
            counters: Object.assign({}, current.counters, { plays: 0 })
        }), reason);
    }

    function addItem(type, item) {
        const state = ensure();
        const key = type === 'music' ? 'music' : 'soundboard';
        const max = type === 'music' ? MAX_MUSIC : MAX_SOUNDBOARD;
        state[key] = boundedItems([...(state[key] || []), item], type === 'music' ? 'music' : 'sound', max);
        syncRootOrFallback(state);
        scheduleSave(`audioflix-add-${type}`);
        return state[key][state[key].length - 1];
    }

    function removeItem(type, itemId) {
        const state = ensure();
        const key = type === 'music' ? 'music' : 'soundboard';
        state[key] = (state[key] || []).filter((item) => item.id !== itemId);
        syncRootOrFallback(state);
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
        const safeVolume = normalizeVolume(volume, 1);
        if (state[key]) {
            state[key] = state[key].map(entry => entry.id === itemId ? Object.assign({}, entry, { volume: safeVolume }) : entry);
        }
        state.portVolumes = state.portVolumes || {};
        state.portVolumes[itemId] = safeVolume;
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

    function setItemHotkey(type, itemId, hotkey) {
        const state = ensure();
        const key = type === 'music' ? 'music' : 'soundboard';
        if (state[key]) {
            state[key] = state[key].map(entry => entry.id === itemId ? Object.assign({}, entry, { hotkey }) : entry);
        }
        state.portHotkeys = state.portHotkeys || {};
        state.portHotkeys[itemId] = hotkey;
        scheduleSave('audioflix-hotkey');
        return ensure();
    }

    // Group + folder organization editors live in a sibling module (audioflix.state.groups.js)
    // so this store stays under the line cap; they run against the same live-state primitives.
    const groupOps = window.EveAudioflixStateGroups.create({ ensure, text, scheduleSave, syncRootOrFallback });

    window.addEventListener('pagehide', () => {
        if (saveTimer) persistNow('audioflix-pagehide');
    });

    Object.assign(ns, {
        ready: true,
        ensure,
        update,
        replaceState,
        replaceDatapackState,
        addItem,
        removeItem,
        addPort,
        removePort,
        recordPlay,
        recordGeminiAudioEvent,
        clearGeminiAudioEvents,
        normalizeVolume,
        setItemVolume,
        setItemExposed,
        setItemHotkey,
        ...groupOps,
        getSnapshot: function () { return JSON.parse(JSON.stringify(ensure())); },
        isTextBrainMode: function () { return ensure().geminiConversationMode === 'text-brain-live-voice'; }
    });
})();
