window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};
    var {
        escapeCardHtml,
        escapeCardJs,
        buildScopedCategoryKey,
        getCardHeaderButtonsForCategory,
        buildFolderSectionsHtml
    } = api;

    function renderCard(cat, catLinks, gridContainer, configOptions) {
        var options = configOptions || {};
        var isDetachedParkingCard = !!options.detachedParkingCard;
        var isFocusMode = !!options.focusMode;

        // ── EARLY EXIT: Defer entire heavy card processing ──
        // For cards with many links, render a minimal shell immediately and
        // schedule the full build in setTimeout. This prevents the large card
        // from blocking interactions on OTHER cards in the same tab.
        var HEAVY_CARD_THRESHOLD = 80;
        if (catLinks.length > HEAVY_CARD_THRESHOLD) {
            var safeCatHtml = escapeCardHtml(cat || 'Unsorted');
            var safeCatJs = escapeCardJs(cat || 'Unsorted');
            var activeWorkspaceId = String(options.activeWorkspace || config.activeWorkspace || 'main');
            var cardTargetId = window.EveQuickPins?.buildCardTargetId
                ? window.EveQuickPins.buildCardTargetId(activeWorkspaceId, cat)
                : buildScopedCategoryKey(activeWorkspaceId, cat);
            var libPanelId = 'lib-' + String(cat || 'Unsorted').replace(/[^a-zA-Z0-9]/g, '_') + '-panel';

            var shellCard = document.createElement('div');
            shellCard.className = 'category-card';
            if (!isFocusMode && Array.isArray(options.collapsed) && options.collapsed.includes(cat)) {
                shellCard.classList.add('collapsed');
            }
            shellCard.setAttribute('data-card-target-id', cardTargetId);
            shellCard.setAttribute('data-card-category', String(cat || 'Unsorted'));
            shellCard.setAttribute('data-card-workspace', activeWorkspaceId);
            shellCard.setAttribute('data-card-deferred', '1');
            if (isDetachedParkingCard) {
                shellCard.setAttribute('data-detached-parking-card', '1');
            }

            // Minimal header — no expensive task counting or button logic
            shellCard.innerHTML = ''
                + '<div class="cat-progress-bg"><div class="cat-progress-fill" style="width:0%"></div></div>'
                + '<div class="category-header" oncontextmenu="showCategoryContextMenu(event, \'' + safeCatJs + '\')">'
                + '<div class="cat-title-group">'
                + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleCollapse(this.dataset.cat)" title="Toggle Card">&#9660;</span>'
                + '<div class="category-title-wrap" data-title="' + safeCatHtml + '">'
                + '<div class="category-title">' + safeCatHtml + '</div>'
                + '</div>'
                + '</div>'
                + '</div>'
                + '<div id="' + libPanelId + '" class="lib-panel" style="display:none;"></div>'
                + '<div class="eve-card-deferred-skeleton" style="padding:12px 16px; opacity:0.5;">'
                + '<div style="display:flex; align-items:center; gap:8px; color:rgba(180,200,220,0.5); font-size:0.82rem;">'
                + '<span class="eve-skeleton-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(80,200,255,0.15); border-top-color:rgba(80,200,255,0.5); border-radius:50%; animation:spin 0.8s linear infinite;"></span>'
                + 'Loading ' + catLinks.length + ' bookmarks\u2026'
                + '</div>'
                + '</div>'
                + '<div class="category-footer"><span class="stat-pending">Tasks: \u2026</span><span class="stat-done">\u2026</span></div>';

            gridContainer.appendChild(shellCard);

            // If the card is collapsed, DON'T schedule the heavy build.
            // The content is invisible anyway. It will build on expand.
            if (shellCard.classList.contains('collapsed')) {
                return;
            }

            // Two-phase rendering for mega-cards:
            //   Phase 1: Render card WITHOUT ghost folders (fast initial paint)
            //   Phase 2: Hydrate ghost folders via chunked deferred callbacks
            var cardGen = options._renderGen;
            var MEGA_THRESHOLD = 500;
            var isMega = catLinks.length > MEGA_THRESHOLD;

            function doDeferredBuild() {
                if (cardGen != null && window._eveDashRenderGen !== cardGen) return;
                if (!shellCard.parentNode) return;
                if (shellCard.classList.contains('collapsed')) return;

                // Phase 1: Build card (skip ghosts for mega-cards)
                var phase1Options = isMega
                    ? Object.assign({}, configOptions, { _skipGhosts: true })
                    : configOptions;
                var tempContainer = document.createDocumentFragment();
                _renderCardFull(cat, catLinks, tempContainer, phase1Options);
                var fullCard = tempContainer.firstChild;
                if (fullCard) {
                    shellCard.replaceWith(fullCard);
                    fullCard.style.opacity = '0';
                    fullCard.style.transition = 'opacity 0.2s ease';
                    requestAnimationFrame(function () { fullCard.style.opacity = '1'; });
                    if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
                        var ws = fullCard.getAttribute('data-card-workspace') || activeWorkspaceId;
                        window.EveFolderViewV2.restoreActiveFolderState(ws, cat);
                    }

                    // Phase 2: Hydrate ghost folders (chunked, yielding between steps)
                    if (isMega) {
                        // Use setTimeout(0) so each step yields to pending user events
                        setTimeout(function ghostHydrationStep() {
                            if (cardGen != null && window._eveDashRenderGen !== cardGen) return;
                            if (!fullCard.parentNode) return;

                            var ghostContainer = document.createDocumentFragment();
                            var phase2Options = Object.assign({}, configOptions, { _skipGhosts: false });
                            _renderCardFull(cat, catLinks, ghostContainer, phase2Options);
                            var ghostCard = ghostContainer.firstChild;
                            if (ghostCard && fullCard.parentNode) {
                                fullCard.replaceWith(ghostCard);
                                if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
                                    var ws2 = ghostCard.getAttribute('data-card-workspace') || activeWorkspaceId;
                                    window.EveFolderViewV2.restoreActiveFolderState(ws2, cat);
                                }
                            }
                        }, 300); // Delay Phase 2 significantly to let UI settle first
                    }
                }
            }

            // Schedule Phase 1 via setTimeout(0) — yields to pending user events
            setTimeout(doDeferredBuild, 0);

            return;
        }

        // Normal path for small/medium cards
        _renderCardFull(cat, catLinks, gridContainer, configOptions);
    }

    /**
     * Full card rendering logic — does ALL the expensive work.
     * Called directly for small cards, and in setTimeout for heavy cards.
     */
    function _renderCardFull(cat, catLinks, gridContainer, configOptions) {
        var options = configOptions || {};
        var isDetachedParkingCard = !!options.detachedParkingCard;
        var isFocusMode = !!options.focusMode;
        var focusedFilterMode = (isFocusMode && typeof window.DashboardCategories.getFocusedEntriesFilterMode === 'function')
            ? window.DashboardCategories.getFocusedEntriesFilterMode()
            : 'all';
        var focusedSortBy = (isFocusMode && typeof window.DashboardCategories.getFocusedEntriesSortBy === 'function')
            ? window.DashboardCategories.getFocusedEntriesSortBy()
            : 'none';
        var focusedSortOrder = (isFocusMode && typeof window.DashboardCategories.getFocusedEntriesSortOrder === 'function')
            ? window.DashboardCategories.getFocusedEntriesSortOrder()
            : 'desc';

        var visibleLinks = (isFocusMode && typeof window.DashboardCategories.matchesFocusedEntriesFilter === 'function')
            ? catLinks.filter(function (link) {
                return window.DashboardCategories.matchesFocusedEntriesFilter(link, focusedFilterMode);
            })
            : (catLinks.length > 500 && !isFocusMode ? catLinks : catLinks.slice());
        var renderedLinks = (isFocusMode && typeof window.DashboardCategories.sortFocusedLinks === 'function')
            ? window.DashboardCategories.sortFocusedLinks(visibleLinks)
            : (catLinks.length > 500 && !isFocusMode ? visibleLinks : visibleLinks.slice());

        var card = document.createElement('div');
        card.className = 'category-card';
        if (!isFocusMode && Array.isArray(options.collapsed) && options.collapsed.includes(cat)) {
            card.classList.add('collapsed');
        }
        if (!isFocusMode && Array.isArray(options.foldersCollapsed) && options.foldersCollapsed.includes(cat)) {
            card.classList.add('folders-collapsed');
        }
        if (!isFocusMode && Array.isArray(options.linksCollapsed) && options.linksCollapsed.includes(cat)) {
            card.classList.add('links-collapsed');
        }
        var folderTaskApi = window.EveBookmarkFolders;
        var safeCatHtml = escapeCardHtml(cat || 'Unsorted');
        var safeCatJs = escapeCardJs(cat || 'Unsorted');
        var libPanelId = 'lib-' + String(cat || 'Unsorted').replace(/[^a-zA-Z0-9]/g, '_') + '-panel';
        var folderToolbarExpanded = !!folderTaskApi?.isToolbarExpanded?.(options.activeWorkspace, cat);
        var folderHeaderBtnClass = 'category-action-btn' + (folderToolbarExpanded ? ' is-active' : '');

        function isTaskEnabledForLink(link) {
            if (typeof folderTaskApi?.isTaskEnabledForLink === 'function') {
                return !!folderTaskApi.isTaskEnabledForLink(link);
            }
            return !Array.isArray(options.hideStats) || !options.hideStats.includes(cat);
        }

        var totalAll = catLinks.length;
        var totalVisible = renderedLinks.length;

        // For mega-cards (500+), skip expensive full-array iterations.
        // RENDER_CAP limits output to 20 links — full stats are invisible anyway.
        var isMegaCard = catLinks.length > 500;

        var totalAllTasks = 0, doneAll = 0;
        var totalVisibleTasks = 0, doneVisible = 0;

        if (!isMegaCard) {
            // Single-pass task stats (replaces 5 separate .filter() calls)
            for (var _ti = 0; _ti < catLinks.length; _ti++) {
                if (isTaskEnabledForLink(catLinks[_ti])) {
                    totalAllTasks++;
                    if (catLinks[_ti].done) doneAll++;
                }
            }
            for (var _tv = 0; _tv < renderedLinks.length; _tv++) {
                if (isTaskEnabledForLink(renderedLinks[_tv])) {
                    totalVisibleTasks++;
                    if (renderedLinks[_tv].done) doneVisible++;
                }
            }
        }

        var hasTaskBookmarks = totalAllTasks > 0;
        if (hasTaskBookmarks) {
            card.classList.add('task-mode');
        }
        var isTaskMode = hasTaskBookmarks;
        var customOrderApi = window.EveCustomOrder;
        var activeWorkspaceId = String(options.activeWorkspace || config.activeWorkspace || 'main');
        var customOrderEnabled = !isMegaCard && customOrderApi ? customOrderApi.isEnabled(activeWorkspaceId, cat) : false;
        if (customOrderEnabled) {
            card.classList.add('custom-order');
            // Ensure all links have order numbers
            customOrderApi.ensureAllLinksHaveNumbers(activeWorkspaceId, cat, renderedLinks);
        }

        if (!isMegaCard) {
            // Stamp stable base positions BEFORE any sorting
            // These never change regardless of sort mode
            renderedLinks.forEach(function (link, index) {
                var linkId = String(link.id);
                if (customOrderEnabled && customOrderApi) {
                    var coNum = customOrderApi.getNumber(activeWorkspaceId, cat, linkId);
                    link._basePos = (typeof coNum === 'number') ? coNum : (index + 1);
                } else {
                    link._basePos = index + 1;
                }
            });

            // Apply sorting (works with or without custom numbering)
            if (customOrderApi) {
                renderedLinks = customOrderApi.applySorting(renderedLinks, activeWorkspaceId, cat);
            }
        }

        // True Value Approximation — skip for mega-cards (too expensive for initial paint)
        var trueValueApi = window.EveTrueValue;
        var trueValueEnabled = !isMegaCard && trueValueApi ? trueValueApi.isEnabled(activeWorkspaceId, cat) : false;
        var trueValueData = null;
        var currentSortMode = customOrderApi ? customOrderApi.getSortMode(activeWorkspaceId, cat) : 'none';
        if (trueValueEnabled) {
            card.classList.add('true-value-mode');
            trueValueData = trueValueApi.computeTrueValues(renderedLinks, activeWorkspaceId, cat);
            renderedLinks = trueValueApi.applySorting(renderedLinks, trueValueData, currentSortMode);
        }
        if (isFocusMode) {
            card.classList.add('is-focus-mode');
        }
        var pct = totalAllTasks === 0 ? 0 : (doneAll / totalAllTasks) * 100;
        var barClass = pct === 100 && totalAllTasks > 0 ? 'complete' : '';

        card.ondragover = function (event) {
            if (typeof allowDrop === 'function') allowDrop(event);
        };
        card.ondrop = function (event) {
            if (isDetachedParkingCard) {
                if (window.EveConstellationMap && window.EveConstellationMap._detached && typeof window.EveConstellationMap._detached.handleDashboardParkingDrop === 'function') {
                    window.EveConstellationMap._detached.handleDashboardParkingDrop(event, activeWorkspaceId);
                }
                return;
            }
            if (typeof drop === 'function') drop(event, cat);
        };

        var RENDER_CAP = window._evePerfMode ? 20 : 50; // Fewer in perf mode
        var RENDER_BATCH = 50; // Batch size for "Show More"

        function renderLinkCollection(linksForRender) {
            if (isFocusMode && typeof window.DashboardCategories.buildFocusedLinkHtml === 'function') {
                var cappedFocus = linksForRender.slice(0, RENDER_CAP);
                var focusedHtml = cappedFocus.map(function (link) {
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

                if (linksForRender.length > RENDER_CAP) {
                    focusedHtml += buildShowMoreButton(linksForRender, RENDER_CAP, true);
                }
                return '<section class="unidex-entries is-row-layout focused-category-entries" aria-label="' + safeCatHtml + ' bookmarks">' + focusedHtml + '</section>';
            }

            // Apply true value sorting per-section (works for both flat and folder views)
            if (trueValueEnabled && trueValueApi) {
                // Stamp stable base positions if not already set (for folder sections)
                linksForRender.forEach(function (link, idx) {
                    if (typeof link._basePos !== 'number') {
                        if (customOrderEnabled && customOrderApi) {
                            var coNum = customOrderApi.getNumber(activeWorkspaceId, cat, String(link.id));
                            link._basePos = (typeof coNum === 'number') ? coNum : (idx + 1);
                        } else {
                            link._basePos = idx + 1;
                        }
                    }
                });
                var sectionTvData = trueValueApi.computeTrueValues(linksForRender, activeWorkspaceId, cat);
                linksForRender = trueValueApi.applySorting(linksForRender, sectionTvData, currentSortMode);
                // Use section-local true value data for badges
                trueValueData = sectionTvData;
            }

            var cappedLinks = linksForRender.slice(0, RENDER_CAP);
            var flatHtml = cappedLinks.map(function (link) {
                var folderLabel = '';
                if (options.searchStr && window.EveBookmarkFolders?.buildFolderPathLabel) {
                    folderLabel = window.EveBookmarkFolders.buildFolderPathLabel(link.workspace, link.category, link.folderId);
                }
                return window.DashboardCategories.buildLinkHtml(link, options.searchStr, options.activeWorkspace, options.workspaces, {
                    folderLabel: folderLabel,
                    isTaskEnabled: isTaskEnabledForLink(link),
                    customOrderEnabled: customOrderEnabled,
                    customOrderWsId: activeWorkspaceId,
                    customOrderCategory: cat,
                    trueValueEnabled: trueValueEnabled,
                    trueValueData: trueValueData
                });
            }).join('');

            if (linksForRender.length > RENDER_CAP) {
                flatHtml += buildShowMoreButton(linksForRender, RENDER_CAP, false);
            }

            return '<ul class="' + (options.scrollableCategories ? 'category-scrollable' : '') + '">' + flatHtml + '</ul>';
        }

        function buildShowMoreButton(allLinks, alreadyRendered, isFocused) {
            var remaining = allLinks.length - alreadyRendered;
            var btnId = 'showMore_' + String(cat || '').replace(/[^a-zA-Z0-9]/g, '_') + '_' + alreadyRendered;
            // Store links reference on window for progressive loading
            if (!window._eveProgressiveLinks) window._eveProgressiveLinks = {};
            window._eveProgressiveLinks[btnId] = { links: allLinks, offset: alreadyRendered, focused: isFocused };
            return '<li class="eve-show-more-item" id="' + btnId + '">'
                + '<button class="eve-show-more-btn" onclick="window._eveLoadMoreLinks(\'' + btnId + '\')">'
                + '▾ Show ' + Math.min(remaining, RENDER_BATCH) + ' more (' + remaining + ' remaining)'
                + '</button></li>';
        }

        // For mega-cards, skip iterating all 3551 links just to extract workspace IDs
        var scopedWorkspaceIds = isMegaCard
            ? [String(options.activeWorkspace || 'main').trim()]
            : Array.from(new Set(renderedLinks.map(function (link) {
                return String(link?.workspace || options.activeWorkspace || '').trim();
            }).filter(Boolean)));

        // Allow folder rendering for cards whose links come from the active workspace or its sub-tabs
        var activeWsId = String(options.activeWorkspace || '').trim();
        var visibleSubTabIds = window._eveActiveVisibleWorkspaceIds instanceof Set
            ? window._eveActiveVisibleWorkspaceIds
            : new Set([activeWsId]);
        var canRenderCardFolders = scopedWorkspaceIds.every(function (wsId) {
            return visibleSubTabIds.has(wsId);
        });

        // When all links come from a single sub-tab, adopt that workspace for the entire card
        var effectiveWsId = activeWsId;
        if (canRenderCardFolders && scopedWorkspaceIds.length === 1 && scopedWorkspaceIds[0] !== activeWsId) {
            effectiveWsId = scopedWorkspaceIds[0];
            options = Object.assign({}, options, { activeWorkspace: effectiveWsId });
        }

        var listHtml;
        if (canRenderCardFolders && scopedWorkspaceIds.length <= 1) {
            var shouldSkipGhosts = (options._skipGhosts !== undefined) ? !!options._skipGhosts : isMegaCard;
            var folderOptions = shouldSkipGhosts ? Object.assign({}, options, { skipGhosts: true }) : options;
            listHtml = buildFolderSectionsHtml(cat, renderedLinks, folderOptions, renderLinkCollection);
        } else if (canRenderCardFolders && scopedWorkspaceIds.length > 1) {
            var combinedHtml = [];
            scopedWorkspaceIds.forEach(function (wsId) {
                var wsLinks = renderedLinks.filter(function (link) {
                    return String(link?.workspace || 'main').trim() === wsId;
                });
                if (!wsLinks.length) return;
                var isSubTab = wsId !== activeWsId;
                var wsOptions = Object.assign({}, options, { activeWorkspace: wsId, isSubTabInParentView: isSubTab });
                combinedHtml.push(buildFolderSectionsHtml(cat, wsLinks, wsOptions, renderLinkCollection));
            });
            listHtml = combinedHtml.join('');
        } else {
            listHtml = renderLinkCollection(renderedLinks);
        }

        var shownSuffix = (isFocusMode && focusedFilterMode !== 'all') ? ' shown' : '';
        var titleMetaText = isTaskMode
            ? (totalVisible + ' bookmarks' + shownSuffix + ' &bull; ' + doneVisible + ' done' + ' &bull; ' + Math.max(totalVisibleTasks - doneVisible, 0) + ' to-do')
            : (totalVisible + ' bookmarks' + shownSuffix);
        var titleMetaHtml = isFocusMode
            ? '<div class="cat-focus-meta">' + titleMetaText + '</div>'
            : '';

        var titleControlsHtml = isFocusMode
            ? ''
            : ''
            + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleLinksCollapse(this.dataset.cat)" title="Toggle Bookmarks">&#128216;</span>'
            + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleFolderCollapse(this.dataset.cat)" title="Toggle Folders">&#128193;</span>'
            + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleCollapse(this.dataset.cat)" title="Toggle Card">&#9660;</span>'
            + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', -1)">&#9650;</span>'
            + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', 1)">&#9660;</span>';

        var activeWorkspaceId = String(options.activeWorkspace || window.eveState?.config?.activeWorkspace || 'main').trim() || 'main';
        var cardTargetId = window.EveQuickPins?.buildCardTargetId
            ? window.EveQuickPins.buildCardTargetId(activeWorkspaceId, cat)
            : buildScopedCategoryKey(activeWorkspaceId, cat);
        var detachedMapButtonHtml = isDetachedParkingCard
            ? '<button class="card-header-icon-btn constellation-btn" onclick="if(window.EveDetachedDashboardCard) window.EveDetachedDashboardCard.openDetachedParkingMap(\'' + escapeCardJs(activeWorkspaceId) + '\')" title="Detached Map">&#127756;</button>'
            : '';
        var detachedFocusMapButtonHtml = isDetachedParkingCard
            ? '<button class=\"category-action-btn\" onclick=\"if(window.EveDetachedDashboardCard) window.EveDetachedDashboardCard.openDetachedParkingMap(\'' + escapeCardJs(activeWorkspaceId) + '\')\" title=\"Detached Map\">&#127756; <span>Map</span></button>'
            : '';
        var visibleHeaderButtons = new Set(getCardHeaderButtonsForCategory(activeWorkspaceId, cat));
        var nonFocusButtons = [];
        if (!isDetachedParkingCard && visibleHeaderButtons.has('add')) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="openAddModal(\'' + safeCatJs + '\')" title="Add Bookmark">&#10133;</button>');
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('folders')) {
            nonFocusButtons.push('<button class="' + (folderToolbarExpanded ? 'card-header-icon-btn card-folder-toggle-btn is-active' : 'card-header-icon-btn card-folder-toggle-btn') + '" data-folder-toolbar-toggle="1" onclick="toggleBookmarkFolderToolbar(\'' + safeCatJs + '\', \'' + escapeCardJs(options.activeWorkspace || 'main') + '\')" title="Folders">&#128193;</button>');
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('library')) {
            nonFocusButtons.push('<button class="card-header-icon-btn lib-toggle-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218;</button>');
        }
        if (visibleHeaderButtons.has('focus')) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="setFocus(\'' + safeCatJs + '\')" title="Focus">&#127919;</button>');
        }
        if (isDetachedParkingCard) {
            nonFocusButtons.push(detachedMapButtonHtml);
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('constellation')) {
            nonFocusButtons.push('<button class="card-header-icon-btn constellation-btn" onclick="if(window.EveConstellationMap) window.EveConstellationMap.openCardMap(\'' + escapeCardJs(activeWorkspaceId) + '\', \'' + safeCatJs + '\')" title="Constellation Map">&#127756;</button>');
        }
        if (!isDetachedParkingCard) {
            nonFocusButtons.push('<button class="card-header-icon-btn" onclick="openCategorySettings(\'' + safeCatJs + '\')" title="Settings">&#9881;</button>');
        }
        if (!isDetachedParkingCard && visibleHeaderButtons.has('launch')) {
            nonFocusButtons.push('<button class="card-header-icon-btn launch-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640;</button>');
        }

        var headerButtonsHtml = isFocusMode
            ? ''
            + '<div class="focus-card-controls">'
            + '<button class="category-action-btn bulk-scope-btn" data-scope-category="' + safeCatHtml + '" data-scope-workspace="' + escapeCardJs(activeWorkspaceId) + '" onclick="bulkToggleCardScopeSelection(\'' + safeCatJs + '\', \'' + escapeCardJs(activeWorkspaceId) + '\')" title="Select all bookmarks in this card">&#9744; <span>Select Card</span></button>'
            + (!isDetachedParkingCard && visibleHeaderButtons.has('add')
                ? '<button class="category-action-btn" onclick="openAddModal(\'' + safeCatJs + '\')" title="Add Bookmark">&#10133; <span>Add</span></button>'
                : '')
            + (!isDetachedParkingCard && visibleHeaderButtons.has('folders')
                ? '<button class="' + folderHeaderBtnClass + '" data-folder-toolbar-toggle="1" onclick="toggleBookmarkFolderToolbar(\'' + safeCatJs + '\', \'' + escapeCardJs(options.activeWorkspace || 'main') + '\')" title="Folders">&#128193; <span>Folders</span></button>'
                : '')
            + (!isDetachedParkingCard && visibleHeaderButtons.has('library')
                ? '<button class="category-action-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218; <span>Library</span></button>'
                : '')
            + (!isDetachedParkingCard && visibleHeaderButtons.has('constellation')
                ? '<button class=\"category-action-btn\" onclick=\"if(window.EveConstellationMap) window.EveConstellationMap.openCardMap(\'' + escapeCardJs(activeWorkspaceId) + '\', \'' + safeCatJs + '\')\" title=\"Constellation Map\">&#127756; <span>Map</span></button>'
                : '')
            + detachedFocusMapButtonHtml
            + '<select class="unidex-filter-select focus-filter-select" aria-label="Focused bookmark filter" onchange="window.DashboardCategories.setFocusedEntriesFilterMode(this.value)">'
            + '<option value="all"' + (focusedFilterMode === 'all' ? ' selected' : '') + '>All Bookmarks</option>'
            + '<option value="linked"' + (focusedFilterMode === 'linked' ? ' selected' : '') + '>Library Linked</option>'
            + '<option value="bookmark-only"' + (focusedFilterMode === 'bookmark-only' ? ' selected' : '') + '>Bookmarks Only</option>'
            + '</select>'
            + '<select class="unidex-filter-select focus-sort-select" aria-label="Focused linked rating sort" onchange="window.DashboardCategories.setFocusedEntriesSortBy(this.value)">'
            + '<option value="none"' + (focusedSortBy === 'none' ? ' selected' : '') + '>Sort Off</option>'
            + '<option value="active"' + (focusedSortBy === 'active' ? ' selected' : '') + '>Active</option>'
            + '<option value="unified"' + (focusedSortBy === 'unified' ? ' selected' : '') + '>Unified</option>'
            + '<option value="personal"' + (focusedSortBy === 'personal' ? ' selected' : '') + '>Personal</option>'
            + '<option value="api_weighted"' + (focusedSortBy === 'api_weighted' ? ' selected' : '') + '>API Weighted</option>'
            + '<option value="api_average"' + (focusedSortBy === 'api_average' ? ' selected' : '') + '>API Average</option>'
            + '<option value="confidence"' + (focusedSortBy === 'confidence' ? ' selected' : '') + '>Confidence</option>'
            + '<option value="truevalue"' + (focusedSortBy === 'truevalue' ? ' selected' : '') + '>True Value</option>'
            + '</select>'
            + '<select class="unidex-filter-select focus-sort-order-select" aria-label="Focused linked rating sort order" onchange="window.DashboardCategories.setFocusedEntriesSortOrder(this.value)">'
            + '<option value="desc"' + (focusedSortOrder === 'desc' ? ' selected' : '') + '>Desc</option>'
            + '<option value="asc"' + (focusedSortOrder === 'asc' ? ' selected' : '') + '>Asc</option>'
            + '</select>'
            + '<button class="category-action-btn" onclick="clearFocus()" title="Exit Focus">&#127919; <span>Exit Focus</span></button>'
            + (!isDetachedParkingCard
                ? '<button class="category-action-btn" onclick="openCategorySettings(\'' + safeCatJs + '\')" title="Settings">&#9881; <span>Settings</span></button>'
                : '')
            + (!isDetachedParkingCard && visibleHeaderButtons.has('launch')
                ? '<button class="category-action-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640; <span>Launch</span></button>'
                : '')
            + '</div>'
            : ''
            + '<div class="card-header-icon-row" onwheel="handleCardHeaderIconRowWheel(event)">'
            + '<button class="card-header-icon-btn bulk-scope-btn" data-scope-category="' + safeCatHtml + '" data-scope-workspace="' + escapeCardJs(activeWorkspaceId) + '" onclick="bulkToggleCardScopeSelection(\'' + safeCatJs + '\', \'' + escapeCardJs(activeWorkspaceId) + '\')" title="Select Card">&#9744;</button>'
            + nonFocusButtons.join('')
            + '</div>';

        // Detect sub-tab sources in this card
        var subTabSourcesHtml = '';
        if (!isDetachedParkingCard) {
            var subTabIds = new Set();
            catLinks.forEach(function (link) {
                var linkWs = String(link?.workspace || 'main').trim();
                if (linkWs !== activeWsId) subTabIds.add(linkWs);
            });
            if (subTabIds.size > 0) {
                var helpers = window.EveWorkspaceHelpers;
                var badges = [];
                subTabIds.forEach(function (wsId) {
                    var subWs = helpers ? helpers.findById(config.workspaces || [], wsId) : null;
                    var subName = subWs ? escapeCardHtml(subWs.name) : wsId;
                    var subIcon = subWs ? (subWs.icon || '📁') : '📁';
                    badges.push('<span class="card-subtab-source">' + subIcon + ' ' + subName + '</span>');
                });
                subTabSourcesHtml = '<div class="card-subtab-sources">' + badges.join('') + '</div>';
            }
        }

        card.innerHTML = ''
            + '<div class="cat-progress-bg"><div class="cat-progress-fill ' + barClass + '" style="width:' + pct + '%"></div></div>'
            + '<div class="category-header" oncontextmenu="showCategoryContextMenu(event, \'' + safeCatJs + '\')">'
            + '<div class="cat-title-group">'
            + titleControlsHtml
            + '<div class="category-title-wrap"'
            + ' data-title="' + safeCatHtml + '"'
            + ' onmouseenter="showCardTitleHover(event, this.dataset.title)"'
            + ' onmousemove="moveCardTitleHover(event)"'
            + ' onmouseleave="hideCardTitleHover()">'
            + '<div class="category-title">' + safeCatHtml + '</div>'
            + '</div>'
            + subTabSourcesHtml
            + titleMetaHtml
            + '</div>'
            + headerButtonsHtml
            + '</div>'
            + '<div id="' + libPanelId + '" class="lib-panel" style="display:none;"></div>'
            + listHtml
            + '<div class="category-footer"><span class="stat-pending">Pending: ' + Math.max(totalVisibleTasks - doneVisible, 0) + '</span><span class="stat-done">Done: ' + doneVisible + '</span></div>';
        card.setAttribute('data-card-target-id', cardTargetId);
        card.setAttribute('data-card-category', String(cat || 'Unsorted'));
        card.setAttribute('data-card-workspace', effectiveWsId || activeWorkspaceId);
        if (isDetachedParkingCard) {
            card.setAttribute('data-detached-parking-card', '1');
        }

        gridContainer.appendChild(card);

        if (window.EveFolderViewV2 && window.EveFolderViewV2.restoreActiveFolderState) {
            window.EveFolderViewV2.restoreActiveFolderState(effectiveWsId || activeWorkspaceId, cat);
        }
    }

    Object.assign(api, { renderCard });
})();

// Progressive link loader — handles "Show More" clicks
window._eveLoadMoreLinks = function (btnId) {
    var store = window._eveProgressiveLinks && window._eveProgressiveLinks[btnId];
    if (!store) return;

    var BATCH = 50;
    var links = store.links;
    var offset = store.offset;
    var end = Math.min(offset + BATCH, links.length);
    var btnEl = document.getElementById(btnId);
    if (!btnEl) return;

    var parent = btnEl.parentElement;
    if (!parent) return;

    // Build next batch HTML
    var fragment = document.createDocumentFragment();
    for (var i = offset; i < end; i++) {
        var link = links[i];
        if (!link) continue;
        var html = '';
        if (store.focused && typeof window.DashboardCategories.buildFocusedLinkHtml === 'function') {
            html = window.DashboardCategories.buildFocusedLinkHtml(link, {
                taskMode: true,
                taskEnabled: true
            });
        } else if (typeof window.DashboardCategories.buildLinkHtml === 'function') {
            html = window.DashboardCategories.buildLinkHtml(link, '', '', [], {});
        }
        if (html) {
            var temp = document.createElement('div');
            temp.innerHTML = html;
            while (temp.firstChild) {
                fragment.appendChild(temp.firstChild);
            }
        }
    }

    // Insert before the button
    parent.insertBefore(fragment, btnEl);

    // Update or remove button
    store.offset = end;
    var remaining = links.length - end;
    if (remaining > 0) {
        var nextBatch = Math.min(remaining, BATCH);
        btnEl.querySelector('button').textContent = '▾ Show ' + nextBatch + ' more (' + remaining + ' remaining)';
    } else {
        btnEl.remove();
        delete window._eveProgressiveLinks[btnId];
    }
};
