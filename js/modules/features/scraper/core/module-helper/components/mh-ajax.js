/**
 * Module Helper - AJAX Utilities
 * Provides AJAX helper functions for module-helper.js
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const MHAjax = {
        version: '1.0.0',

        init: function () {
            console.log('MHAjax initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Performs an AJAX GET request
         * @param {string} url - The URL to request
         * @param {Function} callback - Success callback
         * @param {Function} errorCallback - Error callback
         */
        ajaxGet: function (url, callback, errorCallback) {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    callback(xhr.responseText);
                } else {
                    if (errorCallback) {
                        errorCallback(xhr.status, xhr.statusText);
                    }
                }
            };
            xhr.onerror = function () {
                if (errorCallback) {
                    errorCallback(0, 'Network Error');
                }
            };
            xhr.send();
        },

        /**
         * Performs a JSON GET request
         * @param {string} url - The URL to request
         * @param {Function} callback - Success callback with parsed JSON
         * @param {Function} errorCallback - Error callback
         */
        getJSON: function (url, callback, errorCallback) {
            this.ajaxGet(url, function (responseText) {
                try {
                    const data = JSON.parse(responseText);
                    callback(data);
                } catch (e) {
                    if (errorCallback) {
                        errorCallback(200, 'JSON Parse Error: ' + e.message);
                    }
                }
            }, errorCallback);
        },

        /**
         * Creates a CORS proxy URL
         * @param {string} url - The URL to proxy
         * @returns {string} - The proxied URL
         */
        createCorsProxyUrl: function (url) {
            const corsProxies = [
                'https://corsproxy.io/?',
                'https://cors-anywhere.herokuapp.com/',
                'https://api.allorigins.win/raw?url='
            ];
            return corsProxies[0] + encodeURIComponent(url);
        }
    };

    // Expose globally
    window.MHAjax = MHAjax;

    // Also set global convenience functions
    window.ajaxGet = function (url, callback, errorCallback) {
        return MHAjax.ajaxGet(url, callback, errorCallback);
    };
    window.getJSON = function (url, callback, errorCallback) {
        return MHAjax.getJSON(url, callback, errorCallback);
    };
    window.createCorsProxyUrl = function (url) {
        return MHAjax.createCorsProxyUrl(url);
    };

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('MHAjax', MHAjax);
    }
})();
