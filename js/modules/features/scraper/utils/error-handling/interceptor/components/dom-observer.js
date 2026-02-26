/**
 * Module Error Interceptor - DOM Observer Component
 * 
 * Handles DOM mutation observing and active dialog blocking.
 */

(function () {
    'use strict';

    if (!window.ModuleErrorInterceptor) window.ModuleErrorInterceptor = {};
    const ModuleErrorInterceptor = window.ModuleErrorInterceptor;

    /**
     * Block native error dialogs by temporarily creating a shield over the page
     */
    ModuleErrorInterceptor.blockNativeErrorDialogs = function () {
        // Create a full-screen iframe to intercept/block browser dialogs (works in Chrome)
        const iframe = document.createElement('iframe');
        iframe.id = 'dialog-blocking-iframe';
        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100vw';
        iframe.style.height = '100vh';
        iframe.style.border = 'none';
        iframe.style.zIndex = '2147483647'; // Maximum z-index
        iframe.style.opacity = '0.01';
        iframe.setAttribute('title', 'Dialog Blocker');

        // Add to the DOM temporarily
        if (document.body) {
            document.body.appendChild(iframe);
        } else {
            // If body is not ready, we can't block dialogs yet
            console.warn('ModuleErrorInterceptor: document.body not ready, skipping dialog blocker');
            return;
        }

        // Activate shield class on body
        document.body.classList.add('force-reload-active');
        document.body.classList.add('error-shield-active');

        // Remove it after a short delay to not interfere with page
        setTimeout(() => {
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
            document.body.classList.remove('error-shield-active');
            // Keep force-reload-active a bit longer
            setTimeout(() => {
                document.body.classList.remove('force-reload-active');
            }, 500);
        }, 100);
    };

    /**
     * Setup observer to watch for error dialogs
     */
    ModuleErrorInterceptor.setupDialogObserver = function () {
        // Some browsers use dialog elements for errors
        const self = this;

        // Override showModal method of HTMLDialogElement
        if (typeof HTMLDialogElement !== 'undefined') {
            const originalShowModal = HTMLDialogElement.prototype.showModal;

            HTMLDialogElement.prototype.showModal = function () {
                // Check if this is an error dialog
                if (this.textContent && (
                    this.textContent.includes('Error during module registration') ||
                    this.textContent.includes('modules.forEach is not a function')
                )) {
                    console.warn('ModuleErrorInterceptor: Prevented error dialog from appearing');
                    self._disabledDialogs++;
                    return; // Don't show the dialog
                }

                // Otherwise, proceed with normal behavior
                return originalShowModal.apply(this, arguments);
            };
        }
    };

    /**
     * Setup mutation observer to detect and remove error dialogs
     */
    ModuleErrorInterceptor.setupMutationObserver = function () {
        const self = this;

        // Create a mutation observer to watch for added nodes
        const observer = new MutationObserver(function (mutations) {
            for (let i = 0; i < mutations.length; i++) {
                const mutation = mutations[i];

                // Check for added nodes
                if (mutation.addedNodes && mutation.addedNodes.length) {
                    for (let j = 0; j < mutation.addedNodes.length; j++) {
                        const node = mutation.addedNodes[j];

                        // Check if this is an error dialog/message
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check for common error dialog containers
                            if (node.tagName === 'DIALOG' ||
                                node.classList.contains('error-dialog') ||
                                node.getAttribute('role') === 'alertdialog' ||
                                node.getAttribute('role') === 'dialog') {

                                // Check if it contains module registration error text
                                if (node.textContent && (
                                    node.textContent.includes('Error during module registration') ||
                                    node.textContent.includes('modules.forEach is not a function')
                                )) {
                                    console.warn('ModuleErrorInterceptor: Removed error dialog from DOM');
                                    if (node.parentNode) {
                                        try {
                                            node.parentNode.removeChild(node);
                                            self._disabledDialogs++;
                                        } catch (err) {
                                            console.warn('Could not remove dialog node:', err);
                                            // Try to hide it instead
                                            self.attemptToStopEventPropagation(node);
                                        }
                                    }
                                }
                            }

                            // Look for any elements that might contain error messages
                            // Some browsers don't use standard dialog containers
                            if (self._activeInterception && node.textContent) {
                                if (node.textContent.includes('Error during module registration') ||
                                    node.textContent.includes('modules.forEach is not a function')) {
                                    console.warn('ModuleErrorInterceptor: Found error message in DOM:', node);
                                    self.attemptToStopEventPropagation(node);
                                }
                            }
                        }
                    }
                }
            }
        });

        // Start observing
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        // Store the observer for potential cleanup
        this._observer = observer;
    };

    // Register submodule
    ModuleErrorInterceptor.domObserver = true;
    console.log('Module Error Interceptor - DOM Observer loaded');

})();
