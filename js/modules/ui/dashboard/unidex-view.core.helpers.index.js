window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    window.UnidexViewModules.createCoreIndexHelpers = function createCoreIndexHelpers(state) {        function getDatapackIndexApi() {
            return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        }
        function hasUsableDatapackSnapshot(indexApi) {
            if (!indexApi) return false;
            const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
            return typeof indexApi.hasUsableSnapshot === 'function'
                ? indexApi.hasUsableSnapshot()
                : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
        }
        function hasReadableDatapackLinkSnapshot(indexApi) {
            if (!indexApi) return false;
            if (typeof indexApi.hasReadableLinkSnapshot === 'function') return !!indexApi.hasReadableLinkSnapshot();
            return hasUsableDatapackSnapshot(indexApi);
        }
        function getLiveLinkCount() {
            if (typeof window.getLiveLinks === 'function') return window.getLiveLinks().length;
            if (Array.isArray(window.eveState?.links)) return window.eveState.links.length;
            if (Array.isArray(window.links)) return window.links.length;
            return 0;
        }
        function warmDatapackIndex() {
            const linkCount = getLiveLinkCount();
            if (linkCount > 3500) {
                state.datapackIndexWarmSuppressed = {
                    at: Date.now(),
                    reason: 'unidex-summary',
                    linkCount,
                    cap: 3500
                };
                window.__eveUnidexIndexWarmupSuppressed = state.datapackIndexWarmSuppressed;
                return;
            }
            const indexApi = getDatapackIndexApi();
            if (!indexApi || (typeof indexApi.ensureFresh !== 'function' && typeof indexApi.rebuild !== 'function')) return;
            if (state.datapackIndexWarmPromise) return;
            const warmPromise = typeof indexApi.ensureFresh === 'function'
                ? indexApi.ensureFresh({ reason: 'unidex-summary', allowStale: true, deferMs: 1400 })
                : indexApi.rebuild({ reason: 'unidex-summary' });
            state.datapackIndexWarmPromise = Promise.resolve(warmPromise)
                .catch(function () {
                    // Keep raw-link fallback active if the datapack spine is not ready.
                })
                .finally(function () {
                    state.datapackIndexWarmPromise = null;
                    if (typeof renderDashboard === 'function') renderDashboard();
                });
        }
        function getDatapackStructureSummary() {
            const indexApi = getDatapackIndexApi();
            if (!indexApi || typeof indexApi.getStructureSummary !== 'function') return null;
            const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
            const hasReadableStructure = typeof indexApi.hasReadableStructureSnapshot === 'function'
                ? !!indexApi.hasReadableStructureSnapshot()
                : hasUsableDatapackSnapshot(indexApi);
            if (!hasReadableStructure) {
                warmDatapackIndex();
                if (Number(buildState?.builtAt || 0) <= 0) return null;
            }
            const summary = indexApi.getStructureSummary();
            if (summary?.builtAt) return summary;
            warmDatapackIndex();
            return null;
        }
        function getAllLinks() {
            if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
            if (Array.isArray(window.eveState?.links)) return window.eveState.links;
            if (Array.isArray(window.links)) return window.links;
            if (typeof links !== 'undefined' && Array.isArray(links)) return links;
            return [];
        }
        function resolveLinkById(linkId) {
            const normalizedId = String(linkId || '').trim();
            if (!normalizedId) return null;
            const indexApi = getDatapackIndexApi();
            if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
                const resolved = indexApi.resolveBookmarkLink(normalizedId);
                if (resolved) return resolved;
            }
            return getAllLinks().find(function (link) {
                return String(link?.id || '').trim() === normalizedId;
            }) || null;
        }
        function buildLinkIdMap(sourceLinks) {
            const map = new Map();
            (Array.isArray(sourceLinks) ? sourceLinks : []).forEach(function (link) {
                const linkId = String(link?.id || '').trim();
                if (linkId) map.set(linkId, link);
            });
            return map;
        }
        function collectIndexedLinks(getIds, sourceLinks) {
            if (typeof getIds !== 'function') return null;
            const indexApi = getDatapackIndexApi();
            const linkIds = getIds();
            if (!Array.isArray(linkIds)) return null;
            const linkIdMap = buildLinkIdMap(sourceLinks);
            const resolveIndexedLink = indexApi && typeof indexApi.resolveBookmarkLink === 'function'
                ? function (linkId) { return indexApi.resolveBookmarkLink(linkId); }
                : null;
            return linkIds.map(function (linkId) {
                const normalizedId = String(linkId || '').trim();
                if (!normalizedId) return null;
                return linkIdMap.get(normalizedId) || (resolveIndexedLink ? resolveIndexedLink(normalizedId) : null) || null;
            }).filter(Boolean);
        }
        function mergePreferredLinks(preferredLinks, liveLinks) {
            const merged = [];
            const seen = new Set();
            function pushLinks(items) {
                (Array.isArray(items) ? items : []).forEach(function (link) {
                    const linkId = String(link?.id || '').trim();
                    if (!linkId || seen.has(linkId)) return;
                    seen.add(linkId);
                    merged.push(link);
                });
            }
            pushLinks(preferredLinks);
            pushLinks(liveLinks);
            return merged;
        }
        function preferIndexedLinks(indexedLinks, rawLinks) {
            if (!Array.isArray(indexedLinks)) return rawLinks;
            if (indexedLinks.length === 0 && Array.isArray(rawLinks) && rawLinks.length > 0) {
                const now = Date.now();
                if (!state.lastEmptyIndexFallbackAt || now - state.lastEmptyIndexFallbackAt > 3000) {
                    state.lastEmptyIndexFallbackAt = now;
                    warmDatapackIndex();
                }
                return rawLinks;
            }
            return indexedLinks;
        }
        function getIndexedScopedLinks(scope) {
            const indexApi = getDatapackIndexApi();
            if (!indexApi || typeof indexApi.getScopedBookmarkLinkIds !== 'function') return null;
            if (!hasReadableDatapackLinkSnapshot(indexApi)) {
                warmDatapackIndex();
                return null;
            }
            return collectIndexedLinks(function () {
                return indexApi.getScopedBookmarkLinkIds(scope || null);
            }, getAllLinks());
        }
        function getIndexedWorkspaceLinks(workspaceId) {
            const indexApi = getDatapackIndexApi();
            if (!indexApi || typeof indexApi.getExactBookmarkLinkIds !== 'function') return null;
            if (!hasReadableDatapackLinkSnapshot(indexApi)) {
                warmDatapackIndex();
                return null;
            }
            return collectIndexedLinks(function () {
                return indexApi.getExactBookmarkLinkIds({ workspaceId: workspaceId });
            }, getAllLinks());
        }
        function getIndexedAllWorkspaceLinks() {
            const indexApi = getDatapackIndexApi();
            if (!indexApi || typeof indexApi.getScopedBookmarkLinkIds !== 'function') return null;
            if (!hasReadableDatapackLinkSnapshot(indexApi)) {
                warmDatapackIndex();
                return null;
            }
            return collectIndexedLinks(function () {
                return indexApi.getScopedBookmarkLinkIds(null);
            }, getAllLinks());
        }
        return {
            getAllLinks,
            resolveLinkById,
            getDatapackStructureSummary,
            getIndexedScopedLinks,
            getIndexedWorkspaceLinks,
            getIndexedAllWorkspaceLinks,
            mergePreferredLinks,
            preferIndexedLinks
        };
    };
})();