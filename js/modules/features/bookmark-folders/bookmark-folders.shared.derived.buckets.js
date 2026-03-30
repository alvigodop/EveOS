window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};
    if (shared.derivedBucketsReady) return;

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

    function getProgressBucketLabel(value) {
        if (!Number.isFinite(value)) return '';
        if (value >= 500) return '500+ Units';
        if (value >= 200) return '200-499 Units';
        if (value >= 100) return '100-199 Units';
        if (value >= 50) return '50-99 Units';
        if (value >= 10) return '10-49 Units';
        return 'Under 10 Units';
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
        getRatingBucketLabel,
        getConfidenceBucketLabel,
        getProgressBucketLabel,
        getPublicationBucketLabel,
        getTitleInitial,
        getCoarseTitleBucket,
        getDerivedTimelineBucket
    });

    shared.derivedBucketsReady = true;
})(window.EveBookmarkFolders);
