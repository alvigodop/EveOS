window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const CLICK_BEHAVIOR_MODES = new Set(['inherit', 'invert', 'focus_only', 'open_and_focus', 'open_only']);
    const TASK_MODES = new Set(['inherit', 'task', 'non_task']);

    function getFolderStore() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {
            return window.eveState.bookmarkFolders;
        }
        if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') {
            return bookmarkFolders;
        }
        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') {
            return window.bookmarkFolders;
        }
        return {};
    }

    function normalizeWorkspaceId(workspaceId) {
        const value = String(
            workspaceId
            || window.eveState?.config?.activeWorkspace
            || (typeof config !== 'undefined' ? config?.activeWorkspace : '')
            || 'main'
        ).trim();
        return value || 'main';
    }

    function normalizeCategoryName(categoryName) {
        return String(categoryName || '').trim() || 'Unsorted';
    }

    function normalizeFolderId(folderId) {
        return String(folderId || '').trim();
    }

    function normalizeParentId(parentId) {
        const normalized = normalizeFolderId(parentId);
        return normalized || null;
    }

    function normalizeClickBehaviorMode(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return CLICK_BEHAVIOR_MODES.has(normalized) ? normalized : 'inherit';
    }

    function normalizeTaskMode(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return TASK_MODES.has(normalized) ? normalized : 'inherit';
    }

    function normalizeTreeSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        return {
            clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode)
        };
    }

    function buildScopedKey(workspaceId, categoryName) {
        return `${normalizeWorkspaceId(workspaceId)}::${normalizeCategoryName(categoryName)}`;
    }

    function getToolbarConfigStore() {
        if (!window.eveState?.config) return [];
        if (!Array.isArray(window.eveState.config.bookmarkFolderToolbarExpanded)) {
            window.eveState.config.bookmarkFolderToolbarExpanded = [];
        }
        return window.eveState.config.bookmarkFolderToolbarExpanded;
    }

    function getScopedTreeByKey(scopedKey) {
        const store = getFolderStore();
        const rawTree = store[scopedKey] || {};
        return {
            nodes: dedupeNodes(rawTree?.nodes || []),
            settings: normalizeTreeSettings(rawTree?.settings)
        };
    }

    function getScopedTree(workspaceId, categoryName) {
        return getScopedTreeByKey(buildScopedKey(workspaceId, categoryName));
    }

    function normalizeNode(node, index) {
        const normalizedId = normalizeFolderId(node?.id);
        if (!normalizedId) return null;
        return {
            id: normalizedId,
            parentId: normalizeParentId(node?.parentId),
            name: String(node?.name || 'Folder').trim() || 'Folder',
            order: Number.isFinite(Number(node?.order)) ? Number(node.order) : index,
            createdAt: Number.isFinite(Number(node?.createdAt)) ? Number(node.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(node?.updatedAt)) ? Number(node.updatedAt) : Date.now(),
            clickBehaviorMode: normalizeClickBehaviorMode(node?.clickBehaviorMode),
            taskMode: normalizeTaskMode(node?.taskMode)
        };
    }

    function dedupeNodes(nodes) {
        const seen = new Set();
        return (Array.isArray(nodes) ? nodes : [])
            .map((node, index) => normalizeNode(node, index))
            .filter((node) => {
                if (!node || seen.has(node.id)) return false;
                seen.add(node.id);
                return true;
            });
    }

    function treeHasMeaningfulState(tree) {
        const settings = normalizeTreeSettings(tree?.settings);
        const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
        return nodes.length > 0 || settings.clickBehaviorMode !== 'inherit';
    }

    function getScopedNodes(workspaceId, categoryName) {
        return dedupeNodes(getScopedTree(workspaceId, categoryName)?.nodes || []);
    }

    function cloneStore() {
        const store = getFolderStore();
        const nextStore = {};
        Object.keys(store || {}).forEach((key) => {
            const normalizedTree = getScopedTreeByKey(key);
            if (!treeHasMeaningfulState(normalizedTree)) return;
            nextStore[key] = {
                nodes: normalizedTree.nodes,
                settings: normalizedTree.settings
            };
        });
        return nextStore;
    }

    function writeStore(nextStore, persist = true) {
        if (typeof bookmarkFolders !== 'undefined') {
            bookmarkFolders = nextStore;
        }
        window.bookmarkFolders = nextStore;
        if (persist && typeof saveData === 'function') {
            saveData();
        }
    }

    function setScopedTree(workspaceId, categoryName, tree, options = {}) {
        const persist = options.persist !== false;
        const normalizedNodes = dedupeNodes(tree?.nodes || []);
        const normalizedSettings = normalizeTreeSettings(tree?.settings);
        const nextStore = cloneStore();
        const scopedKey = buildScopedKey(workspaceId, categoryName);
        if (normalizedNodes.length > 0 || normalizedSettings.clickBehaviorMode !== 'inherit') {
            nextStore[scopedKey] = {
                nodes: normalizedNodes,
                settings: normalizedSettings
            };
        } else {
            delete nextStore[scopedKey];
        }
        writeStore(nextStore, persist);
        return nextStore[scopedKey] || { nodes: [], settings: normalizeTreeSettings({}) };
    }

    function setScopedNodes(workspaceId, categoryName, nodes, options = {}) {
        const currentTree = getScopedTree(workspaceId, categoryName);
        const nextTree = setScopedTree(workspaceId, categoryName, {
            nodes,
            settings: currentTree.settings
        }, options);
        return nextTree.nodes;
    }

    function buildNodeMap(nodes) {
        const map = new Map();
        dedupeNodes(nodes).forEach((node) => map.set(node.id, node));
        return map;
    }

    function buildChildrenMap(nodes) {
        const map = new Map();
        dedupeNodes(nodes).forEach((node) => {
            const parentId = normalizeParentId(node.parentId);
            if (!map.has(parentId)) map.set(parentId, []);
            map.get(parentId).push(node);
        });
        map.forEach((siblings) => {
            siblings.sort((a, b) => {
                const orderDiff = (Number(a.order) || 0) - (Number(b.order) || 0);
                if (orderDiff !== 0) return orderDiff;
                return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
            });
        });
        return map;
    }

    function buildFolderView(workspaceId, categoryName, cardLinks) {
        const scopedNodes = getScopedNodes(workspaceId, categoryName);
        const nodeMap = buildNodeMap(scopedNodes);
        const childrenMap = buildChildrenMap(scopedNodes);
        const folderLinks = new Map();
        const rootLinks = [];

        (Array.isArray(cardLinks) ? cardLinks : []).forEach((link) => {
            const folderId = normalizeFolderId(link?.folderId);
            if (folderId && nodeMap.has(folderId)) {
                if (!folderLinks.has(folderId)) folderLinks.set(folderId, []);
                folderLinks.get(folderId).push(link);
                return;
            }
            rootLinks.push(link);
        });

        return {
            nodes: scopedNodes,
            nodeMap,
            childrenMap,
            folderLinks,
            rootLinks,
            topLevelFolders: childrenMap.get(null) || []
        };
    }

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
        setScopedNodes(workspaceId, categoryName, nodes);
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
        const sWs = normalizeWorkspaceId(sourceWs);
        const sCat = normalizeCategoryName(sourceCat);
        const tWs = normalizeWorkspaceId(targetWs);
        const tCat = normalizeCategoryName(targetCat);
        const fId = normalizeFolderId(folderId);
        const tpId = normalizeParentId(targetParentId);

        if (!fId) return false;
        
        // If it's the same card, just use the local moveFolder logic
        if (sWs === tWs && sCat === tCat) {
            return moveFolder(sWs, sCat, fId, tpId);
        }

        const sourceNodes = getScopedNodes(sWs, sCat);
        if (!sourceNodes || sourceNodes.length === 0) return false;

        const targetNodes = getScopedNodes(tWs, tCat);

        // Find the folder and all its descendants in the source
        const nodeMap = buildNodeMap(sourceNodes);
        const childrenMap = buildChildrenMap(sourceNodes);

        const toMoveIds = new Set();
        function collect(id) {
            toMoveIds.add(id);
            (childrenMap.get(id) || []).forEach(child => collect(child.id));
        }

        const rootNode = nodeMap.get(fId);
        if (!rootNode) return false;
        collect(fId);

        // Update parent of the root moved node BEFORE adding to target
        rootNode.parentId = tpId;
        rootNode.updatedAt = Date.now();

        // 1. Prepare moved nodes
        const movedNodes = sourceNodes.filter(n => toMoveIds.has(n.id));
        if (movedNodes.length === 0) return false;

        // 2. Add nodes to target first (Hardening: Ensure target is updated before source removal)
        const finalTargetNodes = [...targetNodes, ...movedNodes];
        setScopedNodes(tWs, tCat, finalTargetNodes, { persist: false });

        // 3. Update all bookmarks in these folders to the new category/workspace
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

        // 4. Remove nodes from source (Now safe because target and links are updated)
        const remainingSourceNodes = sourceNodes.filter(n => !toMoveIds.has(n.id));
        setScopedNodes(sWs, sCat, remainingSourceNodes, { persist: false });

        if (typeof saveData === 'function') saveData();
        return true;
    }


    function getCardClickBehaviorMode(workspaceId, categoryName) {

        return normalizeTreeSettings(getScopedTree(workspaceId, categoryName)?.settings).clickBehaviorMode;
    }

    function setCardClickBehaviorMode(workspaceId, categoryName, mode, options = {}) {
        const currentTree = getScopedTree(workspaceId, categoryName);
        return setScopedTree(workspaceId, categoryName, {
            nodes: currentTree.nodes,
            settings: {
                ...currentTree.settings,
                clickBehaviorMode: normalizeClickBehaviorMode(mode)
            }
        }, options).settings.clickBehaviorMode;
    }

    function getFolderClickBehaviorMode(workspaceId, categoryName, folderId) {
        const folder = getFolderById(workspaceId, categoryName, folderId);
        return normalizeClickBehaviorMode(folder?.clickBehaviorMode);
    }

    function setFolderClickBehaviorMode(workspaceId, categoryName, folderId, mode) {
        const normalizedFolderId = normalizeFolderId(folderId);
        if (!normalizedFolderId) return 'inherit';
        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === normalizedFolderId);
        if (!target) return 'inherit';
        target.clickBehaviorMode = normalizeClickBehaviorMode(mode);
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes);
        return target.clickBehaviorMode;
    }

    function getFolderTaskMode(workspaceId, categoryName, folderId) {
        const folder = getFolderById(workspaceId, categoryName, folderId);
        return normalizeTaskMode(folder?.taskMode);
    }

    function setFolderTaskMode(workspaceId, categoryName, folderId, mode) {
        const normalizedFolderId = normalizeFolderId(folderId);
        if (!normalizedFolderId) return 'inherit';
        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === normalizedFolderId);
        if (!target) return 'inherit';
        target.taskMode = normalizeTaskMode(mode);
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes);
        return target.taskMode;
    }

    function getFolderTaskModeChain(workspaceId, categoryName, folderId) {
        const normalizedFolderId = normalizeFolderId(folderId);
        if (!normalizedFolderId) return [];
        const nodeMap = buildNodeMap(getScopedNodes(workspaceId, categoryName));
        const chain = [];
        let cursor = nodeMap.get(normalizedFolderId) || null;
        let guard = 0;
        while (cursor && guard < 64) {
            chain.unshift(cursor);
            cursor = cursor.parentId ? (nodeMap.get(cursor.parentId) || null) : null;
            guard += 1;
        }
        return chain;
    }

    function getHideStatsStore() {
        if (Array.isArray(window.eveState?.config?.hideStats)) return window.eveState.config.hideStats;
        if (typeof config !== 'undefined' && Array.isArray(config?.hideStats)) return config.hideStats;
        return [];
    }

    function isCardTaskEnabled(workspaceId, categoryName) {
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        return !getHideStatsStore().includes(normalizedCategoryName);
    }

    function resolveTaskState(workspaceId, categoryName, folderId) {
        let isEnabled = isCardTaskEnabled(workspaceId, categoryName);
        getFolderTaskModeChain(workspaceId, categoryName, folderId).forEach((node) => {
            const mode = normalizeTaskMode(node?.taskMode);
            if (mode === 'task') isEnabled = true;
            if (mode === 'non_task') isEnabled = false;
        });
        return isEnabled;
    }

    function findLinkById(linkId) {
        const targetId = String(linkId || '').trim();
        if (!targetId) return null;
        const source = Array.isArray(window.eveState?.links)
            ? window.eveState.links
            : (typeof links !== 'undefined' && Array.isArray(links) ? links : []);
        return source.find((link) => String(link?.id || '').trim() === targetId) || null;
    }

    function isTaskEnabledForLink(linkOrId) {
        const link = (linkOrId && typeof linkOrId === 'object')
            ? linkOrId
            : findLinkById(linkOrId);
        if (!link || typeof link !== 'object') return false;
        return resolveTaskState(
            normalizeWorkspaceId(link.workspace),
            normalizeCategoryName(link.category),
            normalizeFolderId(link.folderId)
        );
    }

    function getTaskModeOptions() {
        return [
            { value: 'inherit', label: 'Inherit Card Task Mode' },
            { value: 'task', label: 'Force Task' },
            { value: 'non_task', label: 'Force Non-Task' }
        ];
    }

    function describeTaskMode(mode) {
        switch (normalizeTaskMode(mode)) {
            case 'task':
                return 'Bookmarks in this folder behave as tasks even if the card is not in task mode.';
            case 'non_task':
                return 'Bookmarks in this folder do not behave as tasks even if the card is in task mode.';
            default:
                return 'This folder follows the card task mode unless a deeper subfolder overrides it.';
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

    window.moveBookmarksToFolderDrop = function (event, categoryName, folderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
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

    ns.buildScopedKey = buildScopedKey;
    ns.getScopedTree = getScopedTree;
    ns.setScopedTree = setScopedTree;
    ns.getScopedNodes = getScopedNodes;
    ns.setScopedNodes = setScopedNodes;
    ns.getFolderById = getFolderById;
    ns.buildFolderView = buildFolderView;
    ns.buildFolderPathLabel = buildFolderPathLabel;
    ns.isToolbarExpanded = isToolbarExpanded;
    ns.setToolbarExpanded = setToolbarExpanded;
    ns.toggleToolbarExpanded = toggleToolbarExpanded;
    ns.getFolderOptions = getFolderOptions;
    ns.populateFolderSelect = populateFolderSelect;
    ns.refreshEditorFolderSelect = refreshEditorFolderSelect;
    ns.createFolder = createFolder;
    ns.renameFolder = renameFolder;
    ns.moveFolder = moveFolder;
    ns.transferFolderToCategory = transferFolderToCategory;
    ns.deleteFolder = deleteFolder;

    ns.clearLinkFolderAssignment = clearLinkFolderAssignment;
    ns.renameCategoryEverywhere = renameCategoryEverywhere;
    ns.deleteCategoryEverywhere = deleteCategoryEverywhere;
    ns.moveWorkspaceTrees = moveWorkspaceTrees;
    ns.moveLinksToFolderTarget = moveLinksToFolderTarget;
    ns.normalizeClickBehaviorMode = normalizeClickBehaviorMode;
    ns.normalizeTaskMode = normalizeTaskMode;
    ns.getCardClickBehaviorMode = getCardClickBehaviorMode;
    ns.setCardClickBehaviorMode = setCardClickBehaviorMode;
    ns.getFolderClickBehaviorMode = getFolderClickBehaviorMode;
    ns.setFolderClickBehaviorMode = setFolderClickBehaviorMode;
    ns.getFolderTaskMode = getFolderTaskMode;
    ns.setFolderTaskMode = setFolderTaskMode;
    ns.getFolderTaskModeChain = getFolderTaskModeChain;
    ns.isCardTaskEnabled = isCardTaskEnabled;
    ns.resolveTaskState = resolveTaskState;
    ns.isTaskEnabledForLink = isTaskEnabledForLink;
    ns.getTaskModeOptions = getTaskModeOptions;
    ns.describeTaskMode = describeTaskMode;
})(window.EveBookmarkFolders);
