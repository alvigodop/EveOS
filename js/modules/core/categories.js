// --- CATEGORIES ---

function moveCategory(cat, direction) {
    const workspaceId = String(config.activeWorkspace || 'main').trim() || 'main';
    if (window.EveCategoryOrder?.moveCategory) {
        if (window.EveCategoryOrder.moveCategory(workspaceId, cat, direction)) {
            saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
        return;
    }
    const visibleLinks = links.filter(l => l.workspace === config.activeWorkspace);
    let categories = [...new Set(visibleLinks.map(l => l.category || "Unsorted"))];
    if (!config.categoryOrder || config.categoryOrder.length === 0) config.categoryOrder = categories.sort();
    categories.forEach(c => { if (!config.categoryOrder.includes(c)) config.categoryOrder.push(c); });
    const idx = config.categoryOrder.indexOf(cat);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < config.categoryOrder.length) {
        const temp = config.categoryOrder[newIdx];
        config.categoryOrder[newIdx] = config.categoryOrder[idx];
        config.categoryOrder[idx] = temp;
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

function toggleCollapse(cat) {
    if (!config.collapsed) config.collapsed = [];
    if (config.collapsed.includes(cat)) config.collapsed = config.collapsed.filter(c => c !== cat);
    else config.collapsed.push(cat);
    saveConfig();
    if (typeof renderDashboard === 'function') renderDashboard();
}

function toggleFolderCollapse(cat) {
    if (!config.foldersCollapsed) config.foldersCollapsed = [];
    if (config.foldersCollapsed.includes(cat)) config.foldersCollapsed = config.foldersCollapsed.filter(c => c !== cat);
    else config.foldersCollapsed.push(cat);
    saveConfig();
    if (typeof renderDashboard === 'function') renderDashboard();
}

function setFocus(cat) {
    focusCategory = cat;
    if (typeof renderDashboard === 'function') renderDashboard();
}

function clearFocus() {
    focusCategory = null;
    if (typeof renderDashboard === 'function') renderDashboard();
}

async function launchCategory(catName) {
    const urls = links.filter(l => l.category === catName && !l.done && l.workspace === config.activeWorkspace).map(l => l.url);
    if (urls.length === 0) return;

    // Safety check for many tabs
    if (urls.length > 5) {
        if (!(await showConfirm(`Open ${urls.length} tabs?`))) return;
    }

    urls.forEach(u => window.open(u, '_blank'));
}
