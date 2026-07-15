// --- DASHBOARD CORE ---

function renderDashboard() {
    // Coalesce rapid-fire render calls into a single frame
    if (window._eveDashRenderPending) return;
    window._eveDashRenderPending = true;
    var runCoalescedRender = function () {
        window._eveDashRenderPending = false;
        window._eveDashRenderRafId = 0;
        window._eveDashRenderTimerId = 0;
        var finishPerf = window.EvePerformanceMonitor?.startOperation?.('renderDashboard', {
            source: window.__eveDashboardRenderHint?.source || window.__eveDashboardRenderHint?.kind || 'render'
        });
        _renderDashboardImmediate();
        finishPerf?.({
            dirty: !!window._evePerfMode
        });
    };
    if (document.visibilityState === 'hidden') {
        // rAF never fires while the tab is hidden, which would leave the pending flag stuck
        // and swallow every later render call. Build the DOM on a timer instead so the app
        // is already rendered the moment the tab is focused.
        window._eveDashRenderRafId = 0;
        window._eveDashRenderTimerId = window.setTimeout(runCoalescedRender, 0);
    } else {
        window._eveDashRenderTimerId = 0;
        window._eveDashRenderRafId = requestAnimationFrame(runCoalescedRender);
    }
}

window.cancelPendingDashboardRender = function cancelPendingDashboardRender() {
    if (window._eveDashRenderPending && window._eveDashRenderRafId) {
        cancelAnimationFrame(window._eveDashRenderRafId);
    }
    if (window._eveDashRenderPending && window._eveDashRenderTimerId) {
        window.clearTimeout(window._eveDashRenderTimerId);
    }
    window._eveDashRenderPending = false;
    window._eveDashRenderRafId = 0;
    window._eveDashRenderTimerId = 0;
};

function _getRobustScrollTop() {
    if (typeof window.getDashboardScrollTop === 'function') {
        return window.getDashboardScrollTop();
    }
    return Math.max(
        window.pageYOffset || 0,
        document.documentElement.scrollTop || 0,
        document.body.scrollTop || 0,
        window.scrollY || 0
    );
}

function _setRobustScrollTop(top) {
    if (typeof window.setDashboardScrollTop === 'function') {
        window.setDashboardScrollTop(top);
        return;
    }
    window.scrollTo(0, Math.max(0, Number(top || 0)));
}

function getDashboardLiveLinks() {
    if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
    if (Array.isArray(window.eveState?.links)) return window.eveState.links;
    if (Array.isArray(window.links)) return window.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function getDashboardDatapackIndexApi() {
    return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
}

function consumeDashboardRenderHint() {
    var hint = window.__eveDashboardRenderHint || null;
    window.__eveDashboardRenderHint = null;
    return hint;
}

function shouldSkipDashboardCardScrollPreserve(renderHint) {
    return !!(
        renderHint
        && renderHint.kind === 'workspace-switch'
        && String(renderHint.fromWorkspaceId || '').trim()
        && String(renderHint.toWorkspaceId || '').trim()
        && String(renderHint.fromWorkspaceId || '').trim() !== String(renderHint.toWorkspaceId || '').trim()
    );
}

function isDashboardStartupRenderHint(renderHint) {
    return !!(renderHint && renderHint.kind === 'startup');
}

function getDashboardLiveLinkMap(sourceLinks) {
    var linksList = Array.isArray(sourceLinks) ? sourceLinks : [];
    var firstId = linksList.length ? String(linksList[0]?.id || '').trim() : '';
    var lastId = linksList.length ? String(linksList[linksList.length - 1]?.id || '').trim() : '';
    if (
        _dashboardLiveLinkMapCache.ref === linksList
        && _dashboardLiveLinkMapCache.length === linksList.length
        && _dashboardLiveLinkMapCache.firstId === firstId
        && _dashboardLiveLinkMapCache.lastId === lastId
        && _dashboardLiveLinkMapCache.map instanceof Map
    ) {
        return _dashboardLiveLinkMapCache.map;
    }

    var linkMap = new Map();
    for (var i = 0; i < linksList.length; i += 1) {
        var link = linksList[i];
        var linkId = String(link?.id || '').trim();
        if (!linkId) continue;
        linkMap.set(linkId, link);
    }

    _dashboardLiveLinkMapCache = {
        ref: linksList,
        length: linksList.length,
        firstId: firstId,
        lastId: lastId,
        map: linkMap
    };
    return linkMap;
}

function hasDashboardUsableSnapshot(indexApi) {
    if (!indexApi) return false;
    if (typeof indexApi.hasUsableSnapshot === 'function') return !!indexApi.hasUsableSnapshot();
    var buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
    return !buildState?.dirty && Number(buildState?.builtAt || 0) > 0;
}

function hasDashboardReadableLinkSnapshot(indexApi) {
    if (!indexApi) return false;
    if (typeof indexApi.hasReadableLinkSnapshot === 'function') return !!indexApi.hasReadableLinkSnapshot();
    return hasDashboardUsableSnapshot(indexApi);
}

function buildDashboardVisibleLinkMatcher(visibleWorkspaceIds, searchTerms, folderPathLabelBuilder) {
    var linkedLibrarySearchCache = new Map();
    var lowercasedVisibleIds = new Set();
    if (visibleWorkspaceIds && typeof visibleWorkspaceIds.forEach === 'function') {
        visibleWorkspaceIds.forEach(function (id) {
            lowercasedVisibleIds.add(String(id || '').trim().toLowerCase());
        });
    } else if (Array.isArray(visibleWorkspaceIds)) {
        visibleWorkspaceIds.forEach(function (id) {
            lowercasedVisibleIds.add(String(id || '').trim().toLowerCase());
        });
    }

    function buildLinkedLibrarySearchText(link) {
        var linkId = String(link?.id || '').trim();
        if (!linkId || !window.EveLibrary?.ConnectionsAPI?.getLinkedEntry) return '';
        if (linkedLibrarySearchCache.has(linkId)) return linkedLibrarySearchCache.get(linkId);
        const linked = window.EveLibrary.ConnectionsAPI.getLinkedEntry(linkId);
        const entry = linked?.entry;
        if (!entry) {
            linkedLibrarySearchCache.set(linkId, '');
            return '';
        }
        const list = function (value) {
            return Array.isArray(value) ? value : String(value || '').split(/[|,;]/);
        };
        const searchText = [
            entry.title,
            entry.author,
            entry.artist,
            entry.genre,
            entry.status,
            entry.summary,
            list(entry.aliases).join(' '),
            list(entry.alternativeTitles).join(' '),
            list(entry.altTitles).join(' '),
            list(entry.titleAltNames).join(' '),
            list(entry.authorAltNames).join(' '),
            list(entry.tags).join(' ')
        ].join(' ').toLowerCase();
        linkedLibrarySearchCache.set(linkId, searchText);
        return searchText;
    }

    return function (link) {
        if (!lowercasedVisibleIds.has(String(link?.workspace || 'main').trim().toLowerCase())) return false;
        if (!searchTerms.length) return true;

        var titleStr = String(link?.title || link?.name || '').toLowerCase();
        var nameStr = String(link?.name || '').toLowerCase();
        var urlStr = String(link?.url || '').toLowerCase();
        var catStr = String(link?.category || 'Unsorted').toLowerCase();
        var folderStr = String(link?.folderId || '').toLowerCase();
        var folderLabelStr = typeof folderPathLabelBuilder === 'function'
            ? String(folderPathLabelBuilder(link?.workspace, link?.category, link?.folderId) || '').toLowerCase()
            : '';
        var notesStr = String(link?.notes || '').toLowerCase();
        var tagsStr = Array.isArray(link?.tags)
            ? link.tags.map(function (tag) { return String(tag || '').trim(); }).filter(Boolean).join(' ').toLowerCase()
            : '';
        var libraryStr = buildLinkedLibrarySearchText(link);

        return searchTerms.every(function (term) {
            return titleStr.includes(term)
                || nameStr.includes(term)
                || urlStr.includes(term)
                || catStr.includes(term)
                || folderStr.includes(term)
                || folderLabelStr.includes(term)
                || notesStr.includes(term)
                || tagsStr.includes(term)
                || libraryStr.includes(term);
        });
    };
}

