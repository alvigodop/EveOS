window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.RatingsEngineFoundationModules = window.EveLibrary.RatingsEngineFoundationModules || {};

(function () {
    window.EveLibrary.RatingsEngineFoundationModules.createBase = function createBase() {
        const PROVIDERS = ['anilist', 'myanimelist', 'mangadex'];
        const CONFIDENCE_WEIGHTS = {
            coverage: 0.22,
            agreement: 0.18,
            metadata: 0.2,
            apiSignals: 0.15,
            status: 0.05,
            insight: 0.2
        };
        const SIGNAL_COUNT_CAPS = {
            popularity: 1000000,
            members: 500000,
            favorites: 100000
        };
        const SIGNAL_RANK_CAP = 50000;

        const DEFAULTS = {
            activeScale: 'hybrid',
            personalWeight: 0.5,
            missingScoreMode: 'ignore_missing',
            enabledProviders: {
                anilist: true,
                myanimelist: true,
                mangadex: true
            },
            providerWeights: {
                anilist: 1,
                myanimelist: 1,
                mangadex: 1
            }
        };

        function clamp(value, min, max) {
            const n = Number(value);
            if (!Number.isFinite(n)) return min;
            return Math.min(max, Math.max(min, n));
        }

        function round(value, decimals) {
            const n = Number(value);
            const places = Number.isFinite(Number(decimals)) ? Number(decimals) : 2;
            if (!Number.isFinite(n)) return null;
            const power = 10 ** places;
            return Math.round(n * power) / power;
        }

        function toNumberOrNull(value) {
            if (value === null || value === undefined || value === '') return null;
            if (typeof value === 'string' && value.trim() === '') return null;
            const n = Number(value);
            return Number.isFinite(n) ? n : null;
        }

        function createEmptyApiRatings() {
            return {
                anilist: null,
                myanimelist: null,
                mangadex: null
            };
        }

        function sourceNameToProvider(sourceName) {
            const raw = String(sourceName || '').trim().toLowerCase();
            if (!raw) return null;
            if (raw.includes('anilist')) return 'anilist';
            if (raw.includes('myanimelist') || raw === 'mal') return 'myanimelist';
            if (raw.includes('mangadex')) return 'mangadex';
            return null;
        }

        function normalizeProviderScore(provider, rawScore) {
            const n = toNumberOrNull(rawScore);
            if (n === null) return null;

            let value = n;
            if (provider === 'anilist' && value > 10) {
                value = value / 10;
            }
            if (value <= 0) return null;
            return round(clamp(value, 0, 10), 2);
        }

        function averageNumbers(values) {
            const nums = (Array.isArray(values) ? values : [])
                .map(value => Number(value))
                .filter(value => Number.isFinite(value));
            if (!nums.length) return null;
            const sum = nums.reduce((acc, value) => acc + value, 0);
            return sum / nums.length;
        }

        function pickDominantStatus(statuses, normalizeSourceStatus) {
            const normalized = (Array.isArray(statuses) ? statuses : [])
                .map(normalizeSourceStatus)
                .filter(Boolean);
            if (!normalized.length) return '';
            const counts = {};
            normalized.forEach(status => {
                counts[status] = (counts[status] || 0) + 1;
            });
            return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || '';
        }

        return {
            PROVIDERS,
            CONFIDENCE_WEIGHTS,
            SIGNAL_COUNT_CAPS,
            SIGNAL_RANK_CAP,
            DEFAULTS,
            clamp,
            round,
            toNumberOrNull,
            createEmptyApiRatings,
            sourceNameToProvider,
            normalizeProviderScore,
            averageNumbers,
            pickDominantStatus
        };
    };
})();
