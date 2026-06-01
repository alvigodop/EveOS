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
    var _indexWarmDelayTimer = 0;
    var _AUTO_INDEX_WARM_LINK_CAP = 3500;

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

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function hasReadableLinkSnapshot(indexApi) {
        if (!indexApi) return false;
        if (typeof indexApi.hasReadableLinkSnapshot === 'function') return !!indexApi.hasReadableLinkSnapshot();
        var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        return typeof indexApi.hasUsableSnapshot === 'function'
            ? !!indexApi.hasUsableSnapshot()
            : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    }

    function buildLiveLinkIdMap(liveLinks) {
        var map = new Map();
        (Array.isArray(liveLinks) ? liveLinks : []).forEach(function (link) {
            var linkId = String(link?.id || '').trim();
            if (linkId) map.set(linkId, link);
        });
        return map;
    }

    var _indexWarmPromise = null;

    function getLiveLinkCount() {
        if (Array.isArray(window.eveState?.links)) return window.eveState.links.length;
        if (typeof getDashboardLiveLinks === 'function') return getDashboardLiveLinks().length;
        if (Array.isArray(window.links)) return window.links.length;
        return 0;
    }

    function shouldDelayIndexWarmup() {
        if (window._eveStartupBookmarkPaintActive || window.__eveCoreDataLoading) return true;
        return getLiveLinkCount() > _AUTO_INDEX_WARM_LINK_CAP && Number(window.__eveDashboardLastRenderAt || 0) > Date.now() - 3500;
    }

    function shouldSuppressAutoIndexWarmup() {
        return getLiveLinkCount() > _AUTO_INDEX_WARM_LINK_CAP;
    }

    function scheduleDelayedIndexWarmup(reason) {
        if (_indexWarmDelayTimer || _indexWarmPromise) return;
        var requestedAt = Date.now();
        var scrollSeqAtRequest = Number(window._dashboardScrollActivitySeq || 0);
        var linkCount = getLiveLinkCount();
        if (linkCount > _AUTO_INDEX_WARM_LINK_CAP) {
            window.__eveDashboardPrefetchIndexWarmupSuppressed = {
                at: requestedAt,
                reason: String(reason || 'dashboard-prefetch'),
                linkCount: linkCount,
                cap: _AUTO_INDEX_WARM_LINK_CAP
            };
            return;
        }
        var delayMs = window._eveStartupBookmarkPaintActive || window.__eveCoreDataLoading
            ? 10400
            : 1200;
        window.__eveDashboardPrefetchIndexWarmupDelayed = {
            at: requestedAt,
            reason: String(reason || 'dashboard-prefetch'),
            delayMs: delayMs,
            linkCount: linkCount
        };
        _indexWarmDelayTimer = setTimeout(function () {
            _indexWarmDelayTimer = 0;
            var scrollChanged = Number(window._dashboardScrollActivitySeq || 0) !== scrollSeqAtRequest;
            if (scrollChanged && Date.now() - requestedAt < 30000) {
                scheduleDelayedIndexWarmup('scroll-active');
                return;
            }
            if (shouldDelayIndexWarmup()) {
                scheduleDelayedIndexWarmup(reason || 'startup-active');
                return;
            }
            warmDatapackIndex(reason || 'deferred-startup-idle', { forceNow: true });
        }, delayMs);
    }

    function warmDatapackIndex(reason, options) {
        if (!options?.forceNow && shouldSuppressAutoIndexWarmup()) {
            scheduleDelayedIndexWarmup(reason || 'dashboard-prefetch');
            return;
        }
        if (!options?.forceNow && shouldDelayIndexWarmup()) {
            scheduleDelayedIndexWarmup(reason || 'dashboard-prefetch');
            return;
        }
        var indexApi = getDatapackIndexApi();
        if (!indexApi || (typeof indexApi.ensureFresh !== 'function' && typeof indexApi.rebuild !== 'function')) return;
        if (_indexWarmPromise) return;
        var warmReason = String(reason || 'dashboard-prefetch');
        var warmPromise = typeof indexApi.ensureFresh === 'function'
            ? indexApi.ensureFresh({ reason: warmReason, allowStale: true, deferMs: 1900 })
            : indexApi.rebuild({ reason: warmReason });
        _indexWarmPromise = Promise.resolve(warmPromise)
            .catch(function () {
                // Live-link fallback remains available if the index warmup fails.
            })
            .finally(function () {
                _indexWarmPromise = null;
            });
    }

    function collectIndexedVisibleLinks(visibleWsIds, liveLinks) {
        var indexApi = getDatapackIndexApi();
        if (!indexApi || typeof indexApi.getScopedBookmarkLinkIds !== 'function' || !hasReadableLinkSnapshot(indexApi)) {
            warmDatapackIndex('dashboard-prefetch');
            return null;
        }

        var scope = visibleWsIds && visibleWsIds.size
            ? { workspaceIds: Array.from(visibleWsIds) }
            : null;
        var linkIds = indexApi.getScopedBookmarkLinkIds(scope);
        if (!Array.isArray(linkIds)) return null;

        var liveLinkIdMap = buildLiveLinkIdMap(liveLinks);
        var resolveIndexedLink = typeof indexApi.resolveBookmarkLink === 'function'
            ? function (linkId) { return indexApi.resolveBookmarkLink(linkId); }
            : null;
        var seen = new Set();
        return linkIds.map(function (linkId) {
            var normalizedId = String(linkId || '').trim();
            if (!normalizedId || seen.has(normalizedId)) return null;
            seen.add(normalizedId);
            return liveLinkIdMap.get(normalizedId) || (resolveIndexedLink ? resolveIndexedLink(normalizedId) : null) || null;
        }).filter(Boolean);
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

        var visibleLinks = collectIndexedVisibleLinks(visibleWsIds, liveLinks);
        var source = 'datapack-index';

        if (!Array.isArray(visibleLinks)) {
            source = 'live-links';
            visibleLinks = [];
            for (var i = 0; i < liveLinks.length; i++) {
                var link = liveLinks[i];
                if (visibleWsIds.has(String(link.workspace || 'main').trim())) {
                    visibleLinks.push(link);
                }
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
            source: source,
            prefetchedAt: Date.now()
        });

        // Evict oldest if over limit
        while (_prefetchCache.size > _PREFETCH_MAX) {
            var oldestKey = _prefetchCache.keys().next().value;
            _prefetchCache.delete(oldestKey);
        }
    }

    /**
     * Find nearby workspace IDs for the current active workspace.
     * Includes: children (sub-tabs), parent, and siblings — prioritized
     * in that order since those are the most likely navigation targets.
     * Returns up to `maxCount` IDs.
     */
    function getAdjacentWorkspaceIds(activeWsId, workspaces, maxCount) {
        var helpers = window.EveWorkspaceHelpers;
        if (!helpers) return [];

        var result = [];
        var added = new Set();
        added.add(activeWsId);

        function tryAdd(id) {
            var wsId = String(id || '').trim();
            if (!wsId || added.has(wsId)) return;
            if (result.length >= maxCount) return;
            added.add(wsId);
            result.push(wsId);
        }

        // 1. Children (sub-tabs) — highest priority, most likely next click
        var activeWs = helpers.findById(workspaces, activeWsId);
        if (activeWs && Array.isArray(activeWs.subTabs)) {
            for (var c = 0; c < activeWs.subTabs.length && result.length < maxCount; c++) {
                if (activeWs.subTabs[c]) tryAdd(activeWs.subTabs[c].id);
            }
        }

        // 2. Parent — second priority, common back-navigation
        var parent = helpers.findParent(workspaces, activeWsId);
        if (parent) tryAdd(parent.id);

        // 3. Siblings — fill remaining slots with nearest siblings
        if (result.length < maxCount && helpers.findSiblingContext) {
            var ctx = helpers.findSiblingContext(workspaces, activeWsId);
            if (ctx && Array.isArray(ctx.siblings)) {
                var siblings = ctx.siblings;
                var idx = ctx.index;
                var lo = idx - 1;
                var hi = idx + 1;
                while (result.length < maxCount && (lo >= 0 || hi < siblings.length)) {
                    if (hi < siblings.length && siblings[hi]) {
                        tryAdd(siblings[hi].id);
                        hi++;
                    }
                    if (lo >= 0 && siblings[lo]) {
                        tryAdd(siblings[lo].id);
                        lo--;
                    }
                    if (hi >= siblings.length && lo < 0) break;
                }
            }
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
