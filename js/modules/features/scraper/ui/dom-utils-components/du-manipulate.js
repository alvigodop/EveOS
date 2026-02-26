/**
 * DOM Utils - Manipulation Component
 * 
 * Helper functions for manipulating DOM elements (classes, visibility, etc).
 * 
 * @version 1.0.0
 */

const DUManipulate = {
    /**
     * Check if an element has overflowing content
     * @param {HTMLElement} element - The element to check
     * @returns {boolean} True if the element has overflow
     */
    checkOverflow: function (element) {
        if (!element) return false;
        return element.scrollHeight > element.clientHeight;
    },

    /**
     * Toggles the expanded state of an article snippet.
     * @param {string} articleId - The article identifier.
     * @param {Object} queryUtils - Dependency injection for DUQuery
     */
    toggleSnippet: function (articleId, queryUtils) {
        if (!queryUtils) queryUtils = window.DUQuery;
        if (!queryUtils) return;

        const safeArticleId = queryUtils.safeId(articleId);
        const snippet = document.querySelector(`#snippet-${safeArticleId}`);
        const btn = document.querySelector(`#snippet-btn-${safeArticleId}`);
        if (snippet && btn) {
            snippet.classList.toggle('expanded');
            btn.textContent = snippet.classList.contains('expanded') ? 'View Less' : 'View More';
        }
    },

    /**
     * Toggles the expanded state of an article's categories section.
     * @param {string} articleId - The article identifier.
     * @param {Object} queryUtils - Dependency injection for DUQuery
     */
    toggleCategories: function (articleId, queryUtils) {
        if (!queryUtils) queryUtils = window.DUQuery;
        if (!queryUtils) return;

        const safeArticleId = queryUtils.safeId(articleId);
        const categories = document.querySelector(`#categories-${safeArticleId}`);
        const btn = document.querySelector(`#categories-btn-${safeArticleId}`);
        if (categories && btn) {
            categories.classList.toggle('expanded');
            btn.textContent = categories.classList.contains('expanded') ? 'View Less' : 'View More';
        }
    },

    /**
     * Update visibility of "View More" buttons based on content overflow
     */
    updateViewMoreButtons: function () {
        // Check all snippets
        document.querySelectorAll('.article-snippet').forEach(snippet => {
            try {
                // Create a safe ID for querySelector by escaping special characters
                const snippetId = snippet.id.replace('snippet-', 'snippet-btn-');
                const safeId = CSS.escape(snippetId);
                const btn = document.querySelector(`#${safeId}`);

                if (btn) {
                    const hasOverflow = this.checkOverflow(snippet);
                    btn.classList.toggle('visible', hasOverflow);
                    // If there's no overflow and it's expanded, collapse it
                    if (!hasOverflow && snippet.classList.contains('expanded')) {
                        snippet.classList.remove('expanded');
                        btn.textContent = 'View More';
                    }
                }
            } catch (error) {
                console.warn('DOMUtils: Error updating view more button:', error);
            }
        });

        // Check all category lists
        document.querySelectorAll('.categories-list').forEach(categories => {
            try {
                const categoriesId = categories.id.replace('categories-', 'categories-btn-');
                const safeId = CSS.escape(categoriesId);
                const btn = document.querySelector(`#${safeId}`);

                if (btn && categories) {
                    const hasOverflow = this.checkOverflow(categories);
                    btn.classList.toggle('visible', hasOverflow);
                    // If there's no overflow and it's expanded, collapse it
                    if (!hasOverflow && categories.classList.contains('expanded')) {
                        categories.classList.remove('expanded');
                        btn.textContent = 'View More';
                    }
                }
            } catch (error) {
                console.warn('DOMUtils: Error updating category list button:', error);
            }
        });
    },

    /**
     * Change the layout mode
     * @param {string} layout - 'grid' or 'list'
     */
    changeLayout: function (layout) {
        // Update button states
        document.querySelectorAll('.view-btn, .layout-btn').forEach(btn => {
            // Check both data-view and if ID matches the layout
            if (btn.dataset.view === layout || btn.id === `layout${layout.charAt(0).toUpperCase() + layout.slice(1)}Btn`) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update results container layout
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.classList.remove('grid-layout', 'list-layout');
            resultsDiv.classList.add(`${layout}-layout`);
        }

        // Also update discovery results containers
        ['wikiDiscoveryResults', 'fandom-results', 'discoveryResults'].forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                container.classList.remove('grid-layout', 'list-layout');
                container.classList.add(`${layout}-layout`);
            }
        });

        // console.log(`Layout changed to: ${layout}`);
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('DUManipulate', DUManipulate);
}

window.DUManipulate = DUManipulate;
