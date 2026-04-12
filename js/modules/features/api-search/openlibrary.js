window.EveOS = window.EveOS || {};

(function () {
    async function fetchRatings(workKey) {
        // workKey looks like "/works/OL12345W"
        if (!workKey) return null;
        try {
            const url = `https://openlibrary.org${workKey}/ratings.json`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.summary?.average || null;
        } catch (e) {
            return null;
        }
    }

    async function enrichWithRatings(docs) {
        if (!Array.isArray(docs)) return docs;
        // Batch fetch ratings for results that have a work key
        const promises = docs.map(async function (doc) {
            if (doc.key) {
                doc._ratingsAverage = await fetchRatings(doc.key);
            }
            return doc;
        });
        return Promise.all(promises);
    }

    async function searchOpenLibrary(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error("EveOS.API.Core missing"); return { docs: [] }; }

        const targetUrl = `${Core.OPENLIBRARY_API}?q=${encodeURIComponent(query)}&limit=20`;
        const result = await Core.fetchWithFallback(targetUrl, {}, 'OpenLibrary Search failed') || { docs: [] };
        // Enrich with ratings (lazy, parallel)
        if (result.docs && result.docs.length) {
            result.docs = await enrichWithRatings(result.docs);
        }
        return result;
    }

    window.EveOS.API.OpenLibrary = {
        searchOpenLibrary,
        fetchRatings
    };
})();