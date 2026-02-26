/**
 * Tab Manager State Module
 * 
 * Manages the internal state of the Tab Manager.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const TabManagerState = {
        // Internal state
        _currentSource: 'wikipedia', // Default
        _currentLayout: 'grid',      // Default

        /**
         * Initialize state
         */
        init: function () {
            // Can be extended to load from local storage if needed
            return this;
        },

        /**
         * Get current source
         * @returns {string}
         */
        getCurrentSource: function () {
            return this._currentSource;
        },

        /**
         * Set current source
         * @param {string} source 
         */
        setCurrentSource: function (source) {
            this._currentSource = source;
        },

        /**
         * Get current layout
         * @returns {string}
         */
        getCurrentLayout: function () {
            return this._currentLayout;
        },

        /**
         * Set current layout
         * @param {string} layout 
         */
        setCurrentLayout: function (layout) {
            this._currentLayout = layout;
        }
    };

    window.TabManagerState = TabManagerState;

})();
