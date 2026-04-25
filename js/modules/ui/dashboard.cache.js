// --- WORKSPACE DOM CACHE ---
// Caches rendered grid+dock DOM fragments to avoid full rebuilds on tab switch-back.
// Must be loaded before dashboard.js

(function () {
    'use strict';
    if (window.__wsDomCacheReady) return;

    var _wsDomCache = new Map();
    var _WS_DOM_CACHE_MAX = 8;

    function cacheKey(workspaceId, groupOverviewId) {
        var wsId = String(workspaceId || '').trim();
        var gId = String(groupOverviewId || '').trim();
        return gId ? ('g:' + gId) : ('w:' + wsId);
    }

    function evict() {
        while (_wsDomCache.size > _WS_DOM_CACHE_MAX) {
            var oldestKey = _wsDomCache.keys().next().value;
            _wsDomCache.delete(oldestKey);
        }
    }

    function save(key, grid, dock) {
        if (!grid || !key) return;
        var gridFrag = document.createDocumentFragment();
        while (grid.firstChild) gridFrag.appendChild(grid.firstChild);
        var dockFrag = null;
        if (dock) {
            dockFrag = document.createDocumentFragment();
            while (dock.firstChild) dockFrag.appendChild(dock.firstChild);
        }
        _wsDomCache.delete(key);
        _wsDomCache.set(key, {
            gridFrag: gridFrag,
            dockFrag: dockFrag,
            savedAt: Date.now()
        });
        evict();
    }

    function restore(key, grid, dock) {
        if (!_wsDomCache.has(key)) return false;
        var entry = _wsDomCache.get(key);
        _wsDomCache.delete(key);
        if (!entry || !entry.gridFrag) return false;
        grid.appendChild(entry.gridFrag);
        if (dock && entry.dockFrag) dock.appendChild(entry.dockFrag);
        return true;
    }

    function has(key) {
        return _wsDomCache.has(key);
    }

    function clear(specificKey) {
        if (specificKey) {
            _wsDomCache.delete(specificKey);
        } else {
            _wsDomCache.clear();
        }
    }

    // Invalidate cache when bookmark data changes (edits, imports, etc.)
    // Skip saveConfig events — config changes like workspace switches don't
    // alter the card content. Renders triggered by config changes (collapse,
    // view mode) go through the full path anyway since they lack a
    // workspace-switch renderHint.
    window.addEventListener('eve:state-mutated', function (e) {
        var source = (e && e.detail && e.detail.source) ? String(e.detail.source) : '';
        if (source === 'saveConfig') return;
        clear();
    });

    window.EveDashboardCache = {
        cacheKey: cacheKey,
        save: save,
        restore: restore,
        has: has,
        clear: clear
    };

    window.__wsDomCacheReady = true;
})();
