window.EveAudioflixVolumeTarget = window.EveAudioflixVolumeTarget || {};
(function () {
    'use strict';
    const ns = window.EveAudioflixVolumeTarget;
    if (ns.ready) return;
    function kind(value) {
        if (value === 'music') return 'music';
        if (value === 'sound' || value === 'soundboard') return 'sound';
        return '';
    }
    function allows(item, options = {}) {
        // Legacy calls intentionally remain ID-only. Explicit bindings cannot cross namespaces.
        if (options.type === undefined) return true;
        const expected = kind(options.type), actual = kind(item?.type ?? item?.itemType);
        // Ported is a storage/source flag, not a namespace: music ports are still music.
        return !!expected && actual === expected;
    }
    Object.assign(ns, { ready: true, kind, allows });
})();
