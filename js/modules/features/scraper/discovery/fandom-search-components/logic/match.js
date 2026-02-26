/**
 * Fandom Search Logic - Match
 * Counts term matches in wiki data
 */
const FandomSearchMatch = {};

/**
 * Count the number of times the search terms appear in the wiki
 * @param {Object} wiki - The wiki object
 * @param {Object} searchTerms - The search terms object containing original and split terms
 * @returns {number} - Number of matches
 */
FandomSearchMatch.countMatches = function (wiki, searchTerms) {
    const { original, terms } = searchTerms;
    let count = 0;

    // Check domain
    if (wiki.domain) {
        const domainLower = wiki.domain.toLowerCase();
        count += (domainLower.split(original).length - 1);

        // Count matches for individual terms
        terms.forEach(term => {
            count += (domainLower.split(term).length - 1);
        });
    }

    // Check name
    if (wiki.name) {
        const nameLower = wiki.name.toLowerCase();
        count += (nameLower.split(original).length - 1);

        // Count matches for individual terms
        terms.forEach(term => {
            count += (nameLower.split(term).length - 1);
        });
    }

    // Check description
    if (wiki.description) {
        const descLower = wiki.description.toLowerCase();
        count += (descLower.split(original).length - 1);

        // Count matches for individual terms
        terms.forEach(term => {
            count += (descLower.split(term).length - 1);
        });
    }

    return count;
};

// Ensure global availability
window.FandomSearchMatch = FandomSearchMatch;
console.log('[FandomSearchMatch] Loaded');
