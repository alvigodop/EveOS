window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core = ns._core || {};
    const {
        toId,
        getLinkById,
        getPins,
        writeStore,
        buildPinRecord,
        normalizeBookmarkScopeType,
        normalizeTargetVisibilityScopeType,
        getBookmarkScopeOptions,
        resolveDefaultBookmarkScopeType,
        isBookmarkPinned,
        buildCardTargetId,
        isCardPinned,
        buildFolderTargetId,
        isFolderPinned,
        getCardLinks,
        getFolderSubtreeLinks,
        getCardRootLinks
    } = core;

function removePins(predicate, options = {}) {

        const nextPins = getPins().filter((pin) => !predicate(pin));

        return writeStore(nextPins, options);

    }



    function upsertPin(nextPin, options = {}) {

        const normalizedPin = buildPinRecord(nextPin, getPins().length);

        if (!normalizedPin) return getPins();

        const filtered = getPins().filter((pin) => !(pin.targetType === normalizedPin.targetType && pin.targetId === normalizedPin.targetId));

        filtered.push({ ...normalizedPin, order: filtered.length });

        return writeStore(filtered, options);

    }



    function toggleBookmarkPin(linkId, options = {}) {

        const normalizedLinkId = toId(linkId);

        if (!normalizedLinkId || !getLinkById(normalizedLinkId)) return false;

        if (isBookmarkPinned(normalizedLinkId)) {

            removePins((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === normalizedLinkId, options);

            return false;

        }

        upsertPin({

            targetType: 'bookmark',

            targetId: normalizedLinkId,

            scopeType: normalizeBookmarkScopeType(options.scopeType || resolveDefaultBookmarkScopeType(normalizedLinkId))

        }, options);

        return true;

    }



    function setBookmarkScopeType(linkId, scopeType, options = {}) {

        const normalizedLinkId = toId(linkId);

        const link = getLinkById(normalizedLinkId);

        if (!normalizedLinkId || !link || !isBookmarkPinned(normalizedLinkId)) return false;

        const allowedScopeTypes = new Set(getBookmarkScopeOptions(link).map((option) => option.value));

        const normalizedScopeType = allowedScopeTypes.has(normalizeBookmarkScopeType(scopeType))

            ? normalizeBookmarkScopeType(scopeType)

            : 'tab';

        upsertPin({

            targetType: 'bookmark',

            targetId: normalizedLinkId,

            scopeType: normalizedScopeType

        }, options);

        return true;

    }



    

function upsertBookmarkPins(linkIds, scopeType, options = {}) {

        const validIds = Array.from(new Set((Array.isArray(linkIds) ? linkIds : []).map(toId).filter((linkId) => !!getLinkById(linkId))));

        if (!validIds.length) return getPins();

        const requestedScopeType = normalizeBookmarkScopeType(scopeType);

        const existingPins = getPins();

        const nonTargetPins = existingPins.filter((pin) => !(pin.targetType === 'bookmark' && validIds.includes(toId(pin.targetId))));

        const nextPins = nonTargetPins.concat(validIds.map((linkId, index) => {

            const link = getLinkById(linkId);

            const allowedScopeTypes = new Set(getBookmarkScopeOptions(link).map((option) => option.value));

            const normalizedScopeType = allowedScopeTypes.has(requestedScopeType) ? requestedScopeType : 'tab';

            return {

                id: `pin-bookmark-${linkId}`,

                targetType: 'bookmark',

                targetId: linkId,

                scopeType: normalizedScopeType,

                order: nonTargetPins.length + index

            };

        }));

        return writeStore(nextPins, options);

    }



    function removeBookmarkPinsByLinkIds(linkIds, options = {}) {

        const validIds = new Set((Array.isArray(linkIds) ? linkIds : []).map(toId).filter(Boolean));

        return removePins((pin) => pin.targetType === 'bookmark' && validIds.has(toId(pin.targetId)), options);

    }



    function bulkPinBookmarks(linkIds, options = {}) {

        const validIds = Array.from(new Set((Array.isArray(linkIds) ? linkIds : []).map(toId).filter((linkId) => !!getLinkById(linkId))));

        if (!validIds.length) return getPins();



        const preserveExisting = options.preserveExisting !== false;

        const requestedScopeType = toId(options.scopeType) ? normalizeBookmarkScopeType(options.scopeType) : '';

        const nextPins = getPins().slice();



        validIds.forEach((linkId) => {

            const link = getLinkById(linkId);

            if (!link) return;



            const existingIndex = nextPins.findIndex((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === linkId);

            if (existingIndex >= 0 && preserveExisting && !requestedScopeType) {

                return;

            }



            const allowedScopeTypes = new Set(getBookmarkScopeOptions(link).map((option) => option.value));

            const fallbackScopeType = resolveDefaultBookmarkScopeType(link);

            const resolvedScopeType = allowedScopeTypes.has(requestedScopeType)

                ? requestedScopeType

                : (allowedScopeTypes.has(fallbackScopeType) ? fallbackScopeType : 'tab');



            const nextPin = {

                id: existingIndex >= 0 ? nextPins[existingIndex].id : `pin-bookmark-${linkId}`,

                targetType: 'bookmark',

                targetId: linkId,

                scopeType: resolvedScopeType,

                order: existingIndex >= 0 ? nextPins[existingIndex].order : nextPins.length

            };



            if (existingIndex >= 0) nextPins[existingIndex] = nextPin;

            else nextPins.push(nextPin);

        });



        return writeStore(nextPins, options);

    }



    function bulkUnpinBookmarks(linkIds, options = {}) {

        return removeBookmarkPinsByLinkIds(linkIds, options);

    }



    function pinCardRootBookmarks(workspaceId, categoryName, options = {}) {

        const rootLinkIds = getCardRootLinks(workspaceId, categoryName).map((link) => link?.id);

        return upsertBookmarkPins(rootLinkIds, options.scopeType || 'card', options);

    }



    function unpinCardBookmarks(workspaceId, categoryName, options = {}) {

        const cardLinkIds = getCardLinks(workspaceId, categoryName).map((link) => link?.id);

        return removeBookmarkPinsByLinkIds(cardLinkIds, options);

    }



    function pinFolderBookmarks(workspaceId, categoryName, folderId, options = {}) {

        const folderLinkIds = getFolderSubtreeLinks(workspaceId, categoryName, folderId).map((link) => link?.id);

        return upsertBookmarkPins(folderLinkIds, options.scopeType || 'folder', options);

    }



    function unpinFolderBookmarks(workspaceId, categoryName, folderId, options = {}) {

        const folderLinkIds = getFolderSubtreeLinks(workspaceId, categoryName, folderId).map((link) => link?.id);

        return removeBookmarkPinsByLinkIds(folderLinkIds, options);

    }



    function toggleCardPin(workspaceId, categoryName, options = {}) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        if (!targetId) return false;

        if (isCardPinned(workspaceId, categoryName)) {

            removePins((pin) => pin.targetType === 'card' && pin.targetId === targetId, options);

            return false;

        }

        upsertPin({ targetType: 'card', targetId, scopeType: normalizeTargetVisibilityScopeType(options.scopeType || 'tab') }, options);

        return true;

    }



    function toggleFolderPin(workspaceId, categoryName, folderId, options = {}) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        if (!targetId) return false;

        if (isFolderPinned(workspaceId, categoryName, folderId)) {

            removePins((pin) => pin.targetType === 'folder' && pin.targetId === targetId, options);

            return false;

        }

        upsertPin({ targetType: 'folder', targetId, scopeType: normalizeTargetVisibilityScopeType(options.scopeType || 'tab') }, options);

        return true;

    }



    function setCardScopeType(workspaceId, categoryName, scopeType, options = {}) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        const currentPin = getPins().find((pin) => pin.targetType === 'card' && pin.targetId === targetId);

        if (!currentPin) return false;

        upsertPin({

            ...currentPin,

            scopeType: normalizeTargetVisibilityScopeType(scopeType)

        }, options);

        return true;

    }



    function setFolderScopeType(workspaceId, categoryName, folderId, scopeType, options = {}) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        const currentPin = getPins().find((pin) => pin.targetType === 'folder' && pin.targetId === targetId);

        if (!currentPin) return false;

        upsertPin({

            ...currentPin,

            scopeType: normalizeTargetVisibilityScopeType(scopeType)

        }, options);

        return true;

    }
    

    Object.assign(core, {
        removePins,
        upsertPin,
        toggleBookmarkPin,
        setBookmarkScopeType,
        upsertBookmarkPins,
        removeBookmarkPinsByLinkIds,
        bulkPinBookmarks,
        bulkUnpinBookmarks,
        pinCardRootBookmarks,
        unpinCardBookmarks,
        pinFolderBookmarks,
        unpinFolderBookmarks,
        toggleCardPin,
        toggleFolderPin,
        setCardScopeType,
        setFolderScopeType
    });
})();
