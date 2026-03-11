window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    if (ns.sharedDataReady) return;

    if (!Array.isArray(window.tempSources)) {
        window.tempSources = [];
    }

    ns.toArray = function (value) {
        return Array.isArray(value) ? value : [];
    };

    ns.parseUniqueCsvList = function (value) {
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
    };

    ns.normalizeCommaSeparatedValue = function (value) {
        return ns.parseUniqueCsvList(value).join(', ');
    };

    ns.mergeUniqueValues = function (existing, incoming) {
        const seen = new Set();
        const merged = [];
        [...(existing || []), ...(incoming || [])]
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .forEach(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                merged.push(item);
            });
        return merged;
    };

    ns.splitPeopleNames = function (value) {
        if (Array.isArray(value)) {
            return ns.mergeUniqueValues([], value.map(v => String(v || '').trim()));
        }
        return ns.mergeUniqueValues([], String(value || '')
            .split(/\s*(?:,|\/|;|&|\band\b)\s*/i)
            .map(v => v.trim()));
    };

    ns.normalizeSourceList = function (value) {
        if (Array.isArray(value)) {
            return ns.mergeUniqueValues([], value.map(item => String(item || '').trim()));
        }
        return ns.parseUniqueCsvList(value || '');
    };

    ns.normalizeEntryListValue = function (value) {
        if (Array.isArray(value)) {
            return ns.mergeUniqueValues([], value.map(item => String(item || '').trim())).join(', ');
        }
        return ns.normalizeCommaSeparatedValue(value || '');
    };

    ns.toTrimmedLower = function (value) {
        return String(value || '').trim().toLowerCase();
    };

    ns.readNumericRating = function (value) {
        if (value === null || value === undefined || String(value).trim() === '') {
            return null;
        }
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    ns.formatRating = function (value, digits = 2) {
        const n = ns.readNumericRating(value);
        if (n === null) return '';
        return n.toFixed(digits).replace(/\.?0+$/, '');
    };

    ns.normalizeLanguageFromCountryCode = function (value) {
        const raw = String(value || '').trim();
        if (!raw) return '';

        const upper = raw.toUpperCase();
        const languageByCode = {
            JA: 'Japanese',
            JP: 'Japanese',
            KO: 'Korean',
            KR: 'Korean',
            ZH: 'Chinese',
            CN: 'Chinese',
            TW: 'Chinese (Traditional)',
            HK: 'Chinese (Traditional)',
            EN: 'English',
            US: 'English',
            GB: 'English',
            AU: 'English',
            CA: 'English',
            ES: 'Spanish',
            MX: 'Spanish',
            AR: 'Spanish',
            CL: 'Spanish',
            CO: 'Spanish',
            PE: 'Spanish',
            PT: 'Portuguese',
            BR: 'Portuguese',
            FR: 'French',
            DE: 'German',
            IT: 'Italian',
            RU: 'Russian',
            TH: 'Thai',
            VI: 'Vietnamese',
            ID: 'Indonesian',
            TR: 'Turkish',
            PL: 'Polish',
            UA: 'Ukrainian'
        };

        if (languageByCode[upper]) return languageByCode[upper];
        if (/^[A-Z]{2,3}$/.test(upper)) return upper;
        return raw;
    };

    ns.buildSourceMetadata = function (source) {
        const rawImageUrl = String(source?.coverUrl || source?.image || source?.imageUrl || '').trim();
        const isPlaceholderImage = /placeholder\.com|placehold\.co|text=No\+Cover/i.test(rawImageUrl);
        const authors = ns.splitPeopleNames(source?.author);
        const artists = ns.splitPeopleNames(source?.artist);
        const genres = ns.normalizeSourceList(source?.genres);
        const tags = ns.mergeUniqueValues(
            ns.normalizeSourceList(source?.tags),
            ns.normalizeSourceList(source?.synonyms)
        );
        const language = ns.normalizeLanguageFromCountryCode(source?.countryOfOrigin);
        const sourceUrl = normalizeUrl(String(source?.providerUrl || source?.url || '').trim());
        const imageUrl = isPlaceholderImage ? '' : normalizeUrl(rawImageUrl);
        const status = String(source?.status || '').trim();
        const ratingsApi = window.EveLibrary?.Ratings || null;
        const provider = ratingsApi?.sourceNameToProvider?.(source?.source);
        const normalizedScore = provider
            ? ratingsApi?.normalizeProviderScore?.(provider, source?.score)
            : null;
        const sourceStatus = ratingsApi?.normalizeSourceStatus
            ? ratingsApi.normalizeSourceStatus(status)
            : status;
        const sourceSignals = ratingsApi?.extractSourceSignalsFromSources
            ? ratingsApi.extractSourceSignalsFromSources([source])
            : (ratingsApi?.createEmptySourceSignals ? ratingsApi.createEmptySourceSignals() : null);
        const apiRatings = {
            anilist: null,
            myanimelist: null,
            mangadex: null
        };
        if (provider && normalizedScore !== null) {
            apiRatings[provider] = normalizedScore;
        }
        const summary = String(source?.description || '').trim();
        return { authors, artists, genres, tags, language, sourceUrl, imageUrl, status, sourceStatus, apiRatings, sourceSignals, summary };
    };

    ns.getAttachedSourceByIndex = function (index) {
        const safeIndex = Number(index);
        const sources = ns.toArray(window.tempSources);
        if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= sources.length) {
            return null;
        }
        return sources[safeIndex];
    };

    ns.getConnectionsApi = function () {
        return window.EveLibrary?.ConnectionsAPI || null;
    };

    ns.sharedDataReady = true;
})(window.EveLinkForm);
