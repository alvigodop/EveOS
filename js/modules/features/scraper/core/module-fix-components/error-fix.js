/**
 * Module Fix Component - Error Fix
 * Set up error handling to catch and fix common issues
 */
(function () {
    'use strict';
    window.ModuleFixComponents = window.ModuleFixComponents || {};

    window.ModuleFixComponents.ErrorFix = {
        /**
         * Set up error handling to catch and fix common issues
         */
        setupErrorHandling: function () {
            // Initialize the loading errors array if not already present
            if (!window.moduleLoadingErrors) {
                window.moduleLoadingErrors = [];
            }

            // Handle module loading errors
            window.addEventListener('error', function (event) {
                // Skip CORS errors (they're expected with file:// protocol)
                if (event.message === 'Script error.' && !event.filename) {
                    // Suppress CORS error logging completely

                    // Add structured CORS error with module info but don't log it
                    // NOTE: Commented out to prevent other modules (like sd-formatting.js) from stripping 
                    // the 'suppressed' flag during re-mapping and displaying them anyway.
                    /*
                    if (!window.moduleLoadingErrors) {
                        window.moduleLoadingErrors = [];
                    }

                    window.moduleLoadingErrors.push({
                        module: 'Script-CORS',
                        message: 'Script error',
                        time: new Date().toISOString(),
                        source: 'CORS restriction',
                        details: 'Error due to cross-origin restrictions. This is common when running from local file system.',
                        suppressed: true
                    });
                    */

                    event.preventDefault();
                    return false;
                }

                // Check if this looks like a module loading error
                if (event.filename && event.filename.includes('/modules/')) {
                    console.warn(`Module loading error in ${event.filename}`, event.error);

                    // Extract module name from the file path
                    let moduleName = 'unknown';

                    try {
                        // Extract module name from file path with better handling
                        const pathParts = event.filename.split('/');
                        // Get filename without extension
                        const fileName = pathParts[pathParts.length - 1].replace(/\.js$/, '');

                        // Try to get true module name if possible (handle different naming conventions)
                        if (fileName.startsWith('module-')) {
                            moduleName = fileName.replace('module-', '');
                        } else if (fileName.includes('-')) {
                            // Convert kebab-case to PascalCase (common for module files)
                            moduleName = fileName.split('-')
                                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                                .join('');
                        } else {
                            moduleName = fileName;
                        }

                        // Check if we can get more info from the actual error object
                        if (event.error && event.error.module) {
                            moduleName = event.error.module;
                        }
                    } catch (e) {
                        console.error('Error extracting module name:', e);
                        moduleName = event.filename.split('/').pop().replace('.js', '');
                    }

                    // Format the error for better display
                    const formattedError = {
                        module: moduleName,
                        message: event.message || 'Unknown error',
                        time: new Date().toISOString(),
                        line: event.lineno,
                        column: event.colno,
                        source: event.filename,
                        details: event.error ? (event.error.stack || event.error.message) : 'No details available'
                    };

                    // Add to the tracking array
                    if (!window.moduleLoadingErrors) {
                        window.moduleLoadingErrors = [];
                    }
                    window.moduleLoadingErrors.push(formattedError);
                }
            }, true);

            // Handle unhandled promise rejections
            window.addEventListener('unhandledrejection', function (event) {
                console.warn('Unhandled promise rejection:', event.reason);

                // Format the error for better display
                const formattedError = {
                    type: 'promise',
                    message: event.reason?.message || String(event.reason),
                    time: new Date().toISOString(),
                    details: event.reason?.stack || 'No stack available'
                };

                // Add to the tracking array
                window.moduleLoadingErrors.push(formattedError);

                // Prevent the error from breaking the application
                event.preventDefault();
            });

            console.log('Error handling is set up');
        },

        /**
         * Fix error display so [object Object] is not shown
         */
        fixErrorDisplay: function () {
            try {
                // If window.moduleLoadingErrors exists, format it
                if (window.moduleLoadingErrors && Array.isArray(window.moduleLoadingErrors)) {
                    console.log('Formatting module loading errors for better display');

                    // Format any existing errors
                    window.moduleLoadingErrors = window.moduleLoadingErrors.map(error => {
                        if (typeof error === 'object' && error !== null) {
                            return {
                                module: error.module || 'unknown',
                                message: error.message || String(error) || 'No message available',
                                time: error.time || new Date().toISOString(),
                                details: error.details || JSON.stringify(error),
                                suppressed: error.suppressed
                            };
                        }
                        return { message: String(error), time: new Date().toISOString() };
                    });

                    // Add a toString method to prevent [object Object]
                    Object.defineProperty(window.moduleLoadingErrors, 'toString', {
                        value: function () {
                            // DEBUG: Inspect objects before filtering
                            if (this.length > 0 && this[0].module === 'Script-CORS') {
                                // console.log('Debug ErrorFix:', JSON.stringify(this[0]));
                            }
                            return this.filter(err => {
                                const isSuppressed = err.suppressed === true;
                                return !isSuppressed;
                            }).map(err =>
                                `Error in ${err.module || 'unknown'}: ${err.message}`
                            ).join('\n');
                        },
                        writable: true,
                        configurable: true
                    });

                    // Add custom inspection method for console
                    if (typeof window.moduleLoadingErrors.inspect !== 'function') {
                        Object.defineProperty(window.moduleLoadingErrors, 'inspect', {
                            value: function () {
                                return this.filter(err => !err.suppressed).map(err =>
                                    `Error in ${err.module || 'unknown'}: ${err.message}`
                                ).join('\n');
                            },
                            writable: true,
                            configurable: true
                        });
                    }

                    console.log('Module loading errors formatted:', window.moduleLoadingErrors.toString());
                }

                // Fix any error display elements in the DOM
                setTimeout(() => {
                    const errorElements = document.querySelectorAll('.error-display, .log-display, .module-error');
                    errorElements.forEach(element => {
                        if (element.textContent && element.textContent.includes('[object Object]')) {
                            // Replace [object Object] with something better
                            const content = element.textContent;
                            const formatted = content.replace(/\[object Object\]/g, '(Error details hidden)');
                            element.textContent = formatted;
                        }
                    });
                }, 500);
            } catch (e) {
                console.error('Error in fixErrorDisplay:', e);
            }
        }
    };
})();
