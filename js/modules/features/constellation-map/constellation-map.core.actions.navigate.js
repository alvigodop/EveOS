window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const shared = ns._shared || {};
    const view = ns._view || {};
    const helpers = ns._coreActionHelpers || {};

    const { state, getConfig, text } = shared;
    const { centerOnNode } = view;
    const { bringModalAboveConstellation } = helpers;

    function openFolderFromMap(node) {
        const data = node?.data || {};
        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');
        const categoryName = text(data.categoryName, '');
        const folderId = text(data.folderId, '');

        if (!categoryName || !folderId || !window.EveFolderViewV2?.enterFolder) return false;

        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {
            window.switchWorkspace(workspaceId);
        }
        if (categoryName && typeof window.setFocus === 'function') {
            window.setFocus(categoryName);
        }

        window.setTimeout(() => {
            try {
                window.EveFolderViewV2.enterFolder(null, categoryName, folderId, workspaceId);
            } catch (error) {
                console.warn('[ConstellationMap] Failed to open folder from map', error);
            }
        }, 70);

        ns.closeMap();
        return true;
    }

    function openCategorySettingsFromMap(node) {
        const data = node?.data || {};
        const workspaceId = text(data.workspaceId, getConfig().activeWorkspace || 'main');
        const categoryName = text(data.categoryName, '');

        if (!categoryName || typeof window.openCategorySettings !== 'function') return false;

        if (workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(workspaceId)) {
            window.switchWorkspace(workspaceId);
        }
        if (typeof window.setFocus === 'function') {
            window.setFocus(categoryName);
        }

        window.setTimeout(() => {
            try {
                window.openCategorySettings(categoryName);
                bringModalAboveConstellation('categorySettingsModal');
                bringModalAboveConstellation('settingsModal');
            } catch (error) {
                console.warn('[ConstellationMap] Failed to open card settings from map', error);
            }
        }, 60);

        return true;
    }

    function activateNode(node) {
        if (!node) return;
        const data = node.data || {};

        if (node.kind === 'link' && data.linkId && typeof window.openBookmarkFromDashboard === 'function') {
            window.openBookmarkFromDashboard({ preventDefault() {}, stopPropagation() {} }, data.linkId);
            bringModalAboveConstellation('bookmarkFocusModal');
            return;
        }

        if (node.kind === 'workspace' && data.workspaceId && typeof window.switchWorkspace === 'function') {
            window.switchWorkspace(data.workspaceId);
            ns.closeMap();
            return;
        }

        if (node.kind === 'category' && data.categoryName) {
            if (data.workspaceId && typeof window.switchWorkspace === 'function' && String(getConfig().activeWorkspace || 'main') !== String(data.workspaceId)) {
                window.switchWorkspace(data.workspaceId);
            }
            if (typeof window.setFocus === 'function') {
                window.setFocus(data.categoryName);
                ns.closeMap();
                return;
            }
        }

        if (node.kind === 'folder' && data.folderId && data.categoryName && openFolderFromMap(node)) {
            return;
        }

        centerOnNode(node, Math.max(state.transform.scale, 1.2));
    }

    ns._coreActionNavigate = Object.assign(ns._coreActionNavigate || {}, {
        activateNode,
        openFolderFromMap,
        openCategorySettingsFromMap
    });
})(window.EveConstellationMap);
