window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const helpers = ns._coreActionHelpers || {};

    const { getConfig, text } = shared;
    const { hasArmedSource, promptForNodeName, ensureCategoryInOrder, refreshGraphAfterMutation } = helpers;

    async function createFolderFromNode(node, options = {}) {
        const data = node?.data || {};
        const targetKind = text(node?.kind, '');
        if (targetKind !== 'category' && targetKind !== 'folder') return false;

        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');
        const categoryName = text(data.categoryName, '');
        const parentId = targetKind === 'folder' ? text(data.folderId, '') : '';

        if (!categoryName || !window.EveBookmarkFolders?.createFolder) return false;

        const folderName = await promptForNodeName(
            parentId ? 'New subfolder name' : 'New folder name',
            parentId ? 'Detached Chain' : 'New Folder'
        );
        if (!folderName) return false;

        const folder = window.EveBookmarkFolders.createFolder({
            workspaceId,
            categoryName,
            parentId,
            name: folderName,
            persist: false
        });
        if (!folder?.id) return false;

        const folderNodeId = 'folder_' + workspaceId + '_' + categoryName + '_' + text(folder.id, '');
        const shouldAttach = options.attachArmedSource !== false && hasArmedSource();

        if (shouldAttach && typeof ns._commitConstellationRewireTarget === 'function') {
            const attached = ns._commitConstellationRewireTarget({
                workspaceId,
                categoryName,
                folderId: text(folder.id, ''),
                targetParentId: text(folder.id, ''),
                targetNodeId: folderNodeId
            }, {
                snapToTargetNodeId: folderNodeId,
                silent: false
            });
            if (attached) return true;
        }

        if (typeof saveData === 'function') {
            saveData({
                skipRender: true,
                skipSuggestions: true,
                source: 'constellation-folder-created',
                meta: { workspaceId, categoryName, folderId: text(folder.id, '') }
            });
        }

        refreshGraphAfterMutation(folderNodeId);

        if (typeof window.showToast === 'function') {
            window.showToast('Folder created inside the current chain.', 'success');
        }

        return true;
    }

    async function createCardAndAttachFromWorkspace(node) {
        const workspaceId = text(node?.data?.workspaceId, getConfig().activeWorkspace || 'main');
        if (!workspaceId) return false;

        if (!hasArmedSource()) {
            if (typeof window.showToast === 'function') {
                window.showToast('Arm a bookmark or folder first. Empty cards are not first-class map nodes yet.', 'warning');
            }
            return false;
        }

        const categoryName = await promptForNodeName('New card name', 'Detached Chain');
        if (!categoryName) return false;

        ensureCategoryInOrder(categoryName, workspaceId);

        if (typeof ns._commitConstellationRewireTarget === 'function') {
            return !!ns._commitConstellationRewireTarget({
                workspaceId,
                categoryName,
                folderId: '',
                targetParentId: '',
                targetNodeId: 'category_' + workspaceId + '_' + categoryName
            }, {
                snapToTargetNodeId: 'category_' + workspaceId + '_' + categoryName,
                silent: false
            });
        }

        return false;
    }

    ns._coreActionCreate = Object.assign(ns._coreActionCreate || {}, {
        createFolderFromNode,
        createCardAndAttachFromWorkspace
    });
})(window.EveConstellationMap);
