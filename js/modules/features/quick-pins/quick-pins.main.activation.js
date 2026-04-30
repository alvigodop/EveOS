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
        getTargetContext,
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

    function ensureGridMode() {
        const currentConfig = getConfig();
        if (!currentConfig || currentConfig.viewMode === 'grid') return;
        currentConfig.viewMode = 'grid';
        if (typeof saveConfig === 'function') saveConfig();
    }

    function findBookmarkNode(linkId) {
        const targetId = toId(linkId);
        if (!targetId) return null;
        const dataNode = Array.from(document.querySelectorAll('[data-link-id]')).find((node) => (
            toId(node.getAttribute('data-link-id')) === targetId
        ));
        if (dataNode) return dataNode;
        const bulkNode = Array.from(document.querySelectorAll('.bulk-check[data-bulk-id]')).find((node) => (
            toId(node.getAttribute('data-bulk-id')) === targetId
        ));
        return bulkNode ? bulkNode.closest('li') : null;
    }

    function ensureBookmarkRendered(linkId) {
        if (findBookmarkNode(linkId)) return true;
        const targetId = toId(linkId);
        const progressiveStore = window._eveProgressiveLinks || {};
        if (!targetId || typeof window._eveLoadMoreLinks !== 'function') return false;

        for (let attempt = 0; attempt < 30; attempt += 1) {
            const entry = Object.entries(progressiveStore).find(([buttonId, store]) => {
                if (!document.getElementById(buttonId)) return false;
                const links = Array.isArray(store?.links) ? store.links : [];
                return links.some((link) => toId(link?.id) === targetId);
            });
            if (!entry) return false;
            window._eveLoadMoreLinks(entry[0]);
            if (findBookmarkNode(targetId)) return true;
        }
        return !!findBookmarkNode(targetId);
    }

    function highlightBookmarkNode(linkId) {
        ensureBookmarkRendered(linkId);
        const node = findBookmarkNode(linkId);
        if (!node) return false;

        document.querySelectorAll('.quick-pin-reveal-target').forEach((entry) => {
            entry.classList.remove('quick-pin-reveal-target');
            delete entry.dataset.quickPinRevealToken;
        });
        const revealToken = String(Date.now());
        node.dataset.quickPinRevealToken = revealToken;
        node.classList.add('quick-pin-reveal-target');
        if (typeof window.markDashboardProgrammaticScrollWindow === 'function') {
            window.markDashboardProgrammaticScrollWindow(220);
        }
        if (node.scrollIntoView) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
        window.setTimeout(function () {
            if (node.dataset.quickPinRevealToken !== revealToken) return;
            node.classList.remove('quick-pin-reveal-target');
            delete node.dataset.quickPinRevealToken;
        }, 4200);
        return true;
    }

    function revealBookmarkInCard(pinOrId) {
        const targetPin = (pinOrId && typeof pinOrId === 'object')
            ? pinOrId
            : getPins().find((pin) => toId(pin.id) === toId(pinOrId) || toId(pin.targetId) === toId(pinOrId));
        const targetId = toId(targetPin?.targetId || pinOrId);
        const link = getLinkById(targetId);
        if (!link) return false;

        const context = getTargetContext(targetPin) || {
            workspaceId: normalizeWorkspaceId(link.workspace),
            categoryName: normalizeCategoryName(link.category),
            folderId: toId(link.folderId)
        };
        if (!context?.workspaceId || !context?.categoryName) return false;

        ensureGridMode();
        return activateCardTarget(context.workspaceId, context.categoryName, function () {
            const linkId = toId(link.id || targetId);
            window.setTimeout(function () {
                if (context.folderId && window.EveFolderViewV2?.enterFolder) {
                    window.EveFolderViewV2.enterFolder(null, context.categoryName, context.folderId, context.workspaceId, {
                        preservePageScroll: false,
                        source: 'quick-pin-bookmark-reveal'
                    });
                    window.setTimeout(function () {
                        highlightBookmarkNode(linkId);
                    }, 80);
                    return;
                }

                if (!context.folderId && window.EveFolderViewV2?.exitFolder) {
                    const activeFolderKey = `${context.workspaceId}::${context.categoryName}`;
                    if (getConfig()?.activeManhwaFolders?.[activeFolderKey]) {
                        window.EveFolderViewV2.exitFolder(null, context.categoryName, context.workspaceId);
                    }
                }
                window.setTimeout(function () {
                    highlightBookmarkNode(linkId);
                }, 40);
            }, 40);
        });
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
        revealBookmarkInCard,
        activateCardTarget,
        activateFolderPin,
        activateCardPin,
        activatePin
    });

    runtime.activationLoaded = true;
})();
