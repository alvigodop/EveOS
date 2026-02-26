/**
 * Direct Search Wikipedia Core Module
 * 
 * Defines the DirectSearchWikipedia namespace and initialization.
 * Part of the modularized DirectSearchWikipedia feature.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    if (!window.DirectSearchWikipedia) {
        const DirectSearchWikipedia = {
            version: '1.0.0',
            _initialized: false,

            init: function () {
                this._initialized = true;
                return this;
            }
        };

        window.DirectSearchWikipedia = DirectSearchWikipedia;

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
            ModuleRegistry.register('DirectSearchWikipedia', DirectSearchWikipedia);
        }
    }
})();
