// --- UNIDEX VIEW (TABS -> CARDS -> ENTRIES) ---
window.UnidexView = (function () {
    const state = {
        stage: 'tabs',
        selectedWorkspaceId: '',
        selectedCategory: '',
        entriesRetryTimer: null,
        layoutMaintenanceTimers: [],
        layoutMaintenanceToken: 0,
        libraryReadyWaitStartedAt: 0,
        LIBRARY_READY_RETRY_MS: 180,
        LIBRARY_READY_HINT_DELAY_MS: 320,
        LIBRARY_READY_MAX_WAIT_MS: 2500,
        LAYOUT_MAINTENANCE_DELAYS_MS: [0, 600, 1800, 3600]
    };

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

    function getAllWorkspaceLinks(searchStr) {
        return getAllLinks().filter(function (link) {
            const hasWorkspace = getWorkspaceById(link.workspace);
            return !!hasWorkspace && matchesSearch(link, searchStr);
        });
    }

    function getWorkspaceLabel(workspaceId) {
        const workspace = getWorkspaceById(workspaceId);
        if (!workspace) return 'Unknown Tab';
        return String(workspace.name || 'Unnamed Tab');
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

    function getLinkedLibraryEntry(linkId) {
        return getLinkedRecord(linkId)?.entry || null;
    }

    function getEntryConfidence(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const ratingsApi = window.EveLibrary?.Ratings;
        if (ratingsApi?.applyDerivedRatings) {
            ratingsApi.applyDerivedRatings(entry);
        }
        const value = Number(entry?.derivedRatings?.confidence);
        if (!Number.isFinite(value)) return null;
        return Math.max(0, Math.min(1, value));
    }

    function clearEntriesRetryTimer() {
        if (!state.entriesRetryTimer) return;
        clearTimeout(state.entriesRetryTimer);
        state.entriesRetryTimer = null;
    }

    function scheduleEntriesRetry() {
        if (state.entriesRetryTimer) return;
        state.entriesRetryTimer = setTimeout(function () {
            state.entriesRetryTimer = null;
            if (state.stage !== 'entries') return;
            if (typeof renderDashboard === 'function') renderDashboard();
        }, state.LIBRARY_READY_RETRY_MS);
    }

    function resetLibraryReadyWait() {
        state.libraryReadyWaitStartedAt = 0;
        clearEntriesRetryTimer();
    }

    function ensureLibraryReadyForEntries() {
        const lib = window.EveLibrary;
        const api = lib?.ConnectionsAPI;
        const stateApi = lib?.State;

        if (api?.loadConnections && !Array.isArray(lib?.Connections)) {
            try {
                api.loadConnections();
            } catch (error) {
                // best-effort; we'll retry shortly
            }
        }

        const ready = !!(api?.getLinkedEntry && stateApi && Array.isArray(lib?.Connections));

        if (ready) {
            resetLibraryReadyWait();
            return true;
        }

        if (!state.libraryReadyWaitStartedAt) {
            state.libraryReadyWaitStartedAt = Date.now();
        }

        const elapsed = Date.now() - state.libraryReadyWaitStartedAt;
        return elapsed >= state.LIBRARY_READY_MAX_WAIT_MS;
    }

    function shouldShowLibraryLoadingHint() {
        if (!state.libraryReadyWaitStartedAt) return false;
        return (Date.now() - state.libraryReadyWaitStartedAt) >= state.LIBRARY_READY_HINT_DELAY_MS;
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

    const modules = window.UnidexViewModules || {};
    const builders = modules.createBuilders
        ? modules.createBuilders({
            state,
            getAllLinks,
            encodeParam,
            escapeHtml,
            getDomain,
            truncateText,
            getLinkedLibraryEntry,
            getEntryConfidence,
            getMediaTypeLabel,
            getProgressLabel,
            buildBookmarkIconHtml
        })
        : null;

    const controls = modules.createControls
        ? modules.createControls({
            state,
            getLinkedLibraryEntry,
            getEntryConfidence
        })
        : null;

    const layout = modules.createLayout
        ? modules.createLayout({ state })
        : null;

    if (!builders || !controls || !layout || !modules.createStages) {
        console.warn('[UnidexView] Modular components missing (builders/controls/layout/stages).');
        return {
            render: function () { },
            switchWorkspaceTab: function () { },
            selectCategory: function () { },
            backToTabs: function () { },
            backToCards: function () { },
            setEntriesFilter: function () { },
            setEntriesSortBy: function () { },
            setEntriesSortOrder: function () { },
            setEntriesConfidenceMin: function () { },
            setEntriesConfidenceMax: function () { },
            setCardsUnified: function () { },
            setTabsUnified: function () { },
            toggleEntriesLayout: function () { },
            openEntryDirect: function () { return false; },
            openEntry: function () { return false; },
            resetSelection: function () { }
        };
    }

    const stages = modules.createStages({
        state,
        getWorkspaceById,
        getWorkspaceLinks,
        getAllWorkspaceLinks,
        getCategoryModels,
        isTaskModeCategory,
        getWorkspaceLabel,
        escapeHtml,
        ensureLibraryReadyForEntries,
        shouldShowLibraryLoadingHint,
        scheduleEntriesRetry,
        resetLibraryReadyWait,
        stabilizeEntriesLayout: layout.stabilizeEntriesLayout,
        clearLayoutMaintenanceTimers: layout.clearLayoutMaintenanceTimers,
        scheduleLayoutMaintenance: function (gridContainer) {
            layout.scheduleLayoutMaintenance(gridContainer, controls.getEntriesLayoutMode);
        },
        buildTabsHtml: builders.buildTabsHtml,
        buildCardsHtml: builders.buildCardsHtml,
        buildEntriesHtml: builders.buildEntriesHtml,
        getEntriesLayoutMode: controls.getEntriesLayoutMode,
        getCardsUnifiedMode: controls.getCardsUnifiedMode,
        getTabsUnifiedMode: controls.getTabsUnifiedMode,
        getEntriesFilterMode: controls.getEntriesFilterMode,
        applyEntriesViewTransforms: controls.applyEntriesViewTransforms,
        buildEntriesControlsHtml: controls.buildEntriesControlsHtml
    });

    function switchWorkspaceTab(workspaceIdParam) {
        const workspaceId = decodeParam(workspaceIdParam);
        if (!workspaceId) return;

        state.selectedWorkspaceId = workspaceId;
        state.selectedCategory = '';
        state.stage = 'cards';

        if (String(config.activeWorkspace) !== String(workspaceId) && typeof switchWorkspace === 'function') {
            switchWorkspace(workspaceId);
            return;
        }

        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function selectCategory(categoryParam) {
        const category = decodeParam(categoryParam);
        if (!category) return;
        state.selectedCategory = category;
        state.stage = 'entries';
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function backToTabs() {
        stages.resetSelection();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function backToCards() {
        if (!state.selectedWorkspaceId) {
            backToTabs();
            return;
        }
        resetLibraryReadyWait();
        state.stage = 'cards';
        state.selectedCategory = '';
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

    function openEntryDirect(linkIdParam, event) {
        if (event?.preventDefault) event.preventDefault();
        if (event?.stopPropagation) event.stopPropagation();

        const linkId = decodeParam(linkIdParam);
        if (!linkId) return false;

        const link = getAllLinks().find(function (item) {
            return String(item.id) === String(linkId);
        });
        if (!link?.url) return false;

        const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(link.url) : link.url;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        return false;
    }

    function setCardsUnified(enabled) {
        const changed = controls.setCardsUnifiedMode(enabled);
        if (changed) resetLibraryReadyWait();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    function setTabsUnified(enabled) {
        const changed = controls.setTabsUnifiedMode(enabled);
        if (changed) resetLibraryReadyWait();
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    return {
        render: stages.render,
        switchWorkspaceTab: switchWorkspaceTab,
        selectCategory: selectCategory,
        backToTabs: backToTabs,
        backToCards: backToCards,
        setEntriesFilter: controls.setEntriesFilter,
        setEntriesSortBy: controls.setEntriesSortBy,
        setEntriesSortOrder: controls.setEntriesSortOrder,
        setEntriesConfidenceMin: controls.setEntriesConfidenceMin,
        setEntriesConfidenceMax: controls.setEntriesConfidenceMax,
        setCardsUnified: setCardsUnified,
        setTabsUnified: setTabsUnified,
        toggleEntriesLayout: controls.toggleEntriesLayout,
        openEntryDirect: openEntryDirect,
        openEntry: openEntry,
        resetSelection: stages.resetSelection
    };
})();
