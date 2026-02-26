/**
 * Module Error Interceptor - Core Component
 * 
 * Contains state management and shared utility functions.
 * Acts as the base for other error interceptor components.
 */

(function () {
    'use strict';

    // Create the module namespace if it doesn't exist
    if (!window.ModuleErrorInterceptor) {
        window.ModuleErrorInterceptor = {
            version: '1.0.2', // Bumped version for modularized structure
            _initialized: false,
            _interceptedErrors: 0,
            _disabledDialogs: 0,
            _originalOnError: null,
            _lastErrorMessage: '',
            _activeInterception: false,
            
            // Sub-module references (to be populated by other files)
            nativeOverrides: null,
            globalHandler: null,
            domObserver: null,
            styles: null,
            uiMonitor: null
        };
    }

    const ModuleErrorInterceptor = window.ModuleErrorInterceptor;

    /**
     * Initialize the module error interceptor
     * This is strictly for the Core part; the facade will call the sub-modules.
     */
    ModuleErrorInterceptor.initCore = function () {
        if (this._initialized) return this;
        this._initialized = true;
        console.log('Initializing Module Error Interceptor Core');
        return this;
    };

    /**
     * Check if a node contains any of our error text patterns
     * Shared utility used by DOM observers and other components.
     */
    ModuleErrorInterceptor.checkNodeForErrorText = function (node) {
        if (!node || !node.textContent) return false;

        const errorPatterns = [
            'Error during module registration',
            'modules.forEach is not a function',
            'is not a function',
            'undefined is not iterable',
            'Cannot read properties of undefined'
        ];

        return errorPatterns.some(pattern => node.textContent.includes(pattern));
    };

    /**
     * Attempt to stop event propagation for a node
     * Shared utility for disabling dialogs.
     */
    ModuleErrorInterceptor.attemptToStopEventPropagation = function (node) {
        try {
            // Try to disable the node
            node.style.display = 'none';
            node.style.visibility = 'hidden';
            node.style.opacity = '0';
            node.style.pointerEvents = 'none';

            // Apply classes
            node.classList.add('error-dialog-hidden');
            node.classList.add('module-error');

            // Try to stop any click events
            node.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                return false;
            }, true);

            // For dialogs, try to close them
            if (node.close && typeof node.close === 'function') {
                node.close();
            }

            return true;
        } catch (error) {
            console.warn('Failed to disable dialog:', error);
            return false;
        }
    };
    
    // Register submodule
    ModuleErrorInterceptor.core = true;
    console.log('Module Error Interceptor - Core loaded');

})();
