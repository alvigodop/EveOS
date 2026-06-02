window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    if (api.cardRenderDeferredReady) return;

    var {
        escapeCardHtml,
        escapeCardJs,
        buildScopedCategoryKey
    } = api;
    var cardHeightCache = api._cardHeightCache = api._cardHeightCache || {};

    function buildCardHeightCacheKey(workspaceId, categoryName) {
        return buildScopedCategoryKey(workspaceId || 'main', categoryName || 'Unsorted');
    }

    function resolveDeferredLinkCount(catLinks, options) {
        var configuredCount = Number(options?._deferredLinkCount);
        if (Number.isFinite(configuredCount) && configuredCount >= 0) {
            return configuredCount;
        }
        return Array.isArray(catLinks) ? catLinks.length : 0;
    }

    function resolveDeferredCardLinks(catLinks, options) {
        if (Array.isArray(catLinks) && catLinks.length > 0) {
            return catLinks;
        }
        var loader = options?._deferredLinksLoader;
        if (typeof loader === 'function') {
            var loadedLinks = loader();
            return Array.isArray(loadedLinks) ? loadedLinks : [];
        }
        return Array.isArray(catLinks) ? catLinks : [];
    }

    function estimateDeferredShellMinHeight(workspaceId, categoryName, catLinks, options) {
        var cacheKey = buildCardHeightCacheKey(workspaceId, categoryName);
        var cachedHeight = Number(cardHeightCache[cacheKey] || 0);
        if (cachedHeight > 0) {
            return Math.max(160, cachedHeight);
        }

        var linkCount = resolveDeferredLinkCount(catLinks, options);
        var estimate = 170 + Math.min(1500, linkCount * 14);
        if (options?.detachedParkingCard) estimate += 120;

        var folderModeApi = window.EveFolderViewV2;
        var isFolderMode = typeof folderModeApi?.isManhwaModeEnabled === 'function'
            ? !!folderModeApi.isManhwaModeEnabled(workspaceId, categoryName)
            : false;
        if (isFolderMode) estimate += 220;

        var activeFolderKey = String(workspaceId || 'main').trim() + '::' + String(categoryName || 'Unsorted').trim();
        if (window.eveState?.config?.activeManhwaFolders?.[activeFolderKey]) {
            estimate += 320;
        }

        return Math.max(200, Math.min(2200, estimate));
    }

    function applyCardPlaceholderSizing(cardNode, workspaceId, categoryName, catLinks, options) {
        if (!cardNode || !cardNode.style) return 0;
        var placeholderHeight = estimateDeferredShellMinHeight(workspaceId, categoryName, catLinks, options);
        cardNode.style.containIntrinsicSize = 'auto ' + placeholderHeight + 'px';
        if (placeholderHeight >= 900) {
            cardNode.style.contentVisibility = 'visible';
            cardNode.setAttribute('data-card-heavy-layout', '1');
        } else {
            cardNode.style.removeProperty('content-visibility');
            cardNode.removeAttribute('data-card-heavy-layout');
        }
        return placeholderHeight;
    }

    function captureRenderedCardHeight(cardNode, workspaceId, categoryName) {
        if (!cardNode || !cardNode.isConnected) return;
        var cacheKey = buildCardHeightCacheKey(workspaceId, categoryName);

        function commitHeightMeasurement() {
            if (!cardNode || !cardNode.isConnected) return;
            var measuredHeight = Math.ceil(cardNode.getBoundingClientRect?.().height || cardNode.offsetHeight || 0);
            if (measuredHeight > 0) {
                cardHeightCache[cacheKey] = Math.max(Number(cardHeightCache[cacheKey] || 0), measuredHeight);
                cardNode.style.containIntrinsicSize = 'auto ' + measuredHeight + 'px';
                if (measuredHeight >= 900) {
                    cardNode.style.contentVisibility = 'visible';
                    cardNode.setAttribute('data-card-heavy-layout', '1');
                } else {
                    cardNode.style.removeProperty('content-visibility');
                    cardNode.removeAttribute('data-card-heavy-layout');
                }
            }
            cardNode.removeAttribute('data-card-hydrating');
            cardNode.style.removeProperty('min-height');
        }

        requestAnimationFrame(commitHeightMeasurement);
        window.setTimeout(commitHeightMeasurement, 180);
    }

    api.applyCardPlaceholderSizing = applyCardPlaceholderSizing;
    api.captureRenderedCardHeight = captureRenderedCardHeight;

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
            var useIdleHydration = !!options._deferredUseIdle;
            var totalLiveLinksForCardRender = Array.isArray(window.eveState?.links)
                ? window.eveState.links.length
                : (typeof getLiveLinks === 'function'
                    ? getLiveLinks().length
                    : (Array.isArray(window.links) ? window.links.length : 0));
            var autoHydrate = !!options._deferredAutoHydrate;
            var hydrateOnDemand = !autoHydrate && (!!options._deferredHydrateOnDemand
                || (!!shouldForceDeferredShell
                    && !options.focusMode
                    && !options.searchStr
                    && totalLiveLinksForCardRender > 1500));
            var cardLinkCount = resolveDeferredLinkCount(catLinks, options);
        var cardWorkspaceId = typeof catInput === 'object' && catInput
            ? (catInput.workspaceId || options.activeWorkspace || 'main')
            : (options.activeWorkspace || 'main');

        if (!options._disableDeferredShell && (shouldForceDeferredShell || cardLinkCount > HEAVY_CARD_THRESHOLD)) {
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
            shellCard.setAttribute('data-card-hydrating', '1');
            if (autoHydrate) {
                shellCard.setAttribute('data-card-auto-hydrate', '1');
                shellCard.setAttribute('data-card-auto-hydrate-reason', String(options._deferredAutoHydrateReason || 'frequent-place'));
            }
            shellCard.style.minHeight = applyCardPlaceholderSizing(shellCard, cardWorkspaceId, cat, catLinks, options) + 'px';
            if (isDetachedParkingCard) {
                shellCard.setAttribute('data-detached-parking-card', '1');
            }
            shellCard.ondragover = function (event) {
                if (typeof allowDrop === 'function') allowDrop(event);
                if (typeof window.isCategoryCardDragPayload === 'function' && window.isCategoryCardDragPayload(event)) {
                    shellCard.classList.add('card-drop-target');
                }
            };
            shellCard.ondragenter = function (event) {
                if (typeof window.isCategoryCardDragPayload === 'function' && window.isCategoryCardDragPayload(event)) {
                    event.preventDefault();
                    shellCard.classList.add('card-drop-target');
                }
            };
            shellCard.ondragleave = function (event) {
                if (!event.relatedTarget || !shellCard.contains(event.relatedTarget)) {
                    shellCard.classList.remove('card-drop-target');
                }
            };
            shellCard.ondrop = function (event) {
                shellCard.classList.remove('card-drop-target');
                if (typeof window.dropCategoryCardOnCard === 'function' && window.dropCategoryCardOnCard(event, cardWorkspaceId, cat)) {
                    return;
                }
                if (typeof drop === 'function') drop(event, cat);
            };

            shellCard.innerHTML = ''
                + '<div class="cat-progress-bg"><div class="cat-progress-fill" style="width:0%"></div></div>'
                + '<div class="category-header" oncontextmenu="showCategoryContextMenu(event, \'' + safeCatJs + '\', \'' + escapeCardJs(cardWorkspaceId) + '\')">'
                + '<div class="cat-title-group">'
                + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleCollapse(this.dataset.cat)" title="Toggle Card">&#9660;</span>'
                + '<div class="category-title-wrap" data-title="' + safeCatHtml + '" data-ws="' + escapeCardHtml(cardWorkspaceId) + '" data-cat="' + safeCatHtml + '" draggable="true" ondragstart="if(typeof dragCategoryCard===\'function\') dragCategoryCard(event, this.dataset.ws, this.dataset.cat)" ondragend="if(typeof endCategoryCardDrag===\'function\') endCategoryCardDrag(event)">'
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

            var skeletonLabel = shellCard.querySelector('.eve-card-deferred-skeleton > div');
            if (skeletonLabel) {
                skeletonLabel.innerHTML = ''
                    + (autoHydrate
                        ? '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:rgba(255,202,96,0.72); box-shadow:0 0 10px rgba(255,202,96,0.35);"></span>'
                        : hydrateOnDemand
                        ? '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:rgba(80,200,255,0.55);"></span>'
                        : '<span class="eve-skeleton-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(80,200,255,0.15); border-top-color:rgba(80,200,255,0.5); border-radius:50%; animation:spin 0.8s linear infinite;"></span>')
                    + (autoHydrate
                        ? 'Auto-loading frequent place (' + cardLinkCount + ' bookmarks)'
                        : hydrateOnDemand
                        ? 'Ready - hover to load ' + cardLinkCount + ' bookmarks'
                        : 'Loading ' + cardLinkCount + ' bookmarks...');
            }

            gridContainer.appendChild(shellCard);

            if (shellCard.classList.contains('collapsed')) {
                return;
            }

            var cardGen = options._renderGen;
            var MEGA_THRESHOLD = 500;
            var deferGhostHydration = !!options._deferGhostHydration;
            var skipDeferredGhostHydration = !!options._skipDeferredGhostHydration;
            var isMega = cardLinkCount > MEGA_THRESHOLD || deferGhostHydration;
            var resolvedCatLinks = null;

            function getResolvedCatLinks() {
                if (resolvedCatLinks) return resolvedCatLinks;
                resolvedCatLinks = resolveDeferredCardLinks(catLinks, options);
                return resolvedCatLinks;
            }

            function scheduleDeferredWork(callback, delayMs, timeoutMs) {
                var safeDelay = Math.max(0, Number(delayMs || 0) || 0);
                window.setTimeout(function () {
                    if (useIdleHydration && typeof window.requestIdleCallback === 'function') {
                        window.requestIdleCallback(callback, { timeout: Math.max(300, Number(timeoutMs || 1200) || 1200) });
                    } else {
                        callback();
                    }
                }, safeDelay);
            }

            function doDeferredBuild() {
                if (cardGen != null && window._eveDashRenderGen !== cardGen) return;
                if (!shellCard.parentNode) return;
                if (shellCard.classList.contains('collapsed')) return;
                var hydrationStartMs = (window.performance && typeof window.performance.now === 'function')
                    ? window.performance.now()
                    : Date.now();

                try {
                    var hydratedCatLinks = getResolvedCatLinks();
                    var forceFaviconImages = cardLinkCount <= 120;
                    var phase1Options = isMega
                        ? Object.assign({}, configOptions, { _skipGhosts: true, _skipFolderRestore: true, _forceFaviconImages: forceFaviconImages })
                        : Object.assign({}, configOptions, { _skipFolderRestore: true, _forceFaviconImages: forceFaviconImages });
                    var tempContainer = document.createDocumentFragment();
                    api._renderCardFull(cat, hydratedCatLinks, tempContainer, phase1Options);
                    var fullCard = tempContainer.firstChild;
                    if (!fullCard) {
                        shellCard.removeAttribute('data-card-hydrating');
                        return;
                    }

                    fullCard.setAttribute('data-card-hydrating', '1');
                    if (autoHydrate) {
                        fullCard.setAttribute('data-card-auto-hydrate', '1');
                        fullCard.setAttribute('data-card-auto-hydrate-reason', String(options._deferredAutoHydrateReason || 'frequent-place'));
                    }
                    fullCard.style.minHeight = shellCard.style.minHeight || '';
                    fullCard.style.containIntrinsicSize = shellCard.style.containIntrinsicSize || '';
                    fullCard.style.opacity = '1';
                    fullCard.style.transition = '';
                    if (shellCard.getAttribute('data-card-heavy-layout') === '1') {
                        fullCard.style.contentVisibility = 'visible';
                        fullCard.setAttribute('data-card-heavy-layout', '1');
                    }
                    fullCard = api.adoptDeferredCardNode(shellCard, fullCard);
                    captureRenderedCardHeight(fullCard, cardWorkspaceId, cat);
                    api.scheduleDeferredCardFaviconRefresh?.(fullCard, autoHydrate ? 'deferred-auto-hydration' : 'deferred-hover-hydration', {
                        maxFetch: isMega ? 18 : 32,
                        maxUpdate: isMega ? 160 : 240
                    });
                    if (window.EveDashboardMasonryHelpers?.scheduleDashboardMasonryLayout) {
                        window.EveDashboardMasonryHelpers.scheduleDashboardMasonryLayout(fullCard.closest('#dashboard-grid'));
                    }
                    if (autoHydrate && window.EveDashboardHydrationMemory?.noteAutoHydrated) {
                        var hydrationDurationMs = ((window.performance && typeof window.performance.now === 'function')
                            ? window.performance.now()
                            : Date.now()) - hydrationStartMs;
                        window.EveDashboardHydrationMemory.noteAutoHydrated(cardWorkspaceId, cat, {
                            linkCount: cardLinkCount,
                            durationMs: hydrationDurationMs,
                            reason: options._deferredAutoHydrateReason || 'frequent-place'
                        });
                    }
                    if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
                        var workspaceId = fullCard.getAttribute('data-card-workspace') || cardWorkspaceId;
                        if (fullCard.getAttribute('data-card-subtab-parent-view') === '1'
                            && typeof window.EveFolderViewV2.queueRestoreActiveFolderState === 'function') {
                            window.EveFolderViewV2.queueRestoreActiveFolderState(workspaceId, cat, {
                                delayMs: 24,
                                visibleOnly: true
                            });
                        } else {
                            window.EveFolderViewV2.restoreActiveFolderState(workspaceId, cat);
                        }
                    }

                    if (!isMega || skipDeferredGhostHydration) return;

                    scheduleDeferredWork(function ghostHydrationStep() {
                        if (cardGen != null && window._eveDashRenderGen !== cardGen) return;
                        if (!fullCard.parentNode) return;

                        try {
                            var ghostContainer = document.createDocumentFragment();
                            var phase2Options = Object.assign({}, configOptions, { _skipGhosts: false, _skipFolderRestore: true, _forceFaviconImages: cardLinkCount <= 120 });
                            api._renderCardFull(cat, getResolvedCatLinks(), ghostContainer, phase2Options);
                            var ghostCard = ghostContainer.firstChild;
                            if (ghostCard && fullCard.parentNode) {
                                ghostCard.setAttribute('data-card-hydrating', '1');
                                if (autoHydrate) {
                                    ghostCard.setAttribute('data-card-auto-hydrate', '1');
                                    ghostCard.setAttribute('data-card-auto-hydrate-reason', String(options._deferredAutoHydrateReason || 'frequent-place'));
                                }
                                ghostCard.style.minHeight = fullCard.style.minHeight || '';
                                ghostCard.style.containIntrinsicSize = fullCard.style.containIntrinsicSize || '';
                                ghostCard.style.opacity = '1';
                                ghostCard.style.transition = '';
                                if (fullCard.getAttribute('data-card-heavy-layout') === '1') {
                                    ghostCard.style.contentVisibility = 'visible';
                                    ghostCard.setAttribute('data-card-heavy-layout', '1');
                                }
                                fullCard = api.adoptDeferredCardNode(fullCard, ghostCard);
                                captureRenderedCardHeight(fullCard, cardWorkspaceId, cat);
                                api.scheduleDeferredCardFaviconRefresh?.(fullCard, 'deferred-ghost-hydration', {
                                    maxFetch: 12,
                                    maxUpdate: 160
                                });
                                if (window.EveDashboardMasonryHelpers?.scheduleDashboardMasonryLayout) {
                                    window.EveDashboardMasonryHelpers.scheduleDashboardMasonryLayout(fullCard.closest('#dashboard-grid'));
                                }
                                if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
                                    var workspaceId = fullCard.getAttribute('data-card-workspace') || cardWorkspaceId;
                                    if (fullCard.getAttribute('data-card-subtab-parent-view') === '1'
                                        && typeof window.EveFolderViewV2.queueRestoreActiveFolderState === 'function') {
                                        window.EveFolderViewV2.queueRestoreActiveFolderState(workspaceId, cat, {
                                            delayMs: 24,
                                            visibleOnly: true
                                        });
                                    } else {
                                        window.EveFolderViewV2.restoreActiveFolderState(workspaceId, cat);
                                    }
                                }
                            }
                        } catch (error) {
                            console.warn('[Dashboard] Deferred ghost hydration failed; keeping current card.', {
                                workspaceId: cardWorkspaceId,
                                category: cat,
                                error
                            });
                            fullCard.removeAttribute('data-card-hydrating');
                        }
                    }, 300, 1600);
                } catch (error) {
                    console.warn('[Dashboard] Deferred card hydration failed; keeping shell visible.', {
                        workspaceId: cardWorkspaceId,
                        category: cat,
                        error
                    });
                    shellCard.removeAttribute('data-card-hydrating');
                    shellCard.setAttribute('data-card-hydration-error', '1');
                    var label = shellCard.querySelector('.eve-card-deferred-skeleton > div');
                    if (label) {
                        label.textContent = 'Could not load this card yet - click or reload to retry';
                    }
                    var retryHydration = function () {
                        shellCard.removeAttribute('data-card-hydration-error');
                        shellCard.setAttribute('data-card-hydrating', '1');
                        scheduleDeferredWork(doDeferredBuild, 0, 1600);
                    };
                    shellCard.addEventListener('click', retryHydration, { once: true });
                    return;
                }
            }

            if (hydrateOnDemand) {
                shellCard.removeAttribute('data-card-hydrating');
                shellCard.setAttribute('data-card-hydrate-on-demand', '1');
                var hydrateStarted = false;
                var triggerDemandHydration = function () {
                    if (hydrateStarted) return;
                    hydrateStarted = true;
                    if (window.EveDashboardHydrationMemory?.recordCardInteraction) {
                        window.EveDashboardHydrationMemory.recordCardInteraction(cardWorkspaceId, cat, 'hydrate', {
                            linkCount: cardLinkCount
                        });
                    }
                    shellCard.setAttribute('data-card-hydrating', '1');
                    scheduleDeferredWork(doDeferredBuild, 0, 1600);
                };
                shellCard.addEventListener('mouseenter', triggerDemandHydration, { once: true });
                shellCard.addEventListener('focusin', triggerDemandHydration, { once: true });
                shellCard.addEventListener('dblclick', triggerDemandHydration, { once: true });
                return;
            }

            scheduleDeferredWork(doDeferredBuild, hydrationDelayMs, 1400);
            return;
        }

        api._renderCardFull(catInput, catLinks, gridContainer, configOptions);
    }

    Object.assign(api, {
        renderCard: renderCard
    });

    api.cardRenderDeferredReady = true;
})();
