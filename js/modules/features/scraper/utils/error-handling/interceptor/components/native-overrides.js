/**
 * Module Error Interceptor - Native Overrides Component
 * 
 * Handles interception of native browser dialog functions (alert, confirm).
 */

(function () {
    'use strict';

    // Ensure core is present
    if (!window.ModuleErrorInterceptor) {
        window.ModuleErrorInterceptor = {
            _pendingInit: []
        };
    }

    const ModuleErrorInterceptor = window.ModuleErrorInterceptor;

    /**
     * Setup advanced interception for browser-specific native error dialogs
     */
    ModuleErrorInterceptor.setupAdvancedDialogInterception = function () {
        // Intercept internal browser functions that create dialogs
        try {
            // Firefox and some Chrome versions use a function called reportError internally
            // We can't directly access it, but we can intercept window.alert and confirm
            const originalAlert = window.alert;
            window.alert = function (message) {
                if (message && typeof message === 'string' &&
                    (message.includes('Error during module registration') ||
                        message.includes('modules.forEach') ||
                        message.includes('is not a function'))) {
                    console.warn('ModuleErrorInterceptor: Intercepted alert dialog with error:', message);
                    ModuleErrorInterceptor._interceptedErrors++;
                    ModuleErrorInterceptor._lastErrorMessage = message;
                    return; // Block the dialog
                }
                if (originalAlert) return originalAlert.apply(this, arguments);
            };

            // Also intercept confirm dialogs that might be used for errors
            const originalConfirm = window.confirm;
            window.confirm = function (message) {
                if (message && typeof message === 'string' &&
                    (message.includes('Error during module registration') ||
                        message.includes('modules.forEach') ||
                        message.includes('is not a function'))) {
                    console.warn('ModuleErrorInterceptor: Intercepted confirm dialog with error:', message);
                    ModuleErrorInterceptor._interceptedErrors++;
                    ModuleErrorInterceptor._lastErrorMessage = message;
                    return false; // Return false to the dialog handler
                }
                if (originalConfirm) return originalConfirm.apply(this, arguments);
            };

            // Create a MutationObserver that watches for insertions of dialog-like elements
            // (Note: This slightly overlaps with DOM Observer, but is kept here for 'native-like' detection logic scope)
            const nativeDialogObserver = new MutationObserver((mutations) => {
                if (!this._activeInterception) return;

                for (const mutation of mutations) {
                    if (!mutation.addedNodes) continue;

                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;

                        // Look for elements that might be part of a browser error dialog
                        if ((node.nodeName === 'DIALOG' || node.nodeName === 'DIV') &&
                            node.shadowRoot) {
                            // Some browsers use shadow DOM for error dialogs
                            console.log('Detected possible native dialog with shadow root');
                            this.attemptToStopEventPropagation(node);
                        }

                        // Check any new elements with role="dialog" or similar
                        if (node.getAttribute('role') === 'dialog' ||
                            node.getAttribute('role') === 'alertdialog' ||
                            node.classList.contains('error-dialog') ||
                            node.classList.contains('modal-dialog')) {

                            if (this.checkNodeForErrorText(node)) {
                                console.warn('ModuleErrorInterceptor: Removing native browser error dialog');
                                this.attemptToStopEventPropagation(node);
                                if (node.parentNode) {
                                    try {
                                        node.parentNode.removeChild(node);
                                        this._disabledDialogs++;
                                    } catch (err) {
                                        console.warn('Could not remove dialog node:', err);
                                    }
                                }
                            }
                        }
                    }
                }
            });

            // Start observing the entire document for dialog additions
            nativeDialogObserver.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            this._nativeDialogObserver = nativeDialogObserver;

        } catch (error) {
            console.warn('Error setting up advanced dialog interception:', error);
        }
    };

    // Register submodule
    ModuleErrorInterceptor.nativeOverrides = true;
    console.log('Module Error Interceptor - Native Overrides loaded');

})();
