// Unidex View Controls State Transform Helpers
window.UnidexViewModules = window.UnidexViewModules || {};

(function () {
    if (window.UnidexViewModules.createControlsStateTransforms) return;

    window.UnidexViewModules.createControlsStateTransforms = function createControlsStateTransforms(deps) {
        const getLinkedLibraryEntry = deps?.getLinkedLibraryEntry || (() => null);
        const getEntryConfidence = deps?.getEntryConfidence || (() => null);
        const getEntriesConfidenceMin = deps?.getEntriesConfidenceMin || (() => null);
        const getEntriesConfidenceMax = deps?.getEntriesConfidenceMax || (() => null);
        const getEntriesSortBy = deps?.getEntriesSortBy || (() => 'none');
        const getEntriesSortOrder = deps?.getEntriesSortOrder || (() => 'desc');

        function matchesEntriesFilter(link, filterMode) {
            if (filterMode === 'all') return true;
            const isLinked = !!getLinkedLibraryEntry(link.id);
            if (filterMode === 'linked') return isLinked;
            if (filterMode === 'bookmark-only') return !isLinked;
            return true;
        }

        function matchesConfidenceRange(link, minConfidence, maxConfidence) {
            if (!Number.isFinite(minConfidence) && !Number.isFinite(maxConfidence)) return true;
            const entry = getLinkedLibraryEntry(link.id);
            if (!entry) return true;
            const confidence = getEntryConfidence(entry);
            if (!Number.isFinite(confidence)) return false;
            if (Number.isFinite(minConfidence) && confidence < minConfidence) return false;
            if (Number.isFinite(maxConfidence) && confidence > maxConfidence) return false;
            return true;
        }

        function sortByConfidence(links, sortOrder) {
            const indexed = (Array.isArray(links) ? links : []).map(function (link, index) {
                const entry = getLinkedLibraryEntry(link.id);
                return { index, link, confidence: entry ? getEntryConfidence(entry) : null };
            });
            indexed.sort(function (a, b) {
                const aValue = a.confidence;
                const bValue = b.confidence;
                const aMissing = !Number.isFinite(aValue);
                const bMissing = !Number.isFinite(bValue);
                if (aMissing && bMissing) return a.index - b.index;
                if (aMissing) return 1;
                if (bMissing) return -1;
                if (aValue !== bValue) {
                    return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
                }
                return a.index - b.index;
            });
            return indexed.map(function (item) { return item.link; });
        }

        function applyEntriesViewTransforms(entryLinks, filterMode) {
            const base = Array.isArray(entryLinks) ? entryLinks.slice() : [];
            const minConfidence = getEntriesConfidenceMin();
            const maxConfidence = getEntriesConfidenceMax();
            const sortBy = getEntriesSortBy();
            const sortOrder = getEntriesSortOrder();
            const filtered = base.filter(function (link) {
                return matchesEntriesFilter(link, filterMode)
                    && matchesConfidenceRange(link, minConfidence, maxConfidence);
            });
            return sortBy === 'confidence' ? sortByConfidence(filtered, sortOrder) : filtered;
        }

        return { applyEntriesViewTransforms };
    };
})();
