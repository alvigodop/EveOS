window.EveAudioflixPlaylistProviders = window.EveAudioflixPlaylistProviders || {};
(function () {
    'use strict';

    const ns = window.EveAudioflixPlaylistProviders;
    if (ns.ready) return;

    const providers = new Map();
    const text = (value) => String(value ?? '').trim();

    function register(id, adapter) {
        const key = text(id).toLowerCase();
        if (!key || !adapter || typeof adapter !== 'object') return false;
        providers.set(key, { ...adapter, id: key });
        return true;
    }

    function get(id) {
        return providers.get(text(id).toLowerCase()) || providers.get('youtube');
    }

    function detect(value) {
        for (const adapter of providers.values()) {
            if (adapter.id !== 'youtube' && adapter.detect?.(value)) return adapter.id;
        }
        return 'youtube';
    }

    function normalize(id, value) {
        const adapter = get(id);
        if (!adapter) return { ok: false, reason: `Unknown playlist provider: ${id}` };
        if (typeof adapter.normalize === 'function') return adapter.normalize(value);
        const url = text(value);
        return url ? { ok: true, url } : { ok: false, reason: 'Enter a playlist source.' };
    }

    async function fetchPlaylist(id, value, force, options = {}) {
        const adapter = get(id);
        if (!adapter?.fetchPlaylist) return { ok: false, reason: `Playlist provider "${id}" cannot sync.` };
        return adapter.fetchPlaylist(value, force, options);
    }

    function entryPatch(id, entry) {
        return get(id)?.entryPatch?.(entry) || {};
    }

    function connectionPatch(id, payload) {
        return get(id)?.connectionPatch?.(payload) || {};
    }

    register('youtube', {
        label: 'YouTube',
        fetchPlaylist(value, force) {
            return window.EveAudioflixNative?.listPlaylist?.(value, force);
        }
    });

    Object.assign(ns, {
        ready: true,
        register,
        get,
        detect,
        normalize,
        fetchPlaylist,
        entryPatch,
        connectionPatch,
        list: () => [...providers.keys()]
    });
})();
