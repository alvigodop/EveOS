/**
 * Library Stats Renderer Actions
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    window.EveLibrary.createStatsRendererActions = function createStatsRendererActions(deps) {
        const State = deps?.State;
        const Storage = deps?.Storage;
        const Ratings = deps?.Ratings;
        const renderStats = deps?.renderStats;
        const getPrefix = deps?.getPrefix;
        const getWorkspaceId = deps?.getWorkspaceId;
        const isFilmLikeEntry = deps?.isFilmLikeEntry;

        function quickIncrement(categoryName, entryId) {
            const lib = State.getCategoryLibrary(categoryName);
            if (!lib || !Array.isArray(lib.entries)) return false;
            const entry = lib.entries.find(item => String(item?.id) === String(entryId));
            if (!entry) return false;

            if (isFilmLikeEntry(entry)) {
                const current = Number(entry.episode);
                entry.episode = Number.isFinite(current) ? current + 1 : 1;
            } else {
                const current = Number(entry.chapter ?? entry.graphicChapter ?? entry.novelChapter);
                const next = Number.isFinite(current) ? current + 1 : 1;
                entry.chapter = next;
                const mediaTypes = Array.isArray(entry.mediaTypes) ? entry.mediaTypes : [];
                if (!mediaTypes.length || mediaTypes.includes('graphicNovels')) {
                    entry.graphicChapter = next;
                }
                if (mediaTypes.includes('novels')) {
                    entry.novelChapter = next;
                }
            }

            entry.lastEdited = new Date().toISOString();
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(entry);
            }
            Storage?.saveLibrary?.();
            if (window.EveLibrary?.ConnectionsAPI?.syncFromLibraryEntry) {
                window.EveLibrary.ConnectionsAPI.syncFromLibraryEntry(categoryName, entry, getWorkspaceId());
            }

            if (window.EveLibrary?.UI?.refreshLibrary) {
                window.EveLibrary.UI.refreshLibrary(categoryName);
            } else {
                const statsView = document.getElementById(`${getPrefix(categoryName)}stats-view`);
                if (statsView) renderStats(categoryName, statsView);
            }
            return true;
        }

        function applyTagFilter(categoryName, tag) {
            const prefix = getPrefix(categoryName);
            const input = document.getElementById(`${prefix}search-tags`);
            if (input) {
                input.value = String(tag || '').trim();
            }
            if (window.EveLibrary?.UI?.refreshLibrary) {
                window.EveLibrary.UI.refreshLibrary(categoryName);
            } else {
                const statsView = document.getElementById(`${prefix}stats-view`);
                if (statsView) renderStats(categoryName, statsView);
            }
        }

        return {
            quickIncrement,
            applyTagFilter
        };
    };
})();
