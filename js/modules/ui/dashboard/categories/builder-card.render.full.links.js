window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};

    api.createCardLinkCollectionRenderer = function createCardLinkCollectionRenderer(context) {
        var cat = context.cat;
        var safeCatHtml = context.safeCatHtml;
        var activeWorkspaceId = context.activeWorkspaceId;
        var cardWorkspaceId = context.cardWorkspaceId;
        var options = context.options;
        var isFocusMode = context.isFocusMode;
        var customOrderEnabled = context.customOrderEnabled;
        var customOrderApi = context.customOrderApi;
        var trueValueEnabled = context.trueValueEnabled;
        var trueValueApi = context.trueValueApi;
        var trueValueData = context.trueValueData;
        var currentSortMode = context.currentSortMode;
        var progressiveBookmarkRevealEnabled = context.progressiveBookmarkRevealEnabled;
        var progressiveBookmarkRenderCap = context.progressiveBookmarkRenderCap;
        var cardProgressiveRenderBudget = context.cardProgressiveRenderBudget;
        var isFolderBookmarkProgressiveRevealEnabled = context.isFolderBookmarkProgressiveRevealEnabled;
        var isTaskEnabledForLink = context.isTaskEnabledForLink;
        var cardProgressiveRendered = 0;

        function resolveProgressiveRevealForCollection(renderContext) {
            var context = renderContext && typeof renderContext === 'object' ? renderContext : {};
            var folderId = String(context.folderId || '').trim();
            if (folderId && typeof isFolderBookmarkProgressiveRevealEnabled === 'function') {
                return !!isFolderBookmarkProgressiveRevealEnabled(activeWorkspaceId, cat, folderId);
            }
            return progressiveBookmarkRevealEnabled;
        }

        function renderLinkCollection(linksForRender, renderContext) {
            var context = renderContext && typeof renderContext === 'object' ? renderContext : {};
            var showMoreScope = String(context.folderId || '').trim()
                ? 'folder_' + String(context.folderId || '').trim()
                : (Object.prototype.hasOwnProperty.call(context, 'folderId') ? 'root' : 'card');
            var showMoreStateKey = activeWorkspaceId + '::' + cat + '::' + showMoreScope;
            var collectionProgressiveRevealEnabled = resolveProgressiveRevealForCollection(renderContext);
            var baseRenderCap = collectionProgressiveRevealEnabled
                ? progressiveBookmarkRenderCap
                : Number.MAX_SAFE_INTEGER;
            var renderCap = baseRenderCap;
            if (collectionProgressiveRevealEnabled && Number.isFinite(cardProgressiveRenderBudget)) {
                var remainingCardBudget = Math.max(0, cardProgressiveRenderBudget - cardProgressiveRendered);
                renderCap = Math.min(baseRenderCap, remainingCardBudget);
                cardProgressiveRendered += Math.min(renderCap, linksForRender.length);
            }
            if (collectionProgressiveRevealEnabled && typeof api.getProgressiveVisibleCount === 'function') {
                renderCap = api.getProgressiveVisibleCount(showMoreStateKey, renderCap, linksForRender.length, cat);
            }
            if (isFocusMode && typeof window.DashboardCategories.buildFocusedLinkHtml === 'function') {
                var cappedFocusLinks = linksForRender.slice(0, renderCap);
                var focusedHtml = cappedFocusLinks.map(function (link) {
                    return window.DashboardCategories.buildFocusedLinkHtml(link, {
                        taskMode: isTaskEnabledForLink(link),
                        taskEnabled: isTaskEnabledForLink(link)
                    });
                }).join('');

                if (!focusedHtml) {
                    focusedHtml = ''
                        + '<div class="unidex-empty-state">'
                        + '<h3>No Entries Found</h3>'
                        + '<p>No bookmarks match this filter.</p>'
                        + '</div>';
                }

                if (collectionProgressiveRevealEnabled && linksForRender.length > renderCap) {
                    focusedHtml += api.buildShowMoreButton(cat, linksForRender, renderCap, true, showMoreStateKey);
                }
                return '<section class="unidex-entries is-row-layout focused-category-entries" aria-label="' + safeCatHtml + ' bookmarks">' + focusedHtml + '</section>';
            }

            if (trueValueEnabled && trueValueApi) {
                linksForRender.forEach(function (link, index) {
                    if (typeof link._basePos !== 'number') {
                        if (customOrderEnabled && customOrderApi) {
                            var customOrderNumber = customOrderApi.getNumber(activeWorkspaceId, cat, String(link.id));
                            link._basePos = (typeof customOrderNumber === 'number') ? customOrderNumber : (index + 1);
                        } else {
                            link._basePos = index + 1;
                        }
                    }
                });
                var sectionTrueValueData = trueValueApi.computeTrueValues(linksForRender, activeWorkspaceId, cat);
                linksForRender = trueValueApi.applySorting(linksForRender, sectionTrueValueData, currentSortMode);
                trueValueData = sectionTrueValueData;
            }

            var cappedLinks = linksForRender.slice(0, renderCap);
            var dashboardWorkspaceId = options._parentDashboardWorkspace || options.activeWorkspace;
            var cardRenderWorkspaceId = String(cardWorkspaceId || options.activeWorkspace || '').trim() || 'main';
            var suppressCardWorkspaceSubtabBadge = false;
            if (dashboardWorkspaceId && cardRenderWorkspaceId && String(dashboardWorkspaceId).trim() !== cardRenderWorkspaceId) {
                var helpersForBadgeSuppression = window.EveWorkspaceHelpers;
                if (helpersForBadgeSuppression && typeof helpersForBadgeSuppression.findParent === 'function') {
                    var ancestor = helpersForBadgeSuppression.findParent(config.workspaces || [], cardRenderWorkspaceId);
                    while (ancestor) {
                        if (String(ancestor.id || '').trim() === String(dashboardWorkspaceId).trim()) {
                            suppressCardWorkspaceSubtabBadge = true;
                            break;
                        }
                        ancestor = helpersForBadgeSuppression.findParent(config.workspaces || [], ancestor.id);
                    }
                }
            }

            var flatHtml = cappedLinks.map(function (link) {
                var folderLabel = '';
                if (options.searchStr && window.EveBookmarkFolders?.buildFolderPathLabel) {
                    folderLabel = window.EveBookmarkFolders.buildFolderPathLabel(link.workspace, link.category, link.folderId);
                }
                return window.DashboardCategories.buildLinkHtml(link, options.searchStr, options.activeWorkspace, options.workspaces, {
                    dashboardWorkspaceId: dashboardWorkspaceId,
                    cardWorkspaceId: cardRenderWorkspaceId,
                    suppressCardWorkspaceSubtabBadge: suppressCardWorkspaceSubtabBadge,
                    folderLabel: folderLabel,
                    isTaskEnabled: isTaskEnabledForLink(link),
                    customOrderEnabled: customOrderEnabled,
                    customOrderWsId: activeWorkspaceId,
                    customOrderCategory: cat,
                    trueValueEnabled: trueValueEnabled,
                    trueValueData: trueValueData,
                    forceFaviconImages: !!options._forceFaviconImages
                });
            }).join('');

            if (collectionProgressiveRevealEnabled && linksForRender.length > renderCap) {
                flatHtml += api.buildShowMoreButton(cat, linksForRender, renderCap, false, showMoreStateKey);
            }

            return '<ul class="' + (options.scrollableCategories ? 'category-scrollable' : '') + '">' + flatHtml + '</ul>';
        }

        return renderLinkCollection;
    };
})();
