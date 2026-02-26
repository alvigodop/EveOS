/**
 * Category Inference Domain Knowledge Component
 * Logic for inferring content type using domain-specific heuristics.
 */
const CategoryInferenceDomains = {};

/**
 * Initialize the module
 */
CategoryInferenceDomains.init = function () {
    console.log('CategoryInferenceDomains initialized');
};

/**
 * Infer categories and content type when API fails or returns empty.
 * Provides domain-specific inference for popular wikis.
 * @param {string} title - The page title
 * @param {string} domain - The wiki domain (e.g., 'naruto.fandom.com')
 * @returns {object} - { inferredContentType, inferredCategories }
 */
CategoryInferenceDomains.inferCategoriesAndType = function (title, domain) {
    const inferredCategories = [];
    let inferredContentType = 'other';

    if (!title || !domain) {
        return { inferredContentType, inferredCategories };
    }

    // Add domain-specific category
    const domainBase = domain.split('.')[0];
    inferredCategories.push(`${domainBase} wiki content`);

    const lowerDomain = domain.toLowerCase();
    const lowerTitle = title.toLowerCase();

    // Check for specific wikis and add appropriate categories
    if (lowerDomain.includes('dragonball')) {
        inferredCategories.push('Dragon Ball Series');
        if (lowerTitle.includes('goku') || lowerTitle.includes('vegeta') ||
            lowerTitle.includes('gohan') || lowerTitle.includes('piccolo') ||
            lowerTitle.includes('frieza') || lowerTitle.includes('cell') ||
            lowerTitle.includes('buu') || lowerTitle.includes('broly')) {
            inferredCategories.push('Dragon Ball Characters');
            inferredContentType = 'Fictional-Character';
        } else if (lowerTitle.includes('saga') || lowerTitle.includes('arc') ||
            lowerTitle.includes('tournament')) {
            inferredCategories.push('Dragon Ball Story Arcs');
            inferredContentType = 'story';
        } else if (lowerTitle.includes('kamehameha') || lowerTitle.includes('ki') ||
            lowerTitle.includes('super saiyan') || lowerTitle.includes('technique')) {
            inferredCategories.push('Dragon Ball Techniques');
            inferredContentType = 'technique';
        }
    } else if (lowerDomain.includes('bleach')) {
        inferredCategories.push('Bleach Series');
        if (lowerTitle.includes('ichigo') || lowerTitle.includes('rukia') ||
            lowerTitle.includes('aizen') || lowerTitle.includes('byakuya') ||
            lowerTitle.includes('renji') || lowerTitle.includes('orihime') ||
            lowerTitle.includes('urahara') || lowerTitle.includes('yoruichi')) {
            inferredCategories.push('Bleach Characters');
            inferredContentType = 'Fictional-Character';
        } else if (lowerTitle.includes('arc') || lowerTitle.includes('saga')) {
            inferredCategories.push('Bleach Story Arcs');
            inferredContentType = 'story';
        } else if (lowerTitle.includes('zanpakuto') || lowerTitle.includes('bankai') ||
            lowerTitle.includes('shikai') || lowerTitle.includes('kido')) {
            inferredCategories.push('Bleach Techniques');
            inferredContentType = 'technique';
        }
    } else if (lowerDomain.includes('naruto')) {
        inferredCategories.push('Naruto Series');
        if (lowerTitle.includes('naruto') || lowerTitle.includes('sasuke') ||
            lowerTitle.includes('sakura') || lowerTitle.includes('kakashi') ||
            lowerTitle.includes('hinata') || lowerTitle.includes('itachi') ||
            lowerTitle.includes('madara') || lowerTitle.includes('obito')) {
            inferredCategories.push('Naruto Characters');
            inferredContentType = 'Fictional-Character';
        } else if (lowerTitle.includes('arc') || lowerTitle.includes('saga')) {
            inferredCategories.push('Naruto Story Arcs');
            inferredContentType = 'story';
        } else if (lowerTitle.includes('jutsu') || lowerTitle.includes('technique') ||
            lowerTitle.includes('rasengan') || lowerTitle.includes('chidori') ||
            lowerTitle.includes('sharingan') || lowerTitle.includes('byakugan')) {
            inferredCategories.push('Naruto Techniques');
            inferredContentType = 'technique';
        }
    } else if (lowerDomain.includes('onepiece')) {
        inferredCategories.push('One Piece Series');
        if (lowerTitle.includes('luffy') || lowerTitle.includes('zoro') ||
            lowerTitle.includes('nami') || lowerTitle.includes('sanji') ||
            lowerTitle.includes('robin') || lowerTitle.includes('ace') ||
            lowerTitle.includes('shanks') || lowerTitle.includes('whitebeard')) {
            inferredCategories.push('One Piece Characters');
            inferredContentType = 'Fictional-Character';
        } else if (lowerTitle.includes('arc') || lowerTitle.includes('saga')) {
            inferredCategories.push('One Piece Story Arcs');
            inferredContentType = 'story';
        } else if (lowerTitle.includes('devil fruit') || lowerTitle.includes('haki')) {
            inferredCategories.push('One Piece Abilities');
            inferredContentType = 'technique';
        }
    } else if (lowerDomain === 'en.wikipedia.org' || lowerDomain.includes('wikipedia')) {
        // Wikipedia-specific inference
        inferredCategories.push('Wikipedia Articles');

        // Check for anime/manga content
        if (lowerTitle.includes('anime') || lowerTitle.includes('manga') ||
            lowerTitle.includes('astro boy') || lowerTitle.includes('atom') ||
            lowerTitle.includes('mighty atom')) {
            inferredCategories.push('Anime and Manga');

            if (lowerTitle.includes('series') || lowerTitle.includes('tv')) {
                inferredCategories.push('Television Series');
                inferredContentType = 'story';
            } else if (lowerTitle.includes('character')) {
                inferredCategories.push('Fictional Characters');
                inferredContentType = 'Fictional-Character';
            }
        }
    }

    // If we still don't have a content type, try to infer from title
    if (inferredContentType === 'other') {
        // Dependency: Expects TitleInference to be available globally
        if (window.TitleInference && typeof TitleInference.inferContentTypeFromTitle === 'function') {
            inferredContentType = TitleInference.inferContentTypeFromTitle(title, domain) || 'article';
        } else {
            inferredContentType = 'article';
        }
    }

    // Add content type as a category
    if (inferredContentType && inferredContentType !== 'other' && inferredContentType !== 'article') {
        const formattedType = inferredContentType.charAt(0).toUpperCase() + inferredContentType.slice(1);
        inferredCategories.push(formattedType + 's');
    }

    return { inferredContentType, inferredCategories };
};

window.CategoryInferenceDomains = CategoryInferenceDomains;
