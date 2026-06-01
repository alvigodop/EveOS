window.EveBulkToolbar = window.EveBulkToolbar || {};

(function () {
    const ns = window.EveBulkToolbar;
    const {
        getConfig,
        getLinks,
        getSelectedLinks,
        getDatapackIndexApi,
        getDatapackStructureSummary
    } = ns;

    function getAllCategoryNames(workspaceId) {
        const scopedWorkspaceId = String(workspaceId || '').trim();
        const indexApi = getDatapackIndexApi();
        const structureSummary = getDatapackStructureSummary(indexApi);
        const names = new Set();
        if (structureSummary?.cards) {
            Object.keys(structureSummary.cards).forEach(function (key) {
                const cardSummary = structureSummary.cards[key];
                if (!cardSummary) return;
                if (scopedWorkspaceId && String(cardSummary.workspaceId || '').trim() !== scopedWorkspaceId) return;
                const categoryName = String(cardSummary.categoryName || 'Unsorted').trim() || 'Unsorted';
                if (categoryName) names.add(categoryName);
            });
        }
        const scopedLinks = scopedWorkspaceId
            ? getLinks().filter(link => String(link.workspace || '').trim() === scopedWorkspaceId)
            : getLinks();
        scopedLinks.forEach(function (link) {
            const categoryName = String(link.category || 'Unsorted').trim() || 'Unsorted';
            if (categoryName) names.add(categoryName);
        });
        names.add('Unsorted');
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    function getVisibleDashboardCategoryNames() {
        const grid = document.getElementById('dashboard-grid');
        if (!grid) return [];

        const names = [...new Set(
            Array.from(grid.querySelectorAll('.category-card .category-title'))
                .map(node => String(node.textContent || '').trim())
                .filter(Boolean)
        )];

        return names.sort((a, b) => a.localeCompare(b));
    }

    function escapeBulkMoveHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getSelectedCategoryName() {
        const selectedLinks = getSelectedLinks();
        if (!selectedLinks.length) return 'Unsorted';
        return String(selectedLinks[0].category || 'Unsorted').trim() || 'Unsorted';
    }

    function getSelectedWorkspaceForMove() {
        const activeWorkspaceId = String(getConfig()?.activeWorkspace || '').trim();
        if (activeWorkspaceId) return activeWorkspaceId;
        const selectedLink = getSelectedLinks()[0];
        return String(selectedLink?.workspace || '').trim();
    }

    function getWorkspaceList() {
        const workspaces = Array.isArray(getConfig()?.workspaces) ? getConfig().workspaces : [];
        const result = [];

        function traverse(tabs, prefix = '') {
            if (!Array.isArray(tabs)) return;
            for (const tab of tabs) {
                if (!tab) continue;
                const id = String(tab.id || '');
                if (id) {
                    const rawName = String(tab.name || '').trim() || 'Unnamed';
                    const displayName = prefix ? `${prefix} > ${rawName}` : rawName;
                    result.push({
                        id: id,
                        name: displayName,
                        icon: String(tab.icon || '').trim()
                    });
                }
                if (Array.isArray(tab.subTabs)) {
                    const rawName = String(tab.name || '').trim() || 'Unnamed';
                    traverse(tab.subTabs, prefix ? `${prefix} > ${rawName}` : rawName);
                }
            }
        }

        traverse(workspaces);
        return result;
    }

    function getWorkspaceTree() {
        const workspaces = Array.isArray(getConfig()?.workspaces) ? getConfig().workspaces : [];
        function normalize(node) {
            if (!node) return null;
            const id = String(node.id || '').trim();
            if (!id) return null;
            const children = Array.isArray(node.subTabs)
                ? node.subTabs.map(normalize).filter(Boolean)
                : [];
            return {
                id,
                name: String(node.name || '').trim() || 'Unnamed',
                icon: String(node.icon || '').trim(),
                children
            };
        }
        return workspaces.map(normalize).filter(Boolean);
    }

    function getSelectedWorkspaceId() {
        const selectedLink = getSelectedLinks()[0];
        if (selectedLink?.workspace) return String(selectedLink.workspace);
        return String(getConfig()?.activeWorkspace || getWorkspaceList()[0]?.id || '');
    }

    Object.assign(ns, {
        getAllCategoryNames,
        getVisibleDashboardCategoryNames,
        escapeBulkMoveHtml,
        getSelectedCategoryName,
        getSelectedWorkspaceForMove,
        getWorkspaceList,
        getWorkspaceTree,
        getSelectedWorkspaceId
    });
    ns.sharedReady = true;
})();
