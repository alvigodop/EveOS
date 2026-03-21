window.DashboardCategories = window.DashboardCategories || {};

(function () {
    var api = window.DashboardCategories._builderCard = window.DashboardCategories._builderCard || {};

var DEFAULT_CARD_HEADER_BUTTONS = ['add', 'folders', 'library', 'focus', 'launch'];
    var ALL_CARD_HEADER_BUTTONS = ['add', 'folders', 'library', 'focus', 'launch', 'constellation'];
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

    function showCardTitleHover(event, titleText) {
        var target = event && event.currentTarget;
        if (!target || !titleText) return;

        var overlay = ensureCardTitleHoverOverlay();
        overlay.textContent = String(titleText);
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

    function buildFolderAction(categoryName, folderId, action) {
        const safeCategory = escapeCardJs(categoryName);
        const safeFolderId = escapeCardJs(folderId);
        return `event.preventDefault();event.stopPropagation();${action}('${safeCategory}', '${safeFolderId}')`;
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

    

    Object.assign(api, {
        DEFAULT_CARD_HEADER_BUTTONS,
        ALL_CARD_HEADER_BUTTONS,
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
        getCardHeaderButtonStore,
        normalizeHeaderButtons,
        getCardHeaderButtonsForCategory,
        setCardHeaderButtonsForCategory
    });
})();
