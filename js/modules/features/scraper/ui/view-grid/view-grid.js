/**
 * View Grid Module (Facade)
 * 
 * Handles rendering of search results in grid layout by orchestrating
 * specialized components for header, content, and footer.
 * 
 * @version 1.0.1-modular
 */

(function () {
    'use strict';

    if (!window.ViewGrid) {
        window.ViewGrid = {
            /**
             * Create a grid-style result element
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @param {object} context - The ResultDisplay instance (for helpers)
             * @returns {Element} - The created grid result element
             */
            createResultElement: function (result, options, context) {
                const card = document.createElement('div');
                card.className = 'result-card';

                // Add top-level attributes and classes

                // Add data-title for lazy thumbnail loading targeting
                if (result.title) {
                    card.setAttribute('data-title', result.title);
                }

                // Add type-specific class
                if (result.type) {
                    card.classList.add(`result-type-${result.type}`);
                }

                // Add source-specific class
                if (result.source) {
                    card.classList.add(`result-source-${result.source}`);
                }

                // Add main community flag special class for styling
                if (result.isMainCommunity) {
                    card.classList.add('main-community');
                }

                // Add verified flag if available
                if (result.verified) {
                    card.classList.add('verified');
                }

                // [Legacy UI Harmonization] Add status classes for premium styling
                if (result.isMainArticle) {
                    card.classList.add('main-article');
                    // Add legacy 'article' class if needed for CSS compatibility
                    card.classList.add('article');
                }

                if (result.isWebEnhanced) {
                    card.classList.add('web-enhanced');
                }

                if (result.thumbnail || result.thumbnailUrl) {
                    card.classList.add('has-image');
                }

                // Assemble the card using sub-components

                // 1. Header
                if (window.VGHeader) {
                    card.appendChild(window.VGHeader.create(result, options, context));
                } else {
                    console.error('VGHeader module not found');
                }

                // 2. Title
                if (window.VGContent) {
                    card.appendChild(window.VGContent.createTitle(result, options, context));
                } else {
                    console.error('VGContent module not found');
                }

                // 3. Content Body
                if (window.VGContent) {
                    card.appendChild(window.VGContent.createBody(result, options, context));
                }

                // 4. Footer
                if (window.VGFooter) {
                    card.appendChild(window.VGFooter.create(result, options, context));
                } else {
                    console.error('VGFooter module not found');
                }

                return card;
            }
        };

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            try {
                window.ModuleRegistry.register('ViewGrid', window.ViewGrid);
            } catch (error) {
                console.error('Error registering ViewGrid with ModuleRegistry:', error);
            }
        }
    }
})();
