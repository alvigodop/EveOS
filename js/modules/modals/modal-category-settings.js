window.currentCategoryCtx = null;
window.categoryFolderCreateDraft = window.categoryFolderCreateDraft || {
    mode: 'create',
    categoryName: '',
    parentId: '',
    folderId: '',
    initialName: ''
};
window.categoryFolderActionExpansion = window.categoryFolderActionExpansion || {};

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

    function getFolderActionExpansionStore() {
        if (!window.categoryFolderActionExpansion || typeof window.categoryFolderActionExpansion !== 'object') {
            window.categoryFolderActionExpansion = {};
        }
        return window.categoryFolderActionExpansion;
    }

    function folderActionExpansionKey(workspaceId, categoryName, folderId) {
        return [
            String(workspaceId || 'main').trim() || 'main',
            String(categoryName || 'Unsorted').trim() || 'Unsorted',
            String(folderId || '').trim()
        ].join('::');
    }

    function isFolderActionExpanded(workspaceId, categoryName, folderId) {
        return !!getFolderActionExpansionStore()[folderActionExpansionKey(workspaceId, categoryName, folderId)];
    }

    const HEADER_BUTTON_OPTIONS = [
        { id: 'add', label: '➕ Add Bookmark' },
        { id: 'folders', label: '📁 Folders' },
        { id: 'library', label: '📚 Library' },
        { id: 'focus', label: '🎯 Focus' },
        { id: 'launch', label: '🚀 Launch' }
    ];

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

    function getHeaderButtonApi() {
        return window.DashboardCategories || null;
    }

    function getClickBehaviorApi() {
        return window.EveBookmarkClickBehavior || null;
    }

    function getPinApi() {
        return window.EveQuickPins || null;
    }

    function isCategorySettingsVisibleFor(categoryName) {
        const modal = document.getElementById('categorySettingsModal');
        return !!modal
            && modal.style.display === 'flex'
            && String(window.currentCategoryCtx || '').trim() === String(categoryName || '').trim();
    }

    function renderCategoryHeaderButtonSettings() {
        const container = document.getElementById('categoryHeaderButtonSettings');
        if (!container) return;
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const headerButtonApi = getHeaderButtonApi();
        const visibleButtons = new Set(headerButtonApi?.getCardHeaderButtonsForCategory?.(workspaceId, categoryName) || []);

        container.innerHTML = HEADER_BUTTON_OPTIONS.map((option) => {
            const checked = visibleButtons.has(option.id) ? ' checked' : '';
            return ''
                + '<label style="display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid rgba(255,255,255,0.08); border-radius:8px; cursor:pointer;">'
                    + `<input type="checkbox" data-header-button-id="${escapeCategorySettingsHtml(option.id)}"${checked} onchange="toggleCategoryHeaderButtonSetting('${escapeCategorySettingsJs(option.id)}', this.checked)">`
                    + `<span>${escapeCategorySettingsHtml(option.label)}</span>`
                + '</label>';
        }).join('');
    }

    function renderCategoryClickBehaviorSettings() {
        const select = document.getElementById('categoryClickBehaviorSelect');
        const hint = document.getElementById('categoryClickBehaviorHint');
        const clickApi = getClickBehaviorApi();
        if (!select || !clickApi?.getModeOptions) return;

        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const selectedMode = clickApi.getCardMode(workspaceId, categoryName);
        select.innerHTML = clickApi.getModeOptions().map((option) => {
            const selected = option.value === selectedMode ? ' selected' : '';
            return `<option value="${escapeCategorySettingsHtml(option.value)}"${selected}>${escapeCategorySettingsHtml(option.label)}</option>`;
        }).join('');
        if (hint) hint.textContent = clickApi.describeMode(selectedMode);
    }

    function renderCategoryPinSettings() {
        const pinBtn = document.getElementById('categoryPinCardBtn');
        const scopeWrap = document.getElementById('categoryPinCardScopeWrap');
        const scopeSelect = document.getElementById('categoryPinCardScopeSelect');
        const scopeHint = document.getElementById('categoryPinCardScopeHint');
        const pinApi = getPinApi();
        if (!pinBtn || !pinApi?.isCardPinned) return;
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const isPinned = !!pinApi.isCardPinned(workspaceId, categoryName);
        pinBtn.innerText = isPinned ? '📌 Unpin Card' : '📌 Pin Card';
        if (!scopeWrap || !scopeSelect) return;
        if (!isPinned) {
            scopeWrap.style.display = 'none';
            scopeSelect.innerHTML = '';
            if (scopeHint) scopeHint.textContent = '';
            return;
        }
        const selectedScope = pinApi.getCardScopeType?.(workspaceId, categoryName) || 'tab';
        const options = pinApi.getTargetVisibilityScopeOptions?.() || [];
        scopeSelect.innerHTML = options.map((option) => {
            const selected = option.value === selectedScope ? ' selected' : '';
            return `<option value="${escapeCategorySettingsHtml(option.value)}"${selected}>${escapeCategorySettingsHtml(option.label)}</option>`;
        }).join('');
        if (scopeHint) scopeHint.textContent = pinApi.describeTargetVisibilityScope?.(selectedScope) || '';
        scopeWrap.style.display = 'flex';
    }

    function refreshCategoryPinViews(categoryName) {
        if (!isCategorySettingsVisibleFor(categoryName)) return;
        renderCategoryPinSettings();
        renderCategoryHeaderButtonSettings();
        renderCategoryFolderManager();
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
        const clickApi = getClickBehaviorApi();
        const folderApi = getFolderApi();
        const pinApi = getPinApi();
        const folders = viewModel.childrenMap.get(folderId) || [];
        return folders.map((folder) => {
            const safeCategoryJs = escapeCategorySettingsJs(categoryName);
            const safeFolderJs = escapeCategorySettingsJs(folder.id);
            const bookmarkCount = countFolderBookmarks(viewModel.folderLinks, folder.id);
            const childCount = (viewModel.childrenMap.get(folder.id) || []).length;
            const pinnedBookmarkCount = Array.isArray(pinApi?.filterPinsForFolder?.(workspaceId, categoryName, folder.id))
                ? pinApi.filterPinsForFolder(workspaceId, categoryName, folder.id).filter((pin) => pin?.targetType === 'bookmark').length
                : 0;
            const metaParts = [];
            metaParts.push(`${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'}`);
            metaParts.push(`${childCount} subfolder${childCount === 1 ? '' : 's'}`);
            metaParts.push(`${pinnedBookmarkCount} bookmark pin${pinnedBookmarkCount === 1 ? '' : 's'}`);
            const indentPx = depth * 18;
            const selectedMode = clickApi?.getFolderMode ? clickApi.getFolderMode(workspaceId, categoryName, folder.id) : 'inherit';
            const modeOptionsHtml = clickApi?.getModeOptions
                ? clickApi.getModeOptions().map((option) => {
                    const selected = option.value === selectedMode ? ' selected' : '';
                    return `<option value="${escapeCategorySettingsHtml(option.value)}"${selected}>${escapeCategorySettingsHtml(option.label)}</option>`;
                }).join('')
                : '<option value="inherit">Inherit Current Behavior</option>';
            const modeHint = clickApi?.describeMode ? clickApi.describeMode(selectedMode) : '';
            const selectedTaskMode = folderApi?.getFolderTaskMode ? folderApi.getFolderTaskMode(workspaceId, categoryName, folder.id) : 'inherit';
            const taskModeOptionsHtml = folderApi?.getTaskModeOptions
                ? folderApi.getTaskModeOptions().map((option) => {
                    const selected = option.value === selectedTaskMode ? ' selected' : '';
                    return `<option value="${escapeCategorySettingsHtml(option.value)}"${selected}>${escapeCategorySettingsHtml(option.label)}</option>`;
                }).join('')
                : '<option value="inherit">Inherit Card Task Mode</option>';
            const taskModeHint = folderApi?.describeTaskMode ? folderApi.describeTaskMode(selectedTaskMode) : '';
            const isFolderPinned = !!pinApi?.isFolderPinned?.(workspaceId, categoryName, folder.id);
            const selectedPinScope = pinApi?.getFolderScopeType?.(workspaceId, categoryName, folder.id) || 'tab';
            const pinScopeOptionsHtml = pinApi?.getTargetVisibilityScopeOptions
                ? pinApi.getTargetVisibilityScopeOptions().map((option) => {
                    const selected = option.value === selectedPinScope ? ' selected' : '';
                    return `<option value="${escapeCategorySettingsHtml(option.value)}"${selected}>${escapeCategorySettingsHtml(option.label)}</option>`;
                }).join('')
                : '<option value="tab">This Tab</option>';
            const pinScopeHint = isFolderPinned
                ? (pinApi?.describeTargetVisibilityScope?.(selectedPinScope) || '')
                : 'Pin this folder to control where its dock shortcut appears.';
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
        const pinApi = getPinApi();
        const safeCategoryJs = escapeCategorySettingsJs(categoryName);

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
        const cardPinnedCount = Array.isArray(pinApi?.filterPinsForCard?.(workspaceId, categoryName))
            ? pinApi.filterPinsForCard(workspaceId, categoryName).filter((pin) => pin?.targetType === 'bookmark').length
            : 0;

        const isManhwaMode = window.EveFolderViewV2 && window.EveFolderViewV2.isManhwaModeEnabled(workspaceId, categoryName);
        const manhwaModeHtml = window.EveFolderViewV2 ? `
            <div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); margin-bottom:12px;">
                <div style="display:flex; gap:10px; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
                        <div style="font-weight:600;">Folder View Mode</div>
                        <div style="font-size:0.84rem; opacity:0.76;">Switch between standard Tree View and Navigation View (Manhwa System Interface)</div>
                    </div>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                        <input type="checkbox" onchange="window.EveFolderViewV2.toggleManhwaMode('${escapeCategorySettingsJs(workspaceId)}', '${safeCategoryJs}'); window.renderCategoryFolderManager();" ${isManhwaMode ? 'checked' : ''}>
                        <span style="font-size:0.85rem;">Enable Manhwa View</span>
                    </label>
                </div>
            </div>
        ` : '';

        const ghostFoldersHtml = window.EveFolderViewV2 ? (() => {
            const types = [
                { id: 'recent', label: '[ Recently Updated ]' },
                { id: 'unlinked', label: '[ Unlinked Bookmarks ]' },
                { id: 'missing_covers', label: '[ Missing Covers ]' },
                { id: 'duplicate_suspects', label: '[ Duplicate Suspects ]' },
                { id: 'untagged', label: '[ Untagged ]' },
                { id: 'needs_review', label: '[ Needs Review ]' }
            ];

            let toggles = types.map(t => {
                const isEnabled = window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, t.id);
                return `
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; min-width: 180px;">
                        <input type="checkbox" onchange="window.EveFolderViewV2.toggleGhostFolder('${escapeCategorySettingsJs(workspaceId)}', '${safeCategoryJs}', '${t.id}'); window.renderCategoryFolderManager();" ${isEnabled ? 'checked' : ''}>
                        <span style="font-size:0.85rem;">${t.label}</span>
                    </label>
                `;
            }).join('');

            return `
            <div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); margin-bottom:12px;">
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="font-weight:600;">Smart Ghost Folders</div>
                        <div style="font-size:0.84rem; opacity:0.76;">Toggle which auto-generated folders appear at the root of this card.</div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top: 4px;">
                        ${toggles}
                    </div>
                </div>
            </div>
            `;
        })() : '';

        container.innerHTML = ''
            + manhwaModeHtml
            + ghostFoldersHtml
            + '<div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); margin-bottom:12px;">'
                + '<div style="display:flex; gap:10px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;">'
                    + '<div style="display:flex; flex-direction:column; gap:4px; min-width:0;">'
                        + '<div style="font-weight:600; margin-bottom:4px;">Root bookmarks</div>'
                        + `<div style="font-size:0.84rem; opacity:0.76;">${rootBookmarks} bookmark${rootBookmarks === 1 ? '' : 's'} not assigned to a folder | ${cardPinnedCount} bookmark pin${cardPinnedCount === 1 ? '' : 's'} active in this card</div>`
                    + '</div>'
                    + '<div style="display:flex; gap:6px; flex-wrap:wrap;">'
                        + `<button type="button" onclick="pinCategoryRootBookmarks('${safeCategoryJs}')" style="padding:5px 8px; font-size:0.78rem;">Pin Root Bookmarks</button>`
                        + `<button type="button" onclick="unpinCategoryBookmarks('${safeCategoryJs}')" style="padding:5px 8px; font-size:0.78rem;">Unpin All In Card</button>`
                    + '</div>'
                + '</div>'
            + '</div>'
            + (folderCount
                ? renderFolderManagerRows(categoryName, workspaceId, viewModel, null, 0)
                : ''
                    + '<div style="padding:12px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; opacity:0.8;">'
                        + '<div style="font-weight:600; margin-bottom:4px;">No folders in this card yet</div>'
                        + `<div style="font-size:0.84rem;">Root bookmarks currently visible in this card: ${rootBookmarks}</div>`
                    + '</div>');
    };

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

    window.toggleCategoryHeaderButtonSetting = function (buttonId, visible) {
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const headerButtonApi = getHeaderButtonApi();
        if (!headerButtonApi?.getCardHeaderButtonsForCategory || !headerButtonApi?.setCardHeaderButtonsForCategory) {
            return;
        }

        const currentButtons = headerButtonApi.getCardHeaderButtonsForCategory(workspaceId, categoryName);
        const nextButtons = currentButtons.filter((entry) => entry !== buttonId);
        if (visible) nextButtons.push(buttonId);
        headerButtonApi.setCardHeaderButtonsForCategory(workspaceId, categoryName, nextButtons);
        renderCategoryHeaderButtonSettings();
    };

    window.saveCategoryClickBehaviorSetting = function (mode) {
        const clickApi = getClickBehaviorApi();
        if (!clickApi?.setCardMode) return;
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        clickApi.setCardMode(workspaceId, categoryName, mode);
        renderCategoryClickBehaviorSettings();
        showToast('Card click behavior updated', 'success');
    };

    window.saveFolderClickBehaviorSetting = function (categoryName, folderId, mode) {
        const clickApi = getClickBehaviorApi();
        if (!clickApi?.setFolderMode) return;
        const workspaceId = getCategorySettingsWorkspaceId();
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        clickApi.setFolderMode(workspaceId, resolvedCategory, folderId, mode);
        window.renderCategoryFolderManager();
        showToast('Folder click behavior updated', 'success');
    };

    window.saveFolderTaskModeSetting = function (categoryName, folderId, mode) {
        const folderApi = getFolderApi();
        if (!folderApi?.setFolderTaskMode) return;
        const workspaceId = getCategorySettingsWorkspaceId();
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        folderApi.setFolderTaskMode(workspaceId, resolvedCategory, folderId, mode);
        window.renderCategoryFolderManager();
        if (typeof renderDashboard === 'function') renderDashboard();
        showToast('Folder task behavior updated', 'success');
    };

    window.toggleCategoryCardPin = function () {
        const pinApi = getPinApi();
        if (!pinApi?.toggleCardPin) return;
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        const isPinned = !!pinApi.toggleCardPin(workspaceId, categoryName);
        refreshCategoryPinViews(categoryName);
        showToast(isPinned ? 'Card pinned to dock' : 'Card unpinned from dock', 'success');
    };

    window.saveCategoryCardPinScope = function (scopeType) {
        const pinApi = getPinApi();
        if (!pinApi?.setCardScopeType) return;
        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        if (!pinApi.setCardScopeType(workspaceId, categoryName, scopeType)) return;
        refreshCategoryPinViews(categoryName);
        showToast('Card pin visibility updated', 'success');
    };

    window.toggleCategoryFolderPin = function (categoryName, folderId) {
        const pinApi = getPinApi();
        if (!pinApi?.toggleFolderPin) return;
        const workspaceId = getCategorySettingsWorkspaceId();
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const isPinned = !!pinApi.toggleFolderPin(workspaceId, resolvedCategory, folderId);
        refreshCategoryPinViews(resolvedCategory);
        showToast(isPinned ? 'Folder pinned to dock' : 'Folder unpinned from dock', 'success');
    };

    window.saveCategoryFolderPinScope = function (categoryName, folderId, scopeType) {
        const pinApi = getPinApi();
        if (!pinApi?.setFolderScopeType) return;
        const workspaceId = getCategorySettingsWorkspaceId();
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        if (!pinApi.setFolderScopeType(workspaceId, resolvedCategory, folderId, scopeType)) return;
        refreshCategoryPinViews(resolvedCategory);
        showToast('Folder pin visibility updated', 'success');
    };

    window.pinCategoryRootBookmarks = function (categoryName) {
        const pinApi = getPinApi();
        if (!pinApi?.pinCardRootBookmarks) return;
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        pinApi.pinCardRootBookmarks(workspaceId, resolvedCategory, { scopeType: 'card' });
        refreshCategoryPinViews(resolvedCategory);
        showToast(`Pinned root bookmarks in ${resolvedCategory}`, 'success');
    };

    window.unpinCategoryBookmarks = function (categoryName) {
        const pinApi = getPinApi();
        if (!pinApi?.unpinCardBookmarks) return;
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        pinApi.unpinCardBookmarks(workspaceId, resolvedCategory);
        refreshCategoryPinViews(resolvedCategory);
        showToast(`Unpinned bookmark pins in ${resolvedCategory}`, 'success');
    };

    window.pinCategoryFolderBookmarks = function (categoryName, folderId) {
        const pinApi = getPinApi();
        if (!pinApi?.pinFolderBookmarks) return;
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        pinApi.pinFolderBookmarks(workspaceId, resolvedCategory, folderId, { scopeType: 'folder' });
        refreshCategoryPinViews(resolvedCategory);
        showToast('Pinned folder subtree bookmarks', 'success');
    };

    window.unpinCategoryFolderBookmarks = function (categoryName, folderId) {
        const pinApi = getPinApi();
        if (!pinApi?.unpinFolderBookmarks) return;
        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';
        const workspaceId = getCategorySettingsWorkspaceId();
        pinApi.unpinFolderBookmarks(workspaceId, resolvedCategory, folderId);
        refreshCategoryPinViews(resolvedCategory);
        showToast('Unpinned folder subtree bookmarks', 'success');
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

        if (tabName === 'general') {
            renderCategoryHeaderButtonSettings();
            renderCategoryClickBehaviorSettings();
            renderCategoryPinSettings();
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
