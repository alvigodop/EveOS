(function () {
    const core = window.EveCategorySettingsModalCore || {};
    const {
        escapeCategorySettingsHtml,
        getFolderApi,
        getPinApi,
        getClickBehaviorApi
    } = core;

    const mod = window.EveCategorySettingsFolders = window.EveCategorySettingsFolders || {};
    if (mod.renderStateReady) return;

    function countFolderBookmarks(folderLinks, folderId) {
        return Array.isArray(folderLinks.get(folderId)) ? folderLinks.get(folderId).length : 0;
    }

    function renderFolderManagerSelectOptions(options, selectedValue) {
        return (Array.isArray(options) ? options : []).map((option) => {
            const value = escapeCategorySettingsHtml(option?.value);
            const label = escapeCategorySettingsHtml(option?.label);
            const selected = option?.value === selectedValue ? ' selected' : '';
            return `<option value="${value}"${selected}>${label}</option>`;
        }).join('');
    }

    function normalizeFolderTaskModeValue(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized === 'task' || normalized === 'non_task' || normalized === 'inherit'
            ? normalized
            : 'inherit';
    }

    function buildFolderManagerRenderState(categoryName, workspaceId, viewModel, scopedLinks) {
        const clickApi = getClickBehaviorApi();
        const folderApi = getFolderApi();
        const pinApi = getPinApi();
        const linkById = new Map((Array.isArray(scopedLinks) ? scopedLinks : []).map((link) => [String(link?.id || '').trim(), link]));
        const cardPins = Array.isArray(pinApi?.getPins?.())
            ? pinApi.getPins().filter((pin) => {
                if (!pin || typeof pin !== 'object') return false;
                if (pin.targetType === 'bookmark') {
                    return linkById.has(String(pin.targetId || '').trim());
                }
                if (pin.targetType === 'folder') {
                    const target = pinApi.parseFolderTargetId?.(pin.targetId) || {};
                    return String(target.workspaceId || '') === workspaceId
                        && String(target.categoryName || 'Unsorted') === categoryName;
                }
                if (pin.targetType === 'card') {
                    const target = pinApi.parseCardTargetId?.(pin.targetId) || {};
                    return String(target.workspaceId || '') === workspaceId
                        && String(target.categoryName || 'Unsorted') === categoryName;
                }
                return false;
            })
            : [];
        const folderPinState = new Map();
        const directBookmarkPinsByFolderId = new Map();
        let cardPinnedBookmarkCount = 0;

        cardPins.forEach((pin) => {
            if (pin?.targetType === 'bookmark') {
                cardPinnedBookmarkCount += 1;
                const folderId = String(linkById.get(String(pin.targetId || '').trim())?.folderId || '').trim();
                if (folderId) {
                    directBookmarkPinsByFolderId.set(folderId, (directBookmarkPinsByFolderId.get(folderId) || 0) + 1);
                }
                return;
            }
            if (pin?.targetType === 'folder') {
                const target = pinApi.parseFolderTargetId?.(pin.targetId) || {};
                const folderId = String(target.folderId || '').trim();
                if (!folderId || folderPinState.has(folderId)) return;
                folderPinState.set(folderId, {
                    pinned: true,
                    scopeType: String(pin.scopeType || 'tab').trim().toLowerCase() === 'card' ? 'card' : 'tab'
                });
            }
        });

        const subtreePinnedBookmarkCounts = new Map();
        const computePinnedBookmarkCount = (folderId) => {
            const normalizedFolderId = String(folderId || '').trim();
            if (!normalizedFolderId) return 0;
            if (subtreePinnedBookmarkCounts.has(normalizedFolderId)) {
                return subtreePinnedBookmarkCounts.get(normalizedFolderId) || 0;
            }
            let total = directBookmarkPinsByFolderId.get(normalizedFolderId) || 0;
            (viewModel.childrenMap.get(normalizedFolderId) || []).forEach((child) => {
                if (!child?.isGhost) {
                    total += computePinnedBookmarkCount(child.id);
                }
            });
            subtreePinnedBookmarkCounts.set(normalizedFolderId, total);
            return total;
        };

        (viewModel.childrenMap.get(null) || []).forEach((folder) => {
            if (!folder?.isGhost) computePinnedBookmarkCount(folder.id);
        });

        return {
            clickModeOptions: clickApi?.getModeOptions?.() || [{ value: 'inherit', label: 'Inherit Current Behavior' }],
            taskModeOptions: folderApi?.getTaskModeOptions?.() || [{ value: 'inherit', label: 'Inherit Card Task Mode' }],
            pinScopeOptions: pinApi?.getTargetVisibilityScopeOptions?.() || [{ value: 'tab', label: 'This Tab' }],
            cardPinnedBookmarkCount,
            subtreePinnedBookmarkCounts,
            folderPinState,
            getModeHint(mode) {
                return clickApi?.describeMode ? clickApi.describeMode(mode) : '';
            },
            getTaskModeHint(mode) {
                return folderApi?.describeTaskMode ? folderApi.describeTaskMode(mode) : '';
            },
            getPinScopeHint(scopeType, isPinned) {
                if (!isPinned) return 'Pin this folder to control where its dock shortcut appears.';
                return pinApi?.describeTargetVisibilityScope?.(scopeType) || '';
            }
        };
    }

    Object.assign(mod, {
        countFolderBookmarks,
        renderFolderManagerSelectOptions,
        normalizeFolderTaskModeValue,
        buildFolderManagerRenderState
    });

    mod.renderStateReady = true;
})();
