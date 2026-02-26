/**
 * Content Inferrer (Facade)
 * Logic for inferring content types and categories from titles and metadata
 * Refactored to delegate to sub-modules in content-inferrer-components/
 */

const ContentInferrer = {
    version: '1.1.0',

    init: function () {
        console.log('ContentInferrer (Facade) initialized');

        // Aggregate functionality from sub-modules
        this.aggregateModules();
    },

    /**
     * Aggregates functionality from all sub-modules onto this facade object.
     * Uses Object.assign to copy methods and properties.
     */
    aggregateModules: function () {
        // Ensure sub-modules are loaded
        const modules = [
            window.ContentUtils,
            window.ContentFilters,
            window.TitleInference,
            window.TextInference,
            window.CategoryInference
        ];

        modules.forEach(module => {
            if (module) {
                Object.assign(this, module);
            } else {
                console.warn('ContentInferrer: A sub-module is missing');
            }
        });
    }
};

// Auto-aggregate immediately in case init isn't called explicitly before use
ContentInferrer.aggregateModules();

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ContentInferrer', ContentInferrer);
}

// Make globally available
window.ContentInferrer = ContentInferrer;

// Expose functions globally for backward compatibility
window.inferCategoriesAndType = function (title, domain) {
    return ContentInferrer.inferCategoriesAndType(title, domain);
};

window.getContentTypeIcon = function (contentType) {
    return ContentInferrer.getContentTypeIcon(contentType);
};
