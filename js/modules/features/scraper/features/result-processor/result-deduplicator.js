/**
 * Result Deduplicator Module (Facade)
 * 
 * Handles deduplication of search results using exact matching, strict clean matching,
 * Levenshtein distance, and alias cross-referencing.
 * 
 * Delegates to:
 * - RDSimilarity: Title similarity logic
 * 
 * @version 1.1.0-facade
 */

(function () {
    'use strict';

    if (!window.ResultDeduplicator) {
        const ResultDeduplicator = window.ResultDeduplicator = {
            version: '1.1.0-facade',
            _initialized: false,

            init: function () {
                if (this._initialized) return this;
                console.log('ResultDeduplicator: Initializing');
                if (window.RDSimilarity && typeof RDSimilarity.init === 'function') {
                    RDSimilarity.init();
                    RDSimilarity._initialized = true;
                }
                this._initialized = true;
                return this;
            },

            /**
             * Advanced deduplication using 2-pass matching + fuzzy logic
             * @param {Array} results - Raw results
             * @returns {Array} Deduplicated results
             */
            deduplicate: function (results) {
                console.log(`ResultDeduplicator: Deduplicating ${results.length} results`);

                const groupedResults = {};

                // First pass: Group results by normalized title
                // EXCEPTION: Text matches use URL as key since they point to different locations
                results.forEach(result => {
                    if (!result || !result.title) return;

                    // For text matches, use URL as the unique key to preserve different locations
                    let groupKey;
                    if (result.isTextMatch && result.url) {
                        groupKey = result.url.toLowerCase();
                    } else {
                        groupKey = result.title.toLowerCase().trim();
                    }

                    if (!groupedResults[groupKey]) {
                        groupedResults[groupKey] = [];
                    }
                    groupedResults[groupKey].push(result);
                });

                // Second pass: Cross-reference and merge groups
                const mergedGroups = {};
                Object.entries(groupedResults).forEach(([title, group]) => {
                    let found = false;
                    const groupTitle = group[0].title; // Use actual title of first item for comparison

                    // Check against existing merged groups
                    for (const [existingKey, existingGroup] of Object.entries(mergedGroups)) {
                        const existingTitle = existingGroup[0].title;

                        // 1. Fuzzy Match - delegate to RDSimilarity
                        const isTitleSimilar = this.areTitlesSimilar(groupTitle, existingTitle);

                        // 2. Alias Check
                        const hasAliasOverlap = group.some(result =>
                            existingGroup.some(existing =>
                                (result.aliases && result.aliases.some(a => a.toLowerCase() === existingKey)) ||
                                (existing.aliases && existing.aliases.some(a => a.toLowerCase() === title)) ||
                                // Bi-directional alias check
                                (result.aliases && existing.aliases && result.aliases.some(a => existing.aliases.includes(a)))
                            )
                        );

                        if (isTitleSimilar || hasAliasOverlap) {
                            existingGroup.push(...group);
                            found = true;
                            break; // Stop checking other groups
                        }
                    }

                    if (!found) {
                        mergedGroups[title] = group;
                    }
                });

                const dedupedResults = [];

                // Process each merged group to create a single final result
                Object.values(mergedGroups).forEach(group => {
                    if (group.length === 0) return;

                    // Find the "best" result 
                    // Priority: Main Article > Best Snippet Length > Match Score
                    const mainResult = group.reduce((prev, current) => {
                        // Prefer main articles
                        if (prev.isMainArticle && !current.isMainArticle) return prev;
                        if (!prev.isMainArticle && current.isMainArticle) return current;

                        // Prefer results with better snippets (if not main article decision)
                        const prevSnippetLen = (prev.snippet || '').length;
                        const currSnippetLen = (current.snippet || '').length;
                        const snippetDiff = Math.abs(prevSnippetLen - currSnippetLen);

                        // If snippets are significantly different, take the longer one
                        if (snippetDiff > 50) {
                            return (prevSnippetLen > currSnippetLen) ? prev : current;
                        }

                        // Then match score
                        const prevScore = prev.matchScore || 0;
                        const currScore = current.matchScore || 0;
                        if (prevScore !== currScore) return (prevScore > currScore) ? prev : current;

                        return prev;
                    });

                    // Collect aliased titles & merged categories
                    const capturedAliases = new Set();
                    const mergedCategories = new Set(mainResult.categories || []);

                    // Collect sources
                    const sources = new Set();
                    if (mainResult.wiki_name) sources.add(mainResult.wiki_name);
                    if (mainResult.source) sources.add(mainResult.source);

                    group.forEach(result => {
                        // Aliases
                        if (result.title.toLowerCase() !== mainResult.title.toLowerCase()) {
                            capturedAliases.add(result.title);
                        }
                        if (result.aliases) {
                            result.aliases.forEach(a => capturedAliases.add(a));
                        }

                        // Categories
                        if (result.categories) {
                            result.categories.forEach(c => mergedCategories.add(c));
                        }

                        // Sources
                        if (result.wiki_name) sources.add(result.wiki_name);
                        if (result.source) sources.add(result.source);
                    });

                    const finalResult = {
                        ...mainResult,
                        aliases: Array.from(capturedAliases),
                        categories: Array.from(mergedCategories),
                        // Aggregate sources
                        sourceCount: group.length,
                        mergedSources: Array.from(sources).filter(Boolean)
                    };

                    dedupedResults.push(finalResult);
                });

                return dedupedResults;
            },

            /**
             * Check if two titles are similar - delegates to RDSimilarity
             */
            areTitlesSimilar: function (t1, t2) {
                if (window.RDSimilarity) {
                    return RDSimilarity.areTitlesSimilar(t1, t2);
                }
                // Fallback: basic comparison
                if (!t1 || !t2) return false;
                return t1.toLowerCase().trim() === t2.toLowerCase().trim();
            },

            /**
             * Levenshtein Distance - delegates to RDSimilarity
             */
            levenshteinDistance: function (a, b) {
                if (window.RDSimilarity) {
                    return RDSimilarity.levenshteinDistance(a, b);
                }
                // Fallback: return max length (no match)
                return Math.max(a.length, b.length);
            }
        };

        // Initialize immediately
        ResultDeduplicator.init();
    }

})();
