window.EveOS = window.EveOS || {};

(function () {
    const MU_BASE_URL = 'https://www.mangaupdates.com';

    function normalizeText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeUrl(value) {
        const next = String(value || '').trim();
        if (!next) return '';
        try {
            return new URL(next, MU_BASE_URL).href;
        } catch (e) {
            return next;
        }
    }

    function hasValue(value) {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        return normalizeText(value) !== '';
    }

    function uniqueStrings(values) {
        const seen = new Set();
        const result = [];

        (Array.isArray(values) ? values : []).forEach((value) => {
            const next = normalizeText(value);
            if (!next) return;
            const key = next.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(next);
        });

        return result;
    }

    function dedupeByName(items, keyName) {
        const seen = new Set();
        const result = [];

        (Array.isArray(items) ? items : []).forEach((item) => {
            const key = normalizeText(item?.[keyName]);
            if (!key) return;
            const normalized = key.toLowerCase();
            if (seen.has(normalized)) return;
            seen.add(normalized);
            result.push(item);
        });

        return result;
    }

    function getElementText(element) {
        return normalizeText(element?.textContent || '');
    }

    function getAttribute(root, selector, attrName) {
        if (!root?.querySelector) return '';
        return normalizeText(root.querySelector(selector)?.getAttribute(attrName) || '');
    }

    function getInfoContentMap(doc) {
        const map = {};
        const headers = Array.from(doc?.querySelectorAll?.('div[data-cy$="-header"]') || []);

        headers.forEach((header) => {
            const label = getElementText(header)
                .replace(/\s*\(vs\. other series\)\s*$/i, '')
                .toLowerCase();
            const content = header.nextElementSibling;
            if (label && content) {
                map[label] = content;
            }
        });

        return map;
    }

    function extractContentLines(content) {
        if (!content) return [];

        const children = Array.from(content.children || [])
            .map(getElementText)
            .filter((line) => line && line.toLowerCase() !== 'n/a');

        if (children.length) return uniqueStrings(children);

        const text = getElementText(content);
        if (!text || text.toLowerCase() === 'n/a') return [];
        return [text];
    }

    function extractLinks(content, pattern) {
        const matcher = pattern instanceof RegExp ? pattern : new RegExp(String(pattern || ''), 'i');
        return uniqueStrings(
            Array.from(content?.querySelectorAll?.('a') || [])
                .filter((anchor) => matcher.test(String(anchor.getAttribute('href') || '')))
                .map(getElementText)
        );
    }

    function parseJsonLd(doc) {
        const scripts = Array.from(doc?.querySelectorAll?.('script[type="application/ld+json"]') || []);

        for (const script of scripts) {
            const raw = normalizeText(script.textContent || '');
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (e) {}
        }

        return null;
    }

    function parseUserRating(content) {
        const text = getElementText(content);
        if (!text) return {};

        const averageMatch = text.match(/Average:\s*([\d.]+)\s*\/\s*10(?:\.0)?/i);
        const bayesianMatch = text.match(/Bayesian Average:\s*([\d.]+)\s*\/\s*10(?:\.0)?/i);
        const votesMatch = text.match(/\((\d+)\s*votes?\)/i);

        return {
            average_rating: averageMatch ? averageMatch[1] : '',
            bayesian_rating: bayesianMatch ? bayesianMatch[1] : '',
            votes: votesMatch ? votesMatch[1] : ''
        };
    }

    function parseStatusSummary(rawStatus) {
        const text = normalizeText(rawStatus);
        if (!text) return {};

        const chaptersMatch = text.match(/(\d+(?:\.\d+)?)\s+Chapters?/i);
        const volumesMatch = text.match(/(\d+(?:\.\d+)?)\s+Volumes?/i);
        const bracketMatch = text.match(/\(([^)]+)\)/);

        return {
            raw: text,
            status: bracketMatch ? normalizeText(bracketMatch[1]) : text,
            chapters: chaptersMatch ? chaptersMatch[1] : '',
            volumes: volumesMatch ? volumesMatch[1] : ''
        };
    }

    function parseActivityStats(content) {
        const labelMap = {
            weekly: 'week',
            monthly: 'month',
            '3 month': 'month3',
            '6 month': 'month6',
            year: 'year'
        };
        const position = {};
        const change = {};

        extractContentLines(content).forEach((line) => {
            const normalized = normalizeText(line);
            const positionMatch = normalized.match(/^(Weekly|Monthly|3 Month|6 Month|Year)\s+Pos\s+#(\d+)/i);
            if (!positionMatch) return;

            const key = labelMap[positionMatch[1].toLowerCase()];
            if (!key) return;

            position[key] = Number(positionMatch[2]);

            const changeMatch = normalized.match(/\(([-+]\d+)\)\s*$/);
            if (changeMatch) {
                change[key] = Number(changeMatch[1]);
            }
        });

        const result = {};
        if (hasValue(position)) result.position = position;
        if (hasValue(change)) result.change = change;
        return result;
    }

    function parseListStats(content) {
        const lists = {};

        extractContentLines(content).forEach((line) => {
            const match = line.match(/On\s+(\d+)\s+(reading|wish|completed|unfinished|custom)\s+lists/i);
            if (!match) return;
            lists[match[2].toLowerCase()] = Number(match[1]);
        });

        return lists;
    }

    function inferCountryFromType(type) {
        const normalized = normalizeText(type).toLowerCase();
        if (!normalized) return '';
        if (normalized === 'manga') return 'JP';
        if (normalized === 'manhwa') return 'KR';
        if (normalized === 'manhua') return 'CN';
        return '';
    }

    function buildPeopleEntries(names, type) {
        return uniqueStrings(names).map((name) => ({ name, type }));
    }

    function mergeDetails(primary, fallback) {
        const merged = { ...(fallback || {}) };

        Object.entries(primary || {}).forEach(([key, value]) => {
            if (hasValue(value)) {
                merged[key] = value;
            }
        });

        return merged;
    }

    function shouldFetchHtmlDetails(details) {
        if (!details) return true;

        return !hasValue(details.categories)
            || !hasValue(details.rank)
            || !hasValue(details.publications)
            || !hasValue(details.publishers)
            || !hasValue(details.related_series);
    }

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
