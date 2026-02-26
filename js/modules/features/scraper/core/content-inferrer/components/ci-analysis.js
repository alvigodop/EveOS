/**
 * Category Inference Analysis Component
 * Logic for inferring content type from category arrays.
 */
const CategoryInferenceAnalysis = {};

/**
 * Initialize the module
 */
CategoryInferenceAnalysis.init = function () {
    console.log('CategoryInferenceAnalysis initialized');
};

/**
 * Infer content type based on categories.
 * @param {Array<string>} categories - Array of category names.
 * @param {string} domain - Domain name for context
 * @returns {string|null} Inferred type or null if no strong indicators.
 */
CategoryInferenceAnalysis.inferContentTypeFromCategories = function (categories, domain) {
    if (!categories || categories.length === 0) return null;

    const isFandom = (domain || '').includes('fandom.com');
    const lowerCategories = categories.map(cat => cat.toLowerCase());

    // Strong indicators first
    if (lowerCategories.some(cat => cat.includes('disambiguation pages'))) return 'disambiguation';
    if (lowerCategories.some(cat => cat.includes('lists of') || cat.endsWith(' lists'))) return 'list';

    // Check for TV series/show categories FIRST (to avoid misclassifying as manga)
    if (lowerCategories.some(cat =>
        cat.includes('television') ||
        cat.includes('tv series') ||
        cat.includes('tv show') ||
        cat.includes('anime series') ||
        cat.includes('anime film') ||
        cat.includes('anime movie') ||
        cat.includes('animated series') ||
        cat.includes('animated film') ||
        cat.includes('based on manga') ||
        cat.includes('based on anime') ||
        cat.includes('based on light novel'))) {
        return 'story';
    }

    // Check for manga (only if not already classified as TV/film above)
    if (lowerCategories.some(cat =>
        (cat.includes('manga') && !cat.includes('based on')) ||
        cat.includes('manga series') ||
        cat.includes('manga magazines'))) {
        return 'manga';
    }
    if (lowerCategories.some(cat => cat.includes('web novel'))) return 'web novel';

    // Check for story/episode categories
    if (lowerCategories.some(cat =>
        cat.includes('chapters') ||
        cat.includes('episodes') ||
        cat.includes('story') ||
        cat.includes('plot') ||
        cat.includes('narrative') ||
        cat.includes('season') ||
        cat.includes('arc'))) {
        return 'story';
    }

    // Check for location categories
    if (lowerCategories.some(cat =>
        cat.includes('location') ||
        cat.includes('places') ||
        cat.includes('cities') ||
        cat.includes('countries') ||
        cat.includes('regions') ||
        cat.includes('house') || // Game of Thrones style houses
        cat.includes('kingdom'))) {
        return 'location';
    }

    // Check for item/object categories
    if (lowerCategories.some(cat =>
        cat.includes('item') ||
        cat.includes('object') ||
        cat.includes('weapon') ||
        cat.includes('technology') ||
        cat.includes('device') ||
        cat.includes('vehicle'))) {
        return 'item';
    }

    // Check for character categories
    if (lowerCategories.some(cat =>
        cat.includes('character') ||
        cat.includes('protagonists') ||
        cat.includes('antagonists') ||
        (cat.includes('fictional') && (cat.includes('people') || cat.includes('person'))))) {
        return 'Fictional-Character';
    }

    // Check for people indicators
    const personIndicators = ['births', 'deaths', 'people', 'actors', 'authors', 'characters created by', 'directors', 'musicians', 'staff', 'cast', 'producers', 'writers', 'mangaka', 'illustrators'];
    if (lowerCategories.some(cat =>
        personIndicators.some(ind => cat.includes(ind)) ||
        cat.includes('real') ||
        cat.includes('living')
    )) {
        // Strict "people" check on Fandom
        const genericPeopleCat = lowerCategories.some(cat => cat.includes('people') || cat.includes('person'));

        if (!isFandom) {
            return 'Real-Person';
        } else {
            const specificRole = lowerCategories.some(cat =>
                cat.includes('author') ||
                cat.includes('director') ||
                cat.includes('actor') || // Covers "Voice actors"
                cat.includes('artist') ||
                cat.includes('staff') ||
                cat.includes('producer') ||
                cat.includes('writer') || // Covers "Screenwriters" etc
                cat.includes('mangaka') ||
                cat.includes('illustrator')
            );

            if (specificRole) {
                return 'Real-Person';
            } else if (genericPeopleCat) {
                return 'Fictional-Character';
            }
        }
    }

    return null; // Let text/title inference handle it
};

window.CategoryInferenceAnalysis = CategoryInferenceAnalysis;
