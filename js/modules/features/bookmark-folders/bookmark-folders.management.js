window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {


    const shared = ns._shared || {};
    const {
        buildScopedKey,
        getToolbarConfigStore,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeParentId,
        dedupeNodes,
        normalizeTreeSettings,
        normalizeClickBehaviorMode,
        normalizeTaskMode,
        getScopedNodes,
        getScopedTree,
        setScopedTree,
        setScopedNodes,
        buildChildrenMap,
        buildNodeMap,
        cloneStore,
        writeStore
    } = shared;

    const buildFolderView = ns.buildFolderView;



    function isToolbarExpanded(workspaceId, categoryName) {

        return getToolbarConfigStore().includes(buildScopedKey(workspaceId, categoryName));

    }



    function setToolbarExpanded(workspaceId, categoryName, expanded) {

        const scopedKey = buildScopedKey(workspaceId, categoryName);

        const store = getToolbarConfigStore();

        const nextStore = store.filter((entry) => entry !== scopedKey);

        if (expanded) nextStore.push(scopedKey);

        if (window.eveState?.config) {

            window.eveState.config.bookmarkFolderToolbarExpanded = nextStore;

        }

        if (typeof saveConfig === 'function') saveConfig();

        syncToolbarDom(workspaceId, categoryName, expanded);

    }



    function toggleToolbarExpanded(workspaceId, categoryName) {

        const expanded = isToolbarExpanded(workspaceId, categoryName);

        setToolbarExpanded(workspaceId, categoryName, !expanded);

    }



    function syncToolbarDom(workspaceId, categoryName, expanded) {

        const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);

        const resolvedCategoryName = normalizeCategoryName(categoryName);

        const cards = Array.from(document.querySelectorAll('.category-card'))

            .filter((card) =>

                String(card.getAttribute('data-card-workspace') || '').trim() === resolvedWorkspaceId

                && String(card.getAttribute('data-card-category') || '').trim() === resolvedCategoryName

            );



        if (!cards.length) {

            if (typeof renderDashboard === 'function') renderDashboard();

            return;

        }



        cards.forEach((card) => {

            const toolbar = card.querySelector('.bookmark-folder-toolbar');

            if (toolbar) {

                toolbar.classList.toggle('is-visible', !!expanded);

            }

            card.querySelectorAll('[data-folder-toolbar-toggle="1"]').forEach((button) => {

                button.classList.toggle('is-active', !!expanded);

            });

            const grid = card.parentElement || document.getElementById('dashboard-grid');

            if (grid && typeof window.scheduleDashboardMasonryLayout === 'function') {

                window.scheduleDashboardMasonryLayout(grid);

            }

        });

    }



    function getFolderById(workspaceId, categoryName, folderId) {

        const normalizedId = normalizeFolderId(folderId);

        if (!normalizedId) return null;

        return getScopedNodes(workspaceId, categoryName)

            .find((node) => node.id === normalizedId) || null;

    }



    function buildFolderPathLabel(workspaceId, categoryName, folderId) {

        const normalizedId = normalizeFolderId(folderId);

        if (!normalizedId) return '';

        const nodeMap = buildNodeMap(getScopedNodes(workspaceId, categoryName));

        const parts = [];

        let cursor = nodeMap.get(normalizedId) || null;

        let guard = 0;

        while (cursor && guard < 64) {

            parts.unshift(cursor.name || 'Folder');

            cursor = cursor.parentId ? (nodeMap.get(cursor.parentId) || null) : null;

            guard += 1;

        }

        return parts.join(' / ');

    }



    function collectFolderOptions(workspaceId, categoryName, parentId, depth, childrenMap, rows) {

        const siblings = childrenMap.get(parentId) || [];

        siblings.forEach((node) => {

            rows.push({

                value: node.id,

                label: `${'\u00A0\u00A0'.repeat(depth)}${depth > 0 ? '\u21B3 ' : ''}${node.name}`,

                node,

                depth

            });

            collectFolderOptions(workspaceId, categoryName, node.id, depth + 1, childrenMap, rows);

        });

    }



    function getFolderOptions(workspaceId, categoryName, options = {}) {

        const rows = [];

        const childrenMap = buildChildrenMap(getScopedNodes(workspaceId, categoryName));

        if (options.includeRoot !== false) {

            rows.push({

                value: '',

                label: options.rootLabel || 'Root / No Folder',

                node: null,

                depth: 0

            });

        }

        collectFolderOptions(workspaceId, categoryName, null, 0, childrenMap, rows);

        return rows;

    }



    function populateFolderSelect(selectEl, workspaceId, categoryName, selectedId, options = {}) {

        if (!selectEl) return;

        const normalizedSelectedId = normalizeFolderId(selectedId);

        const rows = getFolderOptions(workspaceId, categoryName, options);

        selectEl.innerHTML = rows.map((row) => {

            const isSelected = normalizeFolderId(row.value) === normalizedSelectedId;

            const option = document.createElement('option');

            option.value = row.value;

            option.textContent = row.label;

            if (isSelected) option.selected = true;

            return option.outerHTML;

        }).join('');



        if (rows.some((row) => normalizeFolderId(row.value) === normalizedSelectedId)) {

            selectEl.value = normalizedSelectedId;

        } else {

            selectEl.value = '';

        }

    }



    function getEditorWorkspaceId() {

        const editId = String(document.getElementById('editId')?.value || '').trim();

        if (editId && Array.isArray(window.eveState?.links)) {

            const match = window.eveState.links.find((link) => String(link?.id) === editId);

            if (match?.workspace) return String(match.workspace);

        }

        return normalizeWorkspaceId();

    }



    function refreshEditorFolderSelect(preferredFolderId) {

        const select = document.getElementById('newFolderId');

        if (!select) return;

        const categoryName = normalizeCategoryName(document.getElementById('newCategory')?.value);

        const selectedId = preferredFolderId !== undefined

            ? normalizeFolderId(preferredFolderId)

            : normalizeFolderId(select.value);

        populateFolderSelect(select, getEditorWorkspaceId(), categoryName, selectedId);

    }



    function generateFolderId() {

        const randomSuffix = Math.random().toString(36).slice(2, 8);

        return `bf_${Date.now().toString(36)}_${randomSuffix}`;

    }



    function getNextSiblingOrder(nodes, parentId) {

        const normalizedParentId = normalizeParentId(parentId);

        const siblings = dedupeNodes(nodes).filter((node) => normalizeParentId(node.parentId) === normalizedParentId);

        if (!siblings.length) return 0;

        return Math.max(...siblings.map((node) => Number(node.order) || 0)) + 1;

    }



    function createFolder(options = {}) {

        const workspaceId = normalizeWorkspaceId(options.workspaceId);

        const categoryName = normalizeCategoryName(options.categoryName);

        const name = String(options.name || '').trim();

        const parentId = normalizeParentId(options.parentId);

        if (!name) return null;



        const nodes = getScopedNodes(workspaceId, categoryName);

        const now = Date.now();

        const folder = {

            id: generateFolderId(),

            parentId,

            name,

            order: getNextSiblingOrder(nodes, parentId),

            createdAt: now,

            updatedAt: now,

            clickBehaviorMode: 'inherit',

            taskMode: 'inherit'

        };

        nodes.push(folder);

        setScopedNodes(workspaceId, categoryName, nodes, { persist: options.persist !== false });

        return folder;

    }



    function renameFolder(options = {}) {

        const workspaceId = normalizeWorkspaceId(options.workspaceId);

        const categoryName = normalizeCategoryName(options.categoryName);

        const folderId = normalizeFolderId(options.folderId);

        const nextName = String(options.name || '').trim();

        if (!folderId || !nextName) return false;



        const nodes = getScopedNodes(workspaceId, categoryName);

        const target = nodes.find((node) => node.id === folderId);

        if (!target) return false;

        target.name = nextName;

        target.updatedAt = Date.now();

        setScopedNodes(workspaceId, categoryName, nodes);

        return true;

    }



    function moveFolder(workspaceId, categoryName, folderId, targetParentId) {

        workspaceId = normalizeWorkspaceId(workspaceId);

        categoryName = normalizeCategoryName(categoryName);

        folderId = normalizeFolderId(folderId);

        targetParentId = normalizeParentId(targetParentId);



        if (!folderId) return false;

        if (folderId === targetParentId) return false; // Cannot move into itself



        const nodes = getScopedNodes(workspaceId, categoryName);



        // Cycle detection: ensure targetParentId is not a descendant of folderId

        let currentParent = targetParentId;

        while (currentParent) {

            if (currentParent === folderId) return false; // Cycle detected

            const pNode = nodes.find(n => n.id === currentParent);

            if (!pNode) break;

            currentParent = pNode.parentId;

        }



        const target = nodes.find((node) => node.id === folderId);

        if (!target) return false;



        target.parentId = targetParentId;

        target.updatedAt = Date.now();

        setScopedNodes(workspaceId, categoryName, nodes);

        return true;

    }



    function transferFolderToCategory(folderId, sourceWs, sourceCat, targetWs, targetCat, targetParentId) {

        try {

            const sWs = normalizeWorkspaceId(sourceWs);

            const sCat = normalizeCategoryName(sourceCat);

            const tWs = normalizeWorkspaceId(targetWs);

            const tCat = normalizeCategoryName(targetCat);

            const fId = normalizeFolderId(folderId);

            const tpId = normalizeParentId(targetParentId);



            if (!fId) {

                console.warn('[EveBookmarkFolders] Transfer Aborted: Missing Folder ID');

                return false;

            }



            // If it's the same card, just use the local moveFolder logic

            if (sWs === tWs && sCat === tCat) {

                return moveFolder(sWs, sCat, fId, tpId);

            }



            const nextStore = cloneStore();

            const sKey = buildScopedKey(sWs, sCat);

            const tKey = buildScopedKey(tWs, tCat);



            const sourceTree = nextStore[sKey];

            if (!sourceTree || !sourceTree.nodes || sourceTree.nodes.length === 0) {

                console.warn('[EveBookmarkFolders] Transfer Aborted: Source tree empty or missing', sKey);

                return false;

            }



            const targetTree = nextStore[tKey] || { nodes: [], settings: normalizeTreeSettings({}) };



            // Find the folder and all its descendants in the source

            const childrenMap = buildChildrenMap(sourceTree.nodes);



            const toMoveIds = new Set();

            function collect(id) {

                toMoveIds.add(id);

                (childrenMap.get(id) || []).forEach(child => collect(child.id));

            }



            const rootNodeId = fId;

            // Check if rootNode exists in source

            if (!sourceTree.nodes.some(n => normalizeFolderId(n.id) === rootNodeId)) {

                return false;

            }



            collect(rootNodeId);



            // 1. Prepare moved nodes

            const movedNodes = sourceTree.nodes.filter(n => toMoveIds.has(n.id)).map(n => {

                const newNode = { ...n };

                if (normalizeFolderId(n.id) === rootNodeId) {

                    newNode.parentId = tpId;

                    newNode.updatedAt = Date.now();

                }

                return newNode;

            });



            console.log('[EveBookmarkFolders] Nodes captured:', movedNodes.length);

            if (movedNodes.length === 0) return false;



            // 2. Add to target

            targetTree.nodes = [...targetTree.nodes, ...movedNodes];

            nextStore[tKey] = targetTree;



            // 3. Remove from source

            sourceTree.nodes = sourceTree.nodes.filter(n => !toMoveIds.has(n.id));

            if (sourceTree.nodes.length === 0 && sourceTree.settings.clickBehaviorMode === 'inherit') {

                delete nextStore[sKey];

            } else {

                nextStore[sKey] = sourceTree;

            }



            // 4. Update all bookmarks in these folders to the new category/workspace

            if (Array.isArray(window.eveState?.links)) {

                window.eveState.links.forEach(link => {

                    if (toMoveIds.has(normalizeFolderId(link.folderId))) {

                        link.workspace = tWs;

                        link.category = tCat;

                        if (typeof window.EveLibrary?.ConnectionsAPI?.syncFromLink === 'function') {

                            window.EveLibrary.ConnectionsAPI.syncFromLink(link.id);

                        }

                    }

                });

            }



            // 5. Final Atomic Write

            writeStore(nextStore, true);

            return true;

        } catch (err) {

            return false;

        }

    }

    function clearLinkFolderAssignment(link) {

        if (!link || typeof link !== 'object') return false;

        if (!normalizeFolderId(link.folderId)) {

            delete link.folderId;

            return false;

        }

        delete link.folderId;

        return true;

    }



    function deleteFolder(options = {}) {

        const workspaceId = normalizeWorkspaceId(options.workspaceId);

        const categoryName = normalizeCategoryName(options.categoryName);

        const folderId = normalizeFolderId(options.folderId);

        if (!folderId) return false;



        const nodes = getScopedNodes(workspaceId, categoryName);

        const target = nodes.find((node) => node.id === folderId);

        if (!target) return false;



        const nextParentId = normalizeParentId(target.parentId);

        const filteredNodes = nodes.filter((node) => node.id !== folderId);

        filteredNodes.forEach((node) => {

            if (normalizeParentId(node.parentId) === folderId) {

                node.parentId = nextParentId;

                node.updatedAt = Date.now();

            }

        });



        if (Array.isArray(window.eveState?.links)) {

            window.eveState.links.forEach((link) => {

                const sameWorkspace = normalizeWorkspaceId(link?.workspace) === workspaceId;

                const sameCategory = normalizeCategoryName(link?.category) === categoryName;

                if (!sameWorkspace || !sameCategory) return;

                if (normalizeFolderId(link?.folderId) !== folderId) return;

                if (nextParentId) link.folderId = nextParentId;

                else delete link.folderId;

            });

        }



        setScopedNodes(workspaceId, categoryName, filteredNodes, { persist: false });

        if (typeof saveData === 'function') saveData();

        return true;

    }



    function renameCategoryEverywhere(oldCategoryName, nextCategoryName) {

        const previous = normalizeCategoryName(oldCategoryName);

        const next = normalizeCategoryName(nextCategoryName);

        if (!previous || !next || previous === next) return;



        const nextStore = cloneStore();

        Object.keys(nextStore).forEach((key) => {

            const parts = String(key).split('::');

            const workspaceId = parts.shift() || 'main';

            const categoryName = parts.join('::') || 'Unsorted';

            if (normalizeCategoryName(categoryName) !== previous) return;

            const nextKey = buildScopedKey(workspaceId, next);

            if (!nextStore[nextKey]) {

                nextStore[nextKey] = nextStore[key];

            } else {

                const mergedSettings = normalizeTreeSettings({

                    clickBehaviorMode: nextStore[key]?.settings?.clickBehaviorMode !== 'inherit'

                        ? nextStore[key]?.settings?.clickBehaviorMode

                        : nextStore[nextKey]?.settings?.clickBehaviorMode

                });

                nextStore[nextKey] = {

                    nodes: dedupeNodes([...(nextStore[nextKey]?.nodes || []), ...(nextStore[key]?.nodes || [])]),

                    settings: mergedSettings

                };

            }

            if (nextKey !== key) delete nextStore[key];

        });

        writeStore(nextStore, false);

    }



    function deleteCategoryEverywhere(categoryName) {

        const targetCategory = normalizeCategoryName(categoryName);

        const nextStore = cloneStore();

        Object.keys(nextStore).forEach((key) => {

            const parts = String(key).split('::');

            parts.shift();

            const scopedCategory = normalizeCategoryName(parts.join('::'));

            if (scopedCategory === targetCategory) {

                delete nextStore[key];

            }

        });

        writeStore(nextStore, false);

    }



    function moveWorkspaceTrees(sourceWorkspaceId, targetWorkspaceId) {

        const sourceWorkspace = normalizeWorkspaceId(sourceWorkspaceId);

        const targetWorkspace = normalizeWorkspaceId(targetWorkspaceId);

        if (!sourceWorkspace || !targetWorkspace || sourceWorkspace === targetWorkspace) return;



        const nextStore = cloneStore();

        Object.keys(nextStore).forEach((key) => {

            const parts = String(key).split('::');

            const workspaceId = parts.shift() || 'main';

            const categoryName = normalizeCategoryName(parts.join('::'));

            if (workspaceId !== sourceWorkspace) return;

            const nextKey = buildScopedKey(targetWorkspace, categoryName);

            if (!nextStore[nextKey]) {

                nextStore[nextKey] = nextStore[key];

            } else {

                const mergedSettings = normalizeTreeSettings({

                    clickBehaviorMode: nextStore[key]?.settings?.clickBehaviorMode !== 'inherit'

                        ? nextStore[key]?.settings?.clickBehaviorMode

                        : nextStore[nextKey]?.settings?.clickBehaviorMode

                });

                nextStore[nextKey] = {

                    nodes: dedupeNodes([...(nextStore[nextKey]?.nodes || []), ...(nextStore[key]?.nodes || [])]),

                    settings: mergedSettings

                };

            }

            if (nextKey !== key) delete nextStore[key];

        });

        writeStore(nextStore, false);

    }



    function getActiveCategoryContext(categoryName) {

        return normalizeCategoryName(categoryName || window.currentCategoryCtx || window.ctxCatName || 'Unsorted');

    }



    function parseDragPayload(dataTransfer) {

        const rawJson = dataTransfer?.getData("application/json") || dataTransfer?.getData("text/plain") || '';

        let dragIds = [];

        try {

            const parsed = JSON.parse(rawJson);

            if (Array.isArray(parsed?.ids)) {

                dragIds = parsed.ids.map((item) => String(item));

            } else if (parsed !== null && parsed !== undefined && rawJson) {

                dragIds = [String(parsed)];

            }

        } catch (error) {

            if (rawJson) dragIds = [String(rawJson)];

        }

        return dragIds.filter(Boolean);

    }



    function moveLinksToFolderTarget(linkIds, workspaceId, categoryName, folderId) {

        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);

        const targetCategoryName = normalizeCategoryName(categoryName);

        const normalizedFolderId = normalizeFolderId(folderId);

        const validFolderId = normalizedFolderId && getFolderById(targetWorkspaceId, targetCategoryName, normalizedFolderId)

            ? normalizedFolderId

            : '';



        if (!Array.isArray(window.eveState?.links) || !linkIds.length) return false;

        let movedAny = false;

        const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;



        window.eveState.links.forEach((link) => {

            if (!linkIds.includes(String(link?.id))) return;

            const nextWorkspaceId = targetWorkspaceId;

            const nextCategoryName = targetCategoryName;

            const currentFolderId = normalizeFolderId(link?.folderId);

            const alreadyAtTarget = normalizeWorkspaceId(link?.workspace) === nextWorkspaceId

                && normalizeCategoryName(link?.category) === nextCategoryName

                && currentFolderId === validFolderId;

            if (alreadyAtTarget) return;



            link.workspace = nextWorkspaceId;

            link.category = nextCategoryName;

            if (validFolderId) link.folderId = validFolderId;

            else delete link.folderId;

            if (typeof syncLinked === 'function') syncLinked(link.id);

            movedAny = true;

        });



        if (movedAny && typeof saveData === 'function') saveData();

        return movedAny;

    }



    window.openBookmarkFolders = function (categoryName) {

        if (typeof openCategorySettings === 'function') {

            openCategorySettings(getActiveCategoryContext(categoryName), 'folders');

        }

    };



    window.toggleBookmarkFolderToolbar = function (categoryName, workspaceId) {

        toggleToolbarExpanded(workspaceId, getActiveCategoryContext(categoryName));

    };

    window.deleteBookmarkFolderPrompt = async function (categoryName, folderId) {

        const resolvedCategory = getActiveCategoryContext(categoryName);

        const target = getFolderById(normalizeWorkspaceId(), resolvedCategory, folderId);

        if (!target) return;

        const confirmed = typeof showConfirm === 'function'

            ? await showConfirm(`Delete "${target.name}"? Bookmarks move to the parent/root and subfolders move up one level.`)

            : window.confirm(`Delete "${target.name}"? Bookmarks move to the parent/root and subfolders move up one level.`);

        if (!confirmed) return;

        if (!deleteFolder({

            workspaceId: normalizeWorkspaceId(),

            categoryName: resolvedCategory,

            folderId

        })) return;

        if (typeof showToast === 'function') showToast(`Folder "${target.name}" removed`, 'success');

        if (typeof window.renderCategoryFolderManager === 'function') {

            window.renderCategoryFolderManager();

        }

    };



    window.openAddModalForFolder = function (categoryName, folderId) {

        if (typeof openAddModal === 'function') {

            openAddModal({

                category: getActiveCategoryContext(categoryName),

                folderId: normalizeFolderId(folderId)

            });

        }

    };



    window.promptCreateBookmarkFolder = function (categoryName, parentId) {

        const resolvedCategory = getActiveCategoryContext(categoryName);

        if (typeof window.openFolderCreator === 'function') {

            window.openFolderCreator(resolvedCategory, parentId);

        }

    };



    window.promptRenameBookmarkFolder = function (categoryName, folderId) {

        const resolvedCategory = getActiveCategoryContext(categoryName);

        if (typeof window.openFolderRenamer === 'function') {

            window.openFolderRenamer(resolvedCategory, folderId);

        }

    };





    window.moveBookmarksToFolderDrop = function (event, categoryName, folderId, workspaceId) {

        if (event) {

            event.preventDefault();

            event.stopPropagation();

        }



        const rawData = event.dataTransfer?.getData('text/plain') || event.dataTransfer?.getData('application/json');

        if (!rawData) return;



        let payload = null;

        try {

            payload = JSON.parse(rawData);

        } catch (e) {

            // Not a JSON payload, probably standard bookmark link ID list

        }



        // 1. Check if it's a folder payload (Cross-Card or Intra-Card folder move)

        if (payload && payload.type === 'folder' && payload.id) {

            const folderIdToMove = payload.id;

            const targetFolderId = normalizeFolderId(folderId);

            if (folderIdToMove === targetFolderId) return;



            const isCrossCard = (payload.sourceWorkspace && payload.sourceWorkspace !== workspaceId) ||

                               (payload.sourceCategory && payload.sourceCategory !== categoryName);



            if (isCrossCard) {

                if (!payload.sourceWorkspace || !payload.sourceCategory) {

                    console.warn('[moveBookmarksToFolderDrop] Cross-card transfer aborted: Missing source metadata.', payload);

                    return;

                }

                transferFolderToCategory(

                    folderIdToMove,

                    payload.sourceWorkspace,

                    payload.sourceCategory,

                    workspaceId,

                    categoryName,

                    targetFolderId

                );

            } else {

                moveFolder(workspaceId, categoryName, folderIdToMove, targetFolderId);

            }



            if (typeof window.renderDashboard === 'function') window.renderDashboard();

            return;

        }



        // 2. Fallback: Check for bookmark link IDs

        const linkIds = parseDragPayload(event?.dataTransfer);

        if (!linkIds.length) return;

        moveLinksToFolderTarget(linkIds, workspaceId, getActiveCategoryContext(categoryName), folderId);

    };



    if (!window.__eveBookmarkFolderEditorBinding) {

        window.__eveBookmarkFolderEditorBinding = true;

        document.addEventListener('input', (event) => {

            if (event.target?.id !== 'newCategory') return;

            refreshEditorFolderSelect();

        });

        document.addEventListener('change', (event) => {

            if (event.target?.id !== 'newCategory') return;

            refreshEditorFolderSelect();

        });

    }

    Object.assign(ns, {
        getFolderById,
        buildFolderPathLabel,
        isToolbarExpanded,
        setToolbarExpanded,
        toggleToolbarExpanded,
        getFolderOptions,
        populateFolderSelect,
        refreshEditorFolderSelect,
        createFolder,
        renameFolder,
        moveFolder,
        transferFolderToCategory,
        deleteFolder,
        clearLinkFolderAssignment,
        renameCategoryEverywhere,
        deleteCategoryEverywhere,
        moveWorkspaceTrees,
        moveLinksToFolderTarget
    });
})(window.EveBookmarkFolders);
