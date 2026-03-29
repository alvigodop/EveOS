window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const moduleApi = ns._sharedHelpersScope = ns._sharedHelpersScope || {};
    const core = ns._sharedHelpersCore || {};
    const { getConfig, getAllLinks, text } = core;

function getWorkspaceName(workspaceId) {

        const id = text(workspaceId, 'main');

        const config = getConfig();

        const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];

        const match = workspaces.find((workspace) => String(workspace?.id || '') === id);

        return text(match?.name, id);

    }

function getScopeText(scope) {

        if (!scope) return 'Unknown Scope';

        if (scope.scope === 'all') return 'All Tabs / Whole Data Pack';

        if (scope.scope === 'card') return getWorkspaceName(scope.workspaceId) + ' / ' + text(scope.categoryName, 'Card');

        if (scope.scope === 'folder') {

            const folderLabel = text(scope.folderLabel, scope.folderId || 'Folder');

            return getWorkspaceName(scope.workspaceId) + ' / ' + text(scope.categoryName, 'Card') + ' / ' + folderLabel;

        }

        if (scope.scope === 'derived') {

            return getWorkspaceName(scope.workspaceId) + ' / ' + text(scope.categoryName, 'Card') + ' / ' + text(scope.scopeLabel, 'Smart View');

        }

        return getWorkspaceName(scope.workspaceId) + ' / Current Tab';

    }

function normalizeScope(scopeOption) {

        const config = getConfig();

        const scope = (scopeOption && typeof scopeOption === 'object') ? scopeOption : {};

        const normalized = String(scope.scope || 'workspace').trim();

        return {

            scope: ['all', 'workspace', 'card', 'folder', 'derived'].includes(normalized) ? normalized : 'workspace',

            workspaceId: text(scope.workspaceId, config.activeWorkspace || 'main'),

            categoryName: text(scope.categoryName, ''),

            folderId: text(scope.folderId, ''),

            folderLabel: text(scope.folderLabel, ''),

            scopeLabel: text(scope.scopeLabel, ''),

            linkIds: Array.isArray(scope.linkIds)

                ? scope.linkIds.map((value) => String(value || '').trim()).filter(Boolean)

                : []

        };

    }

function getAllWorkspaceIds(links) {

        const config = getConfig();

        const ids = new Set();

        const workspaces = Array.isArray(config.workspaces) ? config.workspaces : [];

        workspaces.forEach((workspace) => ids.add(text(workspace?.id, 'main')));

        links.forEach((link) => ids.add(text(link?.workspace, 'main')));

        if (!ids.size) ids.add(text(config.activeWorkspace, 'main'));

        return Array.from(ids);

    }

function getScopedLinks(scope) {

        const allLinks = getAllLinks();

        if (scope.scope === 'all') return allLinks.slice();

        if (scope.scope === 'derived') {

            const linkIds = new Set(scope.linkIds || []);

            return allLinks.filter((link) => linkIds.has(String(link?.id || '')));

        }

        const workspaceLinks = allLinks.filter((link) => String(link?.workspace || 'main') === String(scope.workspaceId));

        if (scope.scope === 'card') {

            return workspaceLinks.filter((link) => text(link?.category, 'Unsorted') === text(scope.categoryName, 'Unsorted'));

        }

        if (scope.scope === 'folder') {

            return workspaceLinks.filter((link) => text(link?.category, 'Unsorted') === text(scope.categoryName, 'Unsorted'));

        }

        return workspaceLinks;

    }

function getCategoryNames(workspaceId, links) {

        const config = getConfig();

        const names = new Set();

        const order = window.EveCategoryOrder?.getOrder
            ? window.EveCategoryOrder.getOrder(workspaceId)
            : (Array.isArray(config.categoryOrder) ? config.categoryOrder : []);

        links.forEach((link) => names.add(text(link?.category, 'Unsorted')));

        const folderStore = window.bookmarkFolders && typeof window.bookmarkFolders === 'object'
            ? window.bookmarkFolders
            : (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object'
                ? window.eveState.bookmarkFolders
                : {});
        Object.keys(folderStore).forEach((scopedKey) => {
            const parts = String(scopedKey || '').split('::');
            const scopedWorkspaceId = text(parts[0], 'main');
            const scopedCategoryName = text(parts[1], '');
            const tree = folderStore[scopedKey];
            if (scopedWorkspaceId !== text(workspaceId, 'main')) return;
            if (!scopedCategoryName) return;
            if (!Array.isArray(tree?.nodes) || !tree.nodes.length) return;
            names.add(scopedCategoryName);
        });

        if (!names.size) return ['Unsorted'];

        const sortedNames = Array.from(names).filter(Boolean);

        sortedNames.sort((left, right) => {

            const idxLeft = order.indexOf(left);

            const idxRight = order.indexOf(right);

            if (idxLeft !== -1 || idxRight !== -1) {

                if (idxLeft === -1) return 1;

                if (idxRight === -1) return -1;

                if (idxLeft !== idxRight) return idxLeft - idxRight;

            }

            return left.localeCompare(right, undefined, { sensitivity: 'base' });

        });

        return sortedNames;

    }

    Object.assign(moduleApi, {
        getWorkspaceName,
        getScopeText,
        normalizeScope,
        getAllWorkspaceIds,
        getScopedLinks,
        getCategoryNames
    });
})(window.EveConstellationMap);
