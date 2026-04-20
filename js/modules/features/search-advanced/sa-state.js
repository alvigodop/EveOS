window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const DEFAULTS = {
        apiKey: '',
        cx: '',
        sort: '',
        siteSearch: '',
        lr: '',
        cr: '',
        fileType: '',
        dateRestrict: '',
        safe: '',
        rights: '',
        num: '10',
        exactTerms: '',
        excludeTerms: '',
        scopeMode: 'current',
        resultsMode: 'segmented',
        activeVectors: {
            google: true,
            knowledge: true,
            cachedResults: true,
            bookmarks: true
        }
    };

    function getFallbackApiKey() {
        return (
            window.EVE_GOOGLE_API_KEY ||
            window.GOOGLE_API_KEY ||
            window.FCSAFetch?.API_KEY ||
            ''
        );
    }

    function getFallbackCx() {
        return (
            window.EVE_GOOGLE_CSE_CX ||
            window.GOOGLE_CSE_CX ||
            window.googleCseConfig?.cx ||
            window.FCSAFetch?.CX ||
            ''
        );
    }

    function ensureConfigBucket() {
        if (typeof config === 'undefined') return { ...DEFAULTS };
        if (!config.expandedSearch || typeof config.expandedSearch !== 'object') {
            config.expandedSearch = { ...DEFAULTS };
        } else {
            config.expandedSearch = { ...DEFAULTS, ...config.expandedSearch };
        }
        if (!config.expandedSearch.apiKey) config.expandedSearch.apiKey = getFallbackApiKey();
        if (!config.expandedSearch.cx) config.expandedSearch.cx = getFallbackCx();
        return config.expandedSearch;
    }

    function getSettings() {
        return { ...ensureConfigBucket() };
    }

    function updateSettings(patch) {
        const bucket = ensureConfigBucket();
        Object.assign(bucket, patch || {});
        if (typeof saveConfig === 'function') saveConfig();
        return { ...bucket };
    }

    function buildUrl(query, settings) {
        const q = (query || '').trim();
        if (!q) throw new Error('Please enter a search query.');

        const s = { ...DEFAULTS, ...(settings || {}) };
        if (!s.apiKey) throw new Error('Please set your Google API key in Expanded Search.');
        if (!s.cx) throw new Error('Please set your Search Engine ID (CX) in Expanded Search.');

        const params = new URLSearchParams();
        params.set('key', s.apiKey);
        params.set('cx', s.cx);
        params.set('q', q);

        if (s.sort) params.set('sort', s.sort);
        if (s.siteSearch) params.set('siteSearch', s.siteSearch);
        if (s.lr) params.set('lr', s.lr);
        if (s.cr) params.set('cr', s.cr);
        if (s.fileType) params.set('fileType', s.fileType);
        if (s.dateRestrict) params.set('dateRestrict', s.dateRestrict);
        if (s.safe) params.set('safe', s.safe);
        if (s.rights) params.set('rights', s.rights);
        if (s.exactTerms) params.set('exactTerms', s.exactTerms);
        if (s.excludeTerms) params.set('excludeTerms', s.excludeTerms);

        const parsedNum = parseInt(s.num, 10);
        if (Number.isFinite(parsedNum)) {
            const clampedNum = Math.min(10, Math.max(1, parsedNum));
            params.set('num', String(clampedNum));
        }

        return `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
    }

    window.EveOS.SearchAdvanced.State = {
        getSettings,
        updateSettings,
        buildUrl
    };
})();
