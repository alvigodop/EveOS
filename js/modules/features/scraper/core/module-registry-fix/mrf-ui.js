/**
 * Module Registry Fix - UI Module
 * Handles UI-related fixes (e.g. error display formatting).
 */
const ModuleRegistryFixUI = {
    _initialized: false,

    init: function () {
        if (this._initialized) return;
        this._initialized = true;

        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            window.ModuleRegistry.register('ModuleRegistryFixUI', ModuleRegistryFixUI);
        }
    },

    fixErrorDisplay: function () {
        try {
            // Fix display of loading errors
            if (window.moduleLoadingErrors && Array.isArray(window.moduleLoadingErrors)) {
                // Create a more descriptive error array
                const formattedErrors = window.moduleLoadingErrors.map(error => {
                    if (typeof error === 'object' && error !== null) {
                        return {
                            module: error.module || 'unknown',
                            message: error.message || 'No message available',
                            time: error.time || new Date().toISOString(),
                            details: JSON.stringify(error)
                        };
                    }
                    return { message: String(error), time: new Date().toISOString() };
                });

                // Replace the original array with our formatted one
                window.moduleLoadingErrors = formattedErrors;
            }

            // Update any error display elements
            const errorElements = document.querySelectorAll('.error-display, .log-display');
            errorElements.forEach(element => {
                if (element.textContent.includes('[object Object]')) {
                    // Try to format the content better
                    try {
                        const content = element.textContent;
                        const formatted = content.replace(/\[object Object\]/g, '(Error object)');
                        element.textContent = formatted;
                    } catch (displayError) {
                        console.warn('Error updating error display element:', displayError);
                    }
                }
            });
        } catch (e) {
            console.error('Error in fixErrorDisplay:', e);
        }
    }
};

if (typeof window !== 'undefined') {
    window.ModuleRegistryFixUI = ModuleRegistryFixUI;
    ModuleRegistryFixUI.init();
}
