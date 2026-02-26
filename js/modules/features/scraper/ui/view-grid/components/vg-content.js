/**
 * View Grid Content Module (Facade)
 * 
 * Handles rendering of the title and content section of a grid result card,
 * including text formatting, snippets, matches, and categories.
 * Delegates to specialized sub-modules.
 * 
 * Sub-modules:
 * - VGCTitle: Title generation logic.
 * - VGCDetails: Categories and snippet rendering.
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    if (!window.VGContent) {
        window.VGContent = {
            version: '1.1.0-facade',

            /**
             * Create the title element
             * Delegates to VGCTitle
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @param {object} context - The ResultDisplay instance
             * @returns {Element} - The created title element
             */
            createTitle: function (result, options, context) {
                if (window.VGCTitle) {
                    return VGCTitle.createTitle(result, options, context);
                }
                console.error('VGContent: VGCTitle module not loaded');
                const title = document.createElement('h3');
                title.className = 'result-title';
                title.textContent = result.title || result.name || 'Untitled';
                return title;
            },

            /**
             * Create the content body element
             * Orchestrates details, delegates snippet/categories to VGCDetails
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @param {object} context - The ResultDisplay instance
             * @returns {Element} - The created content element
             */
            createBody: function (result, options, context) {
                const content = document.createElement('div');
                content.className = 'result-content';

                // Add text match indicator badge for content matches
                if (result.isTextMatch) {
                    const matchBadge = document.createElement('div');
                    matchBadge.className = 'text-match-badge';
                    matchBadge.innerHTML = `<span class="match-icon">📝</span> Text Match`;
                    content.appendChild(matchBadge);
                }

                // Add domain/source indication for Fandom results
                if (result.domain) {
                    const domain = document.createElement('div');
                    domain.className = 'result-domain';
                    domain.textContent = result.domain;
                    content.appendChild(domain);

                    // Add verified badge for verified domains
                    if (result.verified) {
                        const verifiedBadge = document.createElement('span');
                        verifiedBadge.className = 'verified-badge';
                        verifiedBadge.title = 'Verified to exist';
                        verifiedBadge.textContent = '✓';
                        domain.appendChild(verifiedBadge);
                    }
                }

                // Add category tags if available - delegate to VGCDetails
                if (result.categories && result.categories.length > 0) {
                    if (window.VGCDetails) {
                        VGCDetails.renderCategories(content, result);
                    }
                }

                // Add snippet/description - delegate to VGCDetails
                if (result.snippet || result.description) {
                    if (window.VGCDetails) {
                        VGCDetails.renderSnippet(content, result, options, context);
                    }
                }

                return content;
            }
        };

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            window.ModuleRegistry.register('VGContent', window.VGContent);
        }
    }
})();
