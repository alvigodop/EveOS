/**
 * Result Enricher Module (Facade)
 * 
 * Handles enrichment of search results with inferred metadata (e.g., Content Type)
 * using priority-based logic (Snippet > Categories > Title).
 * 
 * Delegates to:
 * - REFandom: Fandom-specific content type inference
 * - ContentInferrer: General content type inference
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    if (!window.ResultEnricher) {
        const ResultEnricher = window.ResultEnricher = {
            version: '1.1.0-facade',
            _initialized: false,

            init: function () {
                if (this._initialized) return this;
                console.log('ResultEnricher: Initializing');
                if (window.REFandom && typeof REFandom.init === 'function') {
                    REFandom.init();
                    REFandom._initialized = true;
                }
                if (window.ContentInferrer && typeof ContentInferrer.init === 'function') {
                    ContentInferrer.init();
                    ContentInferrer._initialized = true;
                }
                this._initialized = true;
                return this;
            },

            /**
             * Enrich results with inferred metadata
             * Priority: Snippet > Categories > Title
             */
            enrich: function (results) {
                if (!results) return [];

                return results.map(result => {
                    const domain = result.domain || (result.url ? new URL(result.url).hostname : '');
                    const isFandom = window.REFandom ? REFandom.isFandomDomain(domain) : domain.includes('fandom.com');
                    const snippet = result.snippet || result.description || '';

                    // Migrate legacy tags
                    if (result.contentType === 'character') result.contentType = 'Fictional-Character';
                    if (result.contentType === 'person') result.contentType = 'Real-Person';

                    // --- PRIORITY 0: Domain-Specific Inference (Legacy Rules) ---
                    const domainType = this.inferDomainSpecificContent(result);
                    if (domainType) {
                        result.contentType = domainType;
                        return result;
                    }

                    // --- PRIORITY 1: Snippet-based inference (most reliable) ---
                    const typeFromText = this.inferContentTypeFromText(snippet);
                    if (typeFromText) {
                        result.contentType = typeFromText;
                        return result;
                    }

                    // --- PRIORITY 2: Category-based inference ---
                    if (result.categories && result.categories.length > 0) {
                        const typeFromCategories = this.inferContentTypeFromCategories(result.categories, domain);
                        if (typeFromCategories && typeFromCategories !== 'other') {
                            result.contentType = typeFromCategories;
                            return result;
                        }
                    }

                    // --- PRIORITY 3: Title-based inference ---
                    if (!result.contentType || result.contentType === 'other' || result.contentType === 'article') {
                        const typeFromTitle = this.inferContentTypeFromTitle(result.title, domain);
                        const hasSnippet = snippet && snippet.trim() && !snippet.toLowerCase().includes('no snippet');
                        const hasCategories = result.categories && result.categories.length > 0;

                        // Use Fandom-specific logic if available
                        if (isFandom && window.REFandom) {
                            result.contentType = REFandom.inferFandomTitleType(result, typeFromTitle, snippet, hasSnippet, hasCategories);
                        } else {
                            result.contentType = typeFromTitle;
                        }
                    }

                    // --- FINAL FANDOM OVERRIDE ---
                    if (isFandom && result.contentType === 'Real-Person' && window.REFandom) {
                        result.contentType = REFandom.applyFandomRealPersonOverride(result, snippet);
                    }

                    return result;
                });
            },

            /**
             * Helper function to infer content type from title
             */
            inferContentTypeFromTitle: function (title, domain) {
                if (window.ContentInferrer && typeof ContentInferrer.inferContentTypeFromTitle === 'function') {
                    return ContentInferrer.inferContentTypeFromTitle(title, domain);
                }
                return 'other';
            },

            /**
             * Helper function to infer content type from text (snippet/description)
             */
            inferContentTypeFromText: function (text) {
                if (window.ContentInferrer && typeof ContentInferrer.inferContentTypeFromText === 'function') {
                    return ContentInferrer.inferContentTypeFromText(text);
                }
                return null;
            },

            /**
             * Helper function to infer content type from categories
             */
            inferContentTypeFromCategories: function (categories, domain) {
                if (window.ContentInferrer && typeof ContentInferrer.inferContentTypeFromCategories === 'function') {
                    return ContentInferrer.inferContentTypeFromCategories(categories, domain);
                }
                return 'other';
            },

            /**
             * Domain-specific inference rules
             */
            inferDomainSpecificContent: function (result) {
                if (window.ContentInferrer && typeof ContentInferrer.inferCategoriesAndType === 'function') {
                    const domain = result.domain || (result.url ? new URL(result.url).hostname : '');
                    const inference = ContentInferrer.inferCategoriesAndType(result.title, domain);
                    return inference.inferredContentType;
                }
                return null;
            }
        };

        // Initialize immediately
        ResultEnricher.init();
    }

})();
