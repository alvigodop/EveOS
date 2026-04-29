window.EveDuplicateSensor = window.EveDuplicateSensor || {};

(function (ns) {
    function isSearchUrl(url) {
        const lower = String(url || '').toLowerCase();
        return lower.includes('google.com/search')
            || lower.includes('duckduckgo.com/?q=')
            || lower.includes('bing.com/search');
    }

    function isRawTitle(title) {
        const lower = String(title || '').toLowerCase().trim();
        return lower.startsWith('http://')
            || lower.startsWith('https://')
            || lower.startsWith('www.');
    }

    function parseNum(value) {
        const number = Number.parseInt(value, 10);
        return Number.isNaN(number) ? null : number;
    }

    function buildStoreWriter(runtime) {
        if (typeof window.EveBookmarkFolders?._shared?.writeStore === 'function') {
            return function (next, options = {}) {
                return window.EveBookmarkFolders._shared.writeStore(next, true, options);
            };
        }
        return function (next, options = {}) {
            const store = next || runtime.getFolderTrees();
            if (window.eveState) window.eveState.bookmarkFolders = store;
            window.bookmarkFolders = store;
            if (typeof bookmarkFolders !== 'undefined') bookmarkFolders = store;
            if (typeof window.saveData === 'function') {
                window.saveData({
                    source: String(options.source || 'duplicate-sensor-folder-store-updated').trim() || 'duplicate-sensor-folder-store-updated',
                    meta: options.meta && typeof options.meta === 'object' ? options.meta : null
                });
            }
        };
    }

    function getFolderDepth(folderId, lookupMap) {
        let depth = 0;
        let current = lookupMap.get(folderId);
        while (current && current.parentId) {
            depth++;
            current = lookupMap.get(current.parentId);
            if (depth > 100) break;
        }
        return depth;
    }

    function collectDescendantIds(nextStore, rootId, scopedKey) {
        const results = [];
        const tree = nextStore[scopedKey];
        const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
        const children = nodes.filter((node) => node && node.parentId === rootId);
        children.forEach((child) => {
            results.push(child.id);
            results.push(...collectDescendantIds(nextStore, child.id, scopedKey));
        });
        return results;
    }

    ns._mergeHelpers = Object.assign(ns._mergeHelpers || {}, {
        buildStoreWriter,
        collectDescendantIds,
        getFolderDepth,
        isRawTitle,
        isSearchUrl,
        parseNum
    });
})(window.EveDuplicateSensor);
