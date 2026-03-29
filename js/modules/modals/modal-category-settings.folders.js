(function () {
    const core = window.EveCategorySettingsModalCore || {};
    const {
        escapeCategorySettingsHtml,
        escapeCategorySettingsJs,
        getCategorySettingsWorkspaceId,
        getFolderApi,
        getPinApi,
        getClickBehaviorApi,
        getFolderDraft,
        setFolderDraft,
        getFolderDraftCategoryName,
        getFolderDraftMode,
        isCategorySettingsVisibleFor,
        isFolderActionExpanded
    } = core;

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



    window.renderCategoryFolderManager = function () {

        const container = document.getElementById('category-folder-manager');

        if (!container) return;

        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';

        const workspaceId = getCategorySettingsWorkspaceId();

        const folderApi = getFolderApi();

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

        const renderState = buildFolderManagerRenderState(categoryName, workspaceId, viewModel, scopedLinks);

        const rootBookmarks = viewModel.rootLinks.length;

        const folderCount = viewModel.nodes.filter((node) => !node?.isGhost).length;

        const cardPinnedCount = renderState.cardPinnedBookmarkCount;



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

            const sections = [

                {

                    title: "Link Health (Semantic Drift)",

                    types: [

                        { id: 'dead_links', label: '[ Dead Links ]' },

                        { id: 'redirected_links', label: '[ Redirected Links ]' },

                        { id: 'title_drift', label: '[ Title Drift ]' },

                        { id: 'orphaned_lib', label: '[ Orphaned Library Entries ]' }

                    ]

                },

                {

                    title: "Domains",

                    types: [

                        { id: 'domain_grouping', label: '[ Domain Grouping ]' }

                    ]

                },

                {

                    title: "Reading Status",

                    types: [

                        { id: 'unread', label: '[ Plan to Read / Unread ]' },

                        { id: 'reading', label: '[ Actively Reading ]' },

                        { id: 'completed', label: '[ Completed ]' },

                        { id: 'on_hold', label: '[ On Hold ]' },

                        { id: 'dropped', label: '[ Dropped ]' }

                    ]

                },

                {

                    title: "Maintenance",

                    types: [

                        { id: 'unlinked', label: '[ Unlinked Bookmarks ]' },

                        { id: 'missing_covers', label: '[ Missing Covers ]' },

                        { id: 'missing_icons', label: '[ Missing Icons ]' },

                        { id: 'untagged', label: '[ Untagged ]' },

                        { id: 'no_title', label: '[ No Title ]' },

                        { id: 'needs_review', label: '[ Needs Review ]' },

                        { id: 'missing_notes', label: '[ Missing Notes ]' },

                        { id: 'broken_links', label: '[ Broken / Invalid Links ]' }

                    ]

                },

                {

                    title: "Activity",

                    types: [

                        { id: 'recent', label: '[ Recently Updated ]' },

                        { id: 'recently_visited', label: '[ Recently Visited ]' },

                        { id: 'stale', label: '[ Stale Bookmarks ]' }

                    ]

                },

                {

                    title: "Insights",

                    types: [

                        { id: 'top_rated', label: '[ Top Rated ]' },

                        { id: 'duplicate_suspects', label: '[ Duplicate Suspects ]' },

                        { id: 'large_folders', label: '[ Large Folders (>15) ]' },

                        { id: 'ancients', label: '[ The Ancients ]' },

                        { id: 'library_stats', label: '[ Genre Clusters ]' }

                    ]

                },

                {

                    title: "Indexes",

                    types: [

                        { id: 'tag_index', label: '[ By Tags ]' },

                        { id: 'genre_index', label: '[ By Genres ]' },

                        { id: 'author_index', label: '[ By Authors ]' },

                        { id: 'language_index', label: '[ By Language ]' },

                        { id: 'rating_index', label: '[ By Rating ]' },

                        { id: 'confidence_index', label: '[ By Confidence ]' },

                        { id: 'title_index', label: '[ By Title ]' },

                        { id: 'status_index', label: '[ By Status ]' },

                        { id: 'last_read_index', label: '[ By Last Read ]' },

                        { id: 'progress_index', label: '[ By Progress Units ]' },

                        { id: 'demographic_index', label: '[ By Demographic ]' },

                        { id: 'publication_index', label: '[ By Publication Era ]' }

                    ]

                }

            ];



            let html = `

            <div style="padding:10px 12px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); margin-bottom:12px;">

                <div style="display:flex; flex-direction:column; gap:8px;">

                    <div style="display:flex; justify-content:space-between; align-items:center;">

                        <div style="display:flex; flex-direction:column; gap:4px;">

                            <div style="font-weight:600;">Smart Ghost Folders</div>

                            <div style="font-size:0.84rem; opacity:0.76;">Toggle which auto-generated views appear inside [ System Views ].</div>

                        </div>

                        <button class="btn-primary" onclick="if(window.EveSemanticDrift) { window.EveSemanticDrift.forceRefreshScan(); }" style="font-size: 0.7rem; padding: 4px 8px;">Refresh Drift Scan</button>

                    </div>

            `;



            sections.forEach(section => {

                html += `

                    <div style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">

                        <div style="font-size: 0.8rem; color: #aaa; margin-bottom: 6px; font-weight: bold;">${section.title}</div>

                        <div style="display:flex; flex-wrap:wrap; gap:12px;">

                `;

                section.types.forEach(t => {

                    const isEnabled = window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, t.id);

                    html += `

                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; min-width: 180px;">

                            <input type="checkbox" onchange="window.EveFolderViewV2.toggleGhostFolder('${escapeCategorySettingsJs(workspaceId)}', '${safeCategoryJs}', '${t.id}'); window.renderCategoryFolderManager();" ${isEnabled ? 'checked' : ''}>

                            <span style="font-size:0.85rem;">${t.label}</span>

                        </label>

                    `;

                });

                html += `</div></div>`;

            });



            html += `</div></div>`;

            return html;

        })() : '';



        const staticHtml = ''

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

            + '</div>';

        const emptyStateHtml = ''

            + '<div style="padding:12px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; opacity:0.8;">'

                + '<div style="font-weight:600; margin-bottom:4px;">No folders in this card yet</div>'

                + `<div style="font-size:0.84rem;">Root bookmarks currently visible in this card: ${rootBookmarks}</div>`

            + '</div>';

        const renderToken = String(Date.now() + Math.random());

        container.setAttribute('data-folder-render-token', renderToken);

        const renderRowsIntoContainer = function () {

            if (container.getAttribute('data-folder-render-token') !== renderToken) return;

            container.innerHTML = staticHtml + (

                folderCount

                    ? renderFolderManagerRows(categoryName, workspaceId, viewModel, renderState, null, 0)

                    : emptyStateHtml

            );

        };

        if (folderCount > 120) {

            container.innerHTML = staticHtml

                + `<div style="padding:12px; border:1px dashed rgba(255,255,255,0.18); border-radius:10px; opacity:0.8;">Rendering ${folderCount} folders...</div>`;

            setTimeout(renderRowsIntoContainer, 0);

            return;

        }

        renderRowsIntoContainer();

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

})();
