window.EveDashboardHydrationMemory = window.EveDashboardHydrationMemory || {};
(function () {
    'use strict';
    const ns = window.EveDashboardHydrationMemory;
    if (ns.markersReady) return;

    function text(value, fallback) {
        const normalized = String(value ?? '').trim();
        return normalized || String(fallback ?? '').trim();
    }
    function applyMarkerPreferences(memory) {
        if (typeof document === 'undefined' || !document.body) return;
        document.body.classList.toggle('show-hydration-card-markers', !!memory?.showCardMarkers);
        document.body.classList.toggle('show-hydration-bookmark-markers', !!memory?.showBookmarkMarkers);
    }
    function setMarkerVisibility(kind, enabled, options = {}) {
        if (typeof ns.ensureMemory !== 'function') return null;
        const memory = ns.ensureMemory();
        const normalizedKind = text(kind, '').toLowerCase();
        if (normalizedKind === 'card' || normalizedKind === 'cards') {
            memory.showCardMarkers = !!enabled;
        } else if (normalizedKind === 'bookmark' || normalizedKind === 'bookmarks') {
            memory.showBookmarkMarkers = !!enabled;
        } else {
            return memory;
        }
        applyMarkerPreferences(memory);
        if (!options.skipSave && typeof ns.scheduleSave === 'function') {
            ns.scheduleSave('dashboard-hydration-memory-markers');
        }
        return memory;
    }
    function getMarkerVisibility(kind) {
        if (typeof ns.ensureMemory !== 'function') return { card: false, bookmark: false };
        const memory = ns.ensureMemory();
        const normalizedKind = text(kind, '').toLowerCase();
        if (normalizedKind === 'card' || normalizedKind === 'cards') return !!memory.showCardMarkers;
        if (normalizedKind === 'bookmark' || normalizedKind === 'bookmarks') return !!memory.showBookmarkMarkers;
        return { card: !!memory.showCardMarkers, bookmark: !!memory.showBookmarkMarkers };
    }

    Object.assign(ns, { applyMarkerPreferences, setMarkerVisibility, getMarkerVisibility, markersReady: true });
})();
