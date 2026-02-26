/**
 * Domain Validator - Fetch Methods
 * Domain existence checking using fetch API
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const DVFetch = {
        version: '1.0.0',

        init: function () {
            console.log('DVFetch initialized');
            this._initialized = true;
            return this;
        },

        /**
         * Check if a domain exists using fetch
         */
        checkDomainWithFetch: function (domain, callback) {
            let testUrl;
            if (window.location.protocol === 'file:') {
                testUrl = `https://corsproxy.io/?${encodeURIComponent('https://' + domain)}`;
            } else {
                testUrl = 'https://' + domain;
            }

            testUrl += (testUrl.includes('?') ? '&' : '?') + 'cb=' + Date.now();

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout')), 5000);
            });

            Promise.race([
                fetch(testUrl, { mode: 'cors', method: 'HEAD' }),
                timeoutPromise
            ])
                .then(response => {
                    callback(response.ok || response.status === 403);
                })
                .catch(() => {
                    callback(false);
                });
        },

        /**
         * Check if a URL exists using fetch
         */
        checkUrlWithFetch: function (url, callback) {
            let testUrl = url;
            if (window.location.protocol === 'file:') {
                testUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            }

            testUrl += (testUrl.includes('?') ? '&' : '?') + 'cb=' + Date.now();

            fetch(testUrl, { mode: 'cors', method: 'HEAD' })
                .then(response => {
                    callback(response.ok || response.status === 403);
                })
                .catch(() => {
                    callback(false);
                });
        },

        /**
         * Check if a domain exists using an image
         */
        checkDomainWithImage: function (domain, callback) {
            const img = new Image();
            const timeout = setTimeout(() => {
                callback(false);
            }, 5000);

            img.onload = function () {
                clearTimeout(timeout);
                callback(true);
            };

            img.onerror = function () {
                clearTimeout(timeout);
                callback(false);
            };

            img.src = 'https://' + domain + '/favicon.ico?' + Date.now();
        }
    };

    // Expose globally
    window.DVFetch = DVFetch;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('DVFetch', DVFetch);
    }
})();
