window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};
    if (shared.derivedNormalizeReady) return;

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

    Object.assign(shared, {
        uniqueNonEmpty,
        splitLibraryFieldValues,
        normalizeLanguageLabel,
        normalizeStatusLabel
    });

    shared.derivedNormalizeReady = true;
})(window.EveBookmarkFolders);
