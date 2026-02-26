// --- UNIDEX VIEW (TABS -> CARDS -> ENTRIES) ---
window.UnidexView = (function () {
    let stage = 'tabs';
    let selectedWorkspaceId = '';
    let selectedCategory = '';

    function getAllLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function encodeParam(value) {
        return encodeURIComponent(String(value ?? ''));
    }

    function decodeParam(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        try {
            return decodeURIComponent(text);
        } catch (error) {
            return text;
        }
    }

    function matchesSearch(link, search) {
        if (!search) return true;
        const query = search.toLowerCase();
        const title = String(link.title || '').toLowerCase();
        const url = String(link.url || '').toLowerCase();
        const category = String(link.category || '').toLowerCase();
        return title.includes(query) || url.includes(query) || category.includes(query);
    }

    function getWorkspaceById(workspaceId) {
        return (config.workspaces || []).find(function (workspace) {
            return String(workspace.id) === String(workspaceId);
        }) || null;
    }

    function getWorkspaceLinks(workspaceId, searchStr) {
        return getAllLinks().filter(function (link) {
            return String(link.workspace) === String(workspaceId) && matchesSearch(link, searchStr);
        });
    }

    function isTaskModeCategory(categoryName) {
        const hidden = Array.isArray(config.hideStats) ? config.hideStats : [];
        return !hidden.includes(categoryName);
    }

    function getSortedCategories(workspaceLinks) {
        if (window.DashboardCategories && typeof window.DashboardCategories.sort === 'function') {
            return window.DashboardCategories.sort(workspaceLinks, config.categoryOrder || []);
        }
        const unique = new Set(workspaceLinks.map(function (link) {
            return link.category || 'Unsorted';
        }));
        return Array.from(unique).sort();
    }

    function getCategoryModels(workspaceLinks) {
        return getSortedCategories(workspaceLinks).map(function (category) {
            const categoryLinks = workspaceLinks.filter(function (link) {
                return (link.category || 'Unsorted') === category;
            });
            const doneCount = categoryLinks.filter(function (link) { return !!link.done; }).length;

            return {
                category: category,
                total: categoryLinks.length,
                done: doneCount,
                pending: Math.max(categoryLinks.length - doneCount, 0),
                taskMode: isTaskModeCategory(category)
            };
        });
    }

    function getDomain(rawUrl) {
        try {
            return new URL(rawUrl).hostname || String(rawUrl || '');
        } catch (error) {
            return String(rawUrl || '');
        }
    }

    function getLinkedRecord(linkId) {
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry) return null;
        return api.getLinkedEntry(linkId);
    }

    function buildTabsHtml() {
        return (config.workspaces || []).map(function (workspace) {
            const workspaceCount = getAllLinks().filter(function (link) {
                return String(link.workspace) === String(workspace.id);
            }).length;

            const encodedId = encodeParam(workspace.id);
            const safeName = escapeHtml(workspace.name);
            const safeIcon = escapeHtml(workspace.icon || '');

            return `
                <button type="button"
                    class="unidex-tab-btn"
                    data-text="${safeName.toUpperCase()}"
                    onclick="window.UnidexView.switchWorkspaceTab('${encodedId}')"
                    title="Open ${safeName}">
                    <span class="unidex-tab-main">${safeIcon} ${safeName}</span>
                    <span class="unidex-tab-count">${workspaceCount} links</span>
                </button>
            `;
        }).join('');
    }

    function buildCardsHtml(categoryModels) {
        if (categoryModels.length === 0) {
            return `
                <div class="unidex-empty-state">
                    <h3>No Cards Yet</h3>
                    <p>This workspace has no categories for the current search.</p>
                </div>
            `;
        }

        return categoryModels.map(function (model) {
            const safeCategory = escapeHtml(model.category);
            const encodedCategory = encodeParam(model.category);
            const progress = model.total > 0 ? Math.round((model.done / model.total) * 100) : 0;
            const metaText = model.taskMode
                ? `Done: ${model.done} | Pending: ${model.pending}`
                : `${model.total} links`;
            const progressHtml = model.taskMode
                ? `<div class="unidex-card-progress"><div class="unidex-card-progress-fill" style="width:${progress}%"></div></div>`
                : '';

            return `
                <article class="unidex-card ${model.taskMode ? 'is-task-mode' : 'is-link-mode'}" title="${safeCategory}">
                    <button type="button" class="unidex-card-hit"
                        data-text="${safeCategory.toUpperCase()}"
                        onclick="window.UnidexView.selectCategory('${encodedCategory}')"
                        aria-label="Open ${safeCategory}">
                        <div class="unidex-card-header">
                            <h3 class="unidex-card-title">${safeCategory}</h3>
                            <span class="unidex-card-pill">${model.total}</span>
                        </div>
                        <p class="unidex-card-meta">${metaText}</p>
                        ${progressHtml}
                    </button>
                </article>
            `;
        }).join('');
    }

    function buildEntriesHtml(entryLinks, taskMode) {
        if (entryLinks.length === 0) {
            return `
                <div class="unidex-empty-state">
                    <h3>No Entries Found</h3>
                    <p>This card has no bookmarks for the current search.</p>
                </div>
            `;
        }

        return entryLinks.map(function (link) {
            const encodedId = encodeParam(link.id);
            const safeTitle = escapeHtml(link.title || 'Untitled');
            const safeDomain = escapeHtml(getDomain(link.url));
            const linkedRecord = getLinkedRecord(link.id);
            const isLibraryLinked = !!linkedRecord?.entry;
            const libraryStatusRaw = String(linkedRecord?.entry?.status || '').trim();
            const libraryRatingRaw = String(linkedRecord?.entry?.rating || '').trim();
            const libraryStatus = escapeHtml(libraryStatusRaw || 'No status');
            const libraryRating = escapeHtml(libraryRatingRaw || '-');
            const libraryInfoHtml = isLibraryLinked
                ? `<p class="unidex-entry-library linked">Library: ${libraryStatus} | Rating: ${libraryRating}</p>`
                : '';
            const taskTagHtml = taskMode
                ? `<span class="unidex-entry-tag ${link.done ? 'done' : 'pending'}">${link.done ? 'Done' : 'Pending'}</span>`
                : '';
            const libraryTagHtml = isLibraryLinked
                ? '<span class="unidex-entry-tag library-linked">Library Linked</span>'
                : '';

            return `
                <article class="unidex-entry-item ${taskMode && link.done ? 'is-done' : ''}">
                    <div class="unidex-entry-main">
                        <h4 class="unidex-entry-title">${safeTitle}</h4>
                        <p class="unidex-entry-domain">${safeDomain}</p>
                        ${libraryInfoHtml}
                        <div class="unidex-entry-tags">
                            ${taskTagHtml}
                            ${libraryTagHtml}
                            ${link.pinned ? '<span class="unidex-entry-tag pinned">Pinned</span>' : ''}
                        </div>
                    </div>
                    <div class="unidex-entry-actions">
                        <button type="button" class="unidex-entry-btn" onclick="return window.UnidexView.openEntry('${encodedId}', event)">Open</button>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderTabsStage(gridContainer) {
        gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Tabs View">
                <header class="unidex-hero">
                    <h2 class="unidex-title">The Unidex View</h2>
                </header>
                <section class="unidex-tabs" aria-label="Workspace Tabs">
                    ${buildTabsHtml()}
                </section>
            </section>
        `;
    }

    function renderCardsStage(gridContainer, searchStr) {
        const workspace = getWorkspaceById(selectedWorkspaceId);
        if (!workspace) {
            resetSelection();
            renderTabsStage(gridContainer);
            return;
        }

        const workspaceLinks = getWorkspaceLinks(workspace.id, searchStr);
        const categoryModels = getCategoryModels(workspaceLinks);

        gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Cards View">
                <header class="unidex-panel-header">
                    <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToTabs()">Back To Tabs</button>
                    <h3 class="unidex-panel-title">${escapeHtml(workspace.name)} Cards</h3>
                </header>
                <section class="unidex-cards" aria-label="Category Cards">
                    ${buildCardsHtml(categoryModels)}
                </section>
            </section>
        `;
    }

    function renderEntriesStage(gridContainer, searchStr) {
        const workspace = getWorkspaceById(selectedWorkspaceId);
        if (!workspace || !selectedCategory) {
            stage = workspace ? 'cards' : 'tabs';
            render(gridContainer, { searchStr: searchStr });
            return;
        }

        const workspaceLinks = getWorkspaceLinks(workspace.id, searchStr);
        const entries = workspaceLinks.filter(function (link) {
            return (link.category || 'Unsorted') === selectedCategory;
        });
        const taskMode = isTaskModeCategory(selectedCategory);

        gridContainer.innerHTML = `
            <section class="unidex-shell" aria-label="Unidex Entries View">
                <header class="unidex-panel-header">
                    <button type="button" class="unidex-back-btn" onclick="window.UnidexView.backToCards()">Back To Cards</button>
                    <h3 class="unidex-panel-title">${escapeHtml(selectedCategory)} Entries</h3>
                </header>
                <section class="unidex-entries" aria-label="Bookmark and Library Entries">
                    ${buildEntriesHtml(entries, taskMode)}
                </section>
            </section>
        `;
    }

    function ensureValidState() {
        if (stage === 'tabs') return;

        const workspace = getWorkspaceById(selectedWorkspaceId);
        if (!workspace) {
            resetSelection();
            return;
        }

        if (stage === 'entries' && !selectedCategory) {
            stage = 'cards';
        }
    }

    function render(gridContainer, options) {
        if (!gridContainer) return;

        const searchStr = options && options.searchStr ? String(options.searchStr) : '';
        ensureValidState();

        if (stage === 'tabs') {
            renderTabsStage(gridContainer);
            return;
        }

        if (stage === 'cards') {
            renderCardsStage(gridContainer, searchStr);
            return;
        }

        renderEntriesStage(gridContainer, searchStr);
    }

    function switchWorkspaceTab(workspaceIdParam) {
        const workspaceId = decodeParam(workspaceIdParam);
        if (!workspaceId) return;

        selectedWorkspaceId = workspaceId;
        selectedCategory = '';
        stage = 'cards';

        if (String(config.activeWorkspace) !== String(workspaceId) && typeof switchWorkspace === 'function') {
            switchWorkspace(workspaceId);
            return;
        }

        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function selectCategory(categoryParam) {
        const category = decodeParam(categoryParam);
        if (!category) return;
        selectedCategory = category;
        stage = 'entries';
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function backToTabs() {
        resetSelection();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function backToCards() {
        if (!selectedWorkspaceId) {
            backToTabs();
            return;
        }
        stage = 'cards';
        selectedCategory = '';
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function openEntry(linkIdParam, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        const linkId = decodeParam(linkIdParam);
        if (!linkId) return false;

        if (typeof openBookmarkFromDashboard === 'function') {
            return openBookmarkFromDashboard(event, linkId);
        }

        const link = getAllLinks().find(function (item) {
            return String(item.id) === String(linkId);
        });
        if (link?.url) {
            const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
            window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
        return false;
    }

    function resetSelection() {
        stage = 'tabs';
        selectedWorkspaceId = '';
        selectedCategory = '';
    }

    return {
        render: render,
        switchWorkspaceTab: switchWorkspaceTab,
        selectCategory: selectCategory,
        backToTabs: backToTabs,
        backToCards: backToCards,
        openEntry: openEntry,
        resetSelection: resetSelection
    };
})();
