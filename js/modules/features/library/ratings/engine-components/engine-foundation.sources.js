window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.RatingsEngineFoundationModules = window.EveLibrary.RatingsEngineFoundationModules || {};

(function () {
    window.EveLibrary.RatingsEngineFoundationModules.createSources = function createSources(base) {
        const PROVIDERS = base.PROVIDERS;
        const round = base.round;
        const toNumberOrNull = base.toNumberOrNull;
        const createEmptyApiRatings = base.createEmptyApiRatings;
        const sourceNameToProvider = base.sourceNameToProvider;
        const normalizeProviderScore = base.normalizeProviderScore;
        const averageNumbers = base.averageNumbers;
        const pickDominantStatus = base.pickDominantStatus;

        function createEmptySignalProvider() {
            return {
                popularity: null,
                members: null,
                favorites: null,
                rank: null,
                status: ''
            };
        }

        function createEmptySourceSignals() {
            return {
                anilist: createEmptySignalProvider(),
                myanimelist: createEmptySignalProvider(),
                mangadex: createEmptySignalProvider()
            };
        }

        function normalizeCountSignal(value) {
            const n = toNumberOrNull(value);
            if (n === null || n <= 0) return null;
            return Math.round(n);
        }

        function normalizeRankSignal(value) {
            const n = toNumberOrNull(value);
            if (n === null || n <= 0) return null;
            return Math.round(n);
        }

        function normalizeSourceStatus(value) {
            const raw = String(value || '').trim().toLowerCase();
            if (!raw) return '';

            const compact = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (!compact) return '';

            if (/hiatus|paused|suspend/.test(compact)) return 'Hiatus';
            if (/cancel|canceled|discontinu|dropped/.test(compact)) return 'Cancelled';
            if (/not yet|upcoming|tba|unreleased|to be announced/.test(compact)) return 'Upcoming';
            if (/ongoing|publishing|releasing|airing|currently/.test(compact)) return 'Ongoing';
            if (/complete|completed|finished|ended/.test(compact)) return 'Completed';
            return '';
        }

        function sanitizeSourceSignals(input) {
            const source = input && typeof input === 'object' ? input : {};
            const result = createEmptySourceSignals();
            PROVIDERS.forEach(provider => {
                const row = source[provider] && typeof source[provider] === 'object'
                    ? source[provider]
                    : {};
                result[provider] = {
                    popularity: normalizeCountSignal(row.popularity),
                    members: normalizeCountSignal(row.members ?? row.followers ?? row.follows),
                    favorites: normalizeCountSignal(row.favorites),
                    rank: normalizeRankSignal(row.rank),
                    status: normalizeSourceStatus(row.status ?? row.sourceStatus)
                };
            });
            return result;
        }

        function mergeSourceSignals(existingSignals, incomingSignals) {
            const existing = sanitizeSourceSignals(existingSignals);
            const incoming = sanitizeSourceSignals(incomingSignals);
            const merged = createEmptySourceSignals();
            PROVIDERS.forEach(provider => {
                merged[provider] = {
                    popularity: incoming[provider].popularity !== null
                        ? incoming[provider].popularity
                        : existing[provider].popularity,
                    members: incoming[provider].members !== null
                        ? incoming[provider].members
                        : existing[provider].members,
                    favorites: incoming[provider].favorites !== null
                        ? incoming[provider].favorites
                        : existing[provider].favorites,
                    rank: incoming[provider].rank !== null
                        ? incoming[provider].rank
                        : existing[provider].rank,
                    status: incoming[provider].status || existing[provider].status || ''
                };
            });
            return merged;
        }

        function extractSourceSignalsFromSources(sources) {
            const buckets = {
                anilist: { popularity: [], members: [], favorites: [], rank: [], statuses: [] },
                myanimelist: { popularity: [], members: [], favorites: [], rank: [], statuses: [] },
                mangadex: { popularity: [], members: [], favorites: [], rank: [], statuses: [] }
            };

            (Array.isArray(sources) ? sources : []).forEach(source => {
                const provider = sourceNameToProvider(source?.source);
                if (!provider) return;
                const bucket = buckets[provider];
                if (!bucket) return;

                let rawPopularity = source?.popularity;
                if (provider === 'mangadex' && toNumberOrNull(rawPopularity) === null) {
                    rawPopularity = source?.members ?? source?.followers ?? source?.follows;
                }
                const popularity = normalizeCountSignal(rawPopularity);
                const members = normalizeCountSignal(source?.members ?? source?.followers ?? source?.follows);
                const favorites = normalizeCountSignal(source?.favorites);
                const rank = normalizeRankSignal(source?.rank);
                const status = normalizeSourceStatus(source?.status ?? source?.sourceStatus);

                if (popularity !== null) bucket.popularity.push(popularity);
                if (members !== null) bucket.members.push(members);
                if (favorites !== null) bucket.favorites.push(favorites);
                if (rank !== null) bucket.rank.push(rank);
                if (status) bucket.statuses.push(status);
            });

            const raw = createEmptySourceSignals();
            PROVIDERS.forEach(provider => {
                raw[provider] = {
                    popularity: averageNumbers(buckets[provider].popularity),
                    members: averageNumbers(buckets[provider].members),
                    favorites: averageNumbers(buckets[provider].favorites),
                    rank: averageNumbers(buckets[provider].rank),
                    status: pickDominantStatus(buckets[provider].statuses, normalizeSourceStatus)
                };
            });
            return sanitizeSourceSignals(raw);
        }

        function sanitizeApiRatings(input) {
            const baseRatings = createEmptyApiRatings();
            const source = input && typeof input === 'object' ? input : {};
            PROVIDERS.forEach(provider => {
                baseRatings[provider] = normalizeProviderScore(provider, source[provider]);
            });
            return baseRatings;
        }

        function mergeApiRatings(existingRatings, incomingRatings) {
            const existing = sanitizeApiRatings(existingRatings);
            const incoming = sanitizeApiRatings(incomingRatings);
            const merged = createEmptyApiRatings();
            PROVIDERS.forEach(provider => {
                merged[provider] = incoming[provider] !== null ? incoming[provider] : existing[provider];
            });
            return merged;
        }

        function extractApiRatingsFromSources(sources) {
            const map = {
                anilist: [],
                myanimelist: [],
                mangadex: []
            };
            (Array.isArray(sources) ? sources : []).forEach(source => {
                const provider = sourceNameToProvider(source?.source);
                if (!provider) return;
                const normalizedScore = normalizeProviderScore(provider, source?.score);
                if (normalizedScore === null) return;
                map[provider].push(normalizedScore);
            });

            const result = createEmptyApiRatings();
            PROVIDERS.forEach(provider => {
                const scores = map[provider];
                if (!scores.length) return;
                const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
                result[provider] = round(avg, 2);
            });
            return result;
        }

        return {
            createEmptySourceSignals,
            normalizeSourceStatus,
            sanitizeSourceSignals,
            mergeSourceSignals,
            extractSourceSignalsFromSources,
            sanitizeApiRatings,
            mergeApiRatings,
            extractApiRatingsFromSources
        };
    };
})();
