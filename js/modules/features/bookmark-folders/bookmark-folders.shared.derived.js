window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};

function uniqueNonEmpty(values) {

        const seen = new Set();

        return (Array.isArray(values) ? values : [])

            .map((value) => String(value || '').trim())

            .filter((value) => {

                if (!value) return false;

                const key = value.toLowerCase();

                if (seen.has(key)) return false;

                seen.add(key);

                return true;

            });

    }



    function splitLibraryFieldValues(value) {

        if (Array.isArray(value)) return uniqueNonEmpty(value);

        return uniqueNonEmpty(String(value || '').split(/[|,;/]/g));

    }



    function normalizeLanguageLabel(value) {

        const raw = String(value || '').trim();

        if (!raw) return '';

        const lower = raw.toLowerCase();

        if (/^(english|en|eng)$/.test(lower)) return 'EN';

        if (/^(japanese|ja|jp|jpn)$/.test(lower)) return 'JA';

        if (/^(korean|ko|kr|kor)$/.test(lower)) return 'KO';

        if (/^(chinese|zh|cn|zho)$/.test(lower)) return 'ZH';

        if (/^[a-z]{2,3}$/.test(lower)) return lower.toUpperCase();

        return raw

            .split(/\s+/)

            .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : '')

            .join(' ')

            .trim();

    }



    function normalizeStatusLabel(value) {

        const raw = String(value || '').trim();

        if (!raw) return '';

        const lower = raw.toLowerCase();

        const map = {

            plan_to_read: 'Plan to Read',

            unread: 'Plan to Read',

            reading: 'Reading',

            in_progress: 'Reading',

            ongoing: 'Reading',

            completed: 'Completed',

            finished: 'Completed',

            on_hold: 'On Hold',

            paused: 'On Hold',

            dropped: 'Dropped'

        };

        if (map[lower]) return map[lower];

        return raw

            .replace(/[_-]+/g, ' ')

            .split(/\s+/)

            .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : '')

            .join(' ')

            .trim();

    }



    function getDerivedTagValues(link, entry) {

        return uniqueNonEmpty([

            ...(Array.isArray(link?.tags) ? link.tags : []),

            ...splitLibraryFieldValues(entry?.tags)

        ]);

    }



    function getDerivedGenreValues(entry) {

        return uniqueNonEmpty([

            ...splitLibraryFieldValues(entry?.genre),

            ...splitLibraryFieldValues(entry?.genres)

        ]);

    }



    function getDerivedAuthorValues(entry) {

        return uniqueNonEmpty([

            ...splitLibraryFieldValues(entry?.author),

            ...splitLibraryFieldValues(entry?.authors),

            ...splitLibraryFieldValues(entry?.authorAltNames),

            ...splitLibraryFieldValues(entry?.writer)

        ]);

    }



    function getDerivedLanguageValues(link, entry) {

        const values = uniqueNonEmpty([

            ...splitLibraryFieldValues(link?.language),

            ...splitLibraryFieldValues(entry?.language),

            ...splitLibraryFieldValues(entry?.languages),

            ...splitLibraryFieldValues(entry?.originalLanguage)

        ]);

        return uniqueNonEmpty(values.map((value) => normalizeLanguageLabel(value)));

    }



    function getDerivedStatusValue(link, entry) {

        const libraryStatus = entry?.libraryStatus;

        const raw = libraryStatus?.label || libraryStatus?.name || libraryStatus?.id || entry?.status || link?.status || '';

        const normalized = normalizeStatusLabel(raw);

        return normalized || null;

    }



    function getDerivedRatingValue(link, entry) {

        const candidates = [

            entry?.derivedRatings?.activeValue,

            entry?.derivedRatings?.unified,

            entry?.derivedRatings?.selectedRating10,

            entry?.derivedRatings?.hybrid10,

            entry?.apiRating,

            entry?.personalRating,

            entry?.rating,

            link?.rating,

            link?.priority === 'high' ? 8 : null

        ];

        for (let i = 0; i < candidates.length; i += 1) {

            const numeric = Number(candidates[i]);

            if (Number.isFinite(numeric) && numeric > 0) {

                return numeric;

            }

        }

        return null;

    }



    function getDerivedConfidenceValue(entry) {

        const candidates = [

            entry?.derivedRatings?.confidence,

            entry?.confidence

        ];

        for (let i = 0; i < candidates.length; i += 1) {

            const numeric = Number(candidates[i]);

            if (Number.isFinite(numeric)) {

                if (numeric <= 1) return numeric;

                return Math.max(0, Math.min(1, numeric / 10));

            }

        }

        return null;

    }



    function getRatingBucketLabel(value) {

        if (!Number.isFinite(value)) return '';

        if (value >= 9) return '9+';

        if (value >= 8) return '8-8.9';

        if (value >= 7) return '7-7.9';

        if (value >= 5) return '5-6.9';

        return 'Under 5';

    }



    function getConfidenceBucketLabel(value) {

        if (!Number.isFinite(value)) return '';

        if (value >= 0.9) return '0.90+';

        if (value >= 0.75) return '0.75-0.89';

        if (value >= 0.5) return '0.50-0.74';

        if (value > 0) return 'Below 0.50';

        return '';

    }



    function getDerivedProgressValue(entry) {

        const candidates = [

            entry?.chapter,

            entry?.graphicChapter,

            entry?.novelChapter,

            entry?.episode,

            entry?.chapterTotal,

            entry?.chapters,

            entry?.episodeTotal,

            entry?.episodes

        ];

        for (let i = 0; i < candidates.length; i += 1) {

            const numeric = Number(candidates[i]);

            if (Number.isFinite(numeric) && numeric > 0) return numeric;

        }

        return null;

    }



    function getProgressBucketLabel(value) {

        if (!Number.isFinite(value)) return '';

        if (value >= 500) return '500+ Units';

        if (value >= 200) return '200-499 Units';

        if (value >= 100) return '100-199 Units';

        if (value >= 50) return '50-99 Units';

        if (value >= 10) return '10-49 Units';

        return 'Under 10 Units';

    }



    function getDerivedDemographicValue(entry) {

        const values = uniqueNonEmpty([

            ...splitLibraryFieldValues(entry?.demographic),

            ...splitLibraryFieldValues(entry?.demographics),

            ...splitLibraryFieldValues(entry?.audience)

        ]);

        return values[0] || null;

    }



    function getDerivedPublicationValue(entry) {

        const candidates = [

            entry?.publicationYear,

            entry?.year,

            entry?.releaseYear,

            entry?.publishedYear,

            entry?.startYear

        ];

        for (let i = 0; i < candidates.length; i += 1) {

            const numeric = Number(candidates[i]);

            if (Number.isFinite(numeric) && numeric >= 1900 && numeric <= 2100) {

                return Math.floor(numeric);

            }

        }

        const textCandidates = [entry?.releaseDate, entry?.publishedAt, entry?.dateAdded];

        for (let i = 0; i < textCandidates.length; i += 1) {

            const date = new Date(textCandidates[i]);

            const year = Number(date.getUTCFullYear());

            if (Number.isFinite(year) && year >= 1900 && year <= 2100) {

                return year;

            }

        }

        return null;

    }



    function getPublicationBucketLabel(value) {

        if (!Number.isFinite(value)) return '';

        return `${Math.floor(value / 10) * 10}s`;

    }



    function getTitleInitial(title) {

        const normalized = String(title || '').trim();

        if (!normalized) return '#';

        const first = normalized.charAt(0).toUpperCase();

        if (/[A-Z]/.test(first)) return first;

        if (/[0-9]/.test(first)) return '0-9';

        return '#';

    }



    function getCoarseTitleBucket(initial) {

        if (initial === '0-9' || initial === '#') return initial;

        const code = initial.charCodeAt(0);

        if (code <= 67) return 'A-C';

        if (code <= 70) return 'D-F';

        if (code <= 73) return 'G-I';

        if (code <= 76) return 'J-L';

        if (code <= 79) return 'M-O';

        if (code <= 82) return 'P-R';

        if (code <= 85) return 'S-U';

        return 'V-Z';

    }



    function getDerivedTimelineBucket(link) {

        const raw = link?.lastVisited || link?.updatedAt || link?.createdAt || 0;

        const timestamp = Number(new Date(raw).getTime());

        if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

        const age = Date.now() - timestamp;

        const day = 24 * 60 * 60 * 1000;

        if (age < day) return 'Today';

        if (age < 7 * day) return 'This Week';

        if (age < 30 * day) return 'This Month';

        if (age < 365 * day) return 'This Year';

        return 'Older';

    }



    

    Object.assign(shared, {
        uniqueNonEmpty,
        splitLibraryFieldValues,
        normalizeLanguageLabel,
        normalizeStatusLabel,
        getDerivedTagValues,
        getDerivedGenreValues,
        getDerivedAuthorValues,
        getDerivedLanguageValues,
        getDerivedStatusValue,
        getDerivedRatingValue,
        getDerivedConfidenceValue,
        getRatingBucketLabel,
        getConfidenceBucketLabel,
        getDerivedProgressValue,
        getProgressBucketLabel,
        getDerivedDemographicValue,
        getDerivedPublicationValue,
        getPublicationBucketLabel,
        getTitleInitial,
        getCoarseTitleBucket,
        getDerivedTimelineBucket
    });
})(window.EveBookmarkFolders);
