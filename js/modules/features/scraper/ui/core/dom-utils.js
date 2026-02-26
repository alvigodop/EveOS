/**
 * DOM Utils Module (Facade)
 * 
 * Common DOM manipulation and UI helper functions.
 * Delegates to DUQuery and DUManipulate.
 * 
 * @version 1.0.1 (Modularized)
 */

const DOMUtils = {
    version: '1.0.1',
    _initialized: false,

    /**
     * Initialize DOMUtils
     */
    init: function () {
        if (this._initialized) return this;
        this._initialized = true;
        this.initViewMoreResizeListener();
        return this;
    },

    /**
     * Creates a safe ID by encoding special characters.
     */
    safeId: function (str) {
        return window.DUQuery ? DUQuery.safeId(str) : (str ? encodeURIComponent(str).replace(/%/g, '_') : '');
    },

    /**
     * Check if an element has overflowing content
     */
    checkOverflow: function (element) {
        return window.DUManipulate ? DUManipulate.checkOverflow(element) : (element ? element.scrollHeight > element.clientHeight : false);
    },

    /**
     * Toggles the expanded state of an article snippet.
     */
    toggleSnippet: function (articleId) {
        if (window.DUManipulate) {
            DUManipulate.toggleSnippet(articleId, window.DUQuery);
        }
    },

    /**
     * Toggles the expanded state of an article's categories section.
     */
    toggleCategories: function (articleId) {
        if (window.DUManipulate) {
            DUManipulate.toggleCategories(articleId, window.DUQuery);
        }
    },

    /**
     * Update visibility of "View More" buttons based on content overflow
     */
    updateViewMoreButtons: function () {
        if (window.DUManipulate) {
            DUManipulate.updateViewMoreButtons();
        }
    },

    /**
     * Change the layout mode
     */
    changeLayout: function (layout) {
        if (window.DUManipulate) {
            DUManipulate.changeLayout(layout);
        }
    },

    /**
     * Initialize the window resize listener for updating View More buttons
     * Should be called once during app initialization
     */
    initViewMoreResizeListener: function () {
        window.addEventListener('resize', () => {
            if (window._viewMoreResizeTimeout) {
                clearTimeout(window._viewMoreResizeTimeout);
            }
            window._viewMoreResizeTimeout = setTimeout(() => {
                this.updateViewMoreButtons();
            }, 100);
        });
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('DOMUtils', DOMUtils);
}

// Make globally available
window.DOMUtils = DOMUtils;

// Global helpers for DOM interaction (maintain backward compatibility)
window.safeId = function (str) { return DOMUtils.safeId(str); };
window.toggleSnippet = function (articleId) { DOMUtils.toggleSnippet(articleId); };
window.toggleCategories = function (articleId) { DOMUtils.toggleCategories(articleId); };
window.checkOverflow = function (element) { return DOMUtils.checkOverflow(element); };
window.updateViewMoreButtons = function () { DOMUtils.updateViewMoreButtons(); };
window.changeLayout = function (layout) { DOMUtils.changeLayout(layout); };
window.updateLayout = function (layout) { DOMUtils.changeLayout(layout); };

// Initialize listeners
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        DOMUtils.init();
    });
} else {
    DOMUtils.init();
}
