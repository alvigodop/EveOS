(function () {
    const core = window.EveCategorySettingsModalCore || {};
    const {
        getCategorySettingsWorkspaceId,
        getFolderApi,
        getHeaderButtonApi,
        getBookmarkProgressiveRevealApi,
        getClickBehaviorApi,
        getPinApi,
        getFolderActionExpansionStore,
        folderActionExpansionKey,
        getFolderDraftCategoryName,
        getFolderDraftMode,
        isCategorySettingsVisibleFor,
        refreshCategoryPinViews,
        renderCategoryHeaderButtonSettings,
        renderCategoryBookmarkProgressiveSettings,
        renderCategoryClickBehaviorSettings,
        renderCategoryPinSettings
    } = core;

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



    window.saveCategoryBookmarkProgressiveRevealSetting = function (enabled) {

        const progressiveApi = getBookmarkProgressiveRevealApi();

        if (!progressiveApi?.setCardBookmarkProgressiveRevealEnabled) return;

        const categoryName = String(window.currentCategoryCtx || '').trim() || 'Unsorted';

        const workspaceId = getCategorySettingsWorkspaceId();

        progressiveApi.setCardBookmarkProgressiveRevealEnabled(workspaceId, categoryName, !!enabled);

        renderCategoryBookmarkProgressiveSettings();

        showToast(enabled ? 'Card bookmark reveal limit enabled' : 'Card bookmark reveal limit disabled', 'success');

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

    window.saveFolderBookmarkProgressiveRevealSetting = function (categoryName, folderId, mode) {

        const progressiveApi = getBookmarkProgressiveRevealApi();

        if (!progressiveApi?.setFolderBookmarkProgressiveRevealMode) return;

        const workspaceId = getCategorySettingsWorkspaceId();

        const resolvedCategory = String(categoryName || window.currentCategoryCtx || 'Unsorted').trim() || 'Unsorted';

        const nextMode = progressiveApi.setFolderBookmarkProgressiveRevealMode(workspaceId, resolvedCategory, folderId, mode);

        window.renderCategoryFolderManager();

        showToast(
            nextMode === 'on'
                ? 'Folder bookmark reveal limit enabled'
                : nextMode === 'off'
                    ? 'Folder bookmark reveal limit disabled'
                    : 'Folder bookmark display set to inherit',
            'success'
        );

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

})();
