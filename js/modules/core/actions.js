// --- CORE ACTIONS ---

function switchWorkspace(id) {
    config.activeWorkspace = id;
    saveConfig();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof clearFocus === 'function') clearFocus();
}

function togglePin(id) {
    const l = links.find(x => x.id === id);
    if (l) {
        l.pinned = !l.pinned;
        // Check if we need to show/hide dock immediately
        const dock = document.getElementById('dock-container');
        if (dock && typeof renderDashboard === 'function') renderDashboard();
        saveData();
    }
}

function toggleDone(id) {
    const l = links.find(x => x.id === id);
    if (l) {
        l.done = !l.done;
        saveData();
    }
}

async function deleteLink(id) {
    if (await showConfirm("Delete?")) {
        links = links.filter(l => l.id !== id);
        saveData();
    }
}

async function sweepDone() {
    const doneCount = links.filter(l => l.done && l.workspace === config.activeWorkspace).length;
    if (doneCount === 0) return showToast("Nothing to sweep!", "info");

    if (await showConfirm(`Remove ${doneCount} completed items?`)) {
        links = links.filter(l => !(l.done && l.workspace === config.activeWorkspace));
        saveData();
        showToast("Swept!", "success");
    }
}
