/**
 * Status Data Formatting Component
 * Handles formatting of error objects for display.
 */
const StatusDataFormatting = {};

/**
 * Initialize the module
 */
StatusDataFormatting.init = function () {
    console.log('StatusDataFormatting initialized');
};

/**
 * Ensure errors are properly formatted
 */
StatusDataFormatting.ensureErrorsFormatted = function () {
    // Check if moduleLoadingErrors exists and has [object Object] issues
    if (window.moduleLoadingErrors && Array.isArray(window.moduleLoadingErrors)) {
        // Test if errors need formatting
        const needsFormatting = window.moduleLoadingErrors.some(error =>
            typeof error === 'object' &&
            error !== null &&
            (!error.toString || error.toString === Object.prototype.toString)
        );

        if (needsFormatting) {
            console.log('Errors need formatting, applying direct formatting');

            // Format errors directly
            window.moduleLoadingErrors = window.moduleLoadingErrors.map(error => {
                if (typeof error !== 'object' || error === null) {
                    return {
                        message: String(error)
                    };
                }

                // Create a formatted error object with basic properties
                const formatted = {
                    message: error.message || 'Unknown error',
                    module: error.module || 'unknown',
                    time: error.time || new Date().toISOString()
                };

                // Copy any other properties
                for (const key in error) {
                    if (!formatted[key] && typeof error[key] !== 'function') {
                        formatted[key] = error[key];
                    }
                }

                // Add toString method
                Object.defineProperty(formatted, 'toString', {
                    value: function () {
                        if (this.message) {
                            let errorText = this.message;
                            if (this.module && this.module !== 'unknown') {
                                errorText = `${this.module}: ${errorText}`;
                            }
                            if (this.source) {
                                errorText += ` in ${this.source}`;
                            }
                            if (this.line) {
                                errorText += ` (line ${this.line})`;
                            }
                            return errorText;
                        }
                        return JSON.stringify(this);
                    },
                    writable: true,
                    configurable: true
                });

                return formatted;
            });

            // Add toString method to the array itself
            Object.defineProperty(window.moduleLoadingErrors, 'toString', {
                value: function () {
                    return this.map(e => e.toString()).join('\n');
                },
                writable: true,
                configurable: true
            });
        }
    }
};

window.StatusDataFormatting = StatusDataFormatting;
