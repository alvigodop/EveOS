window.EveOS = window.EveOS || {};

(function () {
    async function fetchSeriesDetails(seriesId) {
        const Core = window.EveOS.API.Core;
        const targetUrl = `https://api.mangaupdates.com/v1/series/${seriesId}`;
        return await Core.fetchWithFallback(targetUrl, {}, 'MangaUpdates Series Details failed');
    }

    function parseSearchPageResults(query, html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const anchors = Array.from(doc.querySelectorAll('a[href*="mangaupdates.com/series/"]'));
            const seen = new Set();
            const results = [];
            const normalizedQuery = String(query || '').trim().toLowerCase();

            for (const anchor of anchors) {
                const href = anchor.getAttribute('href') || '';
                const title = (anchor.textContent || '').trim();
                if (!href || !title || seen.has(href)) continue;

                const card = anchor.closest('.row.g-0.d-flex') || anchor.parentElement;
                if (!card) continue;
                seen.add(href);

                const img = card.querySelector('img[alt="Series Image"]')?.getAttribute('src') || '';
                const genreTitle = card.querySelector('.textsmall a[title]')?.getAttribute('title') || '';
                const description = (card.querySelector('.mu-markdown-module___SC9hG__mu_markdown')?.textContent || '').trim();
                const yearMatch = (card.textContent || '').match(/\b(19|20)\d{2}\b/);
                const scoreMatch = (card.textContent || '').match(/(\d+(?:\.\d+)?)\s*\/\s*10(?:\.0)?/);

                results.push({
                    record: {
                        title,
                        url: href,
                        description,
                        bayesian_rating: scoreMatch ? scoreMatch[1] : '',
                        year: yearMatch ? yearMatch[0] : '',
                        genres: genreTitle
                            .split(',')
                            .map(genre => genre.trim())
                            .filter(Boolean)
                            .map(genre => ({ genre })),
                        image: img
                            ? { url: { original: img.startsWith('http') ? img : new URL(img, 'https://www.mangaupdates.com').href } }
                            : null
                    }
                });

                if (results.length >= 5) break;
            }

            if (!normalizedQuery) return results;

            const exactMatches = [];
            const partialMatches = [];

            for (const item of results) {
                const title = String(item?.record?.title || '').toLowerCase();
                if (title === normalizedQuery || title.startsWith(`${normalizedQuery} `) || title.startsWith(`${normalizedQuery}:`) || title.startsWith(`${normalizedQuery} (`) || title.startsWith(`${normalizedQuery} -`)) {
                    exactMatches.push(item);
                } else if (title.includes(normalizedQuery)) {
                    partialMatches.push(item);
                }
            }

            return [...exactMatches, ...partialMatches];
        } catch (e) {
            console.warn('MangaUpdates HTML parse failed', e);
            return [];
        }
    }

    async function searchMangaUpdates(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) return { results: [] };

        const targetUrl = Core.MANGAUPDATES_API;
        const body = new URLSearchParams();
        body.append('search', query);
        body.append('perpage', '5');

        // 1. Try Configured Proxies (Local Server or Standalone Bridge only)
        // We skip the public POST proxy here because it's usually blocked by Cloudflare
        await Core.ensureLocalServicesProbed();
        if (Core.ACTIVE_PROXY_URL) {
            const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
            try {
                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body
                });
                if (response.ok) {
                    const searchData = await response.json();
                    if (searchData.results) return await enrichResults(searchData.results);
                }
            } catch (e) {}
        }

        // 2. Zero-server fallback: scrape the public series page through a GET-capable text proxy.
        try {
            const webSearchUrl = `https://www.mangaupdates.com/series?search=${encodeURIComponent(query)}`;
            const html = await Core.fetchTextWithFallback(webSearchUrl, {}, 'MangaUpdates Search Page failed');
            if (html) {
                const parsedResults = parseSearchPageResults(query, html);
                if (parsedResults.length) {
                    return { results: parsedResults };
                }
            }
        } catch (e) {
            console.warn('MangaUpdates Scraper Fallback failed', e);
        }

        return { results: [] };
    }

    async function enrichResults(results) {
        if (!results || !Array.isArray(results)) return { results: [] };
        const enriched = await Promise.all(results.map(async (hit) => {
            const seriesId = hit.record?.series_id;
            if (!seriesId) return hit;
            const details = await fetchSeriesDetails(seriesId);
            return details ? { ...hit, _fullDetails: details } : hit;
        }));
        return { results: enriched };
    }

    window.EveOS.API.MangaUpdates = {
        searchMangaUpdates
    };
})();
