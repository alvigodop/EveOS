/**
 * Wiki Discovery Integration - UI Module
 * 
 * Handles UI interactions, error display, and button state updates for Wiki Discovery.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const WDIUI = {
        /**
         * Reset the Wiki Discovery UI inputs and results
         */
        resetWikiDiscovery: function () {
            const input = document.getElementById('wikiDiscoveryInput');
            const results = document.getElementById('wikiDiscoveryResults');
            if (input) input.value = '';
            if (results) results.innerHTML = '';
        },

        /**
         * Update the state of a discovery result button (add/added)
         * @param {string} type - 'wikipedia' or 'fandom'
         * @param {string} identifier - Title (for wiki) or Domain (for fandom)
         * @param {boolean} isAdded - Whether the item is currently in the list
         */
        updateDiscoveryButtonStatus: function (type, identifier, isAdded) {
            if (type === 'wikipedia') {
                const escapedIdentifier = identifier.replace(/(["\\])/g, '\\$1');
                const buttons = document.querySelectorAll(`button.add-wiki-btn[data-title="${escapedIdentifier}"]`);
                buttons.forEach(btn => {
                    btn.textContent = isAdded ? 'Added' : 'Add';
                    btn.disabled = isAdded;
                });
            } else if (type === 'fandom') {
                const escapedIdentifier = identifier.replace(/(["\\])/g, '\\$1');
                // Note: Fandom buttons might use data-domain or a heuristic match if data-domain isn't there
                const buttons = document.querySelectorAll(`button.add-wiki-btn[data-domain="${escapedIdentifier}"]`);

                // Fallback for older buttons or simple Add buttons without data attributes if specific selection logic was used before
                // The original code used a very specific querySelectorAll based on onclick for Fandom. 
                // We'll stick to data-domain if updated renderers use it, but let's check for the robust way.

                buttons.forEach(btn => {
                    btn.textContent = isAdded ? 'Added' : 'Add';
                    btn.disabled = isAdded;
                });
            }
        },

        /**
         * Helper to show an error message in a container
         * @param {string} containerId 
         * @param {string} message 
         */
        showError: function (containerId, message) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `<div class="error">${message}</div>`;
            }
        },

        /**
         * Helper to update global loading indicator
         * @param {boolean} show 
         * @param {string} message 
         */
        updateLoadingIndicator: function (show, message) {
            if (window.UI && typeof UI.updateLoadingIndicator === 'function') {
                UI.updateLoadingIndicator(show, 'loading-indicator', message);
            } else if (window.SearchUIRenderer && typeof SearchUIRenderer.showLoading === 'function') {
                // Fallback to SearchUIRenderer if UI global isn't available or preferred
                SearchUIRenderer.showLoading(show, 'loading-indicator');
            }
        },

        /**
         * Update a specific button to "Added" state
         * @param {HTMLElement} btn 
         */
        markButtonAsAdded: function (btn) {
            if (btn) {
                btn.textContent = 'Added';
                btn.disabled = true;
                btn.classList.add('added');
            }
        },

        /**
         * Render Wiki Categories
         * @param {Array} categories 
         * @param {HTMLElement} resultsDiv 
         */
        renderCategoryResults: function (categories, resultsDiv) {
            if (!resultsDiv) return;

            if (!categories || categories.length === 0) {
                resultsDiv.innerHTML = 'No categories found.';
                return;
            }

            resultsDiv.innerHTML = categories.map(cat => {
                const cleanTitle = cat.title.replace(/^Category:/, '');
                // Check if already added via WikiManager
                const isAdded = window.WikiManager && WikiManager.wikiCategories && WikiManager.wikiCategories.some(c => c.category === cleanTitle);

                // Note: The onclick will point to the facade or the module depending on how we wire it.
                // Facade is safer: WikiDiscoveryIntegration.addWikiCategory(...) which delegates to WikiManager.
                // Wait, WikiManager.addWikiCategory is the direct method.
                // The original code used WikiManager.addWikiCategory directly in the HTML string.
                // We should keep that unless we want to route through WDI.
                // Original: onclick="WikiManager.addWikiCategory('${cleanTitle.replace(/'/g, "\\'")}')"

                return `
                    <div class="wiki-discovery-item" style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                        <div class="wiki-info">
                            <strong>${cat.title}</strong>
                        </div>
                        <button 
                            onclick="WikiManager.addWikiCategory('${cleanTitle.replace(/'/g, "\\'")}')" 
                            class="add-btn"
                            style="padding: 5px 10px; background: ${isAdded ? '#ccc' : '#4CAF50'}; color: white; border: none; border-radius: 4px; cursor: ${isAdded ? 'default' : 'pointer'};"
                            ${isAdded ? 'disabled' : ''}
                        >
                            ${isAdded ? 'Added' : 'Add Category'}
                        </button>
                    </div>
                `;
            }).join('');
        }
    };

    window.WDIUI = WDIUI;

})();
