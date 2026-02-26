/**
 * Direct Search Fandom Core Module
 * 
 * Defines the DirectSearchFandom namespace and initialization.
 * Part of the modularized DirectSearchFandom feature.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    // Create DirectSearchFandom namespace
    const DirectSearchFandom = window.DirectSearchFandom = window.DirectSearchFandom || {
        version: '1.0.0',
        _initialized: false,
        _useBingFallback: localStorage.getItem('directSearch_useBingFallback') !== 'false' // Default ON, toggleable
    };

    /**
     * Initialize the module
     */
    DirectSearchFandom.init = function () {
        this._initialized = true;
        return this;
    };

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('DirectSearchFandom', DirectSearchFandom);
    }

})();
