window.EveFolderViewV2 = window.EveFolderViewV2 || {};

(function () {
    const shared = window.EveFolderViewV2._shared || {};
    const { escapeCardHtml, escapeCardJs, cloneGhostFilterChain } = shared;

    function findCategoryCard(workspaceId, categoryName) {
        if (!categoryName) return null;
        const wsLower = String(workspaceId || 'main').trim().toLowerCase();
        const catLower = String(categoryName || 'Unsorted').trim().toLowerCase();
        const cards = document.querySelectorAll('.category-card');
        
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const cWs = (card.getAttribute('data-card-workspace') || '').trim().toLowerCase();
            const cCat = (card.getAttribute('data-card-category') || '').trim().toLowerCase();
            if ((cWs === wsLower || (!cWs && wsLower === 'main')) && cCat === catLower) {
                return card;
            }
        }
        
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const cCat = (card.getAttribute('data-card-category') || '').trim().toLowerCase();
            if (cCat === catLower) {
                return card;
            }
        }
        return null;
    }

    function getCategoryLinks(workspaceId, categoryName) {
        const scopeShared = window.EveFolderViewV2._shared || {};
        if (typeof scopeShared.getCategoryLinks === 'function') {
            return scopeShared.getCategoryLinks(workspaceId, categoryName);
        }
        const sourceLinks = typeof window.getLiveLinks === 'function'
            ? window.getLiveLinks()
            : (window.getModalLinks
                ? window.getModalLinks()
                : []);
        return (Array.isArray(sourceLinks) ? sourceLinks : []).filter((link) => (
            String(link?.workspace || 'main').trim() === String(workspaceId || 'main').trim()
            && String(link?.category || 'Unsorted').trim() === String(categoryName || 'Unsorted').trim()
        ));
    }

    function buildRootLinkRenderer(workspaceId, categoryName) {
        const resolvedWorkspaceId = String(workspaceId || 'main').trim() || 'main';
        const resolvedCategoryName = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        const folderApi = window.EveBookmarkFolders;
        const customOrderApi = window.EveCustomOrder;
        const trueValueApi = window.EveTrueValue;
        const workspaces = window.eveState?.config?.workspaces || [];
        const progressiveEnabled = typeof window.isCardBookmarkProgressiveRevealEnabled === 'function'
            ? window.isCardBookmarkProgressiveRevealEnabled(resolvedWorkspaceId, resolvedCategoryName)
            : true;
        const baseRenderCap = window._evePerfMode ? 20 : 50;
        const renderCap = progressiveEnabled
            ? baseRenderCap
            : Number.MAX_SAFE_INTEGER;

        return function renderRootLinkCollection(rootLinks, renderContext) {
            const folderId = String(renderContext?.folderId || '').trim();
            const collectionProgressiveEnabled = folderId && typeof window.isFolderBookmarkProgressiveRevealEnabled === 'function'
                ? !!window.isFolderBookmarkProgressiveRevealEnabled(resolvedWorkspaceId, resolvedCategoryName, folderId)
                : progressiveEnabled;
            const collectionRenderCap = collectionProgressiveEnabled
                ? baseRenderCap
                : Number.MAX_SAFE_INTEGER;
            let linksForRender = Array.isArray(rootLinks) ? rootLinks.slice() : [];
            const customOrderEnabled = !window._evePerfMode && customOrderApi
                ? !!customOrderApi.isEnabled(resolvedWorkspaceId, resolvedCategoryName)
                : false;
            if (customOrderEnabled && customOrderApi) {
                linksForRender.forEach(function (link, index) {
                    const linkId = String(link?.id || '');
                    const customOrderNumber = customOrderApi.getNumber(resolvedWorkspaceId, resolvedCategoryName, linkId);
                    link._basePos = (typeof customOrderNumber === 'number') ? customOrderNumber : (index + 1);
                });
                linksForRender = customOrderApi.applySorting(linksForRender, resolvedWorkspaceId, resolvedCategoryName);
            }

            const trueValueEnabled = !window._evePerfMode && trueValueApi
                ? !!trueValueApi.isEnabled(resolvedWorkspaceId, resolvedCategoryName)
                : false;
            let trueValueData = null;
            if (trueValueEnabled && trueValueApi) {
                const currentSortMode = customOrderApi ? customOrderApi.getSortMode(resolvedWorkspaceId, resolvedCategoryName) : 'none';
                trueValueData = trueValueApi.computeTrueValues(linksForRender, resolvedWorkspaceId, resolvedCategoryName);
                linksForRender = trueValueApi.applySorting(linksForRender, trueValueData, currentSortMode);
            }

            const cappedLinks = linksForRender.slice(0, collectionRenderCap);
            const flatHtml = cappedLinks.map(function (link) {
                if (typeof window.DashboardCategories?.buildLinkHtml === 'function') {
                    return window.DashboardCategories.buildLinkHtml(link, '', resolvedWorkspaceId, workspaces, {
                        dashboardWorkspaceId: resolvedWorkspaceId,
                        cardWorkspaceId: resolvedWorkspaceId,
                        suppressCardWorkspaceSubtabBadge: false,
                        folderLabel: '',
                        isTaskEnabled: typeof folderApi?.isTaskEnabledForLink === 'function'
                            ? !!folderApi.isTaskEnabledForLink(link)
                            : true,
                        customOrderEnabled,
                        customOrderWsId: resolvedWorkspaceId,
                        customOrderCategory: resolvedCategoryName,
                        trueValueEnabled,
                        trueValueData
                    });
                }
                return '<li class="item-row">' + escapeCardHtml(link?.title || link?.url || 'Untitled') + '</li>';
            }).join('');

            let showMoreHtml = '';
            if (
                collectionProgressiveEnabled
                && linksForRender.length > collectionRenderCap
                && typeof window.DashboardCategories?._builderCard?.buildShowMoreButton === 'function'
            ) {
                showMoreHtml = window.DashboardCategories._builderCard.buildShowMoreButton(
                    resolvedCategoryName,
                    linksForRender,
                    collectionRenderCap,
                    false,
                    folderId ? ('folder_' + folderId) : 'root'
                );
            }

            const scrollableClass = window.eveState?.config?.scrollableCategories ? 'category-scrollable' : '';
            return '<ul class="' + scrollableClass + '">' + flatHtml + showMoreHtml + '</ul>';
        };
    }

    function buildFreshRootContentHtml(workspaceId, categoryName) {
        const folderApi = window.EveBookmarkFolders;
        if (!folderApi?.buildFolderView || typeof window.EveFolderViewV2.renderRootGrid !== 'function') return '';
        const categoryLinks = getCategoryLinks(workspaceId, categoryName);
        // Folder exit is a user-driven state transition. Rebuild the root with
        // System Views present even in perf mode so ghost folders do not vanish
        // after navigating back from a sub-tab/parent-tab folder view.
        const skipGhosts = false;
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, categoryLinks, { skipGhosts });
        viewModel.scopedLinks = categoryLinks;
        viewModel._skipGhosts = skipGhosts;
        if (typeof window.EveFolderViewV2.setCachedViewModel === 'function') {
            window.EveFolderViewV2.setCachedViewModel(workspaceId, categoryName, viewModel);
        }
        const rootHtml = window.EveFolderViewV2.renderRootGrid(
            workspaceId,
            categoryName,
            viewModel,
            buildRootLinkRenderer(workspaceId, categoryName)
        );
        return `<div class="card-folder-view-content">${rootHtml}</div>`;
    }

    window.EveFolderViewV2._navigation = Object.assign(window.EveFolderViewV2._navigation || {}, {
        findCategoryCard,
        getCategoryLinks,
        buildRootLinkRenderer,
        buildFreshRootContentHtml
    });
})();
