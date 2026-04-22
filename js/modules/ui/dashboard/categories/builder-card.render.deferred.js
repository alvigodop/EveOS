window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderDeferredReady) return;

    var {
        escapeCardHtml,
        escapeCardJs,
        buildScopedCategoryKey
    } = api;

    function renderCard(catInput, catLinks, gridContainer, configOptions) {
        var options = configOptions || {};
        var cat = typeof catInput === 'object' && catInput ? catInput.category : catInput;
        if (typeof catInput === 'object' && catInput && catInput.workspaceId) {
            options._parentDashboardWorkspace = options.activeWorkspace || 'main';
            var overviewRootMap = window._eveGroupOverviewRootMap;
            var markerRouteWorkspace = overviewRootMap
                ? String(overviewRootMap.get(String(catInput.workspaceId || '')) || '').trim()
                : '';
            if (markerRouteWorkspace) {
                options._markerRouteWorkspace = markerRouteWorkspace;
            }
            options.activeWorkspace = catInput.workspaceId;
        }

        var isDetachedParkingCard = !!options.detachedParkingCard;
        var isFocusMode = !!options.focusMode;
        var HEAVY_CARD_THRESHOLD = 80;
        var shouldForceDeferredShell = !!options._forceDeferredShell;
        var hydrationDelayMs = Math.max(0, Number(options._deferredHydrationDelayMs || 0));
        var cardWorkspaceId = typeof catInput === 'object' && catInput
            ? (catInput.workspaceId || options.activeWorkspace || 'main')
            : (options.activeWorkspace || 'main');

        if (shouldForceDeferredShell || catLinks.length > HEAVY_CARD_THRESHOLD) {
            var safeCatHtml = escapeCardHtml(cat || 'Unsorted');
            var safeCatJs = escapeCardJs(cat || 'Unsorted');
            var cardTargetId = window.EveQuickPins?.buildCardTargetId
                ? window.EveQuickPins.buildCardTargetId(cardWorkspaceId, cat)
                : buildScopedCategoryKey(cardWorkspaceId, cat);
            var libraryPanelId = 'lib-' + String(cat || 'Unsorted').replace(/[^a-zA-Z0-9]/g, '_') + '-panel';

            var shellCard = document.createElement('div');
            shellCard.className = 'category-card';
            if (!isFocusMode && Array.isArray(options.collapsed) && options.collapsed.includes(cat)) {
                shellCard.classList.add('collapsed');
            }
            shellCard.setAttribute('data-card-target-id', cardTargetId);
            shellCard.setAttribute('data-card-category', String(cat || 'Unsorted'));
            shellCard.setAttribute('data-card-workspace', cardWorkspaceId);
            shellCard.setAttribute('data-card-deferred', '1');
            if (isDetachedParkingCard) {
                shellCard.setAttribute('data-detached-parking-card', '1');
            }

            shellCard.innerHTML = ''
                + '<div class="cat-progress-bg"><div class="cat-progress-fill" style="width:0%"></div></div>'
                + '<div class="category-header" oncontextmenu="showCategoryContextMenu(event, \'' + safeCatJs + '\', \'' + escapeCardJs(cardWorkspaceId) + '\')">'
                + '<div class="cat-title-group">'
                + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleCollapse(this.dataset.cat)" title="Toggle Card">&#9660;</span>'
                + '<div class="category-title-wrap" data-title="' + safeCatHtml + '">'
                + '<div class="category-title">' + safeCatHtml + '</div>'
                + '</div>'
                + '</div>'
                + '</div>'
                + '<div id="' + libraryPanelId + '" class="lib-panel" style="display:none;"></div>'
                + '<div class="eve-card-deferred-skeleton" style="padding:12px 16px; opacity:0.5;">'
                + '<div style="display:flex; align-items:center; gap:8px; color:rgba(180,200,220,0.5); font-size:0.82rem;">'
                + '<span class="eve-skeleton-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(80,200,255,0.15); border-top-color:rgba(80,200,255,0.5); border-radius:50%; animation:spin 0.8s linear infinite;"></span>'
                + 'Loading ' + catLinks.length + ' bookmarks…'
                + '</div>'
                + '</div>'
                + '<div class="category-footer"><span class="stat-pending">Tasks: …</span><span class="stat-done">…</span></div>';

            gridContainer.appendChild(shellCard);

            if (shellCard.classList.contains('collapsed')) {
                return;
            }

            var cardGen = options._renderGen;
            var MEGA_THRESHOLD = 500;
            var isMega = catLinks.length > MEGA_THRESHOLD;

            function doDeferredBuild() {
                if (cardGen != null && window._eveDashRenderGen !== cardGen) return;
                if (!shellCard.parentNode) return;
                if (shellCard.classList.contains('collapsed')) return;

                var phase1Options = isMega
                    ? Object.assign({}, configOptions, { _skipGhosts: true })
                    : configOptions;
                var tempContainer = document.createDocumentFragment();
                api._renderCardFull(cat, catLinks, tempContainer, phase1Options);
                var fullCard = tempContainer.firstChild;
                if (!fullCard) return;

                shellCard.replaceWith(fullCard);
                fullCard.style.opacity = '0';
                fullCard.style.transition = 'opacity 0.2s ease';
                requestAnimationFrame(function () {
                    fullCard.style.opacity = '1';
                });
                if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
                    var workspaceId = fullCard.getAttribute('data-card-workspace') || cardWorkspaceId;
                    window.EveFolderViewV2.restoreActiveFolderState(workspaceId, cat);
                }

                if (!isMega) return;

                setTimeout(function ghostHydrationStep() {
                    if (cardGen != null && window._eveDashRenderGen !== cardGen) return;
                    if (!fullCard.parentNode) return;

                    var ghostContainer = document.createDocumentFragment();
                    var phase2Options = Object.assign({}, configOptions, { _skipGhosts: false });
                    api._renderCardFull(cat, catLinks, ghostContainer, phase2Options);
                    var ghostCard = ghostContainer.firstChild;
                    if (ghostCard && fullCard.parentNode) {
                        fullCard.replaceWith(ghostCard);
                        if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
                            var workspaceId = ghostCard.getAttribute('data-card-workspace') || cardWorkspaceId;
                            window.EveFolderViewV2.restoreActiveFolderState(workspaceId, cat);
                        }
                    }
                }, 300);
            }

            setTimeout(doDeferredBuild, hydrationDelayMs);
            return;
        }

        api._renderCardFull(catInput, catLinks, gridContainer, configOptions);
    }

    Object.assign(api, {
        renderCard: renderCard
    });

    api.cardRenderDeferredReady = true;
})();
