/**
 * Result Processor Module
 * 
 * Facade for handling cleaning, deduplication, filtering, and sorting of search results.
 * Delegates actual logic to specialized sub-modules.
 * 
 * @version 1.0.1 (Refactored)
 */

(function () {
    'use strict';

    if (!window.ResultProcessor) {
        const ResultProcessor = window.ResultProcessor = {
            version: '1.0.1',
            _initialized: false,

            init: function () {
                if (this._initialized) return this;
                console.log('ResultProcessor: Initializing (Facade Mode)');
                if (window.ResultEnricher && typeof ResultEnricher.init === 'function') {
                    ResultEnricher.init();
                    ResultEnricher._initialized = true;
                }
                if (window.ResultDeduplicator && typeof ResultDeduplicator.init === 'function') {
                    ResultDeduplicator.init();
                    ResultDeduplicator._initialized = true;
                }
                if (window.ResultFilter && typeof ResultFilter.init === 'function') {
                    ResultFilter.init();
                    ResultFilter._initialized = true;
                }
                if (window.RelevanceScorer && typeof RelevanceScorer.init === 'function') {
                    RelevanceScorer.init();
                    RelevanceScorer._initialized = true;
                }
                this._initialized = true;

                // Register with ModuleRegistry
                if (window.ModuleRegistry) {
                    window.ModuleRegistry.register('ResultProcessor', this);
                }
                return this;
            },

            /**
             * Main processing pipeline
             * @param {Array} results - Raw results
             * @param {Object} options - Processing options (filters, sort, etc.)
             * @returns {Array} Processed results
             */
            process: function (results, options = {}) {
                if (!results || !Array.isArray(results)) return [];

                let processed = [...results];

                // 0. Enrich with content types if missing
                if (window.ResultEnricher) {
                    processed = ResultEnricher.enrich(processed);
                } else {
                    console.warn('ResultProcessor: ResultEnricher missing, skipping enrichment');
                }

                // 1. Deduplicate (if enabled)
                if (options.smartDedup !== false) {
                    if (window.ResultDeduplicator) {
                        processed = ResultDeduplicator.deduplicate(processed);
                    } else {
                        console.warn('ResultProcessor: ResultDeduplicator missing, skipping deduplication');
                    }
                }

                // 2. Filter
                if (window.ResultFilter) {
                    processed = ResultFilter.filter(processed, options);
                } else {
                    console.warn('ResultProcessor: ResultFilter missing, skipping filtering');
                }

                // 3. Score and Sort using RelevanceScorer if available
                const query = options.searchTerm || options.query || '';

                if (window.RelevanceScorer && query) {
                    // Use the specialized module for scoring and sorting
                    console.log('ResultProcessor: Delegating sort/score to RelevanceScorer');
                    processed = RelevanceScorer.sortResultsByRelevance(processed, query);
                } else {
                    // Fallback sorting if module missing or no query
                    processed = this.sort(processed, options.sortBy || 'relevance');
                }

                return processed;
            },

            /**
             * Sort results (Fallback)
             */
            sort: function (results, sortBy) {
                if (sortBy === 'relevance') {
                    return results.sort((a, b) => {
                        // Always put main articles first
                        if (a.isMainArticle && !b.isMainArticle) return -1;
                        if (!a.isMainArticle && b.isMainArticle) return 1;

                        return (b.matchScore || 0) - (a.matchScore || 0);
                    });
                }
                return results;
            },

            /**
             * Enrich results (Direct Access)
             */
            enrich: function (results) {
                if (window.ResultEnricher) {
                    return ResultEnricher.enrich(results);
                }
                return results;
            },

            /**
             * Deduplicate results (Direct Access)
             */
            deduplicate: function (results) {
                if (window.ResultDeduplicator) {
                    return ResultDeduplicator.deduplicate(results);
                }
                return results;
            },

            /**
             * Check title similarity (Direct Access)
             */
            areTitlesSimilar: function (t1, t2) {
                if (window.ResultDeduplicator) {
                    return ResultDeduplicator.areTitlesSimilar(t1, t2);
                }
                return false;
            }
        };

        // Initialize immediately
        ResultProcessor.init();
    }

})();
