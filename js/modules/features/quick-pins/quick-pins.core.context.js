window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core = ns._core || {};
    const {
        BOOKMARK_SCOPE_OPTIONS,
        TARGET_VISIBILITY_SCOPE_OPTIONS,
        toId,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeBookmarkScopeType,
        normalizeTargetVisibilityScopeType,
        buildCardTargetId,
        buildFolderTargetId,
        parseCardTargetId,
        parseFolderTargetId,
        getFolderApi,
        getLinkById,
        getLinks,
        getPins
    } = core;

function getBookmarkContextFromLink(link) {

        if (!link) return null;

        return {

            workspaceId: normalizeWorkspaceId(link.workspace),

            categoryName: normalizeCategoryName(link.category),

            folderId: toId(link.folderId)

        };

    }



    function getTargetContext(pin) {

        if (!pin || typeof pin !== 'object') return null;

        if (pin.targetType === 'bookmark') {

            const link = getLinkById(pin.targetId);

            return link ? getBookmarkContextFromLink(link) : null;

        }

        if (pin.targetType === 'card') {

            return parseCardTargetId(pin.targetId);

        }

        if (pin.targetType === 'folder') {

            return parseFolderTargetId(pin.targetId);

        }

        return null;

    }



    function isBookmarkPinned(linkId) {

        const targetId = toId(linkId);

        return getPins().some((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === targetId);

    }



    function getBookmarkScopeType(linkId) {

        const targetId = toId(linkId);

        const currentPin = getPins().find((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === targetId);

        return currentPin ? normalizeBookmarkScopeType(currentPin.scopeType) : 'tab';

    }



    function getBookmarkScopeOptions(linkOrLinkId) {

        const link = typeof linkOrLinkId === 'object' && linkOrLinkId

            ? linkOrLinkId

            : getLinkById(linkOrLinkId);

        const folderId = toId(link?.folderId);

        return BOOKMARK_SCOPE_OPTIONS.filter((option) => option.value !== 'folder' || !!folderId);

    }



    function resolveDefaultBookmarkScopeType(linkOrLinkId) {

        const link = typeof linkOrLinkId === 'object' && linkOrLinkId

            ? linkOrLinkId

            : getLinkById(linkOrLinkId);

        if (!link) return 'tab';

        return toId(link.folderId) ? 'folder' : 'card';

    }



    function isCardPinned(workspaceId, categoryName) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        return getPins().some((pin) => pin.targetType === 'card' && pin.targetId === targetId);

    }



    function getCardScopeType(workspaceId, categoryName) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        const currentPin = getPins().find((pin) => pin.targetType === 'card' && pin.targetId === targetId);

        return currentPin ? normalizeTargetVisibilityScopeType(currentPin.scopeType) : 'tab';

    }



    function isFolderPinned(workspaceId, categoryName, folderId) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        return !!targetId && getPins().some((pin) => pin.targetType === 'folder' && pin.targetId === targetId);

    }



    function getFolderScopeType(workspaceId, categoryName, folderId) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        const currentPin = getPins().find((pin) => pin.targetType === 'folder' && pin.targetId === targetId);

        return currentPin ? normalizeTargetVisibilityScopeType(currentPin.scopeType) : 'tab';

    }



    function getTargetVisibilityScopeOptions() {

        return TARGET_VISIBILITY_SCOPE_OPTIONS.slice();

    }



    function describeTargetVisibilityScope(scopeType) {

        return normalizeTargetVisibilityScopeType(scopeType) === 'card'

            ? 'Show this pin only while the card is focused.'

            : 'Show this pin anywhere on the current tab.';

    }



    

function getCardLinks(workspaceId, categoryName) {

        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);

        const targetCategoryName = normalizeCategoryName(categoryName);

        return getLinks().filter((link) => (

            normalizeWorkspaceId(link?.workspace) === targetWorkspaceId

            && normalizeCategoryName(link?.category) === targetCategoryName

        ));

    }



    function getFolderSubtreeIds(workspaceId, categoryName, folderId) {

        const targetFolderId = toId(folderId);

        if (!targetFolderId) return [];

        const folderApi = getFolderApi();

        const view = folderApi?.buildFolderView?.(normalizeWorkspaceId(workspaceId), normalizeCategoryName(categoryName), getCardLinks(workspaceId, categoryName));

        const childrenMap = view?.childrenMap;

        const subtreeIds = new Set([targetFolderId]);

        if (childrenMap && typeof childrenMap.get === 'function') {

            const pending = [targetFolderId];

            while (pending.length) {

                const currentId = pending.pop();

                (childrenMap.get(currentId) || []).forEach((child) => {

                    const childId = toId(child?.id);

                    if (childId && !subtreeIds.has(childId)) {

                        subtreeIds.add(childId);

                        pending.push(childId);

                    }

                });

            }

        }

        return Array.from(subtreeIds);

    }



    function getDirectFolderLinks(workspaceId, categoryName, folderId) {

        const targetFolderId = toId(folderId);

        if (!targetFolderId) return [];

        return getCardLinks(workspaceId, categoryName).filter((link) => toId(link?.folderId) === targetFolderId);

    }



    function getFolderSubtreeLinks(workspaceId, categoryName, folderId) {

        const subtreeIds = new Set(getFolderSubtreeIds(workspaceId, categoryName, folderId));

        if (!subtreeIds.size) return [];

        return getCardLinks(workspaceId, categoryName).filter((link) => subtreeIds.has(toId(link?.folderId)));

    }



    function getCardRootLinks(workspaceId, categoryName) {

        return getCardLinks(workspaceId, categoryName).filter((link) => !toId(link?.folderId));

    }



    

    Object.assign(core, {
        getBookmarkContextFromLink,
        getTargetContext,
        isBookmarkPinned,
        getBookmarkScopeType,
        getBookmarkScopeOptions,
        resolveDefaultBookmarkScopeType,
        isCardPinned,
        getCardScopeType,
        isFolderPinned,
        getFolderScopeType,
        getTargetVisibilityScopeOptions,
        describeTargetVisibilityScope,
        getCardLinks,
        getFolderSubtreeIds,
        getDirectFolderLinks,
        getFolderSubtreeLinks,
        getCardRootLinks
    });
})();
