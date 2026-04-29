window.EveDuplicateSensor = window.EveDuplicateSensor || {};

(function () {
    const ns = window.EveDuplicateSensor;
    const runtime = ns._runtime = ns._runtime || {};
    if (runtime.baseLoaded) return;

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function hasUsableDatapackSnapshot(indexApi) {
        if (!indexApi) return false;
        const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
        return typeof indexApi.hasUsableSnapshot === 'function'
            ? indexApi.hasUsableSnapshot()
            : (!buildState?.dirty && Number(buildState?.builtAt || 0) > 0);
    }

    function hasReadableDatapackLinkSnapshot(indexApi) {
        if (!indexApi) return false;
        if (typeof indexApi.hasReadableLinkSnapshot === 'function') return !!indexApi.hasReadableLinkSnapshot();
        return hasUsableDatapackSnapshot(indexApi);
    }

    function getLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function getConfig() {
        if (window.eveState?.config) return window.eveState.config;
        if (typeof config !== 'undefined') return config;
        return window.config || {};
    }

    function getFolderTrees() {
        return window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
    }

    function normalizeScope(scope) {
        const normalized = String(scope || 'card').trim().toLowerCase();
        const allowed = ['folder', 'card', 'workspace', 'all_tabs'];
        return allowed.includes(normalized) ? normalized : 'card';
    }

    function normalizeUrl(rawUrl) {
        const raw = String(rawUrl || '').trim();
        if (!raw || raw === '#') return '';

        try {
            const parsed = new URL(raw, window.location.origin);
            const protocol = String(parsed.protocol || '').toLowerCase();
            if (!protocol || protocol === 'file:' || protocol === 'about:') {
                return raw.toLowerCase().replace(/\/+$/, '');
            }

            const host = String(parsed.hostname || '').replace(/^www\./i, '').toLowerCase();
            const port = String(parsed.port || '').trim();
            let pathname = String(parsed.pathname || '/').replace(/\/+/g, '/');
            if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');

            const sortedParams = Array.from(parsed.searchParams.entries())
                .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
                    if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
                    return leftValue.localeCompare(rightValue);
                })
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
            const search = sortedParams.length > 0 ? `?${sortedParams.join('&')}` : '';
            const hostWithPort = port ? `${host}:${port}` : host;
            return `${hostWithPort}${pathname}${search}`;
        } catch (error) {
            return raw.toLowerCase().replace(/\/+$/, '');
        }
    }

    function buildScopedKey(workspaceId, categoryName) {
        const workspace = String(workspaceId || 'main').trim() || 'main';
        const category = String(categoryName || 'Unsorted').trim() || 'Unsorted';
        return `${workspace}::${category}`;
    }

    function getWorkspaceName(workspaceId) {
        const workspaces = Array.isArray(getConfig().workspaces) ? getConfig().workspaces : [];
        const match = workspaces.find((workspace) => String(workspace?.id || '') === String(workspaceId || ''));
        return match?.name || workspaceId || 'Main';
    }

    function buildFolderLookup(workspaceId, categoryName) {
        const scopedKey = buildScopedKey(workspaceId, categoryName);
        const tree = getFolderTrees()[scopedKey];
        const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
        const nodeById = new Map();

        nodes.forEach((node) => {
            const nodeId = String(node?.id || '').trim();
            if (!nodeId) return;
            nodeById.set(nodeId, {
                ...node,
                id: nodeId,
                parentId: String(node?.parentId || '').trim() || null,
                name: String(node?.name || node?.title || 'Folder').trim() || 'Folder'
            });
        });

        function getFolderLabel(folderId) {
            const normalizedFolderId = String(folderId || '').trim();
            if (!normalizedFolderId) return 'Root';
            if (!nodeById.has(normalizedFolderId)) return normalizedFolderId;

            const parts = [];
            let current = nodeById.get(normalizedFolderId);
            let guard = 0;
            while (current && guard < 20) {
                parts.unshift(current.name);
                current = current.parentId ? (nodeById.get(current.parentId) || null) : null;
                guard += 1;
            }
            return parts.join(' / ') || normalizedFolderId;
        }

        return { getFolderLabel };
    }

    function buildLinkIdMap(sourceLinks) {
        const map = new Map();
        (Array.isArray(sourceLinks) ? sourceLinks : []).forEach((link) => {
            const linkId = String(link?.id || '').trim();
            if (linkId) map.set(linkId, link);
        });
        return map;
    }

    function resolveIndexedLinks(indexApi, linkIds, sourceLinks) {
        if (!Array.isArray(linkIds)) return null;
        const linkIdMap = buildLinkIdMap(sourceLinks);
        const resolveIndexedLink = typeof indexApi?.resolveBookmarkLink === 'function'
            ? function (linkId) { return indexApi.resolveBookmarkLink(linkId); }
            : null;
        return linkIds.map((linkId) => {
            const normalizedId = String(linkId || '').trim();
            if (!normalizedId) return null;
            return linkIdMap.get(normalizedId) || (resolveIndexedLink ? resolveIndexedLink(normalizedId) : null) || null;
        }).filter(Boolean);
    }

    function getIndexedScopedLinks(scope, workspaceId, categoryName, folderId, sourceLinks) {
        const indexApi = getDatapackIndexApi();
        if (!indexApi || typeof indexApi.getExactBookmarkLinkIds !== 'function' || !hasReadableDatapackLinkSnapshot(indexApi)) {
            return null;
        }

        if (scope === 'all_tabs') {
            if (typeof indexApi.getScopedBookmarkLinkIds !== 'function') return null;
            return resolveIndexedLinks(indexApi, indexApi.getScopedBookmarkLinkIds(null), sourceLinks);
        }

        if (scope === 'workspace') {
            return resolveIndexedLinks(indexApi, indexApi.getExactBookmarkLinkIds({ workspaceId: workspaceId }), sourceLinks);
        }

        if (scope === 'card') {
            return resolveIndexedLinks(indexApi, indexApi.getExactBookmarkLinkIds({
                workspaceId: workspaceId,
                categoryName: categoryName
            }), sourceLinks);
        }

        if (scope === 'folder') {
            const categoryLinks = resolveIndexedLinks(indexApi, indexApi.getExactBookmarkLinkIds({
                workspaceId: workspaceId,
                categoryName: categoryName
            }), sourceLinks);
            if (!Array.isArray(categoryLinks)) return null;
            return categoryLinks.filter((link) => String(link?.folderId || '').trim() === folderId);
        }

        return null;
    }

    function getScopedLinks(scope, workspaceId, categoryName, folderId) {
        const normalizedScope = normalizeScope(scope);
        const normalizedWorkspace = String(workspaceId || '').trim();
        const normalizedCategory = String(categoryName || '').trim();
        const normalizedFolderId = String(folderId || '').trim();
        const links = getLinks();
        const indexedLinks = getIndexedScopedLinks(
            normalizedScope,
            normalizedWorkspace,
            normalizedCategory,
            normalizedFolderId,
            links
        );

        if (Array.isArray(indexedLinks)) {
            return indexedLinks;
        }

        if (normalizedScope === 'all_tabs') {
            return links.slice();
        }
        
        const wsMatch = (l) => String(l?.workspace || 'main').trim().toLowerCase() === normalizedWorkspace.toLowerCase();
        const catMatch = (l) => String(l?.category || 'Unsorted').trim().toLowerCase() === normalizedCategory.toLowerCase();

        if (normalizedScope === 'workspace') {
            return links.filter(wsMatch);
        }
        if (normalizedScope === 'card') {
            return links.filter((link) => wsMatch(link) && catMatch(link));
        }

        return links.filter((link) => (
            wsMatch(link)
            && catMatch(link)
            && String(link?.folderId || '').trim() === normalizedFolderId
        ));
    }

    function getScopedFolders(scope, workspaceId, categoryName, folderId) {
        const normalizedScope = normalizeScope(scope);
        const normalizedWorkspace = String(workspaceId || '').trim();
        const normalizedCategory = String(categoryName || '').trim();
        const normalizedFolderId = String(folderId || '').trim();
        const folderTrees = getFolderTrees();
        
        const allFolders = [];
        for (const [scopedKey, tree] of Object.entries(folderTrees)) {
            const parts = scopedKey.split('::');
            const wsId = parts[0];
            const catName = parts.slice(1).join('::');
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            
            nodes.forEach(node => {
                if (node && node.id) {
                    allFolders.push({
                        ...node,
                        workspaceId: wsId,
                        categoryName: catName
                    });
                }
            });
        }
        
        if (normalizedScope === 'all_tabs') {
            return allFolders;
        }
        
        const wsMatch = (f) => String(f.workspaceId || 'main').trim().toLowerCase() === normalizedWorkspace.toLowerCase();
        const catMatch = (f) => String(f.categoryName || 'Unsorted').trim().toLowerCase() === normalizedCategory.toLowerCase();

        if (normalizedScope === 'workspace') {
            return allFolders.filter(wsMatch);
        }
        if (normalizedScope === 'card') {
            return allFolders.filter((f) => wsMatch(f) && catMatch(f));
        }
        
        return allFolders.filter((f) => (
            wsMatch(f)
            && catMatch(f)
            && String(f.parentId || '').trim() === normalizedFolderId
        ));
    }

    Object.assign(runtime, {
        getDatapackIndexApi,
        getLinks,
        getConfig,
        getFolderTrees,
        normalizeScope,
        normalizeUrl,
        buildScopedKey,
        getWorkspaceName,
        buildFolderLookup,
        getScopedLinks,
        getScopedFolders
    });

    runtime.baseLoaded = true;
})();
