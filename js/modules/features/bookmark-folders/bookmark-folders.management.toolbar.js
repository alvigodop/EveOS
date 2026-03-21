window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const api = ns._management = ns._management || {};
    const shared = ns._shared || {};
    const {
        buildScopedKey,
        getToolbarConfigStore,
        normalizeWorkspaceId,
        normalizeCategoryName
    } = shared;

function isToolbarExpanded(workspaceId, categoryName) {

        return getToolbarConfigStore().includes(buildScopedKey(workspaceId, categoryName));

    }



    function setToolbarExpanded(workspaceId, categoryName, expanded) {

        const scopedKey = buildScopedKey(workspaceId, categoryName);

        const store = getToolbarConfigStore();

        const nextStore = store.filter((entry) => entry !== scopedKey);

        if (expanded) nextStore.push(scopedKey);

        if (window.eveState?.config) {

            window.eveState.config.bookmarkFolderToolbarExpanded = nextStore;

        }

        if (typeof saveConfig === 'function') saveConfig();

        syncToolbarDom(workspaceId, categoryName, expanded);

    }



    function toggleToolbarExpanded(workspaceId, categoryName) {

        const expanded = isToolbarExpanded(workspaceId, categoryName);

        setToolbarExpanded(workspaceId, categoryName, !expanded);

    }



    function syncToolbarDom(workspaceId, categoryName, expanded) {

        const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);

        const resolvedCategoryName = normalizeCategoryName(categoryName);

        const cards = Array.from(document.querySelectorAll('.category-card'))

            .filter((card) =>

                String(card.getAttribute('data-card-workspace') || '').trim() === resolvedWorkspaceId

                && String(card.getAttribute('data-card-category') || '').trim() === resolvedCategoryName

            );



        if (!cards.length) {

            if (typeof renderDashboard === 'function') renderDashboard();

            return;

        }



        cards.forEach((card) => {

            const toolbar = card.querySelector('.bookmark-folder-toolbar');

            if (toolbar) {

                toolbar.classList.toggle('is-visible', !!expanded);

            }

            card.querySelectorAll('[data-folder-toolbar-toggle="1"]').forEach((button) => {

                button.classList.toggle('is-active', !!expanded);

            });

            const grid = card.parentElement || document.getElementById('dashboard-grid');

            if (grid && typeof window.scheduleDashboardMasonryLayout === 'function') {

                window.scheduleDashboardMasonryLayout(grid);

            }

        });

    }



    

    Object.assign(api, {
        isToolbarExpanded,
        setToolbarExpanded,
        toggleToolbarExpanded
    });
})(window.EveBookmarkFolders);
