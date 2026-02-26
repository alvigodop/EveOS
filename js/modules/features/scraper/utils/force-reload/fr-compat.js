/**
 * Force Reload - Compatibility Module
 * 
 * Handles browser compatibility checks and polyfills.
 */

(function () {
    'use strict';

    // Create ForceReload object if it doesn't exist
    window.ForceReload = window.ForceReload || {};

    /**
     * Browser compatibility helper for NodeList forEach
     * This ensures the module works in older browsers that don't support forEach on NodeList
     */
    ForceReload.ensureBrowserCompatibility = function () {
        // Polyfill for NodeList.forEach for older browsers
        if (window.NodeList && !NodeList.prototype.forEach) {
            console.log('Adding forEach polyfill for NodeList');
            NodeList.prototype.forEach = Array.prototype.forEach;
        }

        // Detect old IE browsers and add special handling
        const isIE = !!document.documentMode;
        if (isIE) {
            console.log('Detected IE browser, will use compatibility mode');
            ForceReload._isLegacyBrowser = true;
        }

        // Add other browser compatibility checks as needed
        return this;
    };

    console.log('ForceReload: Compatibility module loaded');
})();
