/**
 * Content Filters
 * Logic for filtering content results and managing keywords
 */
const ContentFilters = {
    // Keyword arrays for filtering
    MANGA_KEYWORDS: [
        'manga', 'anime', 'japanese comic', 'light novel',
        'webtoon', 'manhwa', 'manhua', 'comic', 'chapter',
        'volume', 'tankōbon', 'tankobon', 'mangaka'
    ],

    WEB_NOVEL_KEYWORDS: [
        'novel', 'web novel', 'light novel', 'web fiction',
        'fanfiction', 'ranobe', 'wuxia', 'xianxia', 'cultivation',
        'chapter', 'volume', 'book', 'series', 'story'
    ],

    /**
     * Filter results based on keywords (Manga/Web Novel)
     * @param {Array} results - The results to filter
     * @param {boolean} isMangaFilter - Whether to filter for manga
     * @param {boolean} isWebNovelFilter - Whether to filter for web novels
     * @returns {Array} Filtered results
     */
    filterResults: function (results, isMangaFilter, isWebNovelFilter) {
        if (!isMangaFilter && !isWebNovelFilter) return results;

        return results.filter(item => {
            if (!item) return false;

            const titleLower = item.title?.toLowerCase() || '';
            const descLower = item.snippet?.toLowerCase() || '';
            const wikiNameLower = item.wiki_name?.toLowerCase() || '';
            const categories = item.categories?.map(cat => cat.toLowerCase()) || [];

            let isMangaRelated = false;
            let isNovelRelated = false;

            if (isMangaFilter) {
                isMangaRelated = this.MANGA_KEYWORDS.some(kw =>
                    titleLower.includes(kw) ||
                    descLower.includes(kw) ||
                    wikiNameLower.includes(kw) ||
                    categories.some(cat => cat.includes(kw))
                );
            }

            if (isWebNovelFilter) {
                isNovelRelated = this.WEB_NOVEL_KEYWORDS.some(kw =>
                    titleLower.includes(kw) ||
                    descLower.includes(kw) ||
                    wikiNameLower.includes(kw) ||
                    categories.some(cat => cat.includes(kw))
                );
            }

            return (isMangaFilter && isMangaRelated) || (isWebNovelFilter && isNovelRelated);
        });
    }
};

window.ContentFilters = ContentFilters;
