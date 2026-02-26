/**
 * DOM Utils - Query Component
 * 
 * Helper functions for querying and identifying DOM elements.
 * 
 * @version 1.0.0
 */

const DUQuery = {
    /**
     * Creates a safe ID by encoding special characters.
     * Useful for creating valid DOM element IDs from arbitrary strings.
     * @param {string} str - The string to convert to a safe ID.
     * @returns {string} A safe ID string.
     */
    safeId: function (str) {
        if (!str) return '';
        // Create a safe ID by replacing special characters and spaces
        return encodeURIComponent(str).replace(/%/g, '_');
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('DUQuery', DUQuery);
}

window.DUQuery = DUQuery;
