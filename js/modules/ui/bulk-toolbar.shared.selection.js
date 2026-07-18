// --- BULK TOOLBAR SHARED STATE ---
window.EveBulkToolbar = window.EveBulkToolbar || {};
var bulkMode = window.bulkMode === true;
var selectedIds = window.selectedIds instanceof Set ? window.selectedIds : new Set();
var bulkLastToggledId = window.bulkLastToggledId ? String(window.bulkLastToggledId) : '';
window.bulkMode = bulkMode;
window.selectedIds = selectedIds;
window.bulkLastToggledId = bulkLastToggledId;

(function () {
    const ns = window.EveBulkToolbar;

    function syncBulkMode(nextValue) {
        bulkMode = !!nextValue;
        window.bulkMode = bulkMode;
        return bulkMode;
    }

    function getLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function setLinks(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined' && config) return config;
        return {};
    }

    function toBulkId(value) {
        return String(value);
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function hasUsableDatapackSnapshot(indexApi) {
        if (!indexApi) return false;
        const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        return typeof indexApi.hasUsableSnapshot === 'function'
            ? indexApi.hasUsableSnapshot()
            : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    }

    function hasReadableDatapackLinkSnapshot(indexApi) {
        if (!indexApi) return false;
        if (typeof indexApi.hasReadableLinkSnapshot === 'function') return !!indexApi.hasReadableLinkSnapshot();
        return hasUsableDatapackSnapshot(indexApi);
    }

    function getDatapackSnapshot(indexApi) {
        if (!hasReadableDatapackLinkSnapshot(indexApi) || typeof indexApi?.getSnapshot !== 'function') return null;
        return indexApi.getSnapshot();
    }

    function getDatapackStructureSummary(indexApi) {
        const hasReadableStructure = typeof indexApi?.hasReadableStructureSnapshot === 'function'
            ? !!indexApi.hasReadableStructureSnapshot()
            : hasUsableDatapackSnapshot(indexApi);
        if (!hasReadableStructure || typeof indexApi?.getStructureSummary !== 'function') return null;
        return indexApi.getStructureSummary();
    }

    function getIndexedRootLinkIds(indexApi, workspaceId, categoryName) {
        const snapshot = getDatapackSnapshot(indexApi);
        if (!Array.isArray(snapshot?.records)) return null;
        return snapshot.records.filter(function (record) {
            if (String(record?.type || '').trim() !== 'bookmark') return false;
            if (String(record?.workspaceId || '').trim() !== String(workspaceId || '').trim()) return false;
            if (String(record?.categoryName || 'Unsorted').trim() !== String(categoryName || 'Unsorted').trim()) return false;
            return !String(record?.path?.folderId || '').trim();
        }).map(function (record) {
            return toBulkId(record?.path?.linkId || record?.provenance?.linkId || '');
        }).filter(Boolean);
    }

    function clearSelection() {
        selectedIds.clear();
        window.selectedIds = selectedIds;
        bulkLastToggledId = '';
        window.bulkLastToggledId = bulkLastToggledId;
        return selectedIds;
    }

    function toggleSelectedId(id) {
        const selectedId = toBulkId(id);
        if (selectedIds.has(selectedId)) selectedIds.delete(selectedId);
        else selectedIds.add(selectedId);
        window.selectedIds = selectedIds;
        return selectedIds;
    }

    function addSelectedIds(ids) {
        (Array.isArray(ids) ? ids : []).forEach((id) => {
            const selectedId = toBulkId(id);
            if (selectedId) selectedIds.add(selectedId);
        });
        window.selectedIds = selectedIds;
        return selectedIds;
    }

    function removeSelectedIds(ids) {
        (Array.isArray(ids) ? ids : []).forEach((id) => {
            const selectedId = toBulkId(id);
            if (selectedId) selectedIds.delete(selectedId);
        });
        window.selectedIds = selectedIds;
        return selectedIds;
    }

    function setLastToggledId(id) {
        bulkLastToggledId = toBulkId(id);
        window.bulkLastToggledId = bulkLastToggledId;
        return bulkLastToggledId;
    }

    function getLastToggledId() {
        return bulkLastToggledId ? toBulkId(bulkLastToggledId) : '';
    }

    function applyRangeSelection(targetId, shouldSelect) {
        const lastId = getLastToggledId();
        const normalizedTargetId = toBulkId(targetId);
        if (!lastId || !normalizedTargetId || lastId === normalizedTargetId) return false;

        const orderedIds = Array.from(document.querySelectorAll('.bulk-check[data-bulk-id]'))
            .filter((checkbox) => checkbox && (checkbox.offsetParent !== null || checkbox.getClientRects().length > 0))
            .map((checkbox) => toBulkId(checkbox.getAttribute('data-bulk-id')))
            .filter(Boolean);

        const startIndex = orderedIds.indexOf(lastId);
        const endIndex = orderedIds.indexOf(normalizedTargetId);
        if (startIndex === -1 || endIndex === -1) return false;

        const rangeIds = orderedIds.slice(
            Math.min(startIndex, endIndex),
            Math.max(startIndex, endIndex) + 1
        );
        if (!rangeIds.length) return false;

        if (shouldSelect) addSelectedIds(rangeIds);
        else removeSelectedIds(rangeIds);
        return true;
    }

    function getSelectedLinks() {
        return getLinks().filter(link => selectedIds.has(toBulkId(link?.id)));
    }

    function normalizeScope(workspaceId, categoryName) {
        return {
            workspaceId: String(workspaceId || 'main').trim() || 'main',
            categoryName: String(categoryName || 'Unsorted').trim() || 'Unsorted'
        };
    }

    function addTouchedScope(scopes, workspaceId, categoryName) {
        const scope = normalizeScope(workspaceId, categoryName);
        scopes.set(scope.workspaceId + '::' + scope.categoryName, scope);
    }

    function buildSelectionSummary() {
        const selectedLinks = getSelectedLinks();
        const workspaceIds = new Set();
        const categoryNames = new Set();
        const folderIds = new Set();
        selectedLinks.forEach(function (link) {
            workspaceIds.add(String(link?.workspace || 'main').trim() || 'main');
            categoryNames.add(String(link?.category || 'Unsorted').trim() || 'Unsorted');
            const folderId = String(link?.folderId || '').trim();
            if (folderId) folderIds.add(folderId);
        });
        return {
            count: selectedLinks.length,
            workspaces: workspaceIds.size,
            cards: categoryNames.size,
            folders: folderIds.size,
            labels: Array.from(categoryNames).slice(0, 4)
        };
    }

    function formatSelectionSummary() {
        const summary = buildSelectionSummary();
        if (!summary.count) return 'No bookmarks selected.';
        const scopeBits = [
            `${summary.count} selected`,
            `${summary.workspaces} tab${summary.workspaces === 1 ? '' : 's'}`,
            `${summary.cards} card${summary.cards === 1 ? '' : 's'}`
        ];
        if (summary.folders) scopeBits.push(`${summary.folders} folder scope${summary.folders === 1 ? '' : 's'}`);
        const labelText = summary.labels.length ? ` (${summary.labels.join(', ')}${summary.cards > summary.labels.length ? ', ...' : ''})` : '';
        return scopeBits.join(' / ') + labelText;
    }

    function areAllIdsSelected(ids) {
        const normalized = (Array.isArray(ids) ? ids : []).map(toBulkId).filter(Boolean);
        return normalized.length > 0 && normalized.every((id) => selectedIds.has(id));
    }

    // Indexed link lookup for fast scope queries.
    // Pre-index links by workspace::category to avoid O(n) scans on every button update.
    let _scopeIndex = null;
    let _scopeIndexGen = 0;

    Object.assign(ns, {
        getBulkMode: function () { return !!bulkMode; },
        setBulkMode: syncBulkMode,
        getSelectedIds: function () { return selectedIds; },
        getLinks,
        setLinks,
        getConfig,
        toBulkId,
        getDatapackIndexApi,
        hasUsableDatapackSnapshot,
        hasReadableDatapackLinkSnapshot,
        getDatapackSnapshot,
        getDatapackStructureSummary,
        getIndexedRootLinkIds,
        clearSelection,
        toggleSelectedId,
        addSelectedIds,
        removeSelectedIds,
        areAllIdsSelected,
        getSelectedLinks,
        normalizeScope,
        addTouchedScope,
        buildSelectionSummary,
        formatSelectionSummary,
        applyRangeSelection,
        setLastToggledId,
        getLastToggledId
    });
})();
