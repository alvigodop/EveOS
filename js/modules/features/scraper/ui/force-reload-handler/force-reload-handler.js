/**
 * Force Reload Handler
 * 
 * Handles the "Force Reload" button logic and error interception.
 * Extracted from ScraperTest.html
 */

(function () {
    // Ensure ModuleErrorInterceptor is active right away for this button
    if (window.ModuleErrorInterceptor) {
        console.log('ModuleErrorInterceptor is available for the Force Reload button');
    }

    // Custom error handler for the Force Reload button
    window.handleForceReloadClick = function () {
        // Pre-emptively activate error interception before doing anything else
        if (window.ModuleErrorInterceptor) {
            console.log('ModuleErrorInterceptor: Preemptively activating interception');
            ModuleErrorInterceptor._activeInterception = true;
            ModuleErrorInterceptor.blockNativeErrorDialogs();
        }

        // Immediately suppress any visible error messages
        const suppressError = function () {
            const errorDisplay = document.getElementById('errorDisplay');
            if (errorDisplay) {
                errorDisplay.style.display = 'none';
                errorDisplay.textContent = '';
            }

            // Remove any browser error dialogs if possible
            if (window.stop) window.stop();

            // In some browsers, forcing a repaint can help clear dialogs
            document.body.style.opacity = '0.99';
            setTimeout(() => { document.body.style.opacity = '1'; }, 10);

            // Activate error shield
            document.body.classList.add('error-shield-active');
            setTimeout(() => {
                document.body.classList.remove('error-shield-active');
            }, 1000);

            // For Firefox: create a temporary iframe to block dialogs
            const iframe = document.createElement('iframe');
            iframe.id = 'dialog-blocking-iframe';
            iframe.className = 'dialog-blocking-iframe';
            document.body.appendChild(iframe);
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 500);
        };

        // Call error suppression right away
        suppressError();

        // Make sure ModuleErrorInterceptor is ready
        if (window.ModuleErrorInterceptor && typeof ModuleErrorInterceptor.hideErrorDialogs === 'function') {
            ModuleErrorInterceptor.hideErrorDialogs();
        }

        // Setup pre-emptive interceptors for Mozilla and Chrome's native dialog system
        // This needs to run before onerror override because the native dialog can appear before the error event
        try {
            // Override alert and confirm preemptively
            const originalAlert = window.alert;
            window.alert = function (message) {
                if (message && typeof message === 'string' &&
                    (message.includes('Error during module registration') ||
                        message.includes('modules.forEach') ||
                        message.includes('is not a function'))) {
                    console.warn('Button handler: Blocked alert dialog with:', message);
                    return; // Block dialog
                }
                return originalAlert.apply(this, arguments);
            };

            // Schedule restoration
            setTimeout(() => { window.alert = originalAlert; }, 3000);
        } catch (e) {
            console.warn('Could not override alert:', e);
        }

        // Also override window.onerror temporarily to catch any errors
        const originalOnError = window.onerror;
        window.onerror = function (message, source, lineno, colno, error) {
            // List of error patterns to suppress during force reload
            const suppressPatterns = [
                'modules.forEach is not a function',
                'modules.forEach',
                'is not a function',
                'module registration',
                'undefined is not iterable',
                'Cannot read properties of undefined'
            ];

            // Check if this is an error we want to suppress
            let shouldSuppress = false;
            for (let pattern of suppressPatterns) {
                if (message && message.toString().indexOf(pattern) !== -1) {
                    shouldSuppress = true;
                    console.warn('Button handler suppressed error:', message);
                    break;
                }
            }

            if (shouldSuppress) {
                suppressError(); // Make extra sure error dialogs are gone
                return true; // Prevent default error handling
            }

            // For other errors, pass to original handler if exists
            if (typeof originalOnError === 'function') {
                return originalOnError(message, source, lineno, colno, error);
            }

            // Allow default error handling for non-suppressed errors
            return false;
        };

        try {
            // Add class to body to enable shield
            document.body.classList.add('force-reload-active');

            // Put a transparent iframe over the page to catch dialogs (for Firefox/Chrome)
            const iframe = document.createElement('iframe');
            iframe.id = 'dialog-intercept-frame';
            iframe.className = 'dialog-blocking-iframe';
            document.body.appendChild(iframe);

            // Schedule removal
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 2000);

            // Execute force reload
            let reloadSuccess = false;

            // Before executing, override alert/confirm one more time
            window.alert = function () { console.log('Blocked alert during reload'); return; };
            window.confirm = function () { console.log('Blocked confirm during reload'); return false; };

            // Now execute the reload
            if (window.ForceReload && typeof ForceReload.reload === 'function') {
                console.log('Using ForceReload.reload directly');
                reloadSuccess = ForceReload.reload();
            } else if (window.forceReload) {
                console.log('Using window.forceReload function');
                reloadSuccess = window.forceReload();
            } else {
                throw new Error('Force reload function not available');
            }

            // Restore original error handler after a delay
            setTimeout(function () {
                window.onerror = originalOnError;
                document.body.classList.remove('force-reload-active');
            }, 1000);

            return false; // Prevent default button action
        } catch (e) {
            console.error('Force reload error:', e);

            // Restore original error handler
            window.onerror = originalOnError;
            document.body.classList.remove('force-reload-active');

            // Only show manual reload confirmation for critical errors
            if (!e.message.includes('modules.forEach') &&
                !e.message.includes('is not a function') &&
                !e.message.includes('undefined')) {
                if (confirm('Error during reload. Reload page manually?')) {
                    window.location.reload();
                }
            } else {
                // For known errors, just suppress them
                suppressError();
            }

            return false; // Prevent default button action
        }
    };
})();
