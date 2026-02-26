/**
 * Debug Helper (Legacy Compatibility Shim)
 * 
 * This module has been modularized.
 * - Startup logic -> js/modules/core/startup-helper.js
 * - Diagnostics -> js/modules/core/debug-diagnostics.js
 * - Debug UI -> js/modules/ui/debug-panel.js
 * 
 * This file remains to ensure backward compatibility for global functions
 * and external references.
 */

(function () {
    const DebugHelper = {
        name: 'DebugHelper (Legacy)',
        version: '1.1.0',
        _initialized: false,

        init: function () {
            if (this._initialized) return;
            console.log('DebugHelper (Legacy) initialized');

            // Expose global fallbacks for legacy code
            this.setupLegacyGlobals();

            this._initialized = true;
            return this;
        },

        // Forwarding methods to new modules

        showErrorPanel: function () {
            if (window.DebugPanel && typeof DebugPanel.showErrorPanel === 'function') {
                DebugPanel.showErrorPanel();
            } else if (window.showErrorPanel) {
                window.showErrorPanel();
            } else {
                console.warn('DebugPanel not available');
                alert('Debug panel not available');
            }
        },

        diagnoseCriticalIssues: function () {
            if (window.DebugDiagnostics && typeof DebugDiagnostics.diagnoseCriticalIssues === 'function') {
                DebugDiagnostics.diagnoseCriticalIssues();
            } else if (window.diagnoseCriticalIssues) {
                window.diagnoseCriticalIssues();
            } else {
                console.warn('DebugDiagnostics not available');
            }
        },

        refreshErrorLog: function () {
            if (window.DebugPanel && typeof DebugPanel.refreshErrorLog === 'function') {
                DebugPanel.refreshErrorLog();
            }
        },

        setupLegacyGlobals: function () {
            // Function aliases for backward compatibility

            window.directAddWikiEntry = function () {
                if (window.WikiManager && typeof WikiManager.addWikiEntry === 'function') {
                    // Start with empty values, WikiManager will read from inputs if args are missing/object
                    WikiManager.addWikiEntry();
                } else {
                    alert('WikiManager not available');
                }
            };

            window.directAddFandomDomain = function () {
                if (window.WikiManager && typeof WikiManager.addFandomDomain === 'function') {
                    WikiManager.addFandomDomain();
                } else {
                    alert('WikiManager not available');
                }
            };

            window.directSearchFandom = function (query) {
                // This was a complex function in old debug-helper.
                // We forward to FandomSearch wrapper if possible
                if (window.FandomDiscovery && typeof FandomDiscovery.searchFandom === 'function') {
                    return FandomDiscovery.searchFandom(query);
                } else {
                    console.error('FandomDiscovery not available for legacy directSearchFandom call');
                    return Promise.reject(new Error('Fandom search not available'));
                }
            };
        }
    };

    // Initialize
    window.DebugHelper = DebugHelper;
    DebugHelper.init();

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
        ModuleRegistry.register('DebugHelper', DebugHelper);
    }
})();