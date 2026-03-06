window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.EntryManagerModules = window.EveLibrary.EntryManagerModules || {};

(function () {
    if (window.EveLibrary.EntryManagerModules.createFormHelpers) return;

    window.EveLibrary.EntryManagerModules.createFormHelpers = function createFormHelpers(deps) {
        const State = deps.State;
        const Ratings = deps.Ratings;

        function getWorkspaceId() {
            if (typeof State?.getCurrentWorkspaceId === 'function') {
                return State.getCurrentWorkspaceId();
            }
            if (window.eveState?.config?.activeWorkspace) return String(window.eveState.config.activeWorkspace);
            if (typeof config !== 'undefined' && config?.activeWorkspace) return String(config.activeWorkspace);
            return 'main';
        }

        function generateUniqueId() {
            return Date.now() + Math.random().toString(36).substr(2, 9);
        }

        function parseUniqueCsvList(value) {
            const seen = new Set();
            return String(value || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
                .filter(item => {
                    const key = item.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
        }

        function normalizeCommaSeparatedValue(value) {
            return parseUniqueCsvList(value).join(', ');
        }

        function getFormData(categoryName) {
            const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
            const rawSourceUrl = document.getElementById(prefix + 'source-url')?.value.trim() || '';
            const author = document.getElementById(prefix + 'author')?.value.trim() || '';
            const authorAltNames = parseUniqueCsvList(document.getElementById(prefix + 'author-alt-names')?.value || '')
                .filter(name => name.toLowerCase() !== author.toLowerCase());
            const apiRatingFieldMap = {
                anilist: prefix + 'api-rating-anilist',
                myanimelist: prefix + 'api-rating-myanimelist',
                mangadex: prefix + 'api-rating-mangadex'
            };
            const apiRatingsProvided = Object.values(apiRatingFieldMap).some(id => !!document.getElementById(id));
            const rawApiRatings = {
                anilist: document.getElementById(apiRatingFieldMap.anilist)?.value ?? null,
                myanimelist: document.getElementById(apiRatingFieldMap.myanimelist)?.value ?? null,
                mangadex: document.getElementById(apiRatingFieldMap.mangadex)?.value ?? null
            };
            const apiRatings = Ratings?.sanitizeApiRatings ? Ratings.sanitizeApiRatings(rawApiRatings) : rawApiRatings;
            return {
                title: document.getElementById(prefix + 'title')?.value.trim() || '',
                author,
                authorAltNames,
                artist: normalizeCommaSeparatedValue(document.getElementById(prefix + 'artist')?.value || ''),
                genre: normalizeCommaSeparatedValue(document.getElementById(prefix + 'genre')?.value || ''),
                status: document.getElementById(prefix + 'status')?.value || '',
                chapter: parseInt(document.getElementById(prefix + 'chapter')?.value) || 0,
                season: parseInt(document.getElementById(prefix + 'season')?.value) || 0,
                episode: parseInt(document.getElementById(prefix + 'episode')?.value) || 0,
                summary: document.getElementById(prefix + 'summary')?.value.trim() || '',
                rating: document.getElementById(prefix + 'rating')?.value || '',
                language: document.getElementById(prefix + 'language')?.value.trim() || '',
                sourceUrl: rawSourceUrl ? normalizeUrl(rawSourceUrl) : '',
                tags: parseUniqueCsvList(document.getElementById(prefix + 'tags')?.value || ''),
                imageUrl: document.getElementById(prefix + 'image-url')?.value.trim() || '',
                apiRatings,
                apiRatingsProvided
            };
        }

        return {
            getWorkspaceId,
            generateUniqueId,
            parseUniqueCsvList,
            normalizeCommaSeparatedValue,
            getFormData
        };
    };
})();
