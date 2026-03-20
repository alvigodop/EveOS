window.EveQuickPins = window.EveQuickPins || {};



(function () {

    const ns = window.EveQuickPins;

    const core = ns._core || {};

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

        getLinkById,

        getTargetContext,

        parseCardTargetId,

        parseFolderTargetId,

        getBookmarkContextFromLink,

        getFolderScopeType,

        buildPinRecord,

        normalizePins,

        normalizeTargetVisibilityScopeType

    } = core;

    if (ns.ready) return;



    function getPinLabel(pin) {

        const context = getTargetContext(pin);

        if (!context) return '';

        if (pin.targetType === 'bookmark') {

            const link = getLinkById(pin.targetId);

            return String(link?.title || 'Bookmark').trim() || 'Bookmark';

        }

        if (pin.targetType === 'card') {

            return context.categoryName;

        }

        if (pin.targetType === 'folder') {

            const folder = getFolderApi()?.getFolderById?.(context.workspaceId, context.categoryName, context.folderId);

            return String(folder?.name || 'Folder').trim() || 'Folder';

        }

        return '';

    }



    function getPinMeta(pin) {

        const context = getTargetContext(pin);

        if (!context) return '';

        if (pin.targetType === 'bookmark') {

            const folderLabel = context.folderId

                ? (getFolderApi()?.buildFolderPathLabel?.(context.workspaceId, context.categoryName, context.folderId) || '')

                : 'Root';

            const scopeLabel = pin.scopeType === 'folder'

                ? `Folder scoped`

                : (pin.scopeType === 'card' ? 'Card scoped' : 'Tab scoped');

            return `${context.categoryName} | ${folderLabel} | ${scopeLabel}`;

        }

        if (pin.targetType === 'card') {

            const scopeLabel = normalizeTargetVisibilityScopeType(pin.scopeType) === 'card' ? 'Focused card only' : 'Tab scoped';

            return `${context.categoryName} card | ${scopeLabel}`;

        }

        if (pin.targetType === 'folder') {

            const scopeLabel = normalizeTargetVisibilityScopeType(pin.scopeType) === 'card' ? 'Focused card only' : 'Tab scoped';

            return `${context.categoryName} | Folder | ${scopeLabel}`;

        }

        return '';

    }



    function getPinIcon(pin) {

        if (pin.targetType === 'bookmark') {

            const link = getLinkById(pin.targetId);

            return String(link?.icon || '').trim() || '\u{1F517}';

        }

        if (pin.targetType === 'card') return '\u{1F5C2}';

        if (pin.targetType === 'folder') return '\u{1F4C1}';

        return '\u{1F4CC}';

    }



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

        if (pin.targetType === 'card') {

            return normalizeTargetVisibilityScopeType(pin.scopeType) === 'card'

                ? activeCategory === resolved.categoryName

                : true;

        }

        if (pin.targetType === 'folder') {

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

                label: getPinLabel(pin),

                meta: getPinMeta(pin),

                icon: getPinIcon(pin)

            }))

            .filter((pin) => pin.label);

    }



    function activateBookmarkPin(pin) {

        const link = getLinkById(pin?.targetId);

        if (!link) return false;

        const clickBehaviorApi = window.EveBookmarkClickBehavior;

        const resolution = clickBehaviorApi?.resolveBehaviorForLink

            ? clickBehaviorApi.resolveBehaviorForLink(link)

            : {

                openLink: !!getConfig().bookmarkClickOpensLink,

                openFocus: true

            };

        if (resolution.openLink) {

            const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(String(link.url || '').trim()) : String(link.url || '').trim();

            if (safeUrl) window.open(safeUrl, '_blank', 'noopener,noreferrer');

        }

        if (resolution.openFocus && typeof window.openBookmarkFocusModal === 'function') {

            window.openBookmarkFocusModal(link.id);

        }

        return true;

    }



    function activateCardTarget(workspaceId, categoryName, afterRender) {

        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);

        const targetCategoryName = normalizeCategoryName(categoryName);

        if (String(getConfig().activeWorkspace || '') !== targetWorkspaceId && typeof switchWorkspace === 'function') {

            switchWorkspace(targetWorkspaceId);

        }

        if (typeof setFocus === 'function') {

            setFocus(targetCategoryName);

        } else if (typeof renderDashboard === 'function') {

            renderDashboard();

        }

        window.setTimeout(function () {

            const cardNode = Array.from(document.querySelectorAll('.category-card[data-card-target-id]')).find((node) => node.getAttribute('data-card-target-id') === buildCardTargetId(targetWorkspaceId, targetCategoryName));

            if (cardNode?.scrollIntoView) {

                cardNode.scrollIntoView({ behavior: 'smooth', block: 'start' });

            }

            if (typeof afterRender === 'function') afterRender();

        }, 80);

        return true;

    }



    function activateFolderPin(pin) {

        const target = parseFolderTargetId(pin?.targetId);

        if (!target.folderId) return false;

        return activateCardTarget(target.workspaceId, target.categoryName, function () {

            const targetId = buildFolderTargetId(target.workspaceId, target.categoryName, target.folderId);

            const folderNode = Array.from(document.querySelectorAll('[data-bookmark-folder-target-id]')).find((node) => node.getAttribute('data-bookmark-folder-target-id') === targetId);

            if (folderNode) {

                if (typeof folderNode.open === 'boolean') folderNode.open = true;

                folderNode.scrollIntoView({ behavior: 'smooth', block: 'start' });

            }

        });

    }



    function activateCardPin(pin) {

        const target = parseCardTargetId(pin?.targetId);

        return activateCardTarget(target.workspaceId, target.categoryName);

    }



    function activatePin(pinId) {

        const targetPin = getPins().find((pin) => toId(pin.id) === toId(pinId));

        if (!targetPin) return false;

        if (targetPin.targetType === 'bookmark') return activateBookmarkPin(targetPin);

        if (targetPin.targetType === 'card') return activateCardPin(targetPin);

        if (targetPin.targetType === 'folder') return activateFolderPin(targetPin);

        return false;

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



    function filterPinsForFolder(workspaceId, categoryName, folderId) {

        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);

        const targetCategoryName = normalizeCategoryName(categoryName);

        const targetFolderId = toId(folderId);

        if (!targetFolderId) return [];

        const folderApi = getFolderApi();

        const view = folderApi?.buildFolderView?.(targetWorkspaceId, targetCategoryName, getLinks().filter((link) => (

            normalizeWorkspaceId(link?.workspace) === targetWorkspaceId

            && normalizeCategoryName(link?.category) === targetCategoryName

        )));

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

        const filteredExisting = getPins().filter((pin) => !filterPinsForFolder(workspaceId, categoryName, folderId).some((existing) => existing.id === pin.id));

        writeStore(filteredExisting.concat(normalizePins(incomingPins)), options);

    }



    Object.assign(ns, {

        getActiveDockPins,

        activatePin,

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



    ns.ready = true;

})();

