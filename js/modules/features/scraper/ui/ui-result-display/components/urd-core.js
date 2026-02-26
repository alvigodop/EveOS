/**
 * UI Result Display - Core Component
 * 
 * Shared utilities for result display.
 * 
 * @version 1.0.0
 */

const URDCore = {
    /**
     * Groups search results by a specified attribute
     * @param {Array} results - The search results to group
     * @param {string} groupBy - The attribute to group by
     * @returns {Object} - The grouped results
     */
    groupResultsBy: function (results, groupBy) {
        if (!results || !Array.isArray(results)) return {};

        const grouped = {};

        results.forEach(result => {
            const key = result[groupBy] || 'Other';
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(result);
        });

        return grouped;
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('URDCore', URDCore);
}

window.URDCore = URDCore;
