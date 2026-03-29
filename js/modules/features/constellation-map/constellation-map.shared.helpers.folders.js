window.EveConstellationMap = window.EveConstellationMap || {};

(function (ns) {
    const moduleApi = ns._sharedHelpersFolders = ns._sharedHelpersFolders || {};
    const core = ns._sharedHelpersCore || {};
    const { text } = core;

function getFolderView(workspaceId, categoryName, scopedLinks) {

        const folderApi = window.EveBookmarkFolders;

        if (!folderApi?.buildFolderView) {

            return {

                nodes: [],

                childrenMap: new Map(),

                folderLinks: new Map(),

                rootLinks: Array.isArray(scopedLinks) ? scopedLinks.slice() : []

            };

        }

        const raw = folderApi.buildFolderView(workspaceId, categoryName, Array.isArray(scopedLinks) ? scopedLinks : []);

        const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];

        const realNodes = rawNodes.filter((node) => !node?.isGhost);

        const realIds = new Set(realNodes.map((node) => String(node.id)));

        const childrenMap = new Map();

        const folderLinks = new Map();

        realNodes.forEach((node) => {

            childrenMap.set(String(node.id), []);

            folderLinks.set(String(node.id), []);

        });

        realNodes.forEach((node) => {

            const parentId = node?.parentId ? String(node.parentId) : '';

            if (!parentId || !realIds.has(parentId)) return;

            childrenMap.get(parentId).push(node);

        });

        const rawFolderLinks = raw?.folderLinks instanceof Map ? raw.folderLinks : new Map();

        rawFolderLinks.forEach((links, folderId) => {

            const id = String(folderId || '');

            if (!realIds.has(id)) return;

            folderLinks.set(id, Array.isArray(links) ? links.slice() : []);

        });

        const rootLinks = Array.isArray(raw?.rootLinks)

            ? raw.rootLinks.slice()

            : (Array.isArray(scopedLinks) ? scopedLinks.filter((link) => {

                const folderId = link?.folderId ? String(link.folderId) : '';

                return !folderId || !realIds.has(folderId);

            }) : []);

        const topLevelFolders = realNodes.filter((node) => {

            const parentId = node?.parentId ? String(node.parentId) : '';

            return !parentId || !realIds.has(parentId);
        });

        return {

            nodes: realNodes,

            childrenMap,

            folderLinks,

            rootLinks,

            topLevelFolders

        };

    }

function collectFolderSubtree(viewModel, folderId) {

        const normalizedId = text(folderId, '');

        if (!normalizedId || !viewModel?.nodes?.length) return null;

        const targetNode = viewModel.nodes.find((node) => String(node?.id || '') === normalizedId);

        if (!targetNode) return null;

        const descendantIds = new Set();

        const stack = [normalizedId];

        while (stack.length) {

            const currentId = stack.pop();

            if (!currentId || descendantIds.has(currentId)) continue;

            descendantIds.add(currentId);

            (viewModel.childrenMap.get(String(currentId)) || []).forEach((childNode) => {

                if (childNode?.id) stack.push(String(childNode.id));

            });

        }

        return {

            targetNode,

            descendantIds,

            childFolders: viewModel.childrenMap.get(normalizedId) || [],

            directLinks: viewModel.folderLinks.get(normalizedId) || []

        };

    }

    Object.assign(moduleApi, {
        getFolderView,
        collectFolderSubtree
    });
})(window.EveConstellationMap);
