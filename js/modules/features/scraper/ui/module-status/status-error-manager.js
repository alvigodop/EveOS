/**
 * Status Error Manager Module
 * 
 * Handles filtering, processing, and grouping of errors for the Status View.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const StatusErrorManager = {
        /**
         * Filter script errors to remove noise
         * @param {Array} errors - Raw script errors
         * @returns {Array} - Filtered errors
         */
        filterScriptsErrors: function (errors) {
            if (!errors) return [];

            return errors.filter(err => {
                // Skip any suppressed errors
                if (err.suppressed) return false;

                // Skip Script-CORS errors
                if (err.module === 'Script-CORS') return false;

                // Skip any kind of script error
                if (typeof err.message === 'string' &&
                    (err.message.includes('Script error') ||
                        err.message === 'Script error.')) return false;

                // Skip [object Object] errors
                if (err === "[object Object]" ||
                    (typeof err === 'object' &&
                        err !== null &&
                        (!err.message || err.message === "[object Object]"))) return false;

                // Skip assignment to constant errors (common in module loading)
                if (typeof err.message === 'string' &&
                    err.message.includes('Assignment to constant')) return false;

                return true;
            });
        },

        /**
         * Group filtered errors by module
         * @param {Array} filteredErrors - List of filtered errors
         * @returns {Object} - Object with module names as keys and arrays of error strings as values
         */
        groupErrorsByModule: function (filteredErrors) {
            const moduleErrors = {};

            filteredErrors.forEach(error => {
                // Extract error information if it's an object
                try {
                    let moduleName = 'unknown';
                    let errorText = '';
                    let errorSource = '';

                    if (typeof error === 'object' && error !== null) {
                        // Try to extract module name from various properties
                        if (error.module) {
                            moduleName = error.module;
                        } else if (error.source) {
                            // Extract module name from source path if available
                            const sourceFile = error.source.split('/').pop();
                            if (sourceFile) {
                                moduleName = sourceFile.replace('.js', '');
                            }
                        } else if (error.message &&
                            error.message.toLowerCase().includes('moduleregistry')) {
                            moduleName = 'ModuleRegistry';
                        }

                        // Try to get the error message text
                        if (typeof error.toString === 'function' &&
                            error.toString !== Object.prototype.toString) {
                            errorText = error.toString();
                        } else if (error.message) {
                            errorText = error.message;

                            // Special handling for common error types
                            if (error.message.includes('ModuleRegistry.exists is not a function')) {
                                moduleName = 'ModuleRegistry';
                                errorText = 'Missing exists method';
                            } else if (error.message === 'Script error.' ||
                                error.message === 'Script error') {
                                moduleName = 'Script-CORS';
                                errorText = 'Script error due to CORS restrictions';
                            }
                        } else {
                            errorText = 'Unknown error';
                        }

                        // Get source info if available
                        if (error.source) {
                            errorSource = error.source;
                        } else if (error.filename) {
                            errorSource = error.filename;
                        }
                    } else {
                        errorText = String(error);
                    }

                    // Add to the module group
                    if (!moduleErrors[moduleName]) {
                        moduleErrors[moduleName] = [];
                    }

                    // Format final error text
                    let fullErrorText = errorText;
                    if (errorSource && !fullErrorText.includes(errorSource)) {
                        fullErrorText += ` in ${errorSource}`;
                    }
                    if (error.line && !fullErrorText.includes(`line ${error.line}`)) {
                        fullErrorText += ` (line ${error.line})`;
                    }

                    moduleErrors[moduleName].push(fullErrorText);
                } catch (e) {
                    // Fallback for any error during processing
                    console.error('Error processing error object:', e);
                    if (!moduleErrors['unknown']) {
                        moduleErrors['unknown'] = [];
                    }
                    moduleErrors['unknown'].push(String(error));
                }
            });

            return moduleErrors;
        },

        /**
         * Get CORS errors that should be displayed in the minimal log
         * @param {Array} errors - All script errors
         * @returns {Array} - Minimized list of CORS/Script errors
         */
        getScriptCorsErrors: function (errors) {
            if (!errors) return [];
            return errors.filter(err =>
                (typeof err.message === 'string' &&
                    (err.message.includes('Script error') ||
                        err.message === 'Script error.')) ||
                err.module === 'Script-CORS'
            );
        },

        /**
         * Get global CORS errors
         * @returns {Array} - Filtered global CORS errors
         */
        getGlobalCorsErrors: function () {
            if (!window.corsErrors) return [];
            return window.corsErrors.filter(error => !error.suppressed);
        }
    };

    window.StatusErrorManager = StatusErrorManager;

})();
