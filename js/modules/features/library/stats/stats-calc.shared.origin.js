/**
 * Statistics Calculator Shared - Origin Utilities
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.StatsCalcSharedModules = window.EveLibrary.StatsCalcSharedModules || {};

(function () {
    window.EveLibrary.StatsCalcSharedModules.createOrigin = function createOrigin(core) {
        const toList = core.toList;
        const toNumber = core.toNumber;
        const clamp = core.clamp;
        const isFilmLikeEntry = core.isFilmLikeEntry;

        function extractYearFromText(value) {
            const match = String(value || '').match(/(?:19|20)\d{2}/);
            if (!match) return null;
            const year = toNumber(match[0]);
            if (year === null) return null;
            return clamp(Math.floor(year), 1900, 2100);
        }

        function extractPublicationYear(entry) {
            const direct = [
                entry?.publicationYear,
                entry?.year,
                entry?.releaseYear
            ];
            for (const candidate of direct) {
                const year = toNumber(candidate);
                if (year !== null && year >= 1900 && year <= 2100) return Math.floor(year);
            }

            const startDate = String(entry?.startDate || '').trim();
            if (startDate) {
                const parsed = new Date(startDate);
                if (!Number.isNaN(parsed.getTime())) {
                    const year = parsed.getUTCFullYear();
                    if (year >= 1900 && year <= 2100) return year;
                }
                const fromText = extractYearFromText(startDate);
                if (fromText) return fromText;
            }

            const tags = toList(entry?.tags);
            for (const tag of tags) {
                const publicationMatch = tag.match(/publication\s*:\s*((?:19|20)\d{2})/i);
                if (publicationMatch) {
                    const year = toNumber(publicationMatch[1]);
                    if (year !== null) return Math.floor(year);
                }
            }

            return null;
        }

        function extractCountryCode(entry) {
            const direct = String(entry?.countryOfOrigin || entry?.originCountry || entry?.country || '').trim().toUpperCase();
            if (direct && /^[A-Z]{2,3}$/.test(direct)) return direct;

            const tags = toList(entry?.tags);
            for (const tag of tags) {
                const match = tag.match(/original\s*:\s*([A-Z]{2,3})/i);
                if (match) return String(match[1] || '').toUpperCase();
            }

            const language = String(entry?.language || '').trim().toLowerCase();
            if (/japanese|\bja\b/.test(language)) return 'JA';
            if (/korean|\bko\b/.test(language)) return 'KO';
            if (/chinese|\bzh\b/.test(language)) return 'ZH';

            return '';
        }

        function mapCountryToOriginLabel(code) {
            const normalized = String(code || '').toUpperCase();
            if (normalized === 'JA' || normalized === 'JP') return 'Manga (Japan)';
            if (normalized === 'KO' || normalized === 'KR') return 'Manhwa (Korea)';
            if (['ZH', 'CN', 'TW', 'HK'].includes(normalized)) return 'Manhua (China)';
            if (normalized) return `Other (${normalized})`;
            return 'Unknown';
        }

        function extractTypeOriginLabel(entry) {
            const typeText = [
                entry?.type,
                entry?.format,
                entry?.mediaType,
                entry?.sourceType
            ]
                .map(value => String(value || '').trim().toLowerCase())
                .filter(Boolean)
                .join(' ');

            if (!typeText) return '';
            if (typeText.includes('manhwa')) return 'Manhwa (Korea)';
            if (typeText.includes('manhua')) return 'Manhua (China)';
            if (typeText.includes('manga')) return 'Manga (Japan)';
            return '';
        }

        function extractOriginLabel(entry) {
            const typeLabel = extractTypeOriginLabel(entry);
            if (typeLabel) return typeLabel;
            return mapCountryToOriginLabel(extractCountryCode(entry));
        }

        return {
            extractYearFromText,
            extractPublicationYear,
            extractCountryCode,
            mapCountryToOriginLabel,
            extractTypeOriginLabel,
            extractOriginLabel
        };
    };
})();
