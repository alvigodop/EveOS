/**
 * Result Filter Module
 * 
 * Handles filtering of search results based on user preferences and content types.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    if (!window.ResultFilter) {
        const ResultFilter = window.ResultFilter = {
            version: '1.0.0',
            _initialized: false,

            init: function () {
                if (this._initialized) return this;
                console.log('ResultFilter: Initializing');
                this._initialized = true;
                return this;
            },

            /**
             * Filter results based on options
             * @param {Array} results - List of results to filter
             * @param {Object} options - Filter options
             */
            filter: function (results, options) {
                if (!results) return [];

                const mangaKeywords = [
                    'manga', 'anime', 'japanese comic', 'light novel',
                    'webtoon', 'manhwa', 'manhua', 'comic', 'chapter',
                    'volume', 'tankōbon', 'tankobon', 'mangaka'
                ];

                const webNovelKeywords = [
                    'novel', 'web novel', 'light novel', 'web fiction',
                    'fanfiction', 'ranobe', 'wuxia', 'xianxia', 'cultivation',
                    'chapter', 'volume', 'book', 'series', 'story'
                ];

                return results.filter(item => {
                    if (!item) return false;

                    // 1. Hide Real People
                    if (options.hidePersons && (item.contentType === 'Real-Person' || item.contentType === 'person')) {
                        return false;
                    }

                    // 2. Hide Text Matches
                    if (options.hideTextMatches && item.isTextMatch) {
                        return false;
                    }

                    // 3. Hide Source Articles (results that match the source entry title)
                    if (options.hideSourceArticles) {
                        const titleLower = (item.title || '').toLowerCase().trim();
                        const relatedToLower = (item.relatedTo || '').toLowerCase().trim();
                        const queryLower = (options.query || options.searchTerm || '').toLowerCase().trim();

                        // If the result title matches the source entry it came from, hide it
                        if (titleLower && relatedToLower && titleLower === relatedToLower) {
                            return false;
                        }

                        // Also check isMainArticle flag
                        if (item.isMainArticle === true) {
                            return false;
                        }
                    }

                    // 4. Manga / Web Novel Logic
                    if (options.mangaFilter || options.webNovelFilter) {
                        const titleLower = item.title?.toLowerCase() || '';
                        const descLower = item.snippet?.toLowerCase() || '';
                        const wikiNameLower = item.wiki_name?.toLowerCase() || '';
                        const categories = item.categories?.map(cat => cat.toLowerCase()) || [];

                        const isMangaRelated = mangaKeywords.some(kw =>
                            titleLower.includes(kw) ||
                            descLower.includes(kw) ||
                            wikiNameLower.includes(kw) ||
                            categories.some(cat => cat.includes(kw))
                        );

                        const isNovelRelated = webNovelKeywords.some(kw =>
                            titleLower.includes(kw) ||
                            descLower.includes(kw) ||
                            wikiNameLower.includes(kw) ||
                            categories.some(cat => cat.includes(kw))
                        );

                        // If filter is active, require a match
                        if (options.mangaFilter && !isMangaRelated) return false;
                        if (options.webNovelFilter && !isNovelRelated) return false;
                    }

                    return true;
                });
            }
        };

        // Initialize immediately
        ResultFilter.init();
    }

})();
