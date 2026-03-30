/**
 * Unified State Store Capture Scoped Pin Helpers
 */
window.EveDataStore = window.EveDataStore || {};
window.EveDataStore.CaptureModules = window.EveDataStore.CaptureModules || {};

(function () {
    window.EveDataStore.CaptureModules.createCaptureScopedPinHelpers = function createCaptureScopedPinHelpers(base, sharedHelpers) {
        const getLinks = base.getLinks;
        const cloneBookmarkFolders = base.cloneBookmarkFolders;
        const cloneQuickPins = base.cloneQuickPins;
        const parseCardTargetId = sharedHelpers.parseCardTargetId;
        const parseFolderTargetId = sharedHelpers.parseFolderTargetId;
        const getScopedFolderNodes = sharedHelpers.getScopedFolderNodes;
        const buildFolderMaps = sharedHelpers.buildFolderMaps;
        const collectFolderSubtreeIds = sharedHelpers.collectFolderSubtreeIds;

        function getPinContext(pin) {
            if (!pin || typeof pin !== 'object') return null;
            const targetType = String(pin.targetType || '').trim().toLowerCase();
            if (targetType === 'bookmark') {
                const targetId = String(pin.targetId || '').trim();
                const link = getLinks().find((entry) => String(entry?.id || '').trim() === targetId);
                if (!link) return null;
                return {
                    workspaceId: String(link.workspace || 'main').trim() || 'main',
                    categoryName: String(link.category || 'Unsorted').trim() || 'Unsorted',
                    folderId: String(link.folderId || '').trim()
                };
            }
            if (targetType === 'card') return parseCardTargetId(pin.targetId);
            if (targetType === 'folder') return parseFolderTargetId(pin.targetId);
            return null;
        }

        function clonePinsByPredicate(predicate) {
            return (cloneQuickPins() || [])
                .filter((pin) => predicate(pin, getPinContext(pin)))
                .map((pin) => ({ ...(pin || {}) }));
        }

        function filterPinsForWorkspace(workspaceId) {
            const normalizedWorkspace = String(workspaceId || 'main').trim() || 'main';
            return clonePinsByPredicate((_pin, context) => (
                !!context && String(context.workspaceId || 'main') === normalizedWorkspace
            ));
        }

        function filterPinsForCard(workspaceId, categoryName) {
            const normalizedWorkspace = String(workspaceId || 'main').trim() || 'main';
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            return clonePinsByPredicate((_pin, context) => (
                !!context
                && String(context.workspaceId || 'main') === normalizedWorkspace
                && String(context.categoryName || 'Unsorted') === normalizedCategory
            ));
        }

        function filterPinsForBookmark(linkId) {
            const normalizedLinkId = String(linkId || '').trim();
            if (!normalizedLinkId) return [];
            return clonePinsByPredicate((pin) => (
                String(pin?.targetType || '').trim().toLowerCase() === 'bookmark'
                && String(pin?.targetId || '').trim() === normalizedLinkId
            ));
        }

        function filterPinsForFolder(workspaceId, categoryName, folderId) {
            const normalizedWorkspace = String(workspaceId || 'main').trim() || 'main';
            const normalizedCategory = String(categoryName || 'Unsorted').trim() || 'Unsorted';
            const normalizedFolderId = String(folderId || '').trim();
            if (!normalizedFolderId) return [];

            const scopedNodes = getScopedFolderNodes(cloneBookmarkFolders(), normalizedWorkspace, normalizedCategory);
            const { childrenByParent } = buildFolderMaps(scopedNodes);
            const subtreeIds = collectFolderSubtreeIds(normalizedFolderId, childrenByParent);
            return clonePinsByPredicate((pin, context) => {
                if (!context) return false;
                if (String(context.workspaceId || 'main') !== normalizedWorkspace) return false;
                if (String(context.categoryName || 'Unsorted') !== normalizedCategory) return false;
                const targetType = String(pin?.targetType || '').trim().toLowerCase();
                if (targetType === 'folder') {
                    return subtreeIds.has(String(context.folderId || '').trim());
                }
                if (targetType === 'bookmark') {
                    return subtreeIds.has(String(context.folderId || '').trim());
                }
                return false;
            });
        }

        return {
            getPinContext,
            clonePinsByPredicate,
            filterPinsForWorkspace,
            filterPinsForCard,
            filterPinsForBookmark,
            filterPinsForFolder
        };
    };
})();
