/**
 * Popup Viewer State Component
 * 
 * Handles History state management and dispatching
 */
(function () {
    'use strict';

    const PVState = {
        /**
         * Add page visit to history
         * @param {string} url 
         * @param {string} title 
         */
        addToHistory: function (url, title) {
            // Check source
            let source = 'fandom';
            if (window.PopupHistory) {
                const currentState = PopupHistory.getCurrentHistoryState();
                if (currentState) {
                    source = currentState.type === 'wiki-cache' ? 'wikipedia' : 'fandom';
                }

                PopupHistory.addToHistory({
                    type: 'page',
                    url: url,
                    title: title,
                    source: source // Only used in openPopupFromCache path usually but good to have
                });
            }
        },

        /**
         * Render a specific history state
         * @param {Object} state 
         */
        renderState: function (state) {
            if (!window.PVUI || !window.PVLoader) {
                console.error('PVUI or PVLoader not found in PVState');
                return;
            }

            if (state.type === 'cache') {
                PVUI.toggleWikiPopup(false);
                PVLoader.showCachedContent(state.domain);
                // Also ensure data popup is shown (which showCachedContent implies but UI handler does explicitly)
                PVUI.toggleDataPopup(true);

            } else if (state.type === 'wiki-cache') {
                PVUI.toggleWikiPopup(false);
                PVLoader.showWikiCachedContent(state.title);
                PVUI.toggleDataPopup(true);

            } else if (state.type === 'category-cache') {
                PVUI.toggleWikiPopup(false);
                PVUI.toggleDataPopup(true);
                PVUI.updateDataTitle(`Cache: ${state.name || state.category}`);
                PVLoader.renderCategoryCache(state.category, state.name);

            } else {
                // Page view
                PVUI.toggleDataPopup(false);
                PVUI.toggleWikiPopup(true);
                PVLoader.loadWikiUrl(state.url);
                PVUI.updateWikiTitle(state.title);
            }
        }
    };

    window.PVState = PVState;
})();
