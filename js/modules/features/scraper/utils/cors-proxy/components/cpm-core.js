/**
 * CORS Proxy Manager Core
 * 
 * Core initialization for the modular CORS Proxy Manager.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const CPMCore = {
        version: '1.0.0',
        _initialized: false,

        /**
         * Initialize the core components
         */
        init: function () {
            if (this._initialized) return true;

            console.log('Initializing CPMCore module');
            this._initialized = true;
            return true;
        },

        isInitialized: function () {
            return this._initialized;
        }
    };

    window.CPMCore = CPMCore;
})();
