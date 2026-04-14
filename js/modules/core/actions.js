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

    // --- AUTO-EXPAND SIDEBAR PATH ---
    // Ensure all ancestors are expanded so the new active tab is visible in the hierarchy
    if (window.EveWorkspaceHelpers) {
        if (!Array.isArray(config.collapsedTabs)) config.collapsedTabs = [];
        var helpers = window.EveWorkspaceHelpers;
        var parentNode = helpers.findParent(config.workspaces, nextWorkspaceId);
        var changed = false;

        while (parentNode) {
            var pid = String(parentNode.id);
            if (config.collapsedTabs.indexOf(pid) !== -1) {
                config.collapsedTabs = config.collapsedTabs.filter(function (id) {
                    return id !== pid;
                });
                changed = true;
            }
            parentNode = helpers.findParent(config.workspaces, pid);
        }

        if (changed) {
            // Updated
        }
    }

    if (typeof focusCategory !== 'undefined') {
        focusCategory = null;
    }

    // Clear stale folder view caches from the previous workspace
    if (window.EveFolderViewV2?._viewModelCache) {
        window.EveFolderViewV2._viewModelCache = {};
    }

    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();

    // Yield one frame so the sidebar paints immediately, then render the dashboard
    requestAnimationFrame(function () {
        if (typeof renderDashboard === 'function') renderDashboard();
    });
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

        // Instant DOM patch in perf mode — no re-render needed
        if (window._evePerfMode) {
            const bulkCheck = document.querySelector(`.bulk-check[data-bulk-id="${CSS.escape(targetId)}"]`);
            if (bulkCheck) {
                const li = bulkCheck.closest('li');
                if (li) li.classList.toggle('done', l.done);
            }
        }

        saveData();
        return true;
    }
    return false;
}

async function deleteLink(id) {
    const targetId = String(id);
    if (await showConfirm("Delete?")) {
        // Instant DOM patch in perf mode
        if (window._evePerfMode) {
            const bulkCheck = document.querySelector(`.bulk-check[data-bulk-id="${CSS.escape(targetId)}"]`);
            if (bulkCheck) {
                const li = bulkCheck.closest('li');
                if (li) li.remove();
            }
        }

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
