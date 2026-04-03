window.EveOS = window.EveOS || {};

(function () {
    const DETAIL_FETCH_LIMIT = 6;
    const COMICK_PRIMARY_BASE_URL = 'https://comick.dev';
    const COMICK_FALLBACK_BASE_URL = 'https://comick.io';

    function normalizeText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
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

    function extractNames(arr) {
        if (!Array.isArray(arr)) return [];
        return uniqueStrings(arr.map((item) => {
            if (typeof item === 'string') return item;
            return item?.name || item?.title || item?.slug || item?.md_genres?.name || item?.md_tags?.name || item?.label || '';
        }));
    }

    function splitList(raw) {
        return uniqueStrings(
            normalizeText(raw)
                .split(/\s*,\s*/)
                .map((entry) => normalizeText(entry))
                .filter(Boolean)
        );
    }

    function parseChapterValue(raw) {
        const text = normalizeText(raw);
        if (!text) return '';
        const chapterMatch = text.match(/chapter\s+([\d.]+)/i);
        if (chapterMatch) return chapterMatch[1];
        const numericMatch = text.match(/([\d.]+)/);
        return numericMatch ? numericMatch[1] : text;
    }

    function parseNumberValue(raw) {
        const text = normalizeText(raw);
        if (!text) return '';
        const match = text.match(/([\d,]+)/);
        return match ? match[1].replace(/,/g, '') : '';
    }

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildPageText(doc) {
        const body = doc?.body;
        if (!body) return '';

        return normalizeText(
            body.innerText
            || body.textContent
            || ''
        );
    }

    function getTextLines(doc) {
        const body = doc?.body;
        const rawText = String(body?.innerText || body?.textContent || '');
        if (!rawText) return [];

        return rawText
            .split(/\r?\n+/)
            .map((line) => normalizeText(line))
            .filter(Boolean);
    }

    function matchesLabeledLine(line, normalizedLabel) {
        const normalized = normalizeText(line).toLowerCase();
        if (!normalized || !normalizedLabel) return false;
        if (normalized === normalizedLabel) return true;
        if (!normalized.startsWith(normalizedLabel)) return false;

        const nextChar = normalized.charAt(normalizedLabel.length);
        return nextChar === ':' || nextChar === ' ' || nextChar === '\t';
    }

    function extractSectionLines(lines, label, nextLabels) {
        const normalizedLabel = normalizeText(label).toLowerCase();
        const nextLabelSet = new Set((Array.isArray(nextLabels) ? nextLabels : []).map((entry) => normalizeText(entry).toLowerCase()));
        const startIndex = lines.findIndex((line) => {
            return matchesLabeledLine(line, normalizedLabel);
        });

        if (startIndex === -1) return [];

        const firstLine = normalizeText(lines[startIndex]);
        const inlineValue = matchesLabeledLine(firstLine, normalizedLabel)
            ? normalizeText(firstLine.slice(normalizedLabel.length).replace(/^:\s*/, ''))
            : '';
        const values = inlineValue ? [inlineValue] : [];

        for (let index = startIndex + 1; index < lines.length; index += 1) {
            const normalized = normalizeText(lines[index]).toLowerCase();
            if (nextLabelSet.has(normalized) || Array.from(nextLabelSet).some((nextLabel) => matchesLabeledLine(lines[index], nextLabel))) {
                break;
            }
            values.push(normalizeText(lines[index]));
        }

        return values.filter(Boolean);
    }

    function isAccessibilitySnapshot(lines) {
        return Array.isArray(lines) && lines.some((line) => /^-\s+(heading|paragraph|link|text|listitem|table|cell)\b/i.test(normalizeText(line)));
    }

    function extractSnapshotRowValue(lines, label) {
        const pattern = new RegExp(`\\b${escapeRegExp(label)}:\\s*([^"]+)`, 'i');

        for (const line of Array.isArray(lines) ? lines : []) {
            const match = normalizeText(line).match(pattern);
            if (match) {
                return normalizeText(match[1]);
            }
        }

        return '';
    }

    function extractSnapshotParagraphAfterHeading(lines, headingLabel) {
        const headingPattern = new RegExp(`^[-\\s]*heading\\s+"${escapeRegExp(headingLabel)}\\b`, 'i');
        const stopPattern = /^[-\s]*heading\s+"/i;
        const values = [];
        let inSection = false;

        for (const line of Array.isArray(lines) ? lines : []) {
            const normalized = normalizeText(line);
            if (!normalized) continue;

            if (!inSection) {
                if (headingPattern.test(normalized)) {
                    inSection = true;
                }
                continue;
            }

            if (stopPattern.test(normalized)) break;
            if (/^[-\s]*separator\b/i.test(normalized)) break;

            const paragraphMatch = normalized.match(/^(?:[-\s]*paragraph:|[-\s]*text:)\s*"(.+)"$/i);
            if (paragraphMatch) {
                values.push(normalizeText(paragraphMatch[1]));
                continue;
            }
        }

        return values.join(' ');
    }

    function extractSnapshotLinkSection(lines, headingLabel) {
        const headingPattern = new RegExp(`^[-\\s]*heading\\s+"${escapeRegExp(headingLabel)}\\b`, 'i');
        const stopPattern = /^[-\s]*heading\s+"/i;
        const values = [];
        let inSection = false;

        for (const line of Array.isArray(lines) ? lines : []) {
            const normalized = normalizeText(line);
            if (!normalized) continue;

            if (!inSection) {
                if (headingPattern.test(normalized)) {
                    inSection = true;
                }
                continue;
            }

            if (stopPattern.test(normalized)) break;

            const linkMatch = normalized.match(/link\s+"([^"]+)"/i);
            if (!linkMatch) continue;

            const value = normalizeText(linkMatch[1])
                .replace(/\s*\([^)]*\)\s*$/, '')
                .trim();
            if (!value || /^\d[\d,]*\s+users?$/i.test(value)) continue;
            values.push(value);
        }

        return uniqueStrings(values);
    }

    function extractSnapshotFollowCount(pageText) {
        const directMatch = String(pageText || '').match(/link\s+"([\d,]+)\s+users"/i);
        if (directMatch) return parseNumberValue(directMatch[1]);
        return '';
    }

    function parseComicKPageDetails(html, item) {
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const pageText = buildPageText(doc);
            if (!pageText) return null;
            const lines = getTextLines(doc);
            const snapshotMode = isAccessibilitySnapshot(lines);

            const description = extractSectionLines(lines, 'Description', ['More Info', 'Reviews', 'Chapters', 'Comments', 'Recommendations', 'FAQ']).join(' ')
                || (snapshotMode ? extractSnapshotParagraphAfterHeading(lines, 'Description') : '');
            const origination = extractSectionLines(lines, 'Origination', ['Demographic', 'Published', 'Status'])[0]
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Origination') : '')
                || '';
            const demographic = extractSectionLines(lines, 'Demographic', ['Published', 'Status', 'Translation', 'Anime Start'])[0]
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Demographic') : '')
                || '';
            const published = extractSectionLines(lines, 'Published', ['Status', 'Translation', 'Anime Start', 'Final Chapter', 'Ranked'])[0]
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Published') : '')
                || '';
            const status = extractSectionLines(lines, 'Status', ['Translation', 'Anime Start', 'Anime End', 'Final Chapter', 'Ranked', 'Followed by', 'Description'])[0]
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Status') : '')
                || '';
            const translation = extractSectionLines(lines, 'Translation', ['Anime Start', 'Anime End', 'Final Chapter', 'Ranked', 'Followed by', 'Description'])[0]
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Translation') : '')
                || '';
            const finalChapter = parseChapterValue(
                extractSectionLines(lines, 'Final Chapter', ['Ranked', 'Followed by', 'Description', 'More Info'])[0]
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Final Chapter') : '')
                || ''
            );
            const rank = parseNumberValue(
                extractSectionLines(lines, 'Ranked', ['Followed by', 'Description', 'More Info'])[0]
                || (snapshotMode ? pageText.match(/Ranked:\s*#?([\d,]+)/i)?.[1] : '')
                || ''
            );
            const followCount = parseNumberValue(
                extractSectionLines(lines, 'Followed by', ['Description', 'More Info'])[0]
                || (snapshotMode ? extractSnapshotFollowCount(pageText) : '')
                || ''
            );

            const artists = splitList(
                extractSectionLines(lines, 'Artists', ['Authors', 'Genres', 'Theme', 'Format', 'Publishers', 'Relations', 'Tags', 'Referrers']).join(', ')
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Artists') : '')
            );
            const authors = splitList(
                extractSectionLines(lines, 'Authors', ['Genres', 'Theme', 'Format', 'Publishers', 'Relations', 'Tags', 'Referrers']).join(', ')
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Authors') : '')
            );
            const genres = splitList(
                extractSectionLines(lines, 'Genres', ['Theme', 'Format', 'Publishers', 'Relations', 'Tags', 'Referrers']).join(', ')
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Genres') : '')
            );
            const themes = splitList(
                extractSectionLines(lines, 'Theme', ['Format', 'Publishers', 'Relations', 'Tags', 'Referrers']).join(', ')
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Theme') : '')
            );
            const formats = splitList(
                extractSectionLines(lines, 'Format', ['Publishers', 'Relations', 'Tags', 'Referrers']).join(', ')
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Format') : '')
            );
            const publishers = splitList(
                extractSectionLines(lines, 'Publishers', ['Relations', 'Tags', 'Referrers', 'Reviews', 'Chapters']).join(', ')
                || (snapshotMode ? extractSnapshotRowValue(lines, 'Publishers') : '')
            );
            const tags = uniqueStrings([
                ...extractSectionLines(lines, 'Tags', ['Referrers', 'Reviews', 'Chapters', 'Comments', 'Recommendations', 'FAQ'])
                    .filter((entry) => entry && !/^show\s+(less|more)$/i.test(entry)),
                ...(snapshotMode ? extractSnapshotLinkSection(lines, 'Tags') : [])
            ]);

            return {
                title: normalizeText(doc?.querySelector?.('meta[property="og:title"]')?.getAttribute('content') || item?.title || ''),
                description: description || normalizeText(doc?.querySelector?.('meta[property="og:description"]')?.getAttribute('content') || item?.desc || ''),
                origination: origination || '',
                demographic: demographic || '',
                year: normalizeText(published || item?.year || ''),
                statusText: normalizeText(status || ''),
                translationStatus: normalizeText(translation || ''),
                finalChapter,
                rank,
                followCount,
                authors,
                artists,
                genres,
                themes,
                tags,
                formats,
                publishers,
                country: normalizeText(item?.country || '')
            };
        } catch (e) {
            console.warn('ComicK page detail parse failed', e);
            return null;
        }
    }

    async function fetchComicKPageDetails(Core, item) {
        if (!item?.slug) return null;

        const pageUrls = [
            `${COMICK_PRIMARY_BASE_URL}/comic/${item.slug}`,
            `${COMICK_FALLBACK_BASE_URL}/comic/${item.slug}`
        ];

        for (const pageUrl of pageUrls) {
            const html = await Core.fetchTextWithFallback(pageUrl, {}, 'ComicK Page Details failed');
            if (!html) continue;

            const parsed = parseComicKPageDetails(html, item);
            if (parsed) return parsed;
        }

        return null;
    }

    async function enrichComicKResults(results, Core) {
        if (!Array.isArray(results) || !results.length) return [];

        const limit = Math.min(DETAIL_FETCH_LIMIT, results.length);
        const enriched = await Promise.all(results.map(async (item, index) => {
            if (index >= limit || !item?.slug) return item;

            const pageDetails = await fetchComicKPageDetails(Core, item);
            return pageDetails ? { ...item, _detail: pageDetails } : item;
        }));

        return enriched;
    }

    async function searchComicK(query) {
        const Core = window.EveOS.API.Core;
        if (!Core) { console.error('EveOS.API.Core missing'); return []; }

        const targetUrl = `https://api.comick.dev/v1.0/search/?q=${encodeURIComponent(query)}&limit=25&t=false`;
        const res = await Core.fetchWithFallback(
            targetUrl,
            { allowBridgeForApiTarget: true },
            'ComicK Search failed'
        );
        const results = Array.isArray(res) ? res : [];
        return await enrichComicKResults(results, Core);
    }

    window.EveOS.API.ComicK = {
        searchComicK
    };
})();
