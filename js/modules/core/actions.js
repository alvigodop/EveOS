// --- CORE ACTIONS ---

function switchWorkspace(id) {
    config.activeWorkspace = id;
    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof clearFocus === 'function') clearFocus();
}

function togglePin(id) {
    const targetId = String(id);
    if (window.EveQuickPins?.toggleBookmarkPin) {
        const link = typeof window.EveQuickPins.getLinkById === 'function'
            ? window.EveQuickPins.getLinkById(targetId)
            : (links.find(x => String(x?.id) === targetId) || null);
        const scopeType = typeof window.EveQuickPins.resolveDefaultBookmarkScopeType === 'function'
            ? window.EveQuickPins.resolveDefaultBookmarkScopeType(link || targetId)
            : 'tab';
        return window.EveQuickPins.toggleBookmarkPin(targetId, { scopeType });
    }
    const l = links.find(x => String(x.id) === targetId);
    if (!l) return false;
    l.pinned = !l.pinned;
    const dock = document.getElementById('dock-container');
    if (dock && typeof renderDashboard === 'function') renderDashboard();
    saveData();
    return !!l.pinned;
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
