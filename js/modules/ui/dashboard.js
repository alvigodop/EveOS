// --- DASHBOARD CORE ---

function renderDashboard() {
    const grid = document.getElementById('dashboard-grid');
    const dock = document.getElementById('dock-container');
    const searchInput = document.getElementById('search');
    const focusBanner = document.getElementById('focus-banner');
    const mainContent = document.getElementById('main-content');

    if (!grid) return;

    const searchStr = searchInput ? searchInput.value.toLowerCase() : '';
    const isListMode = config.viewMode === 'list';
    const isUnidexMode = config.viewMode === 'unidex';

    grid.innerHTML = '';
    if (dock) dock.innerHTML = '';

    grid.classList.toggle('list-mode', isListMode);
    grid.classList.toggle('unidex-mode', isUnidexMode);
    if (mainContent) mainContent.classList.toggle('unidex-view-active', isUnidexMode);

    const visibleLinks = searchStr
        ? links.filter(function (link) {
            return link.title.toLowerCase().includes(searchStr)
                || link.url.toLowerCase().includes(searchStr)
                || link.category.toLowerCase().includes(searchStr);
        })
        : links.filter(function (link) {
            return link.workspace === config.activeWorkspace;
        });

    if (isUnidexMode) {
        if (focusBanner) focusBanner.style.display = 'none';
        if (dock) dock.classList.add('hidden');

        if (window.UnidexView && typeof window.UnidexView.render === 'function') {
            window.UnidexView.render(grid, { searchStr: searchStr });
        } else {
            grid.innerHTML = '<div class="unidex-empty-state"><h3>Unidex View Module Missing</h3><p>Reload to retry.</p></div>';
        }
        return;
    }

    if (focusBanner) {
        focusBanner.style.display = focusCategory ? 'block' : 'none';
        if (focusCategory) focusBanner.innerHTML = `&#127919; FOCUS: ${focusCategory} (Click to Exit)`;
    }

    if (typeof window.renderDock === 'function') {
        window.renderDock(visibleLinks, dock, focusCategory);
    } else {
        console.error('renderDock not found');
    }

    if (typeof window.renderCategories === 'function') {
        window.renderCategories(visibleLinks, grid, focusCategory, searchStr);
    } else {
        console.error('renderCategories not found');
    }
}
