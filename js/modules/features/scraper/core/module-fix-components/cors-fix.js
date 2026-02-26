/**
 * Module Fix Component - CORS Fix
 * Apply CORS workarounds for local file system
 */
(function () {
    'use strict';
    window.ModuleFixComponents = window.ModuleFixComponents || {};

    window.ModuleFixComponents.CorsFix = {
        /**
         * Apply CORS workarounds for local file system
         */
        applyCorsWorkarounds: function () {
            // Skip if not running from file:// protocol
            if (window.location.protocol !== 'file:') {
                return;
            }

            console.log('Applying CORS workarounds for file:// protocol');

            // Override fetch to handle CORS errors better
            if (window.fetch) {
                const originalFetch = window.fetch;
                window.fetch = function (url, options) {
                    return originalFetch(url, options)
                        .catch(error => {
                            if (error.message && error.message.includes('CORS')) {
                                console.warn(`CORS error caught during fetch: ${url}`);
                                // Return empty response to avoid breaking the application
                                return new Response('{}', {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                });
                            }
                            throw error;
                        });
                };
                console.log('Fetch API patched for CORS handling');
            }

            // Set up XMLHttpRequest patches
            if (window.XMLHttpRequest) {
                const OriginalXHR = window.XMLHttpRequest;
                window.XMLHttpRequest = function () {
                    const xhr = new OriginalXHR();
                    const originalOpen = xhr.open;

                    xhr.open = function (method, url, async, user, password) {
                        // Add request context and error handlers
                        xhr.addEventListener('error', function () {
                            console.warn(`XHR CORS error for: ${url}`);
                        });

                        // Call the original open method
                        return originalOpen.call(this, method, url, async, user, password);
                    };

                    return xhr;
                };
                console.log('XMLHttpRequest patched for CORS handling');
            }

            console.log('CORS workarounds applied');
        }
    };
})();
