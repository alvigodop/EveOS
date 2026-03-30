(function () {
    const core = window.EveCategorySettingsModalCore || {};
    const {
        escapeCategorySettingsHtml,
        escapeCategorySettingsJs,
        getCategorySettingsWorkspaceId,
        getClickBehaviorApi,
        isFolderActionExpanded,
        getFolderActionExpansionStore,
        folderActionExpansionKey
    } = core;

    const mod = window.EveCategorySettingsFolders = window.EveCategorySettingsFolders || {};
    if (mod.rowsReady) return;

    const {
        countFolderBookmarks,
        renderFolderManagerSelectOptions,
        normalizeFolderTaskModeValue
    } = mod;

    function renderFolderManagerRows(categoryName, workspaceId, viewModel, renderState, folderId, depth) {
        const folders = (viewModel.childrenMap.get(folderId) || []).filter((folder) => !folder?.isGhost);
        return folders.map((folder) => {
            const safeCategoryJs = escapeCategorySettingsJs(categoryName);
            const safeFolderJs = escapeCategorySettingsJs(folder.id);
            const bookmarkCount = countFolderBookmarks(viewModel.folderLinks, folder.id);
            const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
            const pinnedBookmarkCount = renderState.subtreePinnedBookmarkCounts.get(folder.id) || 0;
            const metaParts = [];
            metaParts.push(`${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'}`);
            metaParts.push(`${childCount} subfolder${childCount === 1 ? '' : 's'}`);
            metaParts.push(`${pinnedBookmarkCount} bookmark pin${pinnedBookmarkCount === 1 ? '' : 's'}`);
            const indentPx = depth * 18;
            const selectedMode = getClickBehaviorApi()?.normalizeMode
                ? getClickBehaviorApi().normalizeMode(folder?.clickBehaviorMode)
                : String(folder?.clickBehaviorMode || 'inherit').trim().toLowerCase() || 'inherit';
            const modeOptionsHtml = renderFolderManagerSelectOptions(renderState.clickModeOptions, selectedMode);
            const modeHint = renderState.getModeHint(selectedMode);
            const selectedTaskMode = normalizeFolderTaskModeValue(folder?.taskMode);
            const taskModeOptionsHtml = renderFolderManagerSelectOptions(renderState.taskModeOptions, selectedTaskMode);
            const taskModeHint = renderState.getTaskModeHint(selectedTaskMode);
            const folderPinState = renderState.folderPinState.get(folder.id) || null;
            const isFolderPinned = !!folderPinState?.pinned;
            const selectedPinScope = folderPinState?.scopeType || 'tab';
            const pinScopeOptionsHtml = renderFolderManagerSelectOptions(renderState.pinScopeOptions, selectedPinScope);
            const pinScopeHint = renderState.getPinScopeHint(selectedPinScope, isFolderPinned);
            const actionsExpanded = isFolderActionExpanded(workspaceId, categoryName, folder.id);
            const actionsExpandedAttr = actionsExpanded ? 'true' : 'false';
            const actionsHiddenAttr = actionsExpanded ? '' : ' hidden';

            return ''
                + `<div class="bookmark-folder-manager-row" style="display:flex; flex-direction:column; gap:8px; padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03); margin-left:${indentPx}px;">`
                    + '<div class="bookmark-folder-manager-row__header" style="display:flex; gap:10px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;">'
                        + '<div class="bookmark-folder-manager-row__info" style="display:flex; flex-direction:column; gap:4px; min-width:0;">'
                            + `<div style="font-weight:600; color:var(--text-main); overflow-wrap:anywhere;">${escapeCategorySettingsHtml(folder.name)}</div>`
                            + `<div style="font-size:0.78rem; opacity:0.72;">${escapeCategorySettingsHtml(metaParts.join(' | '))}</div>`
                        + '</div>'
                        + '<div class="bookmark-folder-manager-row__controls" style="display:flex; gap:6px; flex-wrap:wrap; align-items:flex-start; justify-content:flex-end;">'
                            + `<button type="button" class="bookmark-folder-row-edit-toggle" aria-expanded="${actionsExpandedAttr}" onclick="toggleCategoryFolderActionRow('${safeCategoryJs}', '${safeFolderJs}')">&#9998;</button>`
                            + `<div class="bookmark-folder-row-actions" ${actionsHiddenAttr} style="display:flex; gap:6px; flex-wrap:wrap;">`
                                + `<button type="button" onclick="closeModals(); openAddModalForFolder('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Add Bookmark</button>`
                                + `<button type="button" onclick="toggleCategoryFolderPin('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">${isFolderPinned ? 'Unpin' : 'Pin'}</button>`
                                + `<button type="button" onclick="pinCategoryFolderBookmarks('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Pin Subtree</button>`
                                + `<button type="button" onclick="unpinCategoryFolderBookmarks('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Unpin Subtree</button>`
                                + `<button type="button" onclick="openFolderCreator('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Subfolder</button>`
                                + `<button type="button" onclick="promptRenameBookmarkFolder('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Rename</button>`
                                + `<button type="button" onclick="deleteBookmarkFolderPrompt('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Delete</button>`
                            + '</div>'
                        + '</div>'
                    + '</div>'
                    + '<div style="display:flex; flex-direction:column; gap:4px;">'
                        + '<label style="font-size:0.74rem; opacity:0.76;">Folder Pin Visibility</label>'
                        + `<select onchange="saveCategoryFolderPinScope('${safeCategoryJs}', '${safeFolderJs}', this.value)" ${isFolderPinned ? '' : 'disabled'}>${pinScopeOptionsHtml}</select>`
                        + `<div style="font-size:0.76rem; opacity:0.68;">${escapeCategorySettingsHtml(pinScopeHint)}</div>`
                    + '</div>'
                    + '<div style="display:flex; flex-direction:column; gap:4px;">'
                        + '<label style="font-size:0.74rem; opacity:0.76;">Folder Click Behavior</label>'
                        + `<select onchange="saveFolderClickBehaviorSetting('${safeCategoryJs}', '${safeFolderJs}', this.value)">${modeOptionsHtml}</select>`
                        + `<div style="font-size:0.76rem; opacity:0.68;">${escapeCategorySettingsHtml(modeHint)}</div>`
                    + '</div>'
                    + '<div style="display:flex; flex-direction:column; gap:4px;">'
                        + '<label style="font-size:0.74rem; opacity:0.76;">Folder Task Behavior</label>'
                        + `<select onchange="saveFolderTaskModeSetting('${safeCategoryJs}', '${safeFolderJs}', this.value)">${taskModeOptionsHtml}</select>`
                        + `<div style="font-size:0.76rem; opacity:0.68;">${escapeCategorySettingsHtml(taskModeHint)}</div>`
                    + '</div>'
                    + renderFolderManagerRows(categoryName, workspaceId, viewModel, renderState, folder.id, depth + 1)
                + '</div>';
        }).join('');
    }

    window.toggleCategoryFolderActionRow = function (categoryName, folderId) {
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const resolvedFolderId = String(folderId || '').trim();
        if (!resolvedFolderId) return;
        const workspaceId = getCategorySettingsWorkspaceId();
        const store = getFolderActionExpansionStore();
        const key = folderActionExpansionKey(workspaceId, resolvedCategory, resolvedFolderId);
        store[key] = !store[key];
        window.renderCategoryFolderManager();
    };

    Object.assign(mod, { renderFolderManagerRows });
    mod.rowsReady = true;
})();
