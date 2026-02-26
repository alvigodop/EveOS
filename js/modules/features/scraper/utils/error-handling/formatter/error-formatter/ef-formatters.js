/**
 * ErrorFormatters Module
 * Contains pure functions for formatting error objects and arrays.
 */
const ErrorFormatters = {};

ErrorFormatters.init = function () {
    console.log('ErrorFormatters initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('ErrorFormatters', ErrorFormatters);
    }
};

/**
 * Format an array of errors for proper display
 */
ErrorFormatters.formatErrorArray = function (errorArray) {
    if (!Array.isArray(errorArray)) {
        return [];
    }

    return errorArray.map(error => this.formatError(error));
};

/**
 * Format a single error object
 */
ErrorFormatters.formatError = function (error) {
    // Start with an empty object to ensure consistent structure
    const formattedError = {
        module: 'unknown',
        message: 'Unknown error',
        time: new Date().toISOString(),
        details: '',
        toString: function () {
            return `Error in ${this.module}: ${this.message}`;
        }
    };

    if (typeof error === 'object' && error !== null) {
        // Extract known properties directly
        if (error.module) formattedError.module = error.module;
        if (error.message) formattedError.message = error.message;
        if (error.time) formattedError.time = error.time;
        if (error.details) formattedError.details = error.details;
        if (error.source) formattedError.source = error.source;
        if (error.line) formattedError.line = error.line;
        if (error.stack) formattedError.stack = error.stack;

        // If no message is provided but we have other properties, create one
        if (!error.message) {
            if (error.stack) {
                formattedError.message = error.stack.split('\n')[0];
            } else if (error.source) {
                formattedError.message = `Error in ${error.source}`;
                if (error.line) formattedError.message += ` at line ${error.line}`;
            } else {
                formattedError.message = 'Unknown error';
                // Try to make a reasonable message from any available properties
                const objStr = JSON.stringify(error);
                if (objStr && objStr !== '{}') {
                    formattedError.message = objStr;
                }
            }
        }
    } else if (typeof error === 'string') {
        formattedError.message = error;
    } else {
        formattedError.message = String(error);
    }

    return formattedError;
};

window.ErrorFormatters = ErrorFormatters;
