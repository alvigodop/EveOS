// Browser Extension Error Filter - Prevent extension errors from cluttering console
(function initializeBrowserExtensionErrorFilter() {
    const originalConsoleError = console.error;
    const originalOnError = window.onerror;

    // Filter out known browser extension errors
    const extensionErrorPatterns = [
        /autoCorrectionCache/,
        /content\.js:\d+:\d+/,
        /extension/i,
        /chrome-extension/,
        /moz-extension/,
        /setInitializationProgress/,
        /componentDidCatch.*content\.js/,
        /grammarly/i,
        /spell.*check/i,
        /translation/i
    ];

    function isExtensionError(message, source, stack) {
        const fullError = `${message} ${source || ''} ${stack || ''}`;
        return extensionErrorPatterns.some(pattern => pattern.test(fullError));
    }

    // Override console.error to filter extension errors
    console.error = function (...args) {
        const message = args.join(' ');
        if (!isExtensionError(message)) {
            originalConsoleError.apply(console, args);
        } else {
            // Log filtered extension errors to a separate category (optional debugging)
            if (window.DEBUG_EXTENSIONS) {
                originalConsoleError.apply(console, ['[FILTERED EXTENSION ERROR]', ...args]);
            }
        }
    };

    // Override window.onerror to filter extension errors
    window.onerror = function (message, source, lineno, colno, error) {
        if (!isExtensionError(message, source, error?.stack)) {
            if (originalOnError) {
                return originalOnError.call(this, message, source, lineno, colno, error);
            }
        }
        return true; // Prevent default browser error handling for filtered errors
    };

    console.log('Browser extension error filter initialized');
})();
