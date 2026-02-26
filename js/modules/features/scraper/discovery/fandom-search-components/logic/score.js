/**
 * Fandom Search Logic - Score
 * Calculates relevance scores for search results
 */
const FandomSearchScore = {};

/**
 * Calculate relevance score for a wiki based on the search terms
 * @param {Object} wiki - The wiki object
 * @param {Object} searchTerms - The search terms object containing original and split terms
 * @returns {number} - Relevance score
 */
FandomSearchScore.calculateWikiRelevance = function (wiki, searchTerms) {
    const { original, terms } = searchTerms;
    let score = 100; // Base score

    // Check domain name match
    if (wiki.domain) {
        const domainLower = wiki.domain.toLowerCase();

        // Exact match for original term
        if (domainLower.includes(original)) {
            score += 30;
            // Extra boost for domain that starts with the search term
            if (domainLower.startsWith(original)) {
                score += 50;
            }
        }

        // Check individual terms
        terms.forEach(term => {
            if (domainLower.includes(term)) {
                score += 15;
                if (domainLower.startsWith(term)) {
                    score += 25;
                }
            }
        });
    }

    // Check wiki name match
    if (wiki.name) {
        const nameLower = wiki.name.toLowerCase();

        // Exact match for original term
        if (nameLower.includes(original)) {
            score += 40;
            // Extra boost for name that starts with the search term
            if (nameLower.startsWith(original)) {
                score += 30;
            }
        }

        // Check individual terms
        terms.forEach(term => {
            if (nameLower.includes(term)) {
                score += 20;
                if (nameLower.startsWith(term)) {
                    score += 15;
                }
            }
        });
    }

    // Add points for description match
    if (wiki.description) {
        const descLower = wiki.description.toLowerCase();

        // Exact match for original term
        if (descLower.includes(original)) {
            score += 20;
        }

        // Check individual terms
        terms.forEach(term => {
            if (descLower.includes(term)) {
                score += 10;
            }
        });
    }

    // Add points for verified wikis
    if (wiki.verified) {
        score += 10;
    }

    // Add points for popular wikis
    if (wiki.fromPopular) {
        score += 15;
    }

    return score;
};

// Ensure global availability
window.FandomSearchScore = FandomSearchScore;
console.log('[FandomSearchScore] Loaded');
