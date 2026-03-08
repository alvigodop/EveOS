window.currentCategoryCtx = null;
window.categoryFolderCreateDraft = window.categoryFolderCreateDraft || {
    mode: 'create',
    categoryName: '',
    parentId: '',
    folderId: '',
    initialName: ''
};

(function () {
    function escapeCategorySettingsHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeCategorySettingsJs(value) {
        return String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    function getCategorySettingsWorkspaceId() {
        return String(window.eveState?.config?.activeWorkspace || (typeof config !== 'undefined' ? config?.activeWorkspace : '') || 'main').trim() || 'main';
    }

    function getFolderApi() {
        return window.EveBookmarkFolders || null;
    }

    function getFolderDraft() {
        if (!window.categoryFolderCreateDraft || typeof window.categoryFolderCreateDraft !== 'object') {
            window.categoryFolderCreateDraft = {
                mode: 'create',
                categoryName: '',
                parentId: '',
                folderId: '',
                initialName: ''
            };
        }
        return window.categoryFolderCreateDraft;
    }

    function setFolderDraft(nextDraft) {
        window.categoryFolderCreateDraft = {
            mode: String(nextDraft?.mode || 'create').trim() || 'create',
            categoryName: String(nextDraft?.categoryName || '').trim(),
            parentId: String(nextDraft?.parentId || '').trim(),
            folderId: String(nextDraft?.folderId || '').trim(),
            initialName: String(nextDraft?.initialName || '').trim()
        };
    }

    function getFolderDraftCategoryName() {
        return String(getFolderDraft().categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
    }

    function getFolderDraftMode() {
        return getFolderDraft().mode === 'rename' ? 'rename' : 'create';
    }

    function isCategorySettingsVisibleFor(categoryName) {
        const modal = document.getElementById('categorySettingsModal');
        return !!modal
            && modal.style.display === 'flex'
            && String(window.currentCategoryCtx || '').trim() === String(categoryName || '').trim();
    }

    function renderCategoryFolderCreateForm(preferredParentId) {
        const folderApi = getFolderApi();
        const categoryName = getFolderDraftCategoryName();
        const mode = getFolderDraftMode();
        const workspaceId = getCategorySettingsWorkspaceId();
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

    function countFolderBookmarks(folderLinks, folderId) {
        return Array.isArray(folderLinks.get(folderId)) ? folderLinks.get(folderId).length : 0;
    }

    function renderFolderManagerRows(categoryName, workspaceId, viewModel, folderId, depth) {
        const folders = viewModel.childrenMap.get(folderId) || [];
        return folders.map((folder) => {
            const safeCategoryJs = escapeCategorySettingsJs(categoryName);
            const safeFolderJs = escapeCategorySettingsJs(folder.id);
            const bookmarkCount = countFolderBookmarks(viewModel.folderLinks, folder.id);
            const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
            const metaParts = [];
            metaParts.push(`${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'}`);
            metaParts.push(`${childCount} subfolder${childCount === 1 ? '' : 's'}`);
            const indentPx = depth * 18;

            return ''
                + `<div class="bookmark-folder-manager-row" style="display:flex; flex-direction:column; gap:8px; padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03); margin-left:${indentPx}px;">`
                    + '<div style="display:flex; gap:10px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;">'
                        + '<div style="display:flex; flex-direction:column; gap:4px; min-width:0;">'
                            + `<div style="font-weight:600; color:var(--text-main); overflow-wrap:anywhere;">${escapeCategorySettingsHtml(folder.name)}</div>`
                            + `<div style="font-size:0.78rem; opacity:0.72;">${escapeCategorySettingsHtml(metaParts.join(' | '))}</div>`
                        + '</div>'
                        + '<div style="display:flex; gap:6px; flex-wrap:wrap;">'
                            + `<button type="button" onclick="closeModals(); openAddModalForFolder('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Add Bookmark</button>`
                            + `<button type="button" onclick="openFolderCreator('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Subfolder</button>`
                            + `<button type="button" onclick="promptRenameBookmarkFolder('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Rename</button>`
                            + `<button type="button" onclick="deleteBookmarkFolderPrompt('${safeCategoryJs}', '${safeFolderJs}')" style="padding:5px 8px; font-size:0.78rem;">Delete</button>`
                        + '</div>'
                    + '</div>'
                    + renderFolderManagerRows(categoryName, workspaceId, viewModel, folder.id, depth + 1)
                + '</div>';
        }).join('');
    }

    window.renderCategoryFolderManager = function () {
        const container = document.getElementById('category-folder-manager');
        if (!container) return;
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const folderApi = getFolderApi();

        if (!folderApi?.buildFolderView) {
            container.innerHTML = '<div style="opacity:0.72; font-size:0.9rem;">Folder controls are not available yet.</div>';
            return;
        }

        const scopedLinks = Array.isArray(window.eveState?.links)
            ? window.eveState.links.filter((link) =>
                String(link?.workspace || '') === workspaceId
                && String(link?.category || 'Unsorted') === categoryName
            )
            : [];
        const viewModel = folderApi.buildFolderView(workspaceId, categoryName, scopedLinks);
        const rootBookmarks = viewModel.rootLinks.length;
        const folderCount = viewModel.nodes.length;

        if (!folderCount) {
            container.innerHTML = ''
                + '<div style="padding:12px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; opacity:0.8;">'
                    + '<div style="font-weight:600; margin-bottom:4px;">No folders in this card yet</div>'
                    + `<div style="font-size:0.84rem;">Root bookmarks currently visible in this card: ${rootBookmarks}</div>`
                + '</div>';
            return;
        }

        container.innerHTML = ''
            + '<div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02);">'
                + '<div style="font-weight:600; margin-bottom:4px;">Root bookmarks</div>'
                + `<div style="font-size:0.84rem; opacity:0.76;">${rootBookmarks} bookmark${rootBookmarks === 1 ? '' : 's'} not assigned to a folder</div>`
            + '</div>'
            + renderFolderManagerRows(categoryName, workspaceId, viewModel, null, 0);
    };

    window.openFolderCreator = function (categoryName, parentId) {
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const modal = document.getElementById('bookmarkFolderCreatorModal');
        setFolderDraft({
            mode: 'create',
            categoryName: resolvedCategory,
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

    window.openFolderRenamer = function (categoryName, folderId) {
        const folderApi = getFolderApi();
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const target = folderApi?.getFolderById?.(workspaceId, resolvedCategory, folderId);
        if (!target) return;

        const modal = document.getElementById('bookmarkFolderCreatorModal');
        setFolderDraft({
            mode: 'rename',
            categoryName: resolvedCategory,
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
        const workspaceId = getCategorySettingsWorkspaceId();
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

    window.handleCategoryFolderNameEnter = function (event) {
        if (event?.key === 'Enter') {
            event.preventDefault();
            window.submitCategoryFolderCreate();
        }
    };

    window.openCategorySettings = function (categoryName, activeTab = 'general') {
        window.currentCategoryCtx = categoryName;
        window.ctxCatName = categoryName;

        const titleEl = document.getElementById('catSettingsTitle');
        if (titleEl) titleEl.innerText = `Settings: ${categoryName}`;

        const modal = document.getElementById('categorySettingsModal');
        if (modal) {
            modal.style.display = 'flex';
            switchCategoryTab(activeTab);
        }
    };

    window.switchCategoryTab = function (tabName) {
        document.querySelectorAll('#categorySettingsModal .tab-btn').forEach((button) => button.classList.remove('active'));
        const tabBtn = document.getElementById(`tab-btn-${tabName}`);
        if (tabBtn) tabBtn.classList.add('active');

        document.querySelectorAll('#categorySettingsModal .tab-content').forEach((content) => {
            content.style.display = 'none';
        });
        const tabContent = document.getElementById(`cat-tab-${tabName}`);
        if (tabContent) tabContent.style.display = 'block';

        const modalInner = document.querySelector('#categorySettingsModal .modal');
        if (modalInner) {
            modalInner.style.width = '500px';
            modalInner.style.maxWidth = '90%';
        }

        if (tabName === 'folders') {
            window.renderCategoryFolderManager();
            if (modalInner) {
                modalInner.style.width = '620px';
                modalInner.style.maxWidth = '94%';
            }
            return;
        }

        if (tabName === 'search') {
            const searchCont = document.getElementById('modal-api-search-container');
            const resultsCont = document.getElementById('modal-api-results-container');
            if (window.EveOS?.API?.Manager) {
                window.EveOS.API.Manager.renderSearchUI(searchCont, resultsCont, window.currentCategoryCtx);
                setTimeout(() => {
                    const input = searchCont.querySelector('input');
                    if (input) input.focus();
                }, 100);
            }
            return;
        }

        if (tabName === 'scraper') {
            const scraperCont = document.getElementById('modal-scraper-container');
            if (modalInner) {
                modalInner.style.width = '900px';
                modalInner.style.maxWidth = '95%';
            }
            if (scraperCont && window.CategoryScraperPanel) {
                window.CategoryScraperPanel.renderInModal(window.currentCategoryCtx, scraperCont);
                setTimeout(() => {
                    const input = scraperCont.querySelector('.scraper-search-input');
                    if (input) input.focus();
                }, 100);
            }
        }
    };
})();
