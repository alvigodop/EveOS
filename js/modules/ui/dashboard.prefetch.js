// --- ADJACENT TAB DATA PREFETCH ---
// Pre-computes visible links + category lists for sibling tabs during idle time.
// When the user switches to an adjacent tab, the expensive data filtering is already done.

(function () {
    'use strict';
    if (window.__evePrefetchReady) return;

    var _prefetchCache = new Map();
    var _PREFETCH_MAX = 10;
    var _prefetchIdleId = 0;
    var _prefetchGeneration = 0;

    function clearPrefetchCache() {
        _prefetchCache.clear();
        _prefetchGeneration++;
    }

    function getPrefetched(workspaceId) {
        var key = String(workspaceId || '').trim();
        return _prefetchCache.get(key) || null;
    }

    function hasPrefetched(workspaceId) {
        var key = String(workspaceId || '').trim();
        return _prefetchCache.has(key);
    }

    /**
     * Resolve the set of visible workspace IDs for a given target workspace,
     * mirroring the logic in _renderDashboardCore but without side effects.
     */
    function resolveVisibleWorkspaceIds(targetWsId, workspaces) {
        var helpers = window.EveWorkspaceHelpers;
        if (!helpers) return new Set([targetWsId]);

        var ids = new Set();
        ids.add(targetWsId);

        var activeWs = helpers.findById(workspaces, targetWsId);
        var resolvedWs = activeWs;

        // Follow linkedTo
        if (activeWs && activeWs.linkedTo) {
            var targetWs = helpers.findById(workspaces, activeWs.linkedTo);
            if (targetWs) {
                ids.add(String(targetWs.id));
                resolvedWs = targetWs;
            }
        }

        // Include visible descendants
        if (resolvedWs && !resolvedWs.hideSubTabs && Array.isArray(resolvedWs.subTabs) && resolvedWs.subTabs.length > 0) {
            helpers.getVisibleDescendantIds(resolvedWs).forEach(function (id) {
                ids.add(id);
            });
        }

        // Resolve linkedTo for sub-tabs
        var resolvedLinkedIds = new Set();
        ids.forEach(function (wsId) {
            if (wsId === targetWsId) return;
            var ws = helpers.findById(workspaces, wsId);
            if (ws && ws.linkedTo && !resolvedLinkedIds.has(ws.linkedTo)) {
                resolvedLinkedIds.add(ws.linkedTo);
                var linkedTarget = helpers.findById(workspaces, ws.linkedTo);
                if (linkedTarget) {
                    ids.add(String(linkedTarget.id));
                    if (!linkedTarget.hideSubTabs && Array.isArray(linkedTarget.subTabs) && linkedTarget.subTabs.length > 0) {
                        helpers.getVisibleDescendantIds(linkedTarget).forEach(function (descId) {
                            ids.add(descId);
                        });
                    }
                }
            }
        });

        return ids;
    }

    /**
     * Pre-compute visible links for a workspace without touching global state.
     */
    function prefetchWorkspaceData(targetWsId, workspaces, liveLinks) {
        if (_prefetchCache.has(targetWsId)) return; // already cached

        var visibleWsIds = resolveVisibleWorkspaceIds(targetWsId, workspaces);

        // Filter links belonging to this workspace's scope
        var visibleLinks = [];
        for (var i = 0; i < liveLinks.length; i++) {
            var link = liveLinks[i];
            if (visibleWsIds.has(String(link.workspace || 'main').trim())) {
                visibleLinks.push(link);
            }
        }

        // Build category-to-links index
        var linksByCatWs = new Map();
        for (var j = 0; j < visibleLinks.length; j++) {
            var vl = visibleLinks[j];
            var cat = String(vl.category || 'Unsorted').trim() || 'Unsorted';
            var ws = String(vl.workspace || 'main').trim() || 'main';
            var key = ws + '::' + cat;
            if (!linksByCatWs.has(key)) linksByCatWs.set(key, []);
            linksByCatWs.get(key).push(vl);
        }

        _prefetchCache.set(targetWsId, {
            visibleLinks: visibleLinks,
            visibleWorkspaceIds: visibleWsIds,
            linksByCatWs: linksByCatWs,
            prefetchedAt: Date.now()
        });

        // Evict oldest if over limit
        while (_prefetchCache.size > _PREFETCH_MAX) {
            var oldestKey = _prefetchCache.keys().next().value;
            _prefetchCache.delete(oldestKey);
        }
    }

    /**
     * Find adjacent (sibling) workspace IDs for the current active workspace.
     * Returns up to `maxCount` nearest siblings.
     */
    function getAdjacentWorkspaceIds(activeWsId, workspaces, maxCount) {
        var helpers = window.EveWorkspaceHelpers;
        if (!helpers || !helpers.findSiblingContext) return [];

        var ctx = helpers.findSiblingContext(workspaces, activeWsId);
        if (!ctx || !Array.isArray(ctx.siblings)) return [];

        var siblings = ctx.siblings;
        var idx = ctx.index;
        var result = [];
        var added = new Set();
        added.add(activeWsId);

        // Interleave: one after, one before, one after, one before...
        var lo = idx - 1;
        var hi = idx + 1;
        while (result.length < maxCount && (lo >= 0 || hi < siblings.length)) {
            if (hi < siblings.length && siblings[hi] && !added.has(String(siblings[hi].id))) {
                result.push(String(siblings[hi].id));
                added.add(String(siblings[hi].id));
                hi++;
            }
            if (lo >= 0 && siblings[lo] && !added.has(String(siblings[lo].id))) {
                result.push(String(siblings[lo].id));
                added.add(String(siblings[lo].id));
                lo--;
            }
            if (result.length >= maxCount) break;
            if (hi >= siblings.length && lo < 0) break;
        }

        return result;
    }

    /**
     * Schedule prefetching of adjacent tabs during browser idle time.
     * Called after a workspace switch completes rendering.
     */
    function schedulePrefetch() {
        if (_prefetchIdleId) {
            if (typeof cancelIdleCallback === 'function') {
                cancelIdleCallback(_prefetchIdleId);
            } else {
                clearTimeout(_prefetchIdleId);
            }
            _prefetchIdleId = 0;
        }

        var gen = ++_prefetchGeneration;

        var scheduleCallback = typeof requestIdleCallback === 'function'
            ? requestIdleCallback
            : function (fn) { return setTimeout(fn, 200); };

        _prefetchIdleId = scheduleCallback(function () {
            _prefetchIdleId = 0;
            if (gen !== _prefetchGeneration) return; // stale

            var activeWsId = String(
                (window.eveState && window.eveState.config && window.eveState.config.activeWorkspace)
                || (typeof config !== 'undefined' && config.activeWorkspace)
                || 'main'
            ).trim() || 'main';

            var workspaces = (window.eveState && window.eveState.config && window.eveState.config.workspaces)
                || (typeof config !== 'undefined' && config.workspaces)
                || [];

            if (!Array.isArray(workspaces) || workspaces.length === 0) return;

            var adjacentIds = getAdjacentWorkspaceIds(activeWsId, workspaces, _PREFETCH_MAX);
            if (adjacentIds.length === 0) return;

            // Get live links once (shared across all prefetch calls)
            var liveLinks = typeof getDashboardLiveLinks === 'function'
                ? getDashboardLiveLinks()
                : (typeof links !== 'undefined' && Array.isArray(links) ? links : []);

            if (liveLinks.length === 0) return;

            // Prefetch in small batches to avoid blocking
            var batchIdx = 0;
            var BATCH = 2;

            function prefetchBatch() {
                if (gen !== _prefetchGeneration) return;
                var end = Math.min(batchIdx + BATCH, adjacentIds.length);
                for (var k = batchIdx; k < end; k++) {
                    prefetchWorkspaceData(adjacentIds[k], workspaces, liveLinks);
                }
                batchIdx = end;
                if (batchIdx < adjacentIds.length) {
                    var nextSchedule = typeof requestIdleCallback === 'function'
                        ? requestIdleCallback
                        : function (fn) { return setTimeout(fn, 50); };
                    nextSchedule(prefetchBatch);
                }
            }

            prefetchBatch();
        }, { timeout: 500 });
    }

    // Invalidate prefetch on data changes
    window.addEventListener('eve:state-mutated', function (e) {
        var source = (e && e.detail && e.detail.source) ? String(e.detail.source) : '';
        if (source === 'saveConfig') return;
        clearPrefetchCache();
    });

    window.EveDashboardPrefetch = {
        getPrefetched: getPrefetched,
        hasPrefetched: hasPrefetched,
        schedulePrefetch: schedulePrefetch,
        clearCache: clearPrefetchCache
    };

    window.__evePrefetchReady = true;
})();
