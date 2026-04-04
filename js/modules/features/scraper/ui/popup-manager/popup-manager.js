/**
 * Popup Manager Module
 * Handles all popup-related operations including opening, closing, and navigation
 * Refactored to act as a facade for PopupHistory, PopupConfirmation, and PopupViewer
 */
const PopupManager = {};

// Expose internal components for debugging if needed, 
// though they are global (window.PopupHistory, etc.)
PopupManager.components = {
    get history() { return window.PopupHistory; },
    get confirmation() { return window.PopupConfirmation; },
    get viewer() { return window.PopupViewer; }
};

/**
 * Initialize the PopupManager
 */
PopupManager.init = function () {
    console.log('Initializing PopupManager...');

    // History reset is handled by PopupHistory default state
    if (window.PopupHistory) {
        PopupHistory.resetHistory();
    }

    // Check if valid popup logic exists
    const popup = document.getElementById('wikiPopup');
    if (!popup) {
        console.warn('Wiki popup element not found - some features may be disabled');
    }

    this._initialized = true;
    return this;
};

// --- Confirmation Facade ---

PopupManager.showConfirmation = function (message) {
    if (window.PopupConfirmation) {
        return PopupConfirmation.showConfirmation(message);
    }
    return Promise.resolve(confirm(message));
};

PopupManager.closeConfirmation = function (confirmed) {
    if (window.PopupConfirmation) {
        PopupConfirmation.closeConfirmation(confirmed);
    }
};

// --- Viewer Facade ---

PopupManager.openPopup = function (url, title) {
    if (window.PopupViewer) {
        return PopupViewer.openPopup(url, title);
    }
    return false;
};

PopupManager.closePopup = function () {
    if (window.PopupViewer) {
        PopupViewer.closePopup();
    }
};

PopupManager.closeDataPopup = function () {
    if (window.PopupViewer) {
        PopupViewer.closeDataPopup();
    }
};

PopupManager.openPopupFromCache = function (url, title) {
    if (window.PopupViewer) {
        PopupViewer.openPopupFromCache(url, title);
    }
};

PopupManager.viewCachedData = function (domain) {
    if (window.PopupViewer) {
        PopupViewer.viewCachedData(domain);
    }
};

PopupManager.viewWikiCachedData = function (title) {
    if (window.PopupViewer) {
        PopupViewer.viewWikiCachedData(title);
    }
};

PopupManager.viewCategoryCachedData = function (category, name) {
    if (window.PopupViewer) {
        PopupViewer.viewCategoryCachedData(category, name);
    }
};

// --- History Facade ---

PopupManager._addToHistory = function (state) {
    if (window.PopupHistory) {
        PopupHistory.addToHistory(state);
    }
};

PopupManager.navigatePopupHistory = function (direction) {
    if (window.PopupHistory) {
        PopupHistory.navigatePopupHistory(direction);
    }
};

PopupManager.navigatePopupBack = function () {
    if (window.PopupHistory) {
        PopupHistory.navigatePopupBack();
    }
};

PopupManager.navigatePopupForward = function () {
    if (window.PopupHistory) {
        PopupHistory.navigatePopupForward();
    }
};

PopupManager.updateNavigationButtons = function () {
    if (window.PopupHistory) {
        PopupHistory.updateNavigationButtons();
    }
};

PopupManager.getCurrentHistoryState = function () {
    if (window.PopupHistory) {
        return PopupHistory.getCurrentHistoryState();
    }
    return null;
};

PopupManager.canGoBack = function () {
    if (window.PopupHistory) {
        return PopupHistory.canGoBack();
    }
    return false;
};

PopupManager.canGoForward = function () {
    if (window.PopupHistory) {
        return PopupHistory.canGoForward();
    }
    return false;
};

// Compatibility for internal methods used by sub-modules if any
PopupManager._showCachedContent = function (domain) {
    if (window.PopupViewer) {
        PopupViewer._showCachedContent(domain);
    }
};

PopupManager._showWikiCachedContent = function (title) {
    if (window.PopupViewer) {
        PopupViewer._showWikiCachedContent(title);
    }
};

// Getters/Setters for compatibility with direct property access if used elsewhere
Object.defineProperty(PopupManager, '_popupHistory', {
    get: function () { return window.PopupHistory ? PopupHistory._popupHistory : []; },
    set: function (val) { if (window.PopupHistory) PopupHistory._popupHistory = val; }
});

Object.defineProperty(PopupManager, '_currentHistoryIndex', {
    get: function () { return window.PopupHistory ? PopupHistory._currentHistoryIndex : -1; },
    set: function (val) { if (window.PopupHistory) PopupHistory._currentHistoryIndex = val; }
});

// Make PopupManager globally available
window.PopupManager = PopupManager;

// Register with ModuleRegistry if available
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('PopupManager', PopupManager);
}

console.log('Popup Manager module loaded (Modularized)');
