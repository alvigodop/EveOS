window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { escapeCardJs } = shared;
    const nav = window.EveFolderViewV2._navigation || {};
    const { findCategoryCard, buildFreshRootContentHtml } = nav;

    window.EveFolderViewV2.exitFolder = function (event, categoryName, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const resolvedCategoryName = String(categoryName || '').trim();
        const resolvedWorkspaceId = String(workspaceId || '').trim();
        const scrollBefore = window.pageYOffset || document.documentElement.scrollTop;

        window.EveFolderViewV2.saveActiveFolderState(resolvedWorkspaceId, resolvedCategoryName, null, null, null);

        const card = findCategoryCard(resolvedWorkspaceId, resolvedCategoryName);
        if (!card) {
            if (!window._evePerfMode && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }
        if (!card.dataset.mode1Html) {
            if (!window._evePerfMode && typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        const isV1Fallback = !card.dataset.mode1Html.includes('v2-folder-root-container');
        const isHydratingFallback = card.dataset.mode1Html.includes('data-card-hydrating="1"');

        const v2Container = card.querySelector('.v2-folder-container');
        let restoredFreshRoot = false;
        if (v2Container) {
            const freshRootHtml = buildFreshRootContentHtml(resolvedWorkspaceId, resolvedCategoryName);
            restoredFreshRoot = !!freshRootHtml;
            v2Container.outerHTML = freshRootHtml || card.dataset.mode1Html;
            delete card.dataset.mode1Html;
        }

        if (typeof window.scheduleDashboardMasonryLayout === 'function') {
            window.scheduleDashboardMasonryLayout(card.parentElement || document.getElementById('dashboard-grid'));
        }

        if (Math.abs((window.pageYOffset || document.documentElement.scrollTop) - scrollBefore) > 100) {
            window.scrollTo(0, scrollBefore);
        }

        if (!restoredFreshRoot && (isV1Fallback || isHydratingFallback) && typeof window.renderDashboard === 'function') {
            window.__eveDashboardRenderHint = { immediate: true };
            window.renderDashboard();
            return;
        }

        // We do NOT rebuild the view model synchronously here to prevent UI lag on exit.
        // The root card's DOM is restored instantly from mode1Html, and the view model
        // will be naturally rebuilt during the next dashboard render or folder entry.
    };
})();
