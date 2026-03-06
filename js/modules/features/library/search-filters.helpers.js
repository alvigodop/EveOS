window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.SearchModules = window.EveLibrary.SearchModules || {};

(function (modules) {
    if (modules.helpers) return;

    const State = window.EveLibrary.State;

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function parseUniqueCsvList(value) {
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
    }

    function isEntryVisibleForDataType(entry, dataType) {
        const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : null;
        if (!mediaTypes || mediaTypes.length === 0) return true;
        return mediaTypes.includes(dataType);
    }

    function getTypeScopedEntries(categoryName) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const entries = lib.entries || [];
        return entries.filter(entry => isEntryVisibleForDataType(entry, dataType));
    }

    modules.helpers = {
        toArray,
        parseUniqueCsvList,
        isEntryVisibleForDataType,
        getTypeScopedEntries
    };
})(window.EveLibrary.SearchModules);
