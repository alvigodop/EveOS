// --- CORE ACTIONS ---

function switchWorkspace(id, options = {}) {
    const nextWorkspaceId = String(id || '').trim() || String(config.workspaces?.[0]?.id || 'main');
    const currentWorkspaceId = String(config.activeWorkspace || '').trim() || String(config.workspaces?.[0]?.id || 'main');
    const hadFocusCategory = typeof focusCategory !== 'undefined' && !!focusCategory;
    const forceRender = !!options.forceRender;

    if (window.EveConstellationMap?.closeMap) {
        window.EveConstellationMap.closeMap();
    }

    if (currentWorkspaceId === nextWorkspaceId && !hadFocusCategory && !forceRender) {
        return;
    }

    config.activeWorkspace = nextWorkspaceId;

    if (typeof focusCategory !== 'undefined') {
        focusCategory = null;
    }

    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderDashboard === 'function') renderDashboard();
}

function togglePin(id) {
    const targetId = String(id);
    if (!window.EveQuickPins?.toggleBookmarkPin) {
        console.warn('[QuickPins] toggleBookmarkPin unavailable; pin toggle skipped.');
        if (typeof showToast === 'function') {
            showToast('Pin controls are not ready yet.', 'warning');
        }
        return false;
    }
    const link = typeof window.EveQuickPins.getLinkById === 'function'
        ? window.EveQuickPins.getLinkById(targetId)
        : (links.find(x => String(x?.id) === targetId) || null);
    const scopeType = typeof window.EveQuickPins.resolveDefaultBookmarkScopeType === 'function'
        ? window.EveQuickPins.resolveDefaultBookmarkScopeType(link || targetId)
        : 'card';
    return window.EveQuickPins.toggleBookmarkPin(targetId, { scopeType });
}

function toggleDone(id) {
    const targetId = String(id);
    const l = links.find(x => String(x.id) === targetId);
    if (l) {
        const isTaskEnabled = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? !!window.EveBookmarkFolders.isTaskEnabledForLink(l)
            : true;
        if (!isTaskEnabled) {
            return false;
        }
        l.done = !l.done;
        saveData();
        return true;
    }
    return false;
}

async function deleteLink(id) {
    const targetId = String(id);
    if (await showConfirm("Delete?")) {
        links = links.filter(l => String(l.id) !== targetId);
        if (window.EveLibrary?.ConnectionsAPI?.removeByLinkId) {
            window.EveLibrary.ConnectionsAPI.removeByLinkId(targetId);
        }
        saveData();
    }
}

async function sweepDone() {
    const isTaskEnabled = (link) => (
        typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? !!window.EveBookmarkFolders.isTaskEnabledForLink(link)
            : true
    );
    const doneCount = links.filter(l => (
        l.done
        && l.workspace === config.activeWorkspace
        && isTaskEnabled(l)
    )).length;
    if (doneCount === 0) return showToast("Nothing to sweep!", "info");

    if (await showConfirm(`Remove ${doneCount} completed items?`)) {
        const removedIds = links
            .filter(l => (
                l.done
                && l.workspace === config.activeWorkspace
                && isTaskEnabled(l)
            ))
            .map(l => l.id);
        links = links.filter(l => !(
            l.done
            && l.workspace === config.activeWorkspace
            && isTaskEnabled(l)
        ));
        if (window.EveLibrary?.ConnectionsAPI?.removeByLinkId) {
            removedIds.forEach(id => window.EveLibrary.ConnectionsAPI.removeByLinkId(id));
        }
        saveData();
        showToast("Swept!", "success");
    }
}
