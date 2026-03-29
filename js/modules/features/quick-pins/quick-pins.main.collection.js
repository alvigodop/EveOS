window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core || {};
    const runtime = ns._main = ns._main || {};
    if (runtime.collectionLoaded) return;

    const {
        getLinks,
        getFolderApi,
        getPins,
        removePins,
        writeStore,
        toId,
        normalizeCategoryName,
        normalizeWorkspaceId,
        getConfig,
        getTargetContext,
        normalizePins,
        normalizeTargetVisibilityScopeType
    } = core;

    function isPinVisibleInContext(pin, context = {}) {
        const resolved = getTargetContext(pin);
        if (!resolved) return false;
        const activeWorkspace = normalizeWorkspaceId(context.activeWorkspace || getConfig().activeWorkspace);
        const rawFocusCategory = toId(context.focusCategory);
        const activeCategory = rawFocusCategory ? normalizeCategoryName(rawFocusCategory) : '';
        if (resolved.workspaceId !== activeWorkspace) return false;
        if (pin.targetType === 'bookmark') {
            if (pin.scopeType === 'tab') return true;
            if (pin.scopeType === 'card') return !activeCategory || activeCategory === resolved.categoryName;
            if (pin.scopeType === 'folder') return !!resolved.folderId && (!activeCategory || activeCategory === resolved.categoryName);
            return true;
        }
        if (pin.targetType === 'card' || pin.targetType === 'folder') {
            return normalizeTargetVisibilityScopeType(pin.scopeType) === 'card'
                ? activeCategory === resolved.categoryName
                : true;
        }
        return true;
    }

    function getActiveDockPins(context = {}) {
        return getPins()
            .filter((pin) => isPinVisibleInContext(pin, context))
            .map((pin) => ({
                ...pin,
                label: runtime.getPinLabel(pin),
                meta: runtime.getPinMeta(pin),
                icon: runtime.getPinIcon(pin)
            }))
            .filter((pin) => pin.label);
    }

    function removePin(pinId, options = {}) {
        const normalizedId = toId(pinId);
        return removePins((pin) => toId(pin.id) === normalizedId, options);
    }

    function movePin(pinId, direction, options = {}) {
        const normalizedId = toId(pinId);
        const pins = getPins();
        if (!normalizedId || !pins.length) return false;

        const step = direction === 'left' || direction === -1 ? -1 : 1;
        const existingIds = new Set(pins.map((pin) => toId(pin.id)).filter(Boolean));
        const requestedSubset = Array.isArray(options.visiblePinIds)
            ? options.visiblePinIds.map(toId).filter((id) => existingIds.has(id))
            : pins.map((pin) => toId(pin.id));
        const subsetIds = Array.from(new Set(requestedSubset));
        const subsetIndex = subsetIds.indexOf(normalizedId);
        if (subsetIndex < 0) return false;

        const targetIndex = subsetIndex + step;
        if (targetIndex < 0 || targetIndex >= subsetIds.length) return false;

        const reorderedSubsetIds = subsetIds.slice();
        [reorderedSubsetIds[subsetIndex], reorderedSubsetIds[targetIndex]] = [reorderedSubsetIds[targetIndex], reorderedSubsetIds[subsetIndex]];

        const subsetIdSet = new Set(reorderedSubsetIds);
        const pinsById = new Map(pins.map((pin) => [toId(pin.id), pin]));
        let replacementIndex = 0;
        const nextPins = pins.map((pin) => {
            const currentId = toId(pin.id);
            if (!subsetIdSet.has(currentId)) return pin;
            const replacementId = reorderedSubsetIds[replacementIndex++];
            return pinsById.get(replacementId) || pin;
        }).map((pin, index) => ({ ...pin, order: index }));

        writeStore(nextPins, options);
        return true;
    }

    function filterPinsForWorkspace(workspaceId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        return getPins().filter((pin) => getTargetContext(pin)?.workspaceId === targetWorkspaceId);
    }

    function filterPinsForCard(workspaceId, categoryName) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        return getPins().filter((pin) => {
            const context = getTargetContext(pin);
            return context?.workspaceId === targetWorkspaceId && context?.categoryName === targetCategoryName;
        });
    }

    function filterPinsForBookmark(linkId) {
        const targetId = toId(linkId);
        return getPins().filter((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === targetId);
    }

    function buildFolderPinSubtreeIds(workspaceId, categoryName, folderId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const targetFolderId = toId(folderId);
        const subtreeIds = new Set();
        if (!targetFolderId) return subtreeIds;

        const folderApi = getFolderApi();
        const view = folderApi?.buildFolderView?.(targetWorkspaceId, targetCategoryName, getLinks().filter((link) => (
            normalizeWorkspaceId(link?.workspace) === targetWorkspaceId
            && normalizeCategoryName(link?.category) === targetCategoryName
        )));
        const childrenMap = view?.childrenMap;
        subtreeIds.add(targetFolderId);

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

        return subtreeIds;
    }

    function filterPinsForFolder(workspaceId, categoryName, folderId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const subtreeIds = buildFolderPinSubtreeIds(targetWorkspaceId, targetCategoryName, folderId);
        if (!subtreeIds.size) return [];

        return getPins().filter((pin) => {
            const context = getTargetContext(pin);
            if (!context || context.workspaceId !== targetWorkspaceId || context.categoryName !== targetCategoryName) return false;
            if (pin.targetType === 'folder') {
                return subtreeIds.has(context.folderId);
            }
            if (pin.targetType === 'bookmark') {
                return subtreeIds.has(toId(context.folderId));
            }
            return false;
        });
    }

    function replacePinsForWorkspace(workspaceId, incomingPins, options = {}) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const next = getPins().filter((pin) => getTargetContext(pin)?.workspaceId !== targetWorkspaceId).concat(normalizePins(incomingPins));
        writeStore(next, options);
    }

    function replacePinsForCard(workspaceId, categoryName, incomingPins, options = {}) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const next = getPins().filter((pin) => {
            const context = getTargetContext(pin);
            return !(context?.workspaceId === targetWorkspaceId && context?.categoryName === targetCategoryName);
        }).concat(normalizePins(incomingPins));
        writeStore(next, options);
    }

    function replacePinsForBookmark(linkId, incomingPins, options = {}) {
        const targetId = toId(linkId);
        const next = getPins().filter((pin) => !(pin.targetType === 'bookmark' && toId(pin.targetId) === targetId)).concat(normalizePins(incomingPins));
        writeStore(next, options);
    }

    function replacePinsForFolder(workspaceId, categoryName, folderId, incomingPins, options = {}) {
        const existingIds = new Set(filterPinsForFolder(workspaceId, categoryName, folderId).map((pin) => toId(pin.id)));
        const filteredExisting = getPins().filter((pin) => !existingIds.has(toId(pin.id)));
        writeStore(filteredExisting.concat(normalizePins(incomingPins)), options);
    }

    Object.assign(runtime, {
        isPinVisibleInContext,
        getActiveDockPins,
        removePin,
        movePin,
        filterPinsForWorkspace,
        filterPinsForCard,
        filterPinsForFolder,
        filterPinsForBookmark,
        replacePinsForWorkspace,
        replacePinsForCard,
        replacePinsForFolder,
        replacePinsForBookmark
    });

    runtime.collectionLoaded = true;
})();
