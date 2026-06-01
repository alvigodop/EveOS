window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.DatapackView) return;
    if (!ns.DatapackViewMicro || !ns.DatapackViewMacroActions) return;
    const shared = ns._DatapackViewShared || {};
    const gateway = ns._DatapackViewGateway || {};
    const {
        MAX_MICRO_BOOKMARKS,
        escapeHtml,
        normalizeWorkspaceId,
        normalizeFolderId,
        createEntityLink,
        buildScopedKey,
        getFolderNodes,
        getFolderPathLabel,
        getIdentifierLabels,
        getLiveLinks,
        setLiveLinks,
        resolveCurrentScope
    } = shared;
    const { buildGatewayState, renderGateway } = gateway;

    const macroActions = ns.DatapackViewMacroActions.create({
        normalizeWorkspaceId: normalizeWorkspaceId,
        normalizeCategoryName: normalizeCategoryName,
        getConfig: getConfig,
        getCategoryNamesForWorkspace: getCategoryNamesForWorkspace,
        getLiveLinks: getLiveLinks,
        setLiveLinks: setLiveLinks,
        resolveCurrentScope: resolveCurrentScope,
        renderGateway: renderGateway
    });
    const saveMacroChanges = macroActions.saveMacroChanges;
    const microRuntime = ns.DatapackViewMicro.create({
        MAX_MICRO_BOOKMARKS: MAX_MICRO_BOOKMARKS,
        escapeHtml: escapeHtml,
        normalizeWorkspaceId: normalizeWorkspaceId,
        normalizeCategoryName: normalizeCategoryName,
        normalizeFolderId: normalizeFolderId,
        getScopedLinks: getScopedLinks,
        getFolderNodes: getFolderNodes,
        getFolderPathLabel: getFolderPathLabel,
        getIdentifierLabels: getIdentifierLabels,
        getLiveLinks: getLiveLinks,
        setLiveLinks: setLiveLinks,
        resolveCurrentScope: resolveCurrentScope,
        renderGateway: renderGateway
    });
    const openCardInternals = microRuntime.openCardInternals;
    const closeCardInternals = microRuntime.closeCardInternals;
    const saveMicroChanges = microRuntime.saveMicroChanges;
    function openGateway(options) {
        const modal = document.getElementById('expandedSearchModal');
        if (!modal && typeof window.openExpandedSearchModal === 'function') {
            window.openExpandedSearchModal({ autoSearch: false });
        } else if (modal) {
            modal.style.display = 'flex';
        }
        return renderGateway(options?.scope || null);
    }

    function handleClick(event) {
        const overlay = event.target?.classList?.contains('nx-dv-micro-overlay') ? event.target : null;
        if (overlay) {
            closeCardInternals();
            return;
        }
        const actionNode = event.target?.closest?.('[data-nx-dv-action]');
        if (!actionNode) return;
        const action = actionNode.getAttribute('data-nx-dv-action');
        if (action === 'preview-macro') {
            event.preventDefault();
            saveMacroChanges({ previewOnly: true });
        } else if (action === 'save-macro') {
            event.preventDefault();
            saveMacroChanges();
        } else if (action === 'revert-macro') {
            event.preventDefault();
            renderGateway(resolveCurrentScope());
        } else if (action === 'cancel') {
            event.preventDefault();
            const results = document.getElementById('esResults');
            if (results) results.innerHTML = '';
        } else if (action === 'open-card') {
            event.preventDefault();
            openCardInternals(actionNode.getAttribute('data-workspace-id'), actionNode.getAttribute('data-category-name'));
        } else if (action === 'open-tab') {
            event.preventDefault();
            const workspaceId = normalizeWorkspaceId(actionNode.getAttribute('data-workspace-id'));
            if (typeof window.switchWorkspace === 'function') window.switchWorkspace(workspaceId, { forceRender: true });
            openGateway({ scope: { workspaceId } });
        } else if (action === 'close-micro') {
            event.preventDefault();
            closeCardInternals();
        } else if (action === 'preview-micro') {
            event.preventDefault();
            saveMicroChanges(actionNode.closest('.nx-dv-micro-overlay'), { previewOnly: true });
        } else if (action === 'save-micro') {
            event.preventDefault();
            saveMicroChanges(actionNode.closest('.nx-dv-micro-overlay'));
        } else if (action === 'revert-micro') {
            event.preventDefault();
            openCardInternals(actionNode.getAttribute('data-workspace-id'), actionNode.getAttribute('data-category-name'));
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('click', handleClick, true);
    }

    ns.DatapackView = {
        buildGatewayState,
        renderGateway,
        openGateway,
        openCardInternals,
        closeCardInternals,
        saveMacroChanges,
        saveMicroChanges
    };
})();
