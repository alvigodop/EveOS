/**
 * Category Inference Module (Facade)
 * 
 * Logic for inferring content type from categories and domain specifics.
 * Delegates to specialized components.
 * 
 * Sub-modules:
 * - CategoryInferenceAnalysis: Analyzes category arrays.
 * - CategoryInferenceDomains: Handles domain-specific knowledge and fallbacks.
 * 
 * @version 1.1.0-facade
 */
const CategoryInference = {
    version: '1.1.0-facade',
    _initialized: false,

    /**
     * Initialize CategoryInference
     */
    init: function () {
        if (this._initialized) return;

        console.log('Initializing CategoryInference (Facade)');

        if (window.Categories) {
            // Optional: Register with Categories module if it exists
        }

        // Initialize sub-modules if they have init methods
        if (window.CategoryInferenceAnalysis && typeof CategoryInferenceAnalysis.init === 'function') {
            CategoryInferenceAnalysis.init();
        }
        if (window.CategoryInferenceDomains && typeof CategoryInferenceDomains.init === 'function') {
            CategoryInferenceDomains.init();
        }

        this._initialized = true;
    },

    /**
     * Infer content type based on categories.
     * @param {Array<string>} categories - Array of category names.
     * @param {string} domain - Domain name for context
     * @returns {string|null} Inferred type or null if no strong indicators.
     */
    inferContentTypeFromCategories: function (categories, domain) {
        if (window.CategoryInferenceAnalysis) {
            return CategoryInferenceAnalysis.inferContentTypeFromCategories(categories, domain);
        } else {
            console.warn('CategoryInferenceAnalysis not loaded');
            return null;
        }
    },

    /**
     * Infer categories and content type when API fails or returns empty.
     * Provides domain-specific inference for popular wikis.
     * @param {string} title - The page title
     * @param {string} domain - The wiki domain (e.g., 'naruto.fandom.com')
     * @returns {object} - { inferredContentType, inferredCategories }
     */
    inferCategoriesAndType: function (title, domain) {
        if (window.CategoryInferenceDomains) {
            return CategoryInferenceDomains.inferCategoriesAndType(title, domain);
        } else {
            console.warn('CategoryInferenceDomains not loaded');
            return { inferredContentType: 'other', inferredCategories: [] };
        }
    }
};

// Expose to window
window.CategoryInference = CategoryInference;

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CategoryInference.init());
} else {
    CategoryInference.init();
}
