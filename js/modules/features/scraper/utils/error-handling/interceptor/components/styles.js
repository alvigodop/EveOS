/**
 * Module Error Interceptor - Styles Component
 * 
 * Handles CSS injection for hiding error dialogs.
 */

(function () {
    'use strict';

    if (!window.ModuleErrorInterceptor) window.ModuleErrorInterceptor = {};
    const ModuleErrorInterceptor = window.ModuleErrorInterceptor;

    /**
     * Add CSS to hide error dialogs that match our patterns
     */
    ModuleErrorInterceptor.addErrorDialogStyles = function () {
        // Create a style element
        const style = document.createElement('style');
        style.type = 'text/css';

        // CSS rules to hide error dialogs
        const css = `
            /* Hide any dialog with module registration error text */
            dialog:has(text[content*="Error during module registration"]),
            dialog:has(*:contains("Error during module registration")),
            div[role="dialog"]:has(text[content*="Error during module registration"]),
            div[role="dialog"]:has(*:contains("Error during module registration")),
            div[role="alertdialog"]:has(text[content*="Error during module registration"]),
            div[role="alertdialog"]:has(*:contains("Error during module registration")),
            div.error-dialog:has(text[content*="Error during module registration"]),
            div.error-dialog:has(*:contains("Error during module registration")),
            div.error-display:has(text[content*="Error during module registration"]),
            div.error-display:has(*:contains("Error during module registration")) {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
            
            /* Hide specific error message elements */
            #errorDisplay:has(text[content*="Error during module registration"]),
            #errorDisplay:has(*:contains("Error during module registration")),
            #errorDisplay:has(text[content*="modules.forEach is not a function"]),
            #errorDisplay:has(*:contains("modules.forEach is not a function")) {
                display: none !important;
            }
            
            /* Style for browser's native error dialogs - attempt to hide by higher z-index */
            body::after {
                content: "";
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: transparent;
                z-index: 999999;
                pointer-events: none;
                display: none;
            }
            
            /* When ForceReload is active, add the shield to block dialogs */
            body.force-reload-active::after {
                display: block;
            }
            
            /* For Firefox and Chrome native error dialogs - typically they have fixed positioning */
            body.force-reload-active .error-dialog,
            body.force-reload-active div[role="dialog"],
            body.force-reload-active dialog {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
            }
            
            /* General native error dialog elements */
            div.native-error-dialog,
            div.modal-dialog-container,
            div.modal-dialog,
            #nativeDialog,
            #nativeErrorDialog {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
            }
            
            /* Iframe for blocking dialogs */
            #dialog-blocking-iframe {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 2147483647 !important;
                border: none !important;
                pointer-events: auto !important;
            }
            
            /* Handle Firefox specific dialog elements */
            div[aria-modal="true"]:has(*:contains("Error during module registration")),
            div[aria-modal="true"]:has(*:contains("modules.forEach is not a function")) {
                display: none !important;
                visibility: hidden !important;
            }
        `;

        // Add the CSS to the style element
        if (style.styleSheet) {
            style.styleSheet.cssText = css;
        } else {
            style.appendChild(document.createTextNode(css));
        }

        // Add the style to the head
        document.head.appendChild(style);
    };

    /**
     * Hide any existing error dialogs
     */
    ModuleErrorInterceptor.hideErrorDialogs = function () {
        // Try to find and hide any error dialogs
        const selectors = [
            'dialog',
            'div[role="dialog"]',
            'div[role="alertdialog"]',
            'div[aria-modal="true"]',
            '.error-dialog',
            '.error-display',
            '.modal-dialog',
            '#errorDisplay'
        ];

        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                if (element.textContent && (
                    element.textContent.includes('Error during module registration') ||
                    element.textContent.includes('modules.forEach is not a function') ||
                    element.textContent.includes('is not a function')
                )) {
                    this.attemptToStopEventPropagation(element);
                    this._disabledDialogs++;
                }
            }
        });

        // Block native dialogs more aggressively
        this.blockNativeErrorDialogs();

        if (document.body) {
            // Add the force-reload-active class to body to activate the shield
            document.body.classList.add('force-reload-active');

            // Remove it after a delay
            setTimeout(() => {
                document.body.classList.remove('force-reload-active');
            }, 1000);
        }
    };

    // Register submodule
    ModuleErrorInterceptor.styles = true;
    console.log('Module Error Interceptor - Styles loaded');

})();
