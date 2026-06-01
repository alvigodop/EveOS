function scheduleDashboardFaviconRefresh(reason, options) {
    if (!window.EveFaviconCache || typeof window.EveFaviconCache.refreshRendered !== 'function') return;
    var normalizedReason = reason || 'dashboard-render';
    if (Date.now() < Number(window.__eveSuppressFaviconRefreshUntil || 0)) {
        window.EvePerformanceMonitor?.recordOperation?.('favicon-refresh', 0, {
            reason: normalizedReason,
            suppressed: true
        });
        return;
    }
    var opts = options || {};
    var renderedImageCount = typeof document !== 'undefined' && document.images
        ? Number(document.images.length || 0)
        : 0;
    if (renderedImageCount > 2500 && !opts.force) {
        window.EvePerformanceMonitor?.recordOperation?.('favicon-refresh', 0, {
            reason: normalizedReason,
            suppressed: true,
            total: renderedImageCount
        });
        return;
    }
    if ((window._evePerfMode || window._eveMegaPerfMode) && !opts.force) {
        window.EvePerformanceMonitor?.recordOperation?.('favicon-refresh', 0, {
            reason: normalizedReason,
            suppressed: true
        });
        return;
    }
    var finishPerf = window.EvePerformanceMonitor?.startOperation?.('favicon-refresh', {
        reason: normalizedReason
    });
    window.EveFaviconCache.refreshRendered({
        reason: normalizedReason,
        delayMs: opts.delayMs,
        maxFetch: opts.maxFetch,
        maxUpdate: opts.maxUpdate
    }).then(function (result) {
        finishPerf?.({
            updated: result?.updated || 0,
            queued: result?.queued || 0,
            scanned: result?.scanned || 0,
            total: result?.total || 0,
            aborted: !!result?.aborted,
            suppressed: !!result?.suppressed
        });
    }).catch(function (error) {
        finishPerf?.({ source: 'error' });
        console.warn('[Dashboard] Favicon refresh failed:', error);
    });
}

function mergeDashboardPreferredLinks(preferredLinks, liveLinks) {
    var merged = [];
    var seen = new Set();

    function pushLinks(items) {
        (Array.isArray(items) ? items : []).forEach(function (link) {
            var linkId = String(link?.id || '').trim();
            if (!linkId || seen.has(linkId)) return;
            seen.add(linkId);
            merged.push(link);
        });
    }

    pushLinks(preferredLinks);
    pushLinks(liveLinks);
    return merged;
}

function restoreDashboardOpenLibrarySurface(surface) {
    if (!surface || surface.kind !== 'card-library') return;
    var categoryName = String(surface.categoryName || '').trim();
    if (!categoryName) return;
    var panelId = 'lib-' + categoryName.replace(/[^a-zA-Z0-9]/g, '_') + '-panel';
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var parentCard = panel.closest('.category-card');
    var isFocusedCard = !!parentCard?.classList.contains('is-focus-mode');
    panel.style.display = 'block';
    if (!isFocusedCard) {
        panel.style.maxHeight = 'min(74vh, 760px)';
        panel.style.overflow = '';
        panel.style.overflowX = 'hidden';
        panel.style.overflowY = 'auto';
        panel.style.overscrollBehavior = 'auto';
    }
    if (parentCard) {
        parentCard.classList.add('has-library-expanded');
        if (isFocusedCard) parentCard.classList.add('focus-library-expanded');
    }
    wireDashboardOpenLibrarySurfaceScrollBridge(panel);
    if (!panel.children.length && window.EveLibrary?.UI?.initLibraryPanel) {
        window.EveLibrary.UI.initLibraryPanel(categoryName);
    }
    window.__eveOpenCardLibrarySurface = {
        kind: 'card-library',
        categoryName: categoryName,
        cardTargetId: String(parentCard?.getAttribute('data-card-target-id') || surface.cardTargetId || ''),
        isFocusedCard: isFocusedCard,
        panel: panel,
        openedAt: surface.openedAt || Date.now()
    };
}

function wireDashboardOpenLibrarySurfaceScrollBridge(panel) {
    if (!panel || panel.dataset.dashboardLibraryScrollBridge === '1') return;
    panel.dataset.dashboardLibraryScrollBridge = '1';
    panel.addEventListener('wheel', function (event) {
        if (typeof window.noteDashboardUserScrollActivity === 'function') {
            window.noteDashboardUserScrollActivity({ force: true });
        }
        var deltaY = Number(event?.deltaY || 0);
        if (!deltaY) return;
        var parentCard = panel.closest('.category-card');
        var isNormalCardLibrary = !!parentCard && !parentCard.classList.contains('is-focus-mode');
        if (isNormalCardLibrary) {
            event.preventDefault();
            var scrollHost = typeof window.getDashboardNearestScrollHost === 'function'
                ? window.getDashboardNearestScrollHost(panel, { skipNode: panel })
                : null;
            var pageTop = scrollHost
                ? Number(scrollHost.scrollTop || 0)
                : (typeof window.getDashboardScrollTop === 'function'
                    ? window.getDashboardScrollTop()
                    : (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0));
            if (scrollHost && scrollHost !== document.body && scrollHost !== document.documentElement) {
                scrollHost.scrollTop = Math.max(0, pageTop + deltaY);
            } else if (typeof window.setDashboardScrollTop === 'function') {
                window.setDashboardScrollTop(pageTop + deltaY);
            } else {
                window.scrollTo(0, pageTop + deltaY);
            }
            return;
        }
        var panelCanScroll = panel.scrollHeight > panel.clientHeight + 2;
        if (!panelCanScroll) return;
        var atTop = panel.scrollTop <= 1;
        var atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
        var shouldHandOff = (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
        if (!shouldHandOff) return;
        var scrollHost = typeof window.getDashboardPrimaryScrollHost === 'function'
            ? window.getDashboardPrimaryScrollHost()
            : (document.scrollingElement || document.documentElement || document.body);
        if (!scrollHost || scrollHost === panel) return;
        event.preventDefault();
        var currentTop = typeof window.getDashboardScrollTop === 'function'
            ? window.getDashboardScrollTop()
            : (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);
        if (typeof window.setDashboardScrollTop === 'function') {
            window.setDashboardScrollTop(currentTop + deltaY);
        } else {
            window.scrollTo(0, currentTop + deltaY);
        }
    }, { passive: false, capture: true });
}

function scheduleDashboardOpenLibrarySurfaceRestore(surface) {
    if (!surface || surface.kind !== 'card-library') return;
    window.requestAnimationFrame(function () {
        restoreDashboardOpenLibrarySurface(surface);
    });
    window.setTimeout(function () {
        restoreDashboardOpenLibrarySurface(surface);
    }, 120);
    window.setTimeout(function () {
        restoreDashboardOpenLibrarySurface(surface);
    }, 320);
}

function hasDashboardOpenCardLibrarySurface(surface) {
    return !!(surface && surface.kind === 'card-library');
}

function shouldDashboardProtectLibrarySurfaceScroll(surface) {
    if (!hasDashboardOpenCardLibrarySurface(surface)) return false;
    if (typeof window.isDashboardFocusedCardLibrarySurface === 'function') {
        return window.isDashboardFocusedCardLibrarySurface(surface);
    }
    return surface.isFocusedCard === true;
}

function getDashboardLibrarySurfaceScrollProtectionMs(surface) {
    if (!hasDashboardOpenCardLibrarySurface(surface)) return 0;
    if (shouldDashboardProtectLibrarySurfaceScroll(surface)) return 700;
    if (typeof window.isDashboardInlineCardLibrarySurface === 'function' && window.isDashboardInlineCardLibrarySurface(surface)) {
        return 80;
    }
    return surface.isFocusedCard === false ? 80 : 0;
}

function isDashboardInlineLibrarySurfaceForRender(surface) {
    if (!hasDashboardOpenCardLibrarySurface(surface)) return false;
    if (typeof window.isDashboardInlineCardLibrarySurface === 'function') {
        return window.isDashboardInlineCardLibrarySurface(surface);
    }
    return surface.isFocusedCard === false;
}

function findDashboardCardByTargetId(targetId) {
    var normalized = String(targetId || '').trim();
    if (!normalized) return null;
    return document.querySelector('.category-card[data-card-target-id="' + normalized.replace(/["\\]/g, '\\$&') + '"]');
}

function captureDashboardInlineLibraryViewportAnchor(surface) {
    if (!isDashboardInlineLibrarySurfaceForRender(surface)) return null;
    var panel = typeof window.getDashboardLibrarySurfacePanel === 'function'
        ? window.getDashboardLibrarySurfacePanel(surface)
        : surface.panel;
    var card = panel?.closest('.category-card') || findDashboardCardByTargetId(surface.cardTargetId);
    var targetId = String(card?.getAttribute('data-card-target-id') || surface.cardTargetId || '').trim();
    if (!card || !targetId) return null;
    return {
        cardTargetId: targetId,
        top: card.getBoundingClientRect().top,
        scrollSeq: Number(window._dashboardScrollActivitySeq || 0)
    };
}

function restoreDashboardInlineLibraryViewportAnchor(anchor) {
    if (!anchor || Number(window._dashboardScrollActivitySeq || 0) !== anchor.scrollSeq) return;
    var card = findDashboardCardByTargetId(anchor.cardTargetId);
    if (!card) return;
    var currentTop = card.getBoundingClientRect().top;
    var delta = currentTop - Number(anchor.top || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) <= 2) return;
    markDashboardProgrammaticScrollWindow(24);
    _setRobustScrollTop(_getRobustScrollTop() + delta);
}

function scheduleDashboardInlineLibraryViewportAnchorRestore(anchor) {
    if (!anchor) return;
    requestAnimationFrame(function () {
        restoreDashboardInlineLibraryViewportAnchor(anchor);
    });
    setTimeout(function () {
        restoreDashboardInlineLibraryViewportAnchor(anchor);
    }, 120);
    setTimeout(function () {
        restoreDashboardInlineLibraryViewportAnchor(anchor);
    }, 320);
}

function collectIndexedDashboardVisibleLinks(sourceLinks, scope, matcher) {
    var indexApi = getDashboardDatapackIndexApi();
    if (!indexApi || typeof indexApi.getScopedBookmarkLinkIds !== 'function' || !hasDashboardReadableLinkSnapshot(indexApi)) {
        return null;
    }

    var liveLinkMap = getDashboardLiveLinkMap(sourceLinks);
    var resolveIndexedLink = typeof indexApi.resolveBookmarkLink === 'function'
        ? function (linkId) { return indexApi.resolveBookmarkLink(linkId); }
        : null;

    return indexApi.getScopedBookmarkLinkIds(scope || null).map(function (linkId) {
        var normalizedId = String(linkId || '').trim();
        if (!normalizedId) return null;
        return liveLinkMap.get(normalizedId) || (resolveIndexedLink ? resolveIndexedLink(normalizedId) : null) || null;
    }).filter(function (link) {
        return !!link && (!matcher || matcher(link));
    });
}

