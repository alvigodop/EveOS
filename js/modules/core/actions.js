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
    const l = links.find(x => String(x.id) === targetId);
    if (l) {
        l.pinned = !l.pinned;
        // Check if we need to show/hide dock immediately
        const dock = document.getElementById('dock-container');
        if (dock && typeof renderDashboard === 'function') renderDashboard();
        saveData();
    }
}

function toggleDone(id) {
    const targetId = String(id);
    const l = links.find(x => String(x.id) === targetId);
    if (l) {
        l.done = !l.done;
        saveData();
    }
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
    const doneCount = links.filter(l => l.done && l.workspace === config.activeWorkspace).length;
    if (doneCount === 0) return showToast("Nothing to sweep!", "info");

    if (await showConfirm(`Remove ${doneCount} completed items?`)) {
        const removedIds = links
            .filter(l => l.done && l.workspace === config.activeWorkspace)
            .map(l => l.id);
        links = links.filter(l => !(l.done && l.workspace === config.activeWorkspace));
        if (window.EveLibrary?.ConnectionsAPI?.removeByLinkId) {
            removedIds.forEach(id => window.EveLibrary.ConnectionsAPI.removeByLinkId(id));
        }
        saveData();
        showToast("Swept!", "success");
    }
}
