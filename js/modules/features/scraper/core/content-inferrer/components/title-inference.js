/**
 * Title Inference
 * Logic for inferring content type from title keywords
 */
const TitleInference = {
    /**
     * Infer content type based on title keywords.
     * Basic inference, can be expanded.
     * @param {string} title - The page title.
     * @param {string} [source='unknown'] - Source domain/wiki (e.g., 'en.wikipedia.org')
     * @returns {string} Inferred type (e.g., 'list', 'disambiguation', 'category', 'person', 'article')
     */
    inferContentTypeFromTitle: function (title, source = 'unknown') {
        if (!title) return 'unknown';
        const lowerTitle = title.toLowerCase();
        const lowerSource = (source || 'unknown').toLowerCase();

        // Removed unused isFandom check to avoid linter warnings unless needed in future logic
        // const isFandom = lowerSource.includes('fandom') || lowerSource.includes('wikia');

        if (lowerTitle.startsWith('list of')) return 'list';
        if (lowerTitle.endsWith('(disambiguation)')) return 'disambiguation';
        if (lowerTitle.startsWith('category:')) return 'category';

        // Check for specific Person indicators (High Confidence)
        // Expanded list
        const personKeywords = ['author', 'creator', 'director', 'voice actor', 'cast', 'staff', 'mangaka', 'illustrator', 'artist', 'screenwriter', 'producer', 'writer'];
        if (personKeywords.some(kw => lowerTitle.includes(kw))) {
            return 'Real-Person';
        }

        // Check for location/group indicators (Prioritize over Name Pattern)
        if (lowerTitle.includes('world') ||
            lowerTitle.includes('land') ||
            lowerTitle.includes('planet') ||
            lowerTitle.includes('city') ||
            lowerTitle.includes('town') ||
            lowerTitle.includes('village') ||
            lowerTitle.includes('kingdom') ||
            lowerTitle.includes('family') ||
            lowerTitle.includes('clan') ||
            lowerTitle.includes('tribe') ||
            lowerTitle.includes('dynasty') ||
            lowerTitle.includes('house ')) {
            return 'location';
        }

        // Check for story indicators
        if (lowerTitle.includes('episode') ||
            lowerTitle.includes('chapter') ||
            lowerTitle.includes('saga') ||
            lowerTitle.includes('arc') ||
            lowerTitle.includes('series') ||
            lowerTitle.includes('season')) {
            return 'story';
        }

        // Basic Manga/Web Novel detection from title
        if (lowerTitle.includes('(manga)') || lowerTitle.includes(' manga')) return 'manga';
        if (lowerTitle.includes('(web novel)') || lowerTitle.includes(' web novel')) return 'web novel';

        // Basic person detection (Name Pattern)
        // Moved to be LOWER priority than specific indicators
        const nameParts = title.split(' ');
        if (nameParts.length >= 2 && nameParts.length <= 4) {
            // Check if parts start with uppercase (simple heuristic)
            const allPartsCapitalized = nameParts.every(part => part.length > 0 && part[0] === part[0].toUpperCase());
            if (allPartsCapitalized && !lowerTitle.includes(' series') && !lowerTitle.includes(' episode') && !lowerTitle.includes(' chapter')) {
                // If we got here, it looks like a name, and didn't match location/story/role keywords above.
                // WE DO NOT DEFAULT TO REAL PERSON HERE unless we have strong evidence.
                // But we also shouldn't blindly say 'Fictional-Character' if it's potentially a real person.

                // If we are on Fandom, and it's just a name, it's LIKELY a character, but could be an author.
                // Since we moved the "author/mangaka" check UP, we are safer.

                // We'll leave it as 'other' or a soft probability if possible, but for this function returning a string:
                // Let's rely on the result-processor's other inference methods (categories) to decide.
                // Returning 'unknown' or 'article' is safer than guessing.
            }
        }

        return 'article'; // Default
    }
};

window.TitleInference = TitleInference;
