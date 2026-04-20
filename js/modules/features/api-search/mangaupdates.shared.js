window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};

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
            votes: votesMatch ? votesMatch[1] : '',
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
            volumes: volumesMatch ? volumesMatch[1] : '',
        };
    }

    function parseActivityStats(content) {
        const labelMap = {
            weekly: 'week',
            monthly: 'month',
            '3 month': 'month3',
            '6 month': 'month6',
            year: 'year',
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

    window.EveOS.API._mangaupdatesShared = Object.assign(
        window.EveOS.API._mangaupdatesShared || {},
        {
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
            uniqueStrings,
        }
    );
})();
