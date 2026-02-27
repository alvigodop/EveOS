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

    function truncateText(value, maxLength) {
        const text = String(value || '').trim();
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
    }

    function getMediaTypeLabel(entry) {
        const rawType = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length
            ? String(entry.mediaTypes[0] || '').trim()
            : '';
        if (!rawType) return '';
        if (rawType === 'graphicNovels') return 'Graphic Novel';
        if (rawType === 'novels') return 'Novel';
        if (rawType === 'films') return 'Film/Series';
        return rawType;
    }

    function getProgressLabel(entry) {
        if (!entry || typeof entry !== 'object') return '';
        const season = Number(entry.season || 0);
        const episode = Number(entry.episode || 0);
        if (season > 0 || episode > 0) return `S${Math.max(0, season)} E${Math.max(0, episode)}`;

        const graphicChapter = Number(entry.graphicChapter || 0);
        if (graphicChapter > 0) return `Chapter ${graphicChapter}`;

        const novelChapter = Number(entry.novelChapter || 0);
        if (novelChapter > 0) return `Chapter ${novelChapter}`;

        const chapter = Number(entry.chapter || 0);
        if (chapter > 0) return `Chapter ${chapter}`;
        return '';
    }

    function buildBookmarkIconHtml(link, safeTitle) {
        const iconRaw = String(link?.icon || '').trim();
        const iconNormalized = iconRaw.replace(/\uFE0F/g, '');
        const isLegacyLinkIcon = iconNormalized === '\u{1F517}';
        const hasCustomIcon = !!iconNormalized && !isLegacyLinkIcon;

        if (hasCustomIcon) {
            if (/^https?:\/\//i.test(iconRaw)) {
                const safeIconUrl = escapeHtml(iconRaw);
                return `<img class="unidex-entry-bookmark-icon-img" src="${safeIconUrl}" alt="${safeTitle} icon" loading="lazy" referrerpolicy="no-referrer">`;
            }
            return `<span class="unidex-entry-bookmark-icon-emoji">${escapeHtml(iconRaw)}</span>`;
        }

        const sourceUrl = String(link?.url || '').trim();
        const isLocal = sourceUrl.startsWith('file://');
        const domain = getDomain(sourceUrl);
        const hasDomain = !isLocal && domain.includes('.');
        if (hasDomain) {
            const safeDomain = escapeHtml(domain);
            return `<img class="unidex-entry-bookmark-icon-img" src="https://www.google.com/s2/favicons?domain=${safeDomain}&sz=64" alt="${safeTitle} icon" loading="lazy" referrerpolicy="no-referrer">`;
        }

        return '<span class="unidex-entry-bookmark-icon-fallback">&#128279;</span>';
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
            const hoverText = escapeHtml(truncateText(String(link.title || 'Untitled').toUpperCase(), 34));
            const safeDomain = escapeHtml(getDomain(link.url));
            const linkedRecord = getLinkedRecord(link.id);
            const isLibraryLinked = !!linkedRecord?.entry;
            const libraryEntry = linkedRecord?.entry || null;
            const libraryStatusRaw = String(libraryEntry?.status || '').trim();
            const libraryRatingRaw = String(libraryEntry?.rating || '').trim();
            const libraryAuthorRaw = String(libraryEntry?.author || '').trim();
            const libraryGenreRaw = String(libraryEntry?.genre || '').trim();
            const librarySummaryRaw = truncateText(libraryEntry?.summary, 220);
            const libraryLanguageRaw = String(libraryEntry?.language || '').trim();
            const libraryMediaTypeRaw = getMediaTypeLabel(libraryEntry);
            const progressRaw = getProgressLabel(libraryEntry);
            const coverUrlRaw = String(libraryEntry?.image || libraryEntry?.imageUrl || '').trim();
            const libraryStatus = escapeHtml(libraryStatusRaw || 'No status');
            const libraryRating = escapeHtml(libraryRatingRaw || '-');
            const libraryAuthor = escapeHtml(libraryAuthorRaw);
            const libraryGenre = escapeHtml(libraryGenreRaw);
            const librarySummary = escapeHtml(librarySummaryRaw);
            const libraryLanguage = escapeHtml(libraryLanguageRaw);
            const libraryMediaType = escapeHtml(libraryMediaTypeRaw);
            const libraryProgress = escapeHtml(progressRaw);
            const safeCoverUrl = escapeHtml(coverUrlRaw);
            const libraryChips = [];
            if (libraryStatusRaw) libraryChips.push(`<span class="unidex-entry-chip">${libraryStatus}</span>`);
            if (libraryRatingRaw) libraryChips.push(`<span class="unidex-entry-chip">Rating ${libraryRating}</span>`);
            if (libraryProgress) libraryChips.push(`<span class="unidex-entry-chip">${libraryProgress}</span>`);
            if (libraryMediaType) libraryChips.push(`<span class="unidex-entry-chip">${libraryMediaType}</span>`);
            if (libraryLanguage) libraryChips.push(`<span class="unidex-entry-chip">${libraryLanguage}</span>`);
            const libraryDetailHtml = isLibraryLinked
                ? `
                    <div class="unidex-entry-library-wrap">
                        ${libraryAuthor ? `<p class="unidex-entry-library-author">${libraryAuthor}</p>` : ''}
                        ${libraryGenre ? `<p class="unidex-entry-library-genre">${libraryGenre}</p>` : ''}
                        ${libraryChips.length ? `<div class="unidex-entry-library-chips">${libraryChips.join('')}</div>` : ''}
                        ${librarySummary ? `<p class="unidex-entry-library-summary">${librarySummary}</p>` : ''}
                    </div>
                `
                : '';
            const visualHtml = isLibraryLinked
                ? `
                    <div class="unidex-entry-cover-slot">
                        ${safeCoverUrl
                            ? `<img class="unidex-entry-cover" src="${safeCoverUrl}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer">`
                            : '<div class="unidex-entry-cover-fallback">&#128218;</div>'}
                    </div>
                `
                : `
                    <div class="unidex-entry-cover-slot is-bookmark-only">
                        <div class="unidex-entry-bookmark-icon-wrap">
                            ${buildBookmarkIconHtml(link, safeTitle)}
                        </div>
                    </div>
                `;
            const taskTagHtml = taskMode
                ? `<span class="unidex-entry-tag ${link.done ? 'done' : 'pending'}">${link.done ? 'Done' : 'Pending'}</span>`
                : '';
            const libraryTagHtml = isLibraryLinked
                ? '<span class="unidex-entry-tag library-linked">Library Linked</span>'
                : '';

            return `
                <article class="unidex-entry-item has-visual-slot ${taskMode && link.done ? 'is-done' : ''} ${isLibraryLinked ? 'is-library-linked' : 'is-bookmark-only'}"
                    data-text="${hoverText}">
                    ${visualHtml}
                    <div class="unidex-entry-main">
                        <h4 class="unidex-entry-title">${safeTitle}</h4>
                        <p class="unidex-entry-domain">${safeDomain}</p>
                        ${libraryDetailHtml}
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
                    <h2 class="unidex-title unidex-echo-title" data-text="THE UNIDEX VIEW"><span>The Unidex View</span></h2>
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
                    <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(workspace.name || "").toUpperCase())}"><span>${escapeHtml(workspace.name)} Cards</span></h3>
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
                    <h3 class="unidex-panel-title unidex-echo-title" data-text="${escapeHtml(String(selectedCategory || "").toUpperCase())}"><span>${escapeHtml(selectedCategory)} Entries</span></h3>
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
