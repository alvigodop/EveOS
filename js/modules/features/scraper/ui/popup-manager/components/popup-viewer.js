/**
 * Popup Viewer Component
 * Handles opening and rendering content in popups
 * Refactored to use modular components: PVUI, PVLoader, PVState
 * 
 * @version 1.0.1-modular
 */
const PopupViewer = {
    /**
     * Open a popup window for a wiki article
     * @param {string} url - The URL to open
     * @param {string} title - The title of the popup
     */
    openPopup: function (url, title) {
        if (!window.PVUI || !window.PVLoader) {
            console.error('PopupViewer modules not loaded');
            // Fallback
            window.open(url, '_blank');
            return;
        }

        const useIframe = true;

        if (useIframe) {
            PVUI.updateWikiTitle(title);
            PVLoader.loadWikiUrl(url);
            PVUI.toggleWikiPopup(true);

            // Add to history
            if (window.PopupHistory) {
                PopupHistory.addToHistory({ type: 'page', url: url, title: title });
            }
        } else {
            window.open(url, '_blank');
        }
    },

    /**
     * Close the wiki article popup
     */
    closePopup: function () {
        if (window.PVUI && window.PVLoader) {
            PVUI.toggleWikiPopup(false);
            PVLoader.clearWikiUrl();
        }
    },

    /**
     * Close the data popup
     */
    closeDataPopup: function () {
        console.log('PopupViewer.closeDataPopup called');
        if (window.PVUI && window.PVLoader) {
            console.log('Found data popup element, hiding it');
            PVUI.toggleDataPopup(false);
            PVLoader.clearDataUrl();
        }

        // Reset history
        if (window.PopupHistory) {
            PopupHistory.resetHistory();
        }
    },

    /**
     * Open a popup from cache view
     * @param {string} url - The URL to open
     * @param {string} title - The title
     */
    openPopupFromCache: function (url, title) {
        if (!window.PVUI || !window.PVLoader || !window.PVState) return;

        // History handling delegated to PVState (partially, logic was inline)
        PVState.addToHistory(url, title);

        // Hide Data Popup, Show Wiki Popup
        PVUI.toggleDataPopup(false);
        // Ensure content visibility reset (legacy behavior preserved)
        PVUI.setDataContentVisibility(true);
        PVUI.setDataFrameVisibility(false); // In original code: wrapper hidden, iframe hidden

        PVUI.toggleWikiPopup(true);
        PVLoader.loadWikiUrl(url);
        PVUI.updateWikiTitle(title);
    },

    /**
     * View cached data for a Fandom domain
     * @param {string} domain - The domain to view cache for
     */
    viewCachedData: function (domain) {
        if (!window.PVUI || !window.PVLoader) return;

        // Reset history
        if (window.PopupHistory) {
            PopupHistory.resetHistory([{ type: 'cache', domain: domain }]);
        }

        PVUI.toggleDataPopup(true);
        PVLoader.showCachedContent(domain);

        if (window.PopupHistory) {
            PopupHistory.updateNavigationButtons();
        }
    },

    /**
     * View cached data for a Wikipedia entry
     * @param {string} title - The entry title to view cache for
     */
    viewWikiCachedData: function (title) {
        if (!window.PVUI || !window.PVLoader) return;

        // Reset history
        if (window.PopupHistory) {
            PopupHistory.resetHistory([{ type: 'wiki-cache', title: title }]);
        }

        PVUI.toggleDataPopup(true);
        PVLoader.showWikiCachedContent(title);

        if (window.PopupHistory) {
            PopupHistory.updateNavigationButtons();
        }
    },

    /**
     * View cached data for a Wikipedia category
     * @param {string} category 
     * @param {string} name 
     */
    viewCategoryCachedData: function (category, name) {
        if (!window.PVUI || !window.PVLoader) return;

        if (window.PopupHistory) {
            PopupHistory.resetHistory([{ type: 'category-cache', category: category, name: name }]);
        }

        PVUI.toggleDataPopup(true);
        PVUI.updateDataTitle(`Cache: ${name || category}`);

        PVLoader.renderCategoryCache(category, name);

        if (window.PopupHistory) {
            PopupHistory.updateNavigationButtons();
        }
    },

    /**
     * Render a specific history state
     * Called by PopupHistory during navigation
     * @param {Object} state 
     */
    renderState: function (state) {
        if (window.PVState) {
            PVState.renderState(state);
        }
    },

    // Exposed inner methods (required for compatibility if some other module calls them directly? 
    // Unlikely, but let's map them to PVLoader just in case, or omit if private)
    // _showCachedContent and _showWikiCachedContent were private ("_") so we don't need to expose them on Facade.
};

window.PopupViewer = PopupViewer;
