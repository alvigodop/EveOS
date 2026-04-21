window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    const shared = ns._shared || {};
    const {
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        buildChildrenMap,
        buildNodeMap,
        getScopedNodes,
        resolveLinkById
    } = shared;

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

        if (editId && typeof resolveLinkById === 'function') {

            const match = resolveLinkById(editId);

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



    

    Object.assign(api, {
        getFolderById,
        buildFolderPathLabel,
        getFolderOptions,
        populateFolderSelect,
        refreshEditorFolderSelect
    });
})(window.EveBookmarkFolders);
