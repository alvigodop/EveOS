window.DashboardCategories = window.DashboardCategories || {};

window.DashboardCategories.renderCard = function (cat, catLinks, gridContainer, configOptions) {
    var options = configOptions || {};
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
        : catLinks.slice();
    var renderedLinks = (isFocusMode && typeof window.DashboardCategories.sortFocusedLinks === 'function')
        ? window.DashboardCategories.sortFocusedLinks(visibleLinks)
        : visibleLinks.slice();

    var card = document.createElement('div');
    card.className = 'category-card';
    if (!isFocusMode && Array.isArray(options.collapsed) && options.collapsed.includes(cat)) {
        card.classList.add('collapsed');
    }
    if (!Array.isArray(options.hideStats) || !options.hideStats.includes(cat)) {
        card.classList.add('task-mode');
    }
    var isTaskMode = card.classList.contains('task-mode');
    if (isFocusMode) {
        card.classList.add('is-focus-mode');
    }

    var totalAll = catLinks.length;
    var doneAll = catLinks.filter(function (link) { return !!link.done; }).length;
    var totalVisible = renderedLinks.length;
    var doneVisible = renderedLinks.filter(function (link) { return !!link.done; }).length;
    var pct = totalAll === 0 ? 0 : (doneAll / totalAll) * 100;
    var barClass = pct === 100 ? 'complete' : '';

    card.ondragover = function (event) {
        if (typeof allowDrop === 'function') allowDrop(event);
    };
    card.ondrop = function (event) {
        if (typeof drop === 'function') drop(event, cat);
    };

    var listHtml;
    if (isFocusMode && typeof window.DashboardCategories.buildFocusedLinkHtml === 'function') {
        listHtml = renderedLinks.map(function (link) {
            return window.DashboardCategories.buildFocusedLinkHtml(link, {
                taskMode: isTaskMode
            });
        }).join('');

        if (!listHtml) {
            listHtml = ''
                + '<div class="unidex-empty-state">'
                + '<h3>No Entries Found</h3>'
                + '<p>No bookmarks match this filter.</p>'
                + '</div>';
        }
    } else {
        listHtml = catLinks.map(function (link) {
            return window.DashboardCategories.buildLinkHtml(link, options.searchStr, options.activeWorkspace, options.workspaces);
        }).join('');
    }

    var safeCatHtml = String(cat || 'Unsorted')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    var safeCatJs = String(cat || 'Unsorted')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
    var libPanelId = 'lib-' + String(cat || 'Unsorted').replace(/[^a-zA-Z0-9]/g, '_') + '-panel';

    var shownSuffix = (isFocusMode && focusedFilterMode !== 'all') ? ' shown' : '';
    var titleMetaText = isTaskMode
        ? (totalVisible + ' bookmarks' + shownSuffix + ' &bull; ' + doneVisible + ' done' + ' &bull; ' + Math.max(totalVisible - doneVisible, 0) + ' pending')
        : (totalVisible + ' bookmarks' + shownSuffix);
    var titleMetaHtml = isFocusMode
        ? '<div class="cat-focus-meta">' + titleMetaText + '</div>'
        : '';

    var titleControlsHtml = isFocusMode
        ? ''
        : ''
            + '<span class="collapse-arrow" data-cat="' + safeCatHtml + '" onclick="toggleCollapse(this.dataset.cat)">&#9660;</span>'
            + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', -1)">&#9650;</span>'
            + '<span class="sort-btn" onclick="moveCategory(\'' + safeCatJs + '\', 1)">&#9660;</span>';

    var headerButtonsHtml = isFocusMode
        ? ''
            + '<div class="focus-card-controls">'
                + '<button class="category-action-btn" onclick="openAddModal(\'' + safeCatJs + '\')" title="Add Bookmark">&#10133; <span>Add</span></button>'
                + '<button class="category-action-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218; <span>Library</span></button>'
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
                + '</select>'
                + '<select class="unidex-filter-select focus-sort-order-select" aria-label="Focused linked rating sort order" onchange="window.DashboardCategories.setFocusedEntriesSortOrder(this.value)">'
                    + '<option value="desc"' + (focusedSortOrder === 'desc' ? ' selected' : '') + '>Desc</option>'
                    + '<option value="asc"' + (focusedSortOrder === 'asc' ? ' selected' : '') + '>Asc</option>'
                + '</select>'
                + '<button class="category-action-btn" onclick="clearFocus()" title="Exit Focus">&#127919; <span>Exit Focus</span></button>'
                + '<button class="category-action-btn" onclick="openCategorySettings(\'' + safeCatJs + '\')" title="Settings">&#9881; <span>Settings</span></button>'
                + '<button class="category-action-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640; <span>Launch</span></button>'
            + '</div>'
        : ''
            + '<div style="display:flex; gap:5px;">'
                + '<button onclick="openAddModal(\'' + safeCatJs + '\')" style="padding: 2px 8px; font-size: 1.2rem;" title="Add Bookmark">&#10133;</button>'
                + '<button class="lib-toggle-btn" onclick="toggleCategoryLibrary(\'' + safeCatJs + '\')" title="Library">&#128218;</button>'
                + '<button onclick="setFocus(\'' + safeCatJs + '\')" style="padding: 2px 8px; font-size: 1.2rem;" title="Focus">&#127919;</button>'
                + '<button onclick="openCategorySettings(\'' + safeCatJs + '\')" style="padding: 2px 8px; font-size: 1.2rem;" title="Settings">&#9881;</button>'
                + '<button class="launch-btn" data-cat="' + safeCatHtml + '" onclick="launchCategory(this.dataset.cat)" title="Launch">&#128640;</button>'
            + '</div>';

    var listContainerHtml = isFocusMode
        ? '<section class="unidex-entries is-row-layout focused-category-entries" aria-label="' + safeCatHtml + ' bookmarks">' + listHtml + '</section>'
        : '<ul class="' + (options.scrollableCategories ? 'category-scrollable' : '') + '">' + listHtml + '</ul>';

    card.innerHTML = ''
        + '<div class="cat-progress-bg"><div class="cat-progress-fill ' + barClass + '" style="width:' + pct + '%"></div></div>'
        + '<div class="category-header" oncontextmenu="showCategoryContextMenu(event, \'' + safeCatJs + '\')">'
            + '<div class="cat-title-group">'
                + titleControlsHtml
                + '<div class="category-title" title="' + safeCatHtml + '">' + safeCatHtml + '</div>'
                + titleMetaHtml
            + '</div>'
            + headerButtonsHtml
        + '</div>'
        + '<div id="' + libPanelId + '" class="lib-panel" style="display:none;"></div>'
        + listContainerHtml
        + '<div class="category-footer"><span class="stat-pending">Pending: ' + (totalVisible - doneVisible) + '</span><span class="stat-done">Done: ' + doneVisible + '</span></div>';

    gridContainer.appendChild(card);
};
