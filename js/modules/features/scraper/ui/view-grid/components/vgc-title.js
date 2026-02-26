/**
 * View Grid Content - Title Component
 * Handles rendering of the title section of a grid result card.
 */
(function () {
    'use strict';

    const VGCTitle = {
        /**
         * Create the title element
         * @param {object} result - The search result
         * @param {object} options - Display options
         * @param {object} context - The ResultDisplay instance
         * @returns {Element} - The created title element
         */
        createTitle: function (result, options, context) {
            const title = document.createElement('h3');
            title.className = 'result-title';

            // For Fandom wiki results, format the name nicely
            if (result.domain && (result.domain.includes('fandom.com') || result.domain.includes('wikia.com'))) {
                // Use the formatted name if available, otherwise format the domain
                if (result.name) {
                    title.textContent = result.name;
                } else {
                    // Extract name from domain
                    const domainParts = result.domain.split('.');
                    const domainName = domainParts[0];

                    // Format the domain name by replacing hyphens with spaces and capitalizing
                    const formattedName = domainName
                        .split('-')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');

                    title.textContent = formattedName + ' Wiki';
                }
            } else {
                // For other results, use title or name
                title.textContent = result.title || result.name || 'Untitled';
            }

            // Highlight query terms in title if needed
            if (options.highlightQuery && options.query) {
                title.innerHTML = context.highlightQueryTerms(title.textContent, options.query);
            }

            return title;
        }
    };

    window.VGCTitle = VGCTitle;
})();
