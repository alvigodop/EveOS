window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.CacheAggregatorRecords) return;

    function normalizePoolEntries(pool) {
        if (!pool || typeof pool !== 'object') return [];

        const queryEntries = pool.queries && typeof pool.queries === 'object'
            ? pool.queries
            : pool;
        const orderedKeys = [];
        const seen = new Set();

        (Array.isArray(pool.order) ? pool.order : []).forEach(function (queryKey) {
            const key = String(queryKey || '').trim();
            if (!key || seen.has(key) || !queryEntries[key]) return;
            seen.add(key);
            orderedKeys.push(key);
        });

        Object.keys(queryEntries).forEach(function (queryKey) {
            if (queryKey === 'queries' || queryKey === 'order' || queryKey.charAt(0) === '_') return;
            if (!queryEntries[queryKey] || seen.has(queryKey)) return;
            seen.add(queryKey);
            orderedKeys.push(queryKey);
        });

        return orderedKeys.map(function (queryKey) {
            const entry = queryEntries[queryKey];
            if (!entry || typeof entry !== 'object') return null;
            return { queryKey: queryKey, entry: entry };
        }).filter(Boolean);
    }

    function getResultTitle(result) {
        return String(
            result?.title
            || result?.name
            || result?.attributes?.title?.en
            || result?.attributes?.title?.ja
            || result?.node?.title?.userPreferred
            || result?.volumeInfo?.title
            || 'Untitled'
        ).trim() || 'Untitled';
    }

    function getResultUrl(result) {
        return String(
            result?.url
            || result?.link
            || result?.href
            || result?.siteUrl
            || result?.html_url
            || result?.attributes?.url
            || ''
        ).trim();
    }

    function getResultDescription(result) {
        return String(
            result?.description
            || result?.snippet
            || result?.synopsis
            || result?.attributes?.description?.en
            || result?.attributes?.description
            || result?.volumeInfo?.description
            || ''
        ).trim();
    }

    function safeStringify(value) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return '';
        }
    }

    function normalizeCachedResult(result, providerKey) {
        const item = result && typeof result === 'object' ? result : { title: String(result || '') };
        return Object.assign({}, item, {
            title: getResultTitle(item),
            url: getResultUrl(item),
            description: getResultDescription(item),
            _searchText: safeStringify(item),
            source: String(item.source || item.provider || providerKey || 'unknown').trim() || 'unknown',
            provider: String(item.provider || item.source || providerKey || 'unknown').trim() || 'unknown'
        });
    }

    function extractCachedResults(entry) {
        if (Array.isArray(entry?.results)) {
            return entry.results.map(function (result) {
                return normalizeCachedResult(result, result?.source || result?.provider);
            });
        }

        const cacheRuntime = window.EveOS?.API?.CacheRuntime || {};
        const sources = entry?.sources && typeof entry.sources === 'object' ? entry.sources : {};
        const perSource = entry?.summary?.perSource || {};
        const providerKeys = cacheRuntime.getSearchableProviderKeys
            ? cacheRuntime.getSearchableProviderKeys()
            : Object.keys(perSource);
        const results = [];

        providerKeys.forEach(function (providerKey) {
            const items = cacheRuntime.getProviderList
                ? cacheRuntime.getProviderList(sources, providerKey)
                : [];
            (Array.isArray(items) ? items : []).forEach(function (item) {
                results.push(normalizeCachedResult(item, providerKey));
            });
        });

        return results;
    }

    ns.CacheAggregatorRecords = {
        normalizePoolEntries,
        getResultTitle,
        getResultUrl,
        getResultDescription,
        extractCachedResults
    };
})();
