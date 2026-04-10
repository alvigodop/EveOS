window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core || {};
    const runtime = ns._main = ns._main || {};
    if (runtime.activationLoaded) return;

    const {
        getPins,
        getConfig,
        getLinkById,
        toId,
        normalizeWorkspaceId,
        normalizeCategoryName,
        parseCardTargetId,
        parseFolderTargetId,
        buildCardTargetId,
        buildFolderTargetId
    } = core;

    function activateBookmarkPin(pin) {
        const link = getLinkById(pin?.targetId);
        if (!link) return false;
        const clickBehaviorApi = window.EveBookmarkClickBehavior;
        const resolution = clickBehaviorApi?.resolveBehaviorForLink
            ? clickBehaviorApi.resolveBehaviorForLink(link)
            : {
                openTarget: !!getConfig().bookmarkClickOpensLink ? 'newtab' : 'none',
                openLink: !!getConfig().bookmarkClickOpensLink,
                openFocus: true
            };
        if (resolution.openTarget && resolution.openTarget !== 'none') {
            const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(String(link.url || '').trim()) : String(link.url || '').trim();
            if (safeUrl) {
                const popupHelper = window.EveBookmarkFocus?.openInternalView;
                if (resolution.openTarget === 'internal' && typeof popupHelper === 'function') {
                    popupHelper(safeUrl, String(link.title || safeUrl).trim() || safeUrl);
                } else if (resolution.openTarget === 'internal' && window.PopupManager && typeof window.PopupManager.openPopup === 'function') {
                    window.PopupManager.openPopup(safeUrl, String(link.title || safeUrl).trim() || safeUrl);
                } else {
                    window.open(safeUrl, '_blank', 'noopener,noreferrer');
                }
            }
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
            const targetCardId = buildCardTargetId(targetWorkspaceId, targetCategoryName);
            const cardNode = Array.from(document.querySelectorAll('.category-card[data-card-target-id]')).find((node) => node.getAttribute('data-card-target-id') === targetCardId);
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

    Object.assign(runtime, {
        activateBookmarkPin,
        activateCardTarget,
        activateFolderPin,
        activateCardPin,
        activatePin
    });

    runtime.activationLoaded = true;
})();
