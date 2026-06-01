function invalidateCategoryCardMoveViewCaches() {
    try {
        if (window.EveDashboardCache && typeof window.EveDashboardCache.clear === 'function') {
            window.EveDashboardCache.clear();
        }
    } catch (error) {
        console.warn('[Categories] Dashboard cache invalidation after card move failed:', error);
    }
    try {
        if (window.EveDashboardPrefetch && typeof window.EveDashboardPrefetch.clearCache === 'function') {
            window.EveDashboardPrefetch.clearCache();
        }
    } catch (error) {
        console.warn('[Categories] Dashboard prefetch invalidation after card move failed:', error);
    }
}

function scheduleCategoryCardMoveRefresh(sourceWs, sourceCat, targetWs, targetCat, options) {
    var opts = options || {};
    var activeWorkspaceId = normalizeCategoryWorkspaceId(window.eveState?.config?.activeWorkspace || (typeof config !== 'undefined' ? config.activeWorkspace : 'main'));
    var shouldRefreshDashboard = activeWorkspaceId === sourceWs || activeWorkspaceId === targetWs || !!opts.forceRender;
    var activeSourceOnly = activeWorkspaceId === sourceWs && activeWorkspaceId !== targetWs && !opts.forceRender;
    var activeTarget = activeWorkspaceId === targetWs || !!opts.forceRender;
    var movedLinkCount = Math.max(0, Number(opts.movedLinkCount || opts.linkCount || 0) || 0);
    var liveLinkCount = Array.isArray(window.eveState?.links) ? window.eveState.links.length : getCategoryLiveLinks().length;
    var isLargeDashboard = !!window._eveMegaPerfMode || liveLinkCount > 1500;
    var largeDashboardRenderDelay = 4200;
    if (liveLinkCount > 8000) {
        largeDashboardRenderDelay = activeSourceOnly ? 18000 : (activeTarget ? 1200 : 9000);
    } else if (liveLinkCount > 4500) {
        largeDashboardRenderDelay = activeSourceOnly ? 12000 : (activeTarget ? 900 : 7000);
    } else if (liveLinkCount > 1500) {
        largeDashboardRenderDelay = activeSourceOnly ? 7200 : (activeTarget ? 700 : 4200);
    }
    var defaultRenderDelay = isLargeDashboard
        ? largeDashboardRenderDelay
        : (movedLinkCount > 100 ? 900 : 650);
    var renderDelayMs = Math.max(300, Number(opts.renderDelayMs || defaultRenderDelay) || defaultRenderDelay);
    if (activeTarget && !activeSourceOnly && !opts.forceSlowRender) {
        renderDelayMs = Math.min(renderDelayMs, movedLinkCount > 500 ? 520 : 220);
    }
    var skipFullRenderAfterSourceRemoval = activeSourceOnly && isLargeDashboard && !opts.forceRender;
    var renderFn = function () {
        if (!shouldRefreshDashboard || typeof renderDashboard !== 'function') return;
        var remainingMutationMs = Math.max(0, Number(window.__eveLargeMutationActiveUntil || 0) - Date.now());
        var canRenderActiveTarget = activeTarget && !activeSourceOnly;
        if (remainingMutationMs > 80 && !opts.forceRender && !canRenderActiveTarget) {
            setTimeout(renderFn, Math.min(remainingMutationMs + 40, 1800));
            return;
        }
        window.__eveDashboardRenderHint = {
            kind: 'data-mutation',
            source: 'category-card-move',
            workspaceId: sourceWs,
            targetWorkspaceId: targetWs,
            categoryName: sourceCat,
            targetCategoryName: targetCat
        };
        renderDashboard();
    };

    if (shouldRefreshDashboard && activeSourceOnly) {
        try {
            var sourceCard = findCategoryCard(sourceWs, sourceCat);
            if (sourceCard) {
                sourceCard.classList.add('category-card-moving-out');
                setTimeout(function () {
                    if (sourceCard && sourceCard.parentNode) sourceCard.remove();
                    var grid = document.getElementById('dashboard-grid');
                    if (grid && typeof window.scheduleDashboardMasonryLayout === 'function') {
                        window.scheduleDashboardMasonryLayout(grid);
                    }
                }, 80);
            }
        } catch (error) {
            // Direct DOM cleanup is a best-effort responsiveness path; scheduled render remains authoritative.
        }
    }

    if (typeof renderSidebar === 'function') {
        setTimeout(function () {
            try { renderSidebar(); } catch (error) { console.warn('[Categories] Sidebar refresh after card move failed:', error); }
        }, 80);
    }

    // Large card moves should not immediately kick the favicon queue while the
    // dashboard is still rebuilding. The normal refresh path resumes shortly.
    window.__eveSuppressFaviconRefreshUntil = Math.max(
        Number(window.__eveSuppressFaviconRefreshUntil || 0),
        Date.now() + (skipFullRenderAfterSourceRemoval ? 2400 : (activeTarget ? Math.max(900, renderDelayMs + 450) : Math.max(1200, renderDelayMs + 900)))
    );
    window.__eveLargeMutationActiveUntil = Math.max(
        Number(window.__eveLargeMutationActiveUntil || 0),
        Date.now() + (skipFullRenderAfterSourceRemoval ? 3200 : (activeTarget ? Math.max(1200, renderDelayMs + 700) : Math.max(2800, renderDelayMs + 2200)))
    );

    // requestIdleCallback can fire immediately after the data move, which puts
    // a full dashboard rebuild back inside the drag/drop transaction.
    if (!skipFullRenderAfterSourceRemoval) {
        setTimeout(renderFn, renderDelayMs);
    }
}

function syncMovedCategoryLibraryLinks(linkIds, source, defer) {
    var ids = Array.from(new Set((Array.isArray(linkIds) ? linkIds : [])
        .map(function (id) { return String(id || '').trim(); })
        .filter(Boolean)));
    if (!ids.length || !window.EveLibrary?.ConnectionsAPI) return;

    var runSync = function () {
        var syncResult = null;
        var usedFallback = false;
        var finishPerf = window.EvePerformanceMonitor?.startOperation?.('category-library-sync', {
            source: source || 'category-card-move',
            linkCount: ids.length,
            deferred: !!defer
        });
        try {
            if (typeof window.EveLibrary.ConnectionsAPI.syncFromLinks === 'function') {
                syncResult = window.EveLibrary.ConnectionsAPI.syncFromLinks(ids, {
                    source: source || 'category-card-move',
                    deferEvents: true,
                    async: !!defer,
                    chunkSize: 8,
                    timeoutMs: 900
                });
            } else if (typeof window.EveLibrary.ConnectionsAPI.syncFromLink === 'function') {
                usedFallback = true;
                ids.forEach(function (linkId) {
                    window.EveLibrary.ConnectionsAPI.syncFromLink(linkId, {
                        source: source || 'category-card-move',
                        deferEvents: true
                    });
                });
            }
        } finally {
            window.__eveLastCategoryLibrarySync = {
                at: Date.now(),
                linkCount: ids.length,
                deferred: !!defer,
                fallback: usedFallback,
                scheduled: !!syncResult?.scheduled,
                checked: Number(syncResult?.checked || 0) || ids.length,
                changed: Number(syncResult?.changed || 0) || 0,
                moved: Number(syncResult?.moved || 0) || 0
            };
            finishPerf?.({
                linkCount: ids.length,
                scheduled: !!syncResult?.scheduled,
                checked: Number(syncResult?.checked || 0) || ids.length,
                fallback: usedFallback
            });
        }
    };

    if (!defer) {
        runSync();
        return;
    }
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(runSync, { timeout: 1600 });
    } else {
        setTimeout(runSync, 80);
    }
}

function moveCategoryCardToWorkspace(sourceWorkspaceId, categoryName, targetWorkspaceId, options) {
    options = options || {};
    var sourceWs = normalizeCategoryWorkspaceId(sourceWorkspaceId);
    var sourceCat = normalizeCategoryNameValue(categoryName);
    var targetWs = normalizeCategoryWorkspaceId(targetWorkspaceId);
    var targetCat = normalizeCategoryNameValue(options.targetCategoryName || sourceCat);
    if (!sourceCat || sourceWs === targetWs) return false;

    var targetName = options.targetWorkspaceName || '';
    var targetExists = categoryHasContentInWorkspace(targetWs, targetCat);

    function applyCardMove() {
        var finishPerf = window.EvePerformanceMonitor?.startOperation?.('category-card-move', {
            source: options.source || 'category-card-move',
            workspaceId: sourceWs,
            targetWorkspaceId: targetWs,
            categoryName: sourceCat,
            targetCategoryName: targetCat
        });
        var liveLinks = getCategoryLiveLinks();
        var sourceLinks = liveLinks.filter(function (link) {
            return normalizeCategoryWorkspaceId(link?.workspace).toLowerCase() === sourceWs.toLowerCase()
                && normalizeCategoryNameValue(link?.category).toLowerCase() === sourceCat.toLowerCase();
        });
        var mutationHoldMs = (liveLinks.length > 8000 || sourceLinks.length > 1500)
            ? 4200
            : (sourceLinks.length > 250 ? 2400 : 1400);
        window.__eveLargeMutationActiveUntil = Math.max(
            Number(window.__eveLargeMutationActiveUntil || 0),
            Date.now() + mutationHoldMs
        );

        if (window.EveBookmarkFolders?.transferCategoryFolders) {
            window.EveBookmarkFolders.transferCategoryFolders(sourceWs, sourceCat, targetWs, targetCat, { persist: false });
        }

        var mergeApi = window.EveBookmarkMerge;
        var duplicateLookup = mergeApi && typeof mergeApi.buildDuplicateLookupForScope === 'function'
            ? mergeApi.buildDuplicateLookupForScope(liveLinks, {
                workspaceId: targetWs,
                categoryName: targetCat
            })
            : null;
        var movedIds = [];
        var mergedIds = [];
        var removedIds = [];
        sourceLinks.forEach(function (link) {
            if (!link) return;
            var folderId = String(link.folderId || '').trim();
            if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                var result = mergeApi.moveOrMergeLinkToScope(link, {
                    workspaceId: targetWs,
                    categoryName: targetCat,
                    folderId: folderId
                }, {
                    source: options.source || 'category-card-move',
                    links: liveLinks,
                    duplicateLookup: duplicateLookup,
                    deferLibrarySync: true
                });
                if (result?.targetId) movedIds.push(String(result.targetId));
                if (result?.merged && result.targetId) mergedIds.push(String(result.targetId));
                if (Array.isArray(result?.removedIds)) removedIds.push.apply(removedIds, result.removedIds.map(String));
                if (duplicateLookup && typeof mergeApi.addLinkToDuplicateLookup === 'function') {
                    var lookupTarget = result?.targetId
                        ? liveLinks.find(function (candidate) { return String(candidate?.id || '') === String(result.targetId); })
                        : link;
                    mergeApi.addLinkToDuplicateLookup(duplicateLookup, lookupTarget || link);
                }
                return;
            }
            link.workspace = targetWs;
            link.category = targetCat;
            movedIds.push(String(link.id));
            if (duplicateLookup && typeof mergeApi?.addLinkToDuplicateLookup === 'function') {
                mergeApi.addLinkToDuplicateLookup(duplicateLookup, link);
            }
        });

        setCategoryLiveLinks(liveLinks);
        invalidateCategoryCardMoveViewCaches();
        syncMovedCategoryLibraryLinks(
            movedIds,
            options.source || 'category-card-move',
            sourceLinks.length > 20 || liveLinks.length > 1500
        );
        transferCategoryScopedConfig(sourceWs, sourceCat, targetWs, targetCat);

        if (window.EveCategoryOrder?.removeCategory) window.EveCategoryOrder.removeCategory(sourceWs, sourceCat);
        if (window.EveCategoryOrder?.ensureCategory) window.EveCategoryOrder.ensureCategory(targetWs, targetCat);
        if (options.targetPositionCategoryName && window.EveCategoryOrder?.moveCategoryToPosition && window.EveCategoryOrder?.getOrder) {
            var order = window.EveCategoryOrder.getOrder(targetWs, { persist: true });
            var targetIndex = Array.isArray(order) ? order.indexOf(String(options.targetPositionCategoryName)) : -1;
            if (targetIndex >= 0) window.EveCategoryOrder.moveCategoryToPosition(targetWs, targetCat, targetIndex + 1);
        }

        var moveMutationMeta = {
            kind: 'category-card-move',
            workspaceId: sourceWs,
            categoryName: sourceCat,
            dataDelta: {
                kind: 'core-data-delta',
                complete: true,
                workspaceIds: [sourceWs, targetWs],
                categoryNames: [sourceCat, targetCat],
                linkIds: movedIds,
                removedLinkIds: removedIds,
                affectedScopes: [
                    { workspaceId: sourceWs, categoryName: sourceCat },
                    { workspaceId: targetWs, categoryName: targetCat }
                ],
                hasFolderStoreChanges: true
            }
        };
        var indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        if (indexApi && typeof indexApi.markDirty === 'function') {
            indexApi.markDirty(options.source || 'category-card-move', moveMutationMeta);
        }
        if (window.EveFolderViewV2?.invalidateCachedViewModel) {
            window.EveFolderViewV2.invalidateCachedViewModel(sourceWs, sourceCat);
            window.EveFolderViewV2.invalidateCachedViewModel(targetWs, targetCat);
        }

        if (typeof saveConfig === 'function') {
            saveConfig({
                immediate: true,
                source: options.source || 'category-card-move',
                meta: {
                    workspaceId: sourceWs,
                    categoryName: sourceCat,
                    targetWorkspaceId: targetWs,
                    targetCategoryName: targetCat
                }
            });
        }
        if (typeof saveData === 'function') {
            saveData({
                immediate: true,
                skipRender: true,
                skipSuggestions: true,
                source: options.source || 'category-card-move',
                meta: {
                    workspaceId: sourceWs,
                    categoryName: sourceCat,
                    targetWorkspaceId: targetWs,
                    targetCategoryName: targetCat,
                    linkIds: movedIds,
                    mergedLinkIds: mergedIds,
                    removedLinkIds: removedIds,
                    dataDelta: moveMutationMeta.dataDelta,
                    editHistory: {
                        scopedOnly: true,
                        cards: true,
                        workspaces: false,
                        folders: false,
                        bookmarks: false
                    }
                }
            });

            // Force synchronous push to modular state sync backend immediately
            if (window.EveDataStore?._modularSync && typeof window.EveDataStore._modularSync.pushLocalState === 'function') {
                window.EveDataStore._modularSync.pushLocalState(true);
            }

            scheduleCategoryCardMoveRefresh(sourceWs, sourceCat, targetWs, targetCat, Object.assign({}, options, {
                movedLinkCount: sourceLinks.length
            }));
        } else if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
        finishPerf?.({
            linkCount: sourceLinks.length,
            movedCount: movedIds.length,
            mergedCount: mergedIds.length,
            removedCount: removedIds.length
        });
        return true;
    }

    if (options.requireConfirm !== false) {
        var confirmation = requestCategoryCardMoveConfirm(sourceCat, targetName, targetWs, targetExists);
        if (confirmation && typeof confirmation.then === 'function') {
            return confirmation.then(function (confirmed) {
                return confirmed ? applyCardMove() : false;
            });
        }
        if (!confirmation) return false;
    }

    return applyCardMove();
}

window.moveCategoryCardToWorkspace = moveCategoryCardToWorkspace;
