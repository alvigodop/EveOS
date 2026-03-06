/**
 * Library Stats Renderer Helpers
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    window.EveLibrary.createStatsRendererHelpers = function createStatsRendererHelpers(deps) {
        const State = deps?.State;
        const Search = deps?.Search;

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatAverage(value, digits) {
            const n = Number(value);
            return Number.isFinite(n) ? n.toFixed(digits) : 'N/A';
        }

        function formatPercent(value) {
            const n = Number(value);
            return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '0%';
        }

        function formatSigned(value) {
            const n = Number(value);
            if (!Number.isFinite(n)) return '0';
            const abs = Math.abs(n).toFixed(2).replace(/\.?0+$/, '');
            return n > 0 ? `+${abs}` : (n < 0 ? `-${abs}` : abs);
        }

        function axisMax(values) {
            const max = (values || []).reduce((acc, value) => Math.max(acc, Number(value) || 0), 0);
            if (max <= 0) return 1;
            if (max <= 3) return max + 1;
            if (max <= 10) return max + 2;
            return Math.ceil(max * 1.15);
        }

        function getPrefix(categoryName) {
            return `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        }

        function getEntriesForStats(categoryName) {
            const lib = State.getCategoryLibrary(categoryName);
            const allTypeEntries = Search?.getTypeScopedEntries
                ? Search.getTypeScopedEntries(categoryName)
                : (lib.entries || []);
            const entries = Search?.getFilteredEntries
                ? Search.getFilteredEntries(categoryName)
                : allTypeEntries;
            return { allTypeEntries, entries };
        }

        function isFilmLikeEntry(entry) {
            const mediaTypes = Array.isArray(entry?.mediaTypes)
                ? entry.mediaTypes.map(item => String(item || '').toLowerCase())
                : [];
            if (mediaTypes.includes('films')) return true;
            if (mediaTypes.includes('graphicnovels') || mediaTypes.includes('novels')) return false;

            const episode = Number(entry?.episode);
            const chapter = Number(entry?.chapter ?? entry?.graphicChapter ?? entry?.novelChapter);
            return Number.isFinite(episode) && episode > 0 && (!Number.isFinite(chapter) || chapter <= 0);
        }

        function getWorkspaceId() {
            if (typeof State?.getCurrentWorkspaceId === 'function') {
                return State.getCurrentWorkspaceId();
            }
            if (window.eveState?.config?.activeWorkspace) return String(window.eveState.config.activeWorkspace);
            if (typeof config !== 'undefined' && config?.activeWorkspace) return String(config.activeWorkspace);
            return 'main';
        }

        return {
            escapeHtml,
            formatAverage,
            formatPercent,
            formatSigned,
            axisMax,
            getPrefix,
            getEntriesForStats,
            isFilmLikeEntry,
            getWorkspaceId
        };
    };
})();
