/**
 * View Grid Footer Module
 * 
 * Handles rendering of the footer section of a grid result card,
 * including action buttons and links.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    if (!window.VGFooter) {
        window.VGFooter = {
            /**
             * Create the footer element
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @param {object} context - The ResultDisplay instance
             * @returns {Element} - The created footer element
             */
            create: function (result, options, context) {
                const footer = document.createElement('div');
                footer.className = 'result-footer';

                // Create visit link
                const visitLink = document.createElement('a');
                visitLink.href = result.url;
                visitLink.target = '_blank';
                visitLink.className = 'result-action';
                visitLink.textContent = 'Visit ↗';

                // Add click listener for in-site popup
                visitLink.addEventListener('click', (e) => {
                    // Check if PopupManager is available
                    if (window.PopupManager && typeof PopupManager.openPopup === 'function') {
                        e.preventDefault();
                        const title = result.title || result.name || 'Wiki Page';
                        console.log('Opening via PopupManager:', result.url);
                        PopupManager.openPopup(result.url, title);
                    }
                });

                footer.appendChild(visitLink);

                return footer;
            }
        };

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            window.ModuleRegistry.register('VGFooter', window.VGFooter);
        }
    }
})();
