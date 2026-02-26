/**
 * Library UI Shared Helpers
 * Reused by library UI orchestration and template modules.
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIShared = window.EveLibrary.UIShared || {};

(function (shared) {
    shared.parseUniqueCsvList = function (value) {
        const seen = new Set();
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    };

    shared.normalizeListForInput = function (value) {
        if (Array.isArray(value)) {
            const seen = new Set();
            return value
                .map(item => String(item || '').trim())
                .filter(Boolean)
                .filter(item => {
                    const key = item.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
                .join(', ');
        }
        return shared.parseUniqueCsvList(value).join(', ');
    };

    shared.formatTimestamp = function (value) {
        if (!value) return '-';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '-';
        return parsed.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    shared.formatOptionalScore = function (value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(2).replace(/\.?0+$/, '');
    };
})(window.EveLibrary.UIShared);
