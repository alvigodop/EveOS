(function () {
    const core = window.EveCategorySettingsModalCore || {};
    const {
        getCategorySettingsWorkspaceId,
        getFolderApi,
        getFolderDraft,
        setFolderDraft,
        getFolderDraftCategoryName,
        getFolderDraftMode,
        isCategorySettingsVisibleFor
    } = core;

    const mod = window.EveCategorySettingsFolders = window.EveCategorySettingsFolders || {};
    if (mod.formReady) return;

    function resolveDraftWorkspaceId() {
        const draftWorkspace = String(getFolderDraft()?.workspaceId || '').trim();
        return draftWorkspace || getCategorySettingsWorkspaceId();
    }

    function renderCategoryFolderCreateForm(preferredParentId) {
        const folderApi = getFolderApi();
        const categoryName = getFolderDraftCategoryName();
        const mode = getFolderDraftMode();
        const workspaceId = resolveDraftWorkspaceId();
        const title = document.getElementById('bookmarkFolderCreatorTitle');
        const context = document.getElementById('bookmarkFolderCreatorContext');
        const input = document.getElementById('bookmarkFolderCreatorNameInput');
        const select = document.getElementById('bookmarkFolderCreatorParentSelect');
        const draft = getFolderDraft();
        const parentRow = document.getElementById('bookmarkFolderCreatorParentRow');
        const clearBtn = document.getElementById('bookmarkFolderCreatorClearBtn');
        const submitBtn = document.getElementById('bookmarkFolderCreatorSubmitBtn');
        if (!input || !folderApi) return;

        const selectedParentId = String(preferredParentId !== undefined ? preferredParentId : draft.parentId || '').trim();
        const selectedFolder = draft.folderId ? folderApi.getFolderById?.(workspaceId, categoryName, draft.folderId) : null;
        const parentPath = selectedParentId ? (folderApi.buildFolderPathLabel?.(workspaceId, categoryName, selectedParentId) || 'Selected Parent') : 'Root Level';
        const currentPath = draft.folderId ? (folderApi.buildFolderPathLabel?.(workspaceId, categoryName, draft.folderId) || draft.initialName || 'Folder') : '';

        if (mode === 'rename') {
            if (title) title.innerText = 'Rename Bookmark Folder';
            if (context) context.innerText = `Card: ${categoryName}${currentPath ? ` | Current: ${currentPath}` : ''}`;
            if (parentRow) parentRow.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            if (submitBtn) submitBtn.innerText = 'Save Rename';
            input.placeholder = 'Folder name';
            input.value = draft.initialName || selectedFolder?.name || '';
            return;
        }

        if (!select || !folderApi.populateFolderSelect) return;
        if (title) title.innerText = 'New Bookmark Folder';
        if (context) context.innerText = `Card: ${categoryName} | Parent: ${parentPath}`;
        if (parentRow) parentRow.style.display = 'flex';
        if (clearBtn) clearBtn.style.display = '';
        if (submitBtn) submitBtn.innerText = selectedParentId ? 'Create Subfolder' : 'Create Folder';
        input.placeholder = selectedParentId ? 'Subfolder name' : 'Folder name';
        input.value = '';
        folderApi.populateFolderSelect(select, workspaceId, categoryName, selectedParentId, {
            rootLabel: 'Root Level'
        });
        if (String(select.value || '').trim() !== selectedParentId && selectedParentId) {
            select.value = '';
        }
        draft.parentId = String(select.value || '').trim();
    }

    window.openFolderCreator = function (categoryName, parentId, workspaceId) {
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const resolvedWorkspace = String(workspaceId || '').trim() || getCategorySettingsWorkspaceId();
        const modal = document.getElementById('bookmarkFolderCreatorModal');
        setFolderDraft({
            mode: 'create',
            categoryName: resolvedCategory,
            workspaceId: resolvedWorkspace,
            parentId: String(parentId || '').trim(),
            folderId: '',
            initialName: ''
        });
        if (modal) modal.style.display = 'flex';
        setTimeout(() => {
            renderCategoryFolderCreateForm(String(parentId || '').trim());
            const input = document.getElementById('bookmarkFolderCreatorNameInput');
            if (input) {
                input.focus();
                input.select();
            }
        }, 0);
    };

    window.openFolderRenamer = function (categoryName, folderId, workspaceId) {
        const folderApi = getFolderApi();
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const resolvedWorkspace = String(workspaceId || '').trim() || getCategorySettingsWorkspaceId();
        const target = folderApi?.getFolderById?.(resolvedWorkspace, resolvedCategory, folderId);
        if (!target) return;

        const modal = document.getElementById('bookmarkFolderCreatorModal');
        setFolderDraft({
            mode: 'rename',
            categoryName: resolvedCategory,
            workspaceId: resolvedWorkspace,
            parentId: String(target.parentId || '').trim(),
            folderId: String(target.id || '').trim(),
            initialName: String(target.name || '').trim()
        });
        if (modal) modal.style.display = 'flex';
        setTimeout(() => {
            renderCategoryFolderCreateForm(String(target.parentId || '').trim());
            const input = document.getElementById('bookmarkFolderCreatorNameInput');
            if (input) {
                input.focus();
                input.select();
            }
        }, 0);
    };

    window.closeBookmarkFolderCreatorModal = function () {
        const modal = document.getElementById('bookmarkFolderCreatorModal');
        if (modal) modal.style.display = 'none';
    };

    window.clearCategoryFolderCreateForm = function () {
        const mode = getFolderDraftMode();
        const input = document.getElementById('bookmarkFolderCreatorNameInput');
        if (mode === 'rename') {
            if (input) {
                input.value = String(getFolderDraft().initialName || '').trim();
                input.focus();
                input.select();
            }
            return;
        }

        if (input) {
            input.value = '';
            input.focus();
        }
        setFolderDraft({
            mode: 'create',
            categoryName: getFolderDraftCategoryName(),
            workspaceId: resolveDraftWorkspaceId(),
            parentId: '',
            folderId: '',
            initialName: ''
        });
        renderCategoryFolderCreateForm('');
    };

    window.submitCategoryFolderCreate = function () {
        const folderApi = getFolderApi();
        if (!folderApi) return false;
        const mode = getFolderDraftMode();
        const categoryName = getFolderDraftCategoryName();
        const workspaceId = resolveDraftWorkspaceId();
        const input = document.getElementById('bookmarkFolderCreatorNameInput');
        const select = document.getElementById('bookmarkFolderCreatorParentSelect');
        const folderName = String(input?.value || '').trim();
        const parentId = String(select?.value || '').trim();
        const folderId = String(getFolderDraft().folderId || '').trim();
        const initialName = String(getFolderDraft().initialName || '').trim();

        if (!folderName) {
            if (typeof showToast === 'function') showToast('Folder name required', 'warning');
            if (input) input.focus();
            return false;
        }

        if (mode === 'rename') {
            if (!folderId) return false;
            if (folderName === initialName) {
                window.closeBookmarkFolderCreatorModal();
                return true;
            }
            const renamed = folderApi.renameFolder?.({
                workspaceId,
                categoryName,
                folderId,
                name: folderName
            });
            if (!renamed) return false;
            if (typeof showToast === 'function') showToast(`Folder renamed to "${folderName}"`, 'success');
            if (isCategorySettingsVisibleFor(categoryName)) {
                window.renderCategoryFolderManager();
            }
            window.closeBookmarkFolderCreatorModal();
            return true;
        }

        const created = folderApi.createFolder?.({
            workspaceId,
            categoryName,
            parentId,
            name: folderName
        });
        if (!created) return false;

        if (typeof showToast === 'function') showToast(`Folder "${folderName}" created`, 'success');
        if (input) input.value = '';
        setFolderDraft({
            mode: 'create',
            categoryName,
            workspaceId,
            parentId,
            folderId: '',
            initialName: ''
        });
        if (isCategorySettingsVisibleFor(categoryName)) {
            window.renderCategoryFolderManager();
        }
        window.closeBookmarkFolderCreatorModal();
        return true;
    };

    Object.assign(mod, { renderCategoryFolderCreateForm });
    mod.formReady = true;
})();
