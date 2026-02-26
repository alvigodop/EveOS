// --- DASHBOARD CORE ---

function renderDashboard() {
    const grid = document.getElementById('dashboard-grid');
    const dock = document.getElementById('dock-container');
    const searchInput = document.getElementById('search');
    const focusBanner = document.getElementById('focus-banner');

    if (!grid) return;

    const searchStr = searchInput ? searchInput.value.toLowerCase() : "";

    grid.innerHTML = '';
    if (dock) dock.innerHTML = '';
    grid.classList.toggle('list-mode', config.viewMode === 'list');

    // Use global 'links' and 'config'
    let visibleLinks = searchStr
        ? links.filter(l => l.title.toLowerCase().includes(searchStr) || l.url.toLowerCase().includes(searchStr) || l.category.toLowerCase().includes(searchStr))
        : links.filter(l => l.workspace === config.activeWorkspace);

    // Focus Banner
    if (focusBanner) {
        focusBanner.style.display = focusCategory ? 'block' : 'none';
        if (focusCategory) focusBanner.innerHTML = `🎯 FOCUS: ${focusCategory} (Click to Exit)`;
    }

    // Render Dock
    if (typeof window.renderDock === 'function') {
        window.renderDock(visibleLinks, dock, focusCategory);
    } else {
        console.error("renderDock not found");
    }

    // Render Categories
    if (typeof window.renderCategories === 'function') {
        // Pass 'searchStr' via global scope or modification if needed, but the original logic used 'search' which is now 'searchStr'
        // In the extracted categories module, I used: 
        // let wsBadge = (typeof search !== 'undefined' && search ...
        // So I need to make sure 'search' variable is available or passed. 
        // The original code used 'search' from the closure. 
        // I should probably pass 'searchStr' as an argument to renderCategories or rely on the input value directly inside the module?
        // Actually, let's fix the module to use the argument or fix the call.
        // I will re-write dashboard-categories.js to accept searchStr or read it from input.

        // Wait, I already wrote dashboard-categories.js and it checks 'typeof search !== undefined'. 
        // But 'search' was a local variable in the original function. 
        // I should fix dashboard-categories.js to access the search input value directly if it's not passed.
        // OR better, pass it.

        window.renderCategories(visibleLinks, grid, focusCategory, searchStr);
    } else {
        console.error("renderCategories not found");
    }
}
