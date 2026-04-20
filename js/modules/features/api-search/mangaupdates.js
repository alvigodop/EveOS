window.EveOS = window.EveOS || {};

(function () {
    const MU_BASE_URL = 'https://www.mangaupdates.com';
    const shared = window.EveOS.API._mangaupdatesShared || {};
    const {
        buildPeopleEntries,
        dedupeByName,
        extractContentLines,
        extractLinks,
        getAttribute,
        getElementText,
        getInfoContentMap,
        hasValue,
        inferCountryFromType,
        mergeDetails,
        normalizeText,
        normalizeUrl,
        parseActivityStats,
        parseJsonLd,
        parseListStats,
        parseStatusSummary,
        parseUserRating,
        shouldFetchHtmlDetails,
        uniqueStrings
    } = shared;

    async function fetchSeriesDetails(seriesId) {
        const Core = window.EveOS.API.Core;
        const targetUrl = `https://api.mangaupdates.com/v1/series/${seriesId}`;
        return await Core.fetchWithFallback(targetUrl, {}, 'MangaUpdates Series Details failed');
    }

    async function fetchSeriesHtmlDetails(seriesUrl) {
        const Core = window.EveOS.API.Core;
        const targetUrl = normalizeUrl(seriesUrl);
        if (!targetUrl) return null;

        const html = await Core.fetchTextWithFallback(targetUrl, {}, 'MangaUpdates Series Page failed');
        if (!html) return null;

        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const infoMap = getInfoContentMap(doc);
            const jsonLd = parseJsonLd(doc);

            const title = getAttribute(doc, 'meta[property="og:title"]', 'content')
                || normalizeText(jsonLd?.name)
                || normalizeText(doc?.title || '').replace(/\s*-\s*MangaUpdates\s*$/i, '');
            const canonicalUrl = normalizeUrl(
                getAttribute(doc, 'link[rel="canonical"]', 'href')
                || normalizeText(jsonLd?.url)
                || targetUrl
            );
            const imageUrl = normalizeUrl(
                getAttribute(doc, 'meta[property="og:image"]', 'content')
                || normalizeText(jsonLd?.image)
            );

            const description = getElementText(infoMap['description'])
                || getAttribute(doc, 'meta[property="og:description"]', 'content')
                || normalizeText(jsonLd?.description);

            const type = getElementText(infoMap['type']);
            const statusSummary = parseStatusSummary(getElementText(infoMap['status in country of origin']));
            const genres = extractLinks(infoMap['genre'], /\/series\?genre=/i).map((genre) => ({ genre }));
            const categories = extractLinks(infoMap['categories'], /\/series\?category=/i).map((category) => ({ category }));
            const associated = extractContentLines(infoMap['associated names']).map((entry) => ({ title: entry }));
            const relatedSeries = extractLinks(infoMap['related series'], /\/series\//i)
                .map((name) => ({ related_series_name: name, relation_type: '' }));
            const groupNames = extractLinks(infoMap['groups scanlating'], /\/group\//i);
            const authorNames = extractLinks(infoMap['author(s)'], /\/author\//i);
            const artistNames = extractLinks(infoMap['artist(s)'], /\/author\//i);
            const originalPublisherNames = extractLinks(infoMap['original publisher'], /\/publisher\//i);
            const englishPublisherNames = extractLinks(infoMap['english publisher'], /\/publisher\//i);
            const publicationNames = extractContentLines(infoMap['serialized in (magazine)']);
            const latestReleases = extractContentLines(infoMap['latest release(s)'])
                .filter((line) => !/search for all releases/i.test(line));
            const licensedText = getElementText(infoMap['licensed (in english)']);
            const ratingSummary = parseUserRating(infoMap['user rating']);
            const rank = parseActivityStats(infoMap['activity stats']);
            const listStats = parseListStats(infoMap['list stats']);

            if (hasValue(listStats)) {
                rank.lists = listStats;
            }

            const authors = [
                ...buildPeopleEntries(authorNames, 'Author'),
                ...buildPeopleEntries(artistNames, 'Artist')
            ];
            const publishers = dedupeByName([
                ...uniqueStrings(originalPublisherNames).map((publisher_name) => ({ publisher_name, role: 'Original Publisher' })),
                ...uniqueStrings(englishPublisherNames).map((publisher_name) => ({ publisher_name, role: 'English Publisher' })),
                ...uniqueStrings(Array.isArray(jsonLd?.publisher) ? jsonLd.publisher.map((publisher) => publisher?.name) : []).map((publisher_name) => ({ publisher_name }))
            ], 'publisher_name');

            const result = {
                title,
                url: canonicalUrl,
                description,
                image: imageUrl ? { url: { original: imageUrl } } : null,
                type,
                status: statusSummary.status || '',
                status_summary: statusSummary.raw ? statusSummary : null,
                chapters: statusSummary.chapters || '',
                volumes: statusSummary.volumes || '',
                associated,
                authors,
                artists: buildPeopleEntries(artistNames, 'Artist'),
                genres,
                categories,
                related_series: relatedSeries,
                groups_scanlating: uniqueStrings(groupNames).map((group_name) => ({ group_name })),
                latest_releases: latestReleases,
                completed: getElementText(infoMap['completely scanlated?']),
                bayesian_rating: ratingSummary.bayesian_rating || '',
                average_rating: ratingSummary.average_rating || '',
                votes: ratingSummary.votes || '',
                year: getElementText(infoMap['year']) || normalizeText(jsonLd?.datePublished),
                publications: uniqueStrings(publicationNames).map((publication_name) => ({ publication_name })),
                publishers,
                licensed: /^yes$/i.test(licensedText),
                english_publishers: uniqueStrings(englishPublisherNames).map((publisher_name) => ({ publisher_name })),
                rank,
                country_of_origin: inferCountryFromType(type),
                series_id: Number.isFinite(Number(jsonLd?.identifier)) ? Number(jsonLd.identifier) : ''
            };

            return result;
        } catch (e) {
            console.warn('MangaUpdates detail HTML parse failed', e);
            return null;
        }
    }

    function parseSearchPageResults(query, html) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const anchors = Array.from(doc.querySelectorAll('a[href*="mangaupdates.com/series/"]'));
            const seen = new Set();
            const results = [];
            const normalizedQuery = String(query || '').trim().toLowerCase();

            for (const anchor of anchors) {
                const href = normalizeUrl(anchor.getAttribute('href') || '');
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
                            .map((genre) => genre.trim())
                            .filter(Boolean)
                            .map((genre) => ({ genre })),
                        image: img
                            ? { url: { original: normalizeUrl(img) } }
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

        await Core.ensureLocalServicesProbed();

        if (Core.ACTIVE_PROXY_URL) {
            const proxyUrl = `${Core.ACTIVE_PROXY_URL}${encodeURIComponent(targetUrl)}`;
            try {
                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body
                });
                if (response.ok) {
                    const searchData = await response.json();
                    if (searchData.results) return await enrichResults(searchData.results);
                }
            } catch (e) {}
        }

        try {
            const webSearchUrl = `https://www.mangaupdates.com/series?search=${encodeURIComponent(query)}`;
            const html = await Core.fetchTextWithFallback(webSearchUrl, {}, 'MangaUpdates Search Page failed');
            if (html) {
                const parsedResults = parseSearchPageResults(query, html);
                if (parsedResults.length) {
                    return await enrichResults(parsedResults);
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
            const record = hit?.record || {};
            const seriesId = record.series_id;
            let apiDetails = null;

            if (seriesId) {
                apiDetails = await fetchSeriesDetails(seriesId);
            }

            let htmlDetails = null;
            if (record.url && shouldFetchHtmlDetails(apiDetails)) {
                htmlDetails = await fetchSeriesHtmlDetails(record.url);
            }

            const details = htmlDetails
                ? mergeDetails(htmlDetails, apiDetails)
                : apiDetails;

            return details ? { ...hit, _fullDetails: details } : hit;
        }));

        return { results: enriched };
    }

    window.EveOS.API.MangaUpdates = {
        searchMangaUpdates
    };
})();
