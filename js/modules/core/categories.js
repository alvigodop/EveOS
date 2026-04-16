// --- CATEGORIES ---

function moveCategory(cat, direction, workspaceId) {
    workspaceId = String(workspaceId || config.activeWorkspace || 'main').trim() || 'main';
    if (window.EveCategoryOrder?.moveCategory) {
        if (window.EveCategoryOrder.moveCategory(workspaceId, cat, direction)) {
            saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
        return;
    }
    const visibleLinks = links.filter(l => l.workspace === workspaceId);
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

function promptMoveCategory(cat, currentIndex) {
    var workspaceId = String(config.activeWorkspace || 'main').trim() || 'main';
    var totalCards = window.EveCategoryOrder && window.EveCategoryOrder.getOrder ? window.EveCategoryOrder.getOrder(workspaceId).length : 0;
    if (totalCards === 0) return;
    
    var newPos = prompt("Enter new absolute physical position for card (1 to " + totalCards + "):", (currentIndex + 1));
    if (!newPos) return;
    
    var parsed = parseInt(newPos, 10);
    if (!isNaN(parsed) && parsed >= 1) {
        if (window.EveCategoryOrder && window.EveCategoryOrder.moveCategoryToPosition) {
            if (window.EveCategoryOrder.moveCategoryToPosition(workspaceId, cat, parsed)) {
                saveConfig();
                if (typeof renderDashboard === 'function') renderDashboard();
            }
        }
    }
}

function toggleCollapse(cat, workspaceId) {
    if (!config.collapsed) config.collapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${cat}`;
    var wasCollapsed = config.collapsed.includes(key) || config.collapsed.includes(cat);
    if (wasCollapsed) {
        config.collapsed = config.collapsed.filter(c => c !== key && c !== cat);
    } else {
        config.collapsed.push(key);
    }
    saveConfig();

    // Direct DOM toggle — avoid full re-render for a CSS-only change
    var card = document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"][data-card-workspace="' + CSS.escape(wsId) + '"]') 
            || document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"]');
    if (card) {
        card.classList.toggle('collapsed', !wasCollapsed);
        // If expanding a deferred card, trigger its full build
        if (wasCollapsed && card.getAttribute('data-card-deferred') === '1') {
            if (typeof renderDashboard === 'function') renderDashboard();
        }
    } else {
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

function toggleFolderCollapse(cat, workspaceId) {
    if (!config.foldersCollapsed) config.foldersCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${cat}`;
    const wasCollapsed = config.foldersCollapsed.includes(key) || config.foldersCollapsed.includes(cat);
    if (wasCollapsed) {
        config.foldersCollapsed = config.foldersCollapsed.filter(c => c !== key && c !== cat);
    } else {
        config.foldersCollapsed.push(key);
    }
    saveConfig();

    // Direct DOM toggle — avoid full re-render for a CSS-only change
    var card = document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"][data-card-workspace="' + CSS.escape(wsId) + '"]')
            || document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"]');
    if (card) {
        card.classList.toggle('folders-collapsed', !wasCollapsed);
    } else {
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

function toggleLinksCollapse(cat, workspaceId) {
    if (!config.linksCollapsed) config.linksCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${cat}`;
    const wasCollapsed = config.linksCollapsed.includes(key) || config.linksCollapsed.includes(cat);
    if (wasCollapsed) {
        config.linksCollapsed = config.linksCollapsed.filter(c => c !== key && c !== cat);
    } else {
        config.linksCollapsed.push(key);
    }
    saveConfig();

    // Direct DOM toggle — avoid full re-render for a CSS-only change
    var card = document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"][data-card-workspace="' + CSS.escape(wsId) + '"]')
            || document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"]');
    if (card) {
        card.classList.toggle('links-collapsed', !wasCollapsed);
    } else {
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

function toggleSubfoldersCollapse(folderId, workspaceId) {
    if (!config.subfoldersCollapsed) config.subfoldersCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${folderId}`;
    const wasCollapsed = config.subfoldersCollapsed.includes(key) || config.subfoldersCollapsed.includes(folderId);
    if (wasCollapsed) {
        config.subfoldersCollapsed = config.subfoldersCollapsed.filter(id => id !== key && id !== folderId);
    } else {
        config.subfoldersCollapsed.push(key);
    }
    saveConfig();

    // Perf mode: patch DOM directly, skip full re-render
    if (window._evePerfMode) {
        document.querySelectorAll('.bookmark-folder-group, .bookmark-folder-root-group, .manhwa-frame').forEach(function (el) {
            if (!wasCollapsed) el.classList.add('subfolders-collapsed');
            // Check if this element is relevant by seeing if folderId matches
        });
        // Re-enter current folder for folder-view cards
        const activeFolder = window.EveFolderViewV2?._activeFolderStates;
        if (activeFolder) {
            for (const [key, state] of Object.entries(activeFolder)) {
                if (state?.folderId === folderId || state?.folderId) {
                    const [ws, cat] = key.split('::');
                    if (ws && cat) window.EveFolderViewV2.enterFolder(null, cat, state.folderId, ws);
                }
            }
        }
        return;
    }
    if (typeof renderDashboard === 'function') renderDashboard();
}

function toggleSublinksCollapse(folderId, workspaceId) {
    if (!config.sublinksCollapsed) config.sublinksCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${folderId}`;
    const wasCollapsed = config.sublinksCollapsed.includes(key) || config.sublinksCollapsed.includes(folderId);
    if (wasCollapsed) {
        config.sublinksCollapsed = config.sublinksCollapsed.filter(id => id !== key && id !== folderId);
    } else {
        config.sublinksCollapsed.push(key);
    }
    saveConfig();

    // Perf mode: re-enter current folder to re-render with collapse state
    if (window._evePerfMode) {
        const activeFolder = window.EveFolderViewV2?._activeFolderStates;
        if (activeFolder) {
            for (const [key, state] of Object.entries(activeFolder)) {
                if (state?.folderId === folderId || state?.folderId) {
                    const [ws, cat] = key.split('::');
                    if (ws && cat) window.EveFolderViewV2.enterFolder(null, cat, state.folderId, ws);
                }
            }
        }
        return;
    }
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
