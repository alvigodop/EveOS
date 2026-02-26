/**
 * View List Module
 * 
 * Handles rendering of search results in list layout
 * Refactored to use modular components: VLMedia, VLContent, VLActions
 * 
 * @version 1.0.1-modular
 */

(function () {
    'use strict';

    if (!window.ViewList) {
        window.ViewList = {
            /**
             * Create a list-style result element
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @param {object} context - The ResultDisplay instance (for helpers)
             * @returns {Element} - The created list result element
             */
            createResultElement: function (result, options, context) {
                const item = document.createElement('div');
                item.className = 'result-item';

                // Add data-title for lazy thumbnail loading targeting
                if (result.title) {
                    item.setAttribute('data-title', result.title);
                }

                // Add type-specific class
                if (result.type) {
                    item.classList.add(`result-type-${result.type}`);
                }

                // Add source-specific class
                if (result.source) {
                    item.classList.add(`result-source-${result.source}`);
                }

                // Add main community flag special class for styling
                if (result.isMainCommunity) {
                    item.classList.add('main-community');
                }

                // Add verified flag if available
                if (result.verified) {
                    item.classList.add('verified');
                }

                // Create row container
                const row = document.createElement('div');
                row.className = 'result-row';

                // 1. Media Column (Thumbnail/Icon) - Left
                if (window.VLMedia) {
                    row.appendChild(window.VLMedia.create(result, options, context));
                } else {
                    console.error('VLMedia module not loaded');
                }

                // 2. Content Column (Title, Badges, Snippet) - Middle
                if (window.VLContent) {
                    row.appendChild(window.VLContent.create(result, options, context));
                } else {
                    console.error('VLContent module not loaded');
                }

                // 3. Actions Column (Visit Button) - Right
                if (window.VLActions) {
                    row.appendChild(window.VLActions.create(result, context));
                } else {
                    console.error('VLActions module not loaded');
                }

                item.appendChild(row);
                return item;
            }
        };

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            try {
                window.ModuleRegistry.register('ViewList', window.ViewList);
            } catch (error) {
                console.error('Error registering ViewList with ModuleRegistry:', error);
            }
        }
    }
})();
