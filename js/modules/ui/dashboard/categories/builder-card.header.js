window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};

var DEFAULT_CARD_HEADER_BUTTONS = ['add', 'folders', 'library', 'focus', 'launch'];
    var ALL_CARD_HEADER_BUTTONS = ['add', 'folders', 'library', 'focus', 'launch', 'constellation'];
    var DEFAULT_PROGRESSIVE_BOOKMARK_REVEAL = true;
    window.categoryCardFolderActionExpansion = window.categoryCardFolderActionExpansion || {};

    function escapeCardHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeCardJs(value) {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function ensureCardTitleHoverOverlay() {
        var overlay = document.getElementById('category-title-hover-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'category-title-hover-overlay';
        overlay.className = 'category-title-hover-overlay';
        document.body.appendChild(overlay);
        return overlay;
    }

    function positionCardTitleHoverOverlay(target, overlay) {
        if (!target || !overlay) return;

        var rect = target.getBoundingClientRect();
        var viewportPadding = 8;
        var top = rect.top - overlay.offsetHeight - 10;
        if (top < viewportPadding) {
            top = rect.bottom + 10;
        }

        var left = rect.left;
        var maxLeft = window.innerWidth - overlay.offsetWidth - viewportPadding;
        if (left > maxLeft) left = maxLeft;
        if (left < viewportPadding) left = viewportPadding;

        overlay.style.top = Math.round(top) + 'px';
        overlay.style.left = Math.round(left) + 'px';
    }

    function showCardTitleHover(event, titleText, descriptionText) {
        var target = event && event.currentTarget;
        if (!target || !titleText) return;

        var overlay = ensureCardTitleHoverOverlay();
        var description = String(descriptionText || target.dataset.description || '').trim();
        overlay.innerHTML = ''
            + '<div class="category-title-hover-title">' + escapeCardHtml(titleText) + '</div>'
            + (description ? '<div class="category-title-hover-description">' + escapeCardHtml(description) + '</div>' : '');
        overlay.classList.add('is-visible');
        positionCardTitleHoverOverlay(target, overlay);
    }

    function moveCardTitleHover(event) {
        var target = event && event.currentTarget;
        var overlay = document.getElementById('category-title-hover-overlay');
        if (!target || !overlay || !overlay.classList.contains('is-visible')) return;
        positionCardTitleHoverOverlay(target, overlay);
    }

    function hideCardTitleHover() {
        var overlay = document.getElementById('category-title-hover-overlay');
        if (!overlay) return;
        overlay.classList.remove('is-visible');
    }

    function handleCardHeaderIconRowWheel(event) {
        var row = event && event.currentTarget;
        if (!row || row.scrollWidth <= row.clientWidth) return;
        var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (!delta) return;
        row.scrollLeft += delta;
        event.preventDefault();
        event.stopPropagation();
    }

    function buildFolderAction(categoryName, folderId, action, workspaceId) {
        const safeCategory = escapeCardJs(categoryName);
        const safeFolderId = escapeCardJs(folderId);
        const safeWorkspace = escapeCardJs(workspaceId || '');
        return `event.preventDefault();event.stopPropagation();${action}('${safeCategory}', '${safeFolderId}', '${safeWorkspace}')`;
    }

    function getFolderActionExpansionStore() {
        if (!window.categoryCardFolderActionExpansion || typeof window.categoryCardFolderActionExpansion !== 'object') {
            window.categoryCardFolderActionExpansion = {};
        }
        return window.categoryCardFolderActionExpansion;
    }

    function buildFolderActionExpansionKey(workspaceId, categoryName, folderId) {
        return [
            String(workspaceId || 'main').trim() || 'main',
            String(categoryName || 'Unsorted').trim() || 'Unsorted',
            String(folderId || '').trim()
        ].join('::');
    }

    function isFolderActionExpanded(workspaceId, categoryName, folderId) {
        return !!getFolderActionExpansionStore()[buildFolderActionExpansionKey(workspaceId, categoryName, folderId)];
    }

    function buildScopedCategoryKey(workspaceId, categoryName) {
        if (window.EveBookmarkFolders?.buildScopedKey) {
            return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
        }
        var safeWorkspace = String(workspaceId || 'main').trim() || 'main';
        var safeCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return safeWorkspace + '::' + safeCategory;
    }

    function getCardHeaderButtonStore() {
        if (!window.eveState?.config) return {};
        if (!window.eveState.config.cardHeaderButtonsVisible || typeof window.eveState.config.cardHeaderButtonsVisible !== 'object' || Array.isArray(window.eveState.config.cardHeaderButtonsVisible)) {
            window.eveState.config.cardHeaderButtonsVisible = {};
        }
        return window.eveState.config.cardHeaderButtonsVisible;
    }

    function getCardBookmarkRevealStore() {
        if (!window.eveState?.config) return {};
        if (!window.eveState.config.cardBookmarkProgressiveReveal || typeof window.eveState.config.cardBookmarkProgressiveReveal !== 'object' || Array.isArray(window.eveState.config.cardBookmarkProgressiveReveal)) {
            window.eveState.config.cardBookmarkProgressiveReveal = {};
        }
        return window.eveState.config.cardBookmarkProgressiveReveal;
    }

    function getFolderBookmarkRevealStore() {
        if (!window.eveState?.config) return {};
        if (!window.eveState.config.folderBookmarkProgressiveReveal || typeof window.eveState.config.folderBookmarkProgressiveReveal !== 'object' || Array.isArray(window.eveState.config.folderBookmarkProgressiveReveal)) {
            window.eveState.config.folderBookmarkProgressiveReveal = {};
        }
        return window.eveState.config.folderBookmarkProgressiveReveal;
    }

    function getCardDescriptionStore() {
        if (!window.eveState?.config) return {};
        if (!window.eveState.config.cardDescriptions || typeof window.eveState.config.cardDescriptions !== 'object' || Array.isArray(window.eveState.config.cardDescriptions)) {
            window.eveState.config.cardDescriptions = {};
        }
        return window.eveState.config.cardDescriptions;
    }

    function buildScopedFolderKey(workspaceId, categoryName, folderId) {
        return buildScopedCategoryKey(workspaceId, categoryName) + '::' + String(folderId || '').trim();
    }

    function getCardDescription(workspaceId, categoryName) {
        var scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        return String(getCardDescriptionStore()[scopedKey] || '').trim();
    }

    function setCardDescription(workspaceId, categoryName, description) {
        var resolvedWorkspaceId = String(workspaceId || 'main').trim() || 'main';
        var resolvedCategoryName = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        var scopedKey = buildScopedCategoryKey(resolvedWorkspaceId, resolvedCategoryName);
        var store = getCardDescriptionStore();
        var nextValue = String(description || '').trim();
        if (nextValue) store[scopedKey] = nextValue;
        else delete store[scopedKey];

        if (typeof saveConfig === 'function') {
            saveConfig({
                source: 'card-description',
                meta: { kind: 'card-description', workspaceId: resolvedWorkspaceId, categoryName: resolvedCategoryName }
            });
        }
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('eve:state-mutated', {
                detail: {
                    source: 'card-description',
                    meta: { kind: 'card-description', workspaceId: resolvedWorkspaceId, categoryName: resolvedCategoryName }
                }
            }));
        }
        if (typeof renderDashboard === 'function') renderDashboard();
        return getCardDescription(resolvedWorkspaceId, resolvedCategoryName);
    }

    function normalizeFolderBookmarkProgressiveRevealMode(mode) {
        var normalized = String(mode || '').trim().toLowerCase();
        if (mode === true || normalized === 'on' || normalized === 'enabled' || normalized === 'true') return 'on';
        if (mode === false || normalized === 'off' || normalized === 'disabled' || normalized === 'false') return 'off';
        return 'inherit';
    }

    function getFolderBookmarkProgressiveRevealMode(workspaceId, categoryName, folderId) {
        var normalizedFolderId = String(folderId || '').trim();
        if (!normalizedFolderId) return 'inherit';
        var store = getFolderBookmarkRevealStore();
        var scopedKey = buildScopedFolderKey(workspaceId, categoryName, normalizedFolderId);
        if (!Object.prototype.hasOwnProperty.call(store, scopedKey)) return 'inherit';
        return normalizeFolderBookmarkProgressiveRevealMode(store[scopedKey]);
    }

    function isFolderBookmarkProgressiveRevealEnabled(workspaceId, categoryName, folderId) {
        var mode = getFolderBookmarkProgressiveRevealMode(workspaceId, categoryName, folderId);
        if (mode === 'on') return true;
        if (mode === 'off') return false;
        return isCardBookmarkProgressiveRevealEnabled(workspaceId, categoryName);
    }

    function setFolderBookmarkProgressiveRevealMode(workspaceId, categoryName, folderId, mode) {
        var normalizedFolderId = String(folderId || '').trim();
        if (!normalizedFolderId) return 'inherit';
        var scopedKey = buildScopedFolderKey(workspaceId, categoryName, normalizedFolderId);
        var store = getFolderBookmarkRevealStore();
        var normalizedMode = normalizeFolderBookmarkProgressiveRevealMode(mode);
        if (normalizedMode === 'inherit') {
            delete store[scopedKey];
        } else {
            store[scopedKey] = normalizedMode;
        }
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        return getFolderBookmarkProgressiveRevealMode(workspaceId, categoryName, normalizedFolderId);
    }

    function setFolderBookmarkProgressiveRevealEnabled(workspaceId, categoryName, folderId, enabled) {
        return setFolderBookmarkProgressiveRevealMode(workspaceId, categoryName, folderId, enabled ? 'on' : 'off');
    }

    function getFolderBookmarkProgressiveRevealOptions() {
        return [
            { value: 'inherit', label: 'Inherit Card Display' },
            { value: 'on', label: 'Use Show More' },
            { value: 'off', label: 'Render All Bookmarks' }
        ];
    }

    function describeFolderBookmarkProgressiveRevealMode(mode) {
        var normalizedMode = normalizeFolderBookmarkProgressiveRevealMode(mode);
        if (normalizedMode === 'on') return 'This folder initially shows a capped bookmark list and adds the "Show more" control when needed.';
        if (normalizedMode === 'off') return 'This folder renders all bookmarks immediately with no "Show more" control.';
        return 'This folder follows the card-level bookmark display setting.';
    }

    function normalizeHeaderButtons(buttonIds) {
        var allowed = new Set(ALL_CARD_HEADER_BUTTONS);
        return Array.from(new Set((Array.isArray(buttonIds) ? buttonIds : []).map(function (entry) {
            return String(entry || '').trim().toLowerCase();
        }).filter(function (entry) {
            return allowed.has(entry);
        })));
    }

    function getCardHeaderButtonsForCategory(workspaceId, categoryName) {
        var scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        var store = getCardHeaderButtonStore();
        if (!Object.prototype.hasOwnProperty.call(store, scopedKey)) {
            return DEFAULT_CARD_HEADER_BUTTONS.slice();
        }
        return normalizeHeaderButtons(store[scopedKey]);
    }

    function setCardHeaderButtonsForCategory(workspaceId, categoryName, buttonIds) {
        var scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        var store = getCardHeaderButtonStore();
        var normalizedButtons = normalizeHeaderButtons(buttonIds);
        if (normalizedButtons.length === DEFAULT_CARD_HEADER_BUTTONS.length) {
            delete store[scopedKey];
        } else {
            store[scopedKey] = normalizedButtons;
        }
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        return getCardHeaderButtonsForCategory(workspaceId, categoryName);
    }

    function isCardBookmarkProgressiveRevealEnabled(workspaceId, categoryName) {
        var scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        var store = getCardBookmarkRevealStore();
        if (!Object.prototype.hasOwnProperty.call(store, scopedKey)) {
            return DEFAULT_PROGRESSIVE_BOOKMARK_REVEAL;
        }
        return !!store[scopedKey];
    }

    function setCardBookmarkProgressiveRevealEnabled(workspaceId, categoryName, enabled) {
        var scopedKey = buildScopedCategoryKey(workspaceId, categoryName);
        var store = getCardBookmarkRevealStore();
        var normalizedEnabled = !!enabled;
        if (normalizedEnabled === DEFAULT_PROGRESSIVE_BOOKMARK_REVEAL) {
            delete store[scopedKey];
        } else {
            store[scopedKey] = normalizedEnabled;
        }
        if (typeof saveConfig === 'function') saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
        return isCardBookmarkProgressiveRevealEnabled(workspaceId, categoryName);
    }

    

    Object.assign(api, {
        DEFAULT_CARD_HEADER_BUTTONS,
        ALL_CARD_HEADER_BUTTONS,
        DEFAULT_PROGRESSIVE_BOOKMARK_REVEAL,
        escapeCardHtml,
        escapeCardJs,
        ensureCardTitleHoverOverlay,
        positionCardTitleHoverOverlay,
        showCardTitleHover,
        moveCardTitleHover,
        hideCardTitleHover,
        handleCardHeaderIconRowWheel,
        buildFolderAction,
        getFolderActionExpansionStore,
        buildFolderActionExpansionKey,
        isFolderActionExpanded,
        buildScopedCategoryKey,
        buildScopedFolderKey,
        getCardHeaderButtonStore,
        getCardBookmarkRevealStore,
        getFolderBookmarkRevealStore,
        getCardDescriptionStore,
        getCardDescription,
        setCardDescription,
        normalizeHeaderButtons,
        getCardHeaderButtonsForCategory,
        setCardHeaderButtonsForCategory,
        isCardBookmarkProgressiveRevealEnabled,
        setCardBookmarkProgressiveRevealEnabled,
        normalizeFolderBookmarkProgressiveRevealMode,
        getFolderBookmarkProgressiveRevealMode,
        isFolderBookmarkProgressiveRevealEnabled,
        setFolderBookmarkProgressiveRevealMode,
        setFolderBookmarkProgressiveRevealEnabled,
        getFolderBookmarkProgressiveRevealOptions,
        describeFolderBookmarkProgressiveRevealMode
    });
})();
