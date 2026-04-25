// --- CORE ACTIONS ---

function getLiveLinks() {
    if (Array.isArray(window.eveState?.links)) return window.eveState.links;
    if (Array.isArray(window.links)) return window.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function setLiveLinks(nextLinks) {
    if (window.eveState) window.eveState.links = nextLinks;
    window.links = nextLinks;
    if (typeof links !== 'undefined') links = nextLinks;
    return nextLinks;
}

window.getLiveLinks = getLiveLinks;
window.setLiveLinks = setLiveLinks;

function switchWorkspace(id, options = {}) {
    const nextWorkspaceId = String(id || '').trim() || String(config.workspaces?.[0]?.id || 'main');
    const currentWorkspaceId = String(config.activeWorkspace || '').trim() || String(config.workspaces?.[0]?.id || 'main');
    const hadFocusCategory = typeof focusCategory !== 'undefined' && !!focusCategory;
    const forceRender = !!options.forceRender;
    const groupsApi = window.EveSidebarGroups || null;
    const workspaceHelpers = window.EveWorkspaceHelpers || null;
    const nextWorkspace = workspaceHelpers && typeof workspaceHelpers.findById === 'function'
        ? workspaceHelpers.findById(config.workspaces || [], nextWorkspaceId)
        : null;
    const isUnavailableWorkspace = groupsApi && typeof groupsApi.isWorkspaceEffectivelyInactive === 'function'
        ? groupsApi.isWorkspaceEffectivelyInactive(nextWorkspaceId, config)
        : !!(nextWorkspace && nextWorkspace.inactive);

    if (nextWorkspaceId !== currentWorkspaceId && isUnavailableWorkspace) {
        if (typeof showToast === 'function') {
            const workspaceName = String(nextWorkspace?.name || 'That tab').trim() || 'That tab';
            const targetGroupId = groupsApi && typeof groupsApi.getWorkspaceGroupId === 'function'
                ? groupsApi.getWorkspaceGroupId(nextWorkspaceId, config)
                : '';
            const targetGroup = targetGroupId && typeof groupsApi?.findGroupById === 'function'
                ? groupsApi.findGroupById(targetGroupId, config)
                : null;
            showToast(
                targetGroup?.hidden
                    ? (workspaceName + ' is in a hidden group and cannot be opened.')
                    : (workspaceName + ' is inactive and cannot be opened.'),
                'warning'
            );
        }
        return;
    }

    if (window.EveConstellationMap?.closeMap) {
        window.EveConstellationMap.closeMap();
    }

    const wasInGroupOverview = !!String(config.groupOverviewId || '').trim();

    if (currentWorkspaceId === nextWorkspaceId && !hadFocusCategory && !forceRender && !wasInGroupOverview) {
        return;
    }

    if (wasInGroupOverview) config.groupOverviewId = '';

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

    if (nextWorkspaceId !== currentWorkspaceId) {
        if (typeof window.invalidateDashboardDeferredWork === 'function') {
            window.invalidateDashboardDeferredWork();
        }
        window.__eveDashboardRenderHint = {
            kind: 'workspace-switch',
            fromWorkspaceId: currentWorkspaceId,
            toWorkspaceId: nextWorkspaceId,
            at: Date.now()
        };
    }

    // Clear stale folder view caches from the previous workspace
    if (window.EveFolderViewV2?._viewModelCache) {
        window.EveFolderViewV2._viewModelCache = {};
    }

    saveConfig();
    if (changed || forceRender) {
        if (typeof renderSidebar === 'function') renderSidebar();
    } else if (typeof window.EveSidebarRuntime?.syncSidebarViewState === 'function') {
        window.EveSidebarRuntime.syncSidebarViewState();
    }

    // renderDashboard already coalesces via rAF internally, no need for a second rAF wrapper
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
        : (getLiveLinks().find(x => String(x?.id) === targetId) || null);
    const scopeType = typeof window.EveQuickPins.resolveDefaultBookmarkScopeType === 'function'
        ? window.EveQuickPins.resolveDefaultBookmarkScopeType(link || targetId)
        : 'card';
    return window.EveQuickPins.toggleBookmarkPin(targetId, { scopeType });
}

function toggleDone(id) {
    const targetId = String(id);
    const l = getLiveLinks().find(x => String(x.id) === targetId);
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
        const bulkCheck = document.querySelector(`.bulk-check[data-bulk-id="${CSS.escape(targetId)}"]`);
        if (bulkCheck) {
            const li = bulkCheck.closest('li');
            if (li) li.remove();
        }

        setLiveLinks(getLiveLinks().filter(l => String(l.id) !== targetId));
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
    const liveLinks = getLiveLinks();
    const doneCount = liveLinks.filter(l => (
        l.done
        && l.workspace === config.activeWorkspace
        && isTaskEnabled(l)
    )).length;
    if (doneCount === 0) return showToast("Nothing to sweep!", "info");

    if (await showConfirm(`Remove ${doneCount} completed items?`)) {
        const removedIds = liveLinks
            .filter(l => (
                l.done
                && l.workspace === config.activeWorkspace
                && isTaskEnabled(l)
            ))
            .map(l => l.id);
        setLiveLinks(liveLinks.filter(l => !(
            l.done
            && l.workspace === config.activeWorkspace
            && isTaskEnabled(l)
        )));
        if (window.EveLibrary?.ConnectionsAPI?.removeByLinkId) {
            removedIds.forEach(id => window.EveLibrary.ConnectionsAPI.removeByLinkId(id));
        }
        saveData({ forceRender: true });
        showToast("Swept!", "success");
    }
}
