/**
 * Module Error Display Interceptor (Facade)
 * 
 * Intercepts native browser error dialogs and prevents them from being displayed
 * Specifically targets module registration errors in the UI
 * 
 * @version 1.0.2 - Refactored into components
 */

(function () {
    'use strict';

    // Create the module namespace if not already created by components
    if (!window.ModuleErrorInterceptor) {
        window.ModuleErrorInterceptor = {
            version: '1.0.2',
            _initialized: false,
            _interceptedErrors: 0,
            _disabledDialogs: 0,
            _originalOnError: null,
            _lastErrorMessage: '',
            _activeInterception: false
        };
    }

    const ModuleErrorInterceptor = window.ModuleErrorInterceptor;

    /**
     * Initialize the module error interceptor
     * Orchestrates initialization of all components
     */
    ModuleErrorInterceptor.init = function () {
        if (this._initialized) return this;

        // Ensure Core was initialized
        if (typeof this.initCore === 'function') {
            this.initCore();
        } else {
            this._initialized = true; // Fallback if core init missing
        }

        console.log('Initializing Module Error Display Interceptor (Facade)');

        // Advanced browser dialog interception
        if (typeof this.setupAdvancedDialogInterception === 'function') {
            this.setupAdvancedDialogInterception();
        } else {
            console.warn('ModuleErrorInterceptor: Native Overrides component missing');
        }

        // Setup dialog observer
        if (typeof this.setupDialogObserver === 'function') {
            this.setupDialogObserver();
        }

        // Install global error handler
        if (typeof this.installGlobalHandler === 'function') {
            this.installGlobalHandler();
        } else {
            console.warn('ModuleErrorInterceptor: Global Handler component missing');
        }

        // Setup custom mutation observer to catch error dialogs
        if (typeof this.setupMutationObserver === 'function') {
            this.setupMutationObserver();
        } else {
            console.warn('ModuleErrorInterceptor: DOM Observer component missing');
        }

        // Add specific styles to hide error dialogs
        if (typeof this.addErrorDialogStyles === 'function') {
            this.addErrorDialogStyles();
        } else {
            console.warn('ModuleErrorInterceptor: Styles component missing');
        }

        // Monitor Force Reload button clicks
        if (typeof this.monitorForceReloadButton === 'function') {
            this.monitorForceReloadButton();
        }

        return this;
    };

    // Initialize the module immediately
    setTimeout(() => {
        // Simple delay to let components property mount
        ModuleErrorInterceptor.init();
    }, 10);

    // Make the module globally available (redundant but safe)
    window.ModuleErrorInterceptor = ModuleErrorInterceptor;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('ModuleErrorInterceptor', ModuleErrorInterceptor);
    }

    // Check component status
    const components = ['core', 'nativeOverrides', 'globalHandler', 'domObserver', 'styles', 'uiMonitor'];
    const loaded = components.filter(c => ModuleErrorInterceptor[c]);

    console.log(`Module Error Display Interceptor facade loaded. Components: ${loaded.join(', ')}`);

})(); 