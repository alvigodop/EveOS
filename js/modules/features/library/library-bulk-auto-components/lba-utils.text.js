window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.BulkAutoModules = window.EveLibrary.BulkAutoModules || {};

(function () {
    window.EveLibrary.BulkAutoModules.createTextUtils = function createTextUtils() {
        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function uniqStrings(values) {
            const seen = new Set();
            const result = [];
            (Array.isArray(values) ? values : []).forEach(value => {
                const next = String(value || '').trim();
                if (!next) return;
                const key = next.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                result.push(next);
            });
            return result;
        }

        function splitPeopleNames(value) {
            return uniqStrings(
                String(value || '')
                    .split(/\s*(?:,|\/|;|&|and)\s*/i)
                    .map(item => item.trim())
            );
        }

        function normalizeExactTitle(value) {
            return String(value || '')
                .normalize('NFKC')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function hasExactCaseMatch(bookmarkTitle, sourceMeta) {
            const target = normalizeExactTitle(bookmarkTitle);
            if (!target) return false;
            const titles = uniqStrings([
                sourceMeta?.title,
                ...(Array.isArray(sourceMeta?.synonyms) ? sourceMeta.synonyms : [])
            ]).map(normalizeExactTitle);
            return titles.includes(target);
        }

        function isPlaceholderImageUrl(url) {
            return /placeholder\.com|placehold\.co|text=No\+Cover/i.test(String(url || ''));
        }

        function normalizeLanguageFromCountryCode(value) {
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
        }

        function emptyApiRatings() {
            return {
                anilist: null,
                myanimelist: null,
                mangadex: null
            };
        }

        return {
            escapeHtml,
            uniqStrings,
            splitPeopleNames,
            normalizeExactTitle,
            hasExactCaseMatch,
            isPlaceholderImageUrl,
            normalizeLanguageFromCountryCode,
            emptyApiRatings
        };
    };
})();
