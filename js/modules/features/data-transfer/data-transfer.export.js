// --- Data Transfer Export Actions ---
window.EveDataTransfer = window.EveDataTransfer || {};

(function () {
    const ns = window.EveDataTransfer;
    if (ns.exportReady) return;
    if (!ns.sharedReady || !ns.exportUtilsReady || !ns.exportFolderReady) {
        console.warn('[DataTransfer] Export helpers missing; export actions not initialized.');
        return;
    }

    const getDataStore = ns.getDataStore;
    const getAppConfig = ns.getAppConfig;
    const getAppLinks = ns.getAppLinks;
    const getWorkspaceSelect = ns.getWorkspaceSelect;
    const getGroupSelect = ns.getGroupSelect;
    const getCardWorkspaceSelect = ns.getCardWorkspaceSelect;
    const getCardCategorySelect = ns.getCardCategorySelect;
    const getBookmarkWorkspaceSelect = ns.getBookmarkWorkspaceSelect;
    const getBookmarkCategorySelect = ns.getBookmarkCategorySelect;
    const getBookmarkLinkSelect = ns.getBookmarkLinkSelect;
    const getFolderWorkspaceSelect = ns.getFolderWorkspaceSelect;
    const getFolderCategorySelect = ns.getFolderCategorySelect;
    const getFolderSelect = ns.getFolderSelect;
    const getSidebarGroups = ns.getSidebarGroups;
    const getBookmarkFolderNodesForScope = ns.getBookmarkFolderNodesForScope;
    const buildWorkspacePayload = ns.buildWorkspacePayload;
    const buildCardPayload = ns.buildCardPayload;
    const exportWorkspaceFolderFallback = ns.exportWorkspaceFolderFallback;
    const exportGroupFolderFallback = ns.exportGroupFolderFallback;
    const exportCardFolderFallback = ns.exportCardFolderFallback;
    const exportFolderFolderFallback = ns.exportFolderFolderFallback;
    const buildFullBackupJsonName = ns.buildFullBackupJsonName;
    const buildWorkspaceBackupJsonName = ns.buildWorkspaceBackupJsonName;
    const buildGroupBackupJsonName = ns.buildGroupBackupJsonName;
    const buildCardBackupJsonName = ns.buildCardBackupJsonName;
    const buildFolderBackupJsonName = ns.buildFolderBackupJsonName;
    const buildBookmarkBackupJsonName = ns.buildBookmarkBackupJsonName;
    const requireLayerDestinationPath = ns.requireLayerDestinationPath;
    const persistLayerDestinationPath = ns.persistLayerDestinationPath;
    const canUseServerFolderBackups = typeof ns.canUseServerFolderBackups === 'function'
        ? ns.canUseServerFolderBackups
        : (modularSync) => /^https?:$/i.test(window.location?.protocol || '') && typeof modularSync?.backupLayer === 'function';

    function downloadJsonBackup(fileName, payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = String(fileName || 'eve_backup.json').trim() || 'eve_backup.json';
        anchor.click();
        if (typeof URL.revokeObjectURL === 'function') {
            setTimeout(() => URL.revokeObjectURL(url), 500);
        }
    }

    function getWorkspaceName(workspaceId, appConfig = getAppConfig()) {
        return appConfig.workspaces?.find((workspace) => workspace.id === workspaceId)?.name || workspaceId;
    }

    function downloadWorkspaceBackupJson(workspaceId, workspaceName, exportState) {
        downloadJsonBackup(buildWorkspaceBackupJsonName(workspaceId, workspaceName), exportState);
    }

    function downloadGroupBackupJson(groupId, groupName, exportState) {
        downloadJsonBackup(buildGroupBackupJsonName(groupId, groupName), exportState);
    }

    function downloadCardBackupJson(workspaceId, workspaceName, categoryName, exportState) {
        downloadJsonBackup(buildCardBackupJsonName(workspaceId, workspaceName, categoryName), exportState);
    }

    function downloadFolderBackupJson(workspaceId, workspaceName, categoryName, folderNode, exportState) {
        downloadJsonBackup(buildFolderBackupJsonName(workspaceId, workspaceName, categoryName, folderNode), exportState);
    }

    window.exportWorkspaceBackupJsonOnly = function () {
        const dataStore = getDataStore();
        const select = getWorkspaceSelect();
        const appConfig = getAppConfig();
        const workspaceId = (select?.value || appConfig.activeWorkspace || '').trim();
        if (!workspaceId) {
            return showToast('No workspace selected for export.', 'error');
        }
        const workspaceName = getWorkspaceName(workspaceId, appConfig);
        const workspaceState = dataStore?.captureWorkspace
            ? dataStore.captureWorkspace(workspaceId)
            : buildWorkspacePayload(workspaceId);
        downloadWorkspaceBackupJson(workspaceId, workspaceName, workspaceState);
        showToast('Tab backup downloaded as JSON.', 'info');
    };

    window.exportGroupBackupJsonOnly = function () {
        const dataStore = getDataStore();
        const select = getGroupSelect();
        const groupId = String(select?.value || '').trim();
        if (!groupId) {
            return showToast('Select a group first.', 'error');
        }
        const group = (getSidebarGroups?.() || []).find((entry) => String(entry?.id || '').trim() === groupId);
        const groupName = String(group?.name || groupId).trim() || groupId;
        const groupState = dataStore?.captureGroup ? dataStore.captureGroup(groupId) : null;
        if (!groupState) {
            return showToast('Could not build group backup payload.', 'error');
        }
        downloadGroupBackupJson(groupId, groupName, groupState);
        showToast('Group backup downloaded as JSON.', 'info');
    };

    window.exportCardBackupJsonOnly = function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getCardWorkspaceSelect();
        const categorySelect = getCardCategorySelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        if (!workspaceId || !categoryName) {
            return showToast('Select workspace and card category first.', 'error');
        }
        const workspaceName = getWorkspaceName(workspaceId, appConfig);
        const cardState = dataStore?.captureCard
            ? dataStore.captureCard(workspaceId, categoryName)
            : buildCardPayload(workspaceId, categoryName);
        downloadCardBackupJson(workspaceId, workspaceName, categoryName, cardState);
        showToast('Card backup downloaded as JSON.', 'info');
    };

    window.exportBookmarkBackupJsonOnly = function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getBookmarkWorkspaceSelect();
        const categorySelect = getBookmarkCategorySelect();
        const linkSelect = getBookmarkLinkSelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        const linkId = String(linkSelect?.value || '').trim();
        if (!workspaceId || !categoryName || !linkId) {
            return showToast('Select workspace, category, and bookmark first.', 'error');
        }

        const selectedLink = getAppLinks().find((entry) => String(entry.id) === linkId);
        const exportState = dataStore?.captureBookmark
            ? dataStore.captureBookmark(workspaceId, categoryName, linkId)
            : null;
        if (!exportState) {
            return showToast('Could not build bookmark backup payload.', 'error');
        }

        const workspaceName = getWorkspaceName(workspaceId, appConfig);
        downloadJsonBackup(
            buildBookmarkBackupJsonName(
                workspaceId,
                workspaceName,
                categoryName,
                selectedLink || exportState?.bookmarks?.links?.[0] || { id: linkId }
            ),
            exportState
        );
        showToast('Bookmark backup downloaded as JSON.', 'info');
    };

    window.exportFolderBackupJsonOnly = function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getFolderWorkspaceSelect();
        const categorySelect = getFolderCategorySelect();
        const folderSelect = getFolderSelect();
        const workspaceId = String(wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = String(categorySelect?.value || '').trim();
        const folderId = String(folderSelect?.value || '').trim();
        if (!workspaceId || !categoryName || !folderId) {
            return showToast('Select workspace, card, and folder first.', 'error');
        }

        const workspaceName = getWorkspaceName(workspaceId, appConfig);
        const folderNode = getBookmarkFolderNodesForScope(workspaceId, categoryName)
            .find((node) => String(node?.id || '').trim() === folderId) || { id: folderId };
        const exportState = dataStore?.captureFolder
            ? dataStore.captureFolder(workspaceId, categoryName, folderId)
            : null;
        if (!exportState) {
            return showToast('Could not build folder backup payload.', 'error');
        }

        downloadFolderBackupJson(workspaceId, workspaceName, categoryName, folderNode, exportState);
        showToast('Folder backup downloaded as JSON.', 'info');
    };

    window.exportWorkspaceBackup = async function () {
        const dataStore = getDataStore();
        const select = getWorkspaceSelect();
        const appConfig = getAppConfig();
        const workspaceId = (select?.value || appConfig.activeWorkspace || '').trim();
        if (!workspaceId) {
            return showToast('No workspace selected for export.', 'error');
        }
        const workspaceName = getWorkspaceName(workspaceId, appConfig);
        const modularSync = window.EveDataStore?.ModularSync;
        const workspaceState = dataStore?.captureWorkspace
            ? dataStore.captureWorkspace(workspaceId)
            : buildWorkspacePayload(workspaceId);

        if (canUseServerFolderBackups(modularSync)) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                const result = await modularSync.backupLayer({
                    layer: 'tab',
                    workspaceId,
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    return showToast(`Tab folder backup created: ${result.destinationPath}`, 'success');
                }
                console.warn('[DataTransfer] Tab layer backup failed in server mode, trying browser folder fallback:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Tab layer backup failed in server mode, trying browser folder fallback:', error);
            }
        }

        try {
            const folderResult = await exportWorkspaceFolderFallback(workspaceState, workspaceId, workspaceName);
            if (folderResult?.ok) {
                return showToast(
                    `Tab backup created (${folderResult.cards} cards, ${folderResult.bookmarks} bookmarks).`,
                    'success'
                );
            }
            if (folderResult?.error) {
                showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Tab backup canceled.', 'info');
            }
            console.warn('[DataTransfer] Tab backup failed, falling back to JSON:', error);
        }

        downloadWorkspaceBackupJson(workspaceId, workspaceName, workspaceState);
        showToast('Tab backup downloaded as JSON.', 'info');
    };

    window.exportGroupBackup = async function () {
        const dataStore = getDataStore();
        const select = getGroupSelect();
        const groupId = String(select?.value || '').trim();
        if (!groupId) {
            return showToast('Select a group first.', 'error');
        }

        const group = (getSidebarGroups?.() || []).find((entry) => String(entry?.id || '').trim() === groupId);
        const groupName = String(group?.name || groupId).trim() || groupId;
        const groupState = dataStore?.captureGroup ? dataStore.captureGroup(groupId) : null;
        if (!groupState) {
            return showToast('Could not build group backup payload.', 'error');
        }

        try {
            const folderResult = await exportGroupFolderFallback(groupState, groupId, groupName);
            if (folderResult?.ok) {
                return showToast(
                    `Group backup created (${folderResult.tabs} tabs, ${folderResult.cards} cards, ${folderResult.bookmarks} bookmarks).`,
                    'success'
                );
            }
            if (folderResult?.error) {
                showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Group backup canceled.', 'info');
            }
            console.warn('[DataTransfer] Group backup failed, falling back to JSON:', error);
        }

        downloadGroupBackupJson(groupId, groupName, groupState);
        showToast('Group backup downloaded as JSON.', 'info');
    };

    window.exportCardBackup = async function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getCardWorkspaceSelect();
        const categorySelect = getCardCategorySelect();
        const workspaceId = (wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = (categorySelect?.value || '').trim();
        if (!workspaceId || !categoryName) {
            return showToast('Select workspace and card category first.', 'error');
        }
        const workspaceName = getWorkspaceName(workspaceId, appConfig);
        const modularSync = window.EveDataStore?.ModularSync;
        const cardState = dataStore?.captureCard
            ? dataStore.captureCard(workspaceId, categoryName)
            : buildCardPayload(workspaceId, categoryName);

        if (canUseServerFolderBackups(modularSync)) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                const result = await modularSync.backupLayer({
                    layer: 'card',
                    workspaceId,
                    categoryName,
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    return showToast(`Card folder backup created: ${result.destinationPath}`, 'success');
                }
                console.warn('[DataTransfer] Card layer backup failed in server mode, trying browser folder fallback:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Card layer backup failed in server mode, trying browser folder fallback:', error);
            }
        }

        try {
            const folderResult = await exportCardFolderFallback(cardState, workspaceId, categoryName, workspaceName);
            if (folderResult?.ok) {
                return showToast(`Card backup created (${folderResult.bookmarks} bookmarks).`, 'success');
            }
            if (folderResult?.error) {
                showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Card backup canceled.', 'info');
            }
            console.warn('[DataTransfer] Card backup failed, falling back to JSON:', error);
        }

        downloadCardBackupJson(workspaceId, workspaceName, categoryName, cardState);
        showToast('Card backup downloaded as JSON.', 'info');
    };

    window.exportBookmarkBackup = window.exportBookmarkBackupJsonOnly;

    window.exportFolderBackup = async function () {
        const dataStore = getDataStore();
        const appConfig = getAppConfig();
        const wsSelect = getFolderWorkspaceSelect();
        const categorySelect = getFolderCategorySelect();
        const folderSelect = getFolderSelect();
        const workspaceId = String(wsSelect?.value || appConfig.activeWorkspace || '').trim();
        const categoryName = String(categorySelect?.value || '').trim();
        const folderId = String(folderSelect?.value || '').trim();
        if (!workspaceId || !categoryName || !folderId) {
            return showToast('Select workspace, card, and folder first.', 'error');
        }

        const workspaceName = getWorkspaceName(workspaceId, appConfig);
        const folderNode = getBookmarkFolderNodesForScope(workspaceId, categoryName)
            .find((node) => String(node?.id || '').trim() === folderId) || { id: folderId };
        const modularSync = window.EveDataStore?.ModularSync;
        const exportState = dataStore?.captureFolder
            ? dataStore.captureFolder(workspaceId, categoryName, folderId)
            : null;
        if (!exportState) {
            return showToast('Could not build folder backup payload.', 'error');
        }

        if (canUseServerFolderBackups(modularSync)) {
            const destinationPath = await requireLayerDestinationPath();
            if (!destinationPath) return;
            try {
                const result = await modularSync.backupLayer({
                    layer: 'folder',
                    workspaceId,
                    categoryName,
                    folderId,
                    destinationPath
                });
                if (result?.ok) {
                    persistLayerDestinationPath(destinationPath);
                    return showToast(`Folder subtree backup created: ${result.destinationPath}`, 'success');
                }
                console.warn('[DataTransfer] Folder layer backup failed in server mode, falling back to JSON:', result?.error);
            } catch (error) {
                console.warn('[DataTransfer] Folder layer backup failed in server mode, falling back to JSON:', error);
            }
        }

        try {
            const folderResult = await exportFolderFolderFallback(exportState, workspaceId, categoryName, workspaceName);
            if (folderResult?.ok) {
                return showToast(`Folder subtree backup created (${folderResult.bookmarks} bookmarks).`, 'success');
            }
            if (folderResult?.error) {
                showToast(`${folderResult.error} Falling back to JSON download.`, 'info');
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                return showToast('Folder subtree backup canceled.', 'info');
            }
            console.warn('[DataTransfer] Folder subtree backup failed, falling back to JSON:', error);
        }

        downloadFolderBackupJson(workspaceId, workspaceName, categoryName, folderNode, exportState);
        showToast('Folder backup downloaded as JSON.', 'info');
    };

    ns.exportReady = true;
})();
