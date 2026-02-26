/**
 * ErrorOverrides Module
 * Handles prototype modifications and object overrides for error displays.
 */
const ErrorOverrides = {};

ErrorOverrides.init = function () {
    console.log('ErrorOverrides initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('ErrorOverrides', ErrorOverrides);
    }
};

/**
 * Add toString method to an array to prevent [object Object] in display
 */
ErrorOverrides.addToStringMethod = function (array) {
    if (!Array.isArray(array)) return;

    // Add a toString method to prevent [object Object]
    Object.defineProperty(array, 'toString', {
        value: function () {
            if (this.length === 0) return 'No errors';

            return this.map(err => {
                if (typeof err === 'object' && err !== null) {
                    // If the error object has its own toString method, use it
                    if (typeof err.toString === 'function' &&
                        err.toString !== Object.prototype.toString) {
                        return err.toString();
                    }

                    // Otherwise, build a descriptive string
                    let message = err.message || 'No message';
                    let module = err.module || 'unknown';
                    let source = err.source ? ` (source: ${err.source})` : '';
                    let line = err.line ? ` line ${err.line}` : '';

                    return `Error in ${module}${source}${line}: ${message}`;
                }
                return String(err);
            }).join('\n');
        },
        writable: true,
        configurable: true
    });

    // Add a toJSON method for better JSON formatting
    Object.defineProperty(array, 'toJSON', {
        value: function () {
            return this.map(err => {
                if (typeof err === 'object' && err !== null) {
                    // Create a new object with all properties
                    const result = {};
                    for (const key in err) {
                        if (Object.prototype.hasOwnProperty.call(err, key) &&
                            typeof err[key] !== 'function') {
                            result[key] = err[key];
                        }
                    }
                    // Ensure certain properties exist
                    if (!result.module) result.module = 'unknown';
                    if (!result.message) result.message = 'No message';
                    if (!result.time) result.time = 'No timestamp';
                    return result;
                }
                return { message: String(err) };
            });
        },
        writable: true,
        configurable: true
    });

    // Add an inspect method for console output
    Object.defineProperty(array, 'inspect', {
        value: function () {
            return this.toString();
        },
        writable: true,
        configurable: true
    });
};

/**
 * Set up global Array.prototype.toString override for error-like arrays
 */
ErrorOverrides.setupErrorArrayMethods = function () {
    // Override Array.prototype.toString only for error arrays
    const originalArrayToString = Array.prototype.toString;

    Array.prototype.toString = function () {
        // Check if this looks like an error array
        if (this.length > 0 &&
            this.every(item => typeof item === 'object' &&
                (item.message || item.module || item.time))) {

            return this.map(err => {
                if (typeof err === 'object' && err !== null) {
                    return `Error in ${err.module || 'unknown'}: ${err.message || 'No message'}`;
                }
                return String(err);
            }).join('\n');
        }

        // Use the original method for non-error arrays
        return originalArrayToString.call(this);
    };

    console.log('Error array methods set up');
};

window.ErrorOverrides = ErrorOverrides;
