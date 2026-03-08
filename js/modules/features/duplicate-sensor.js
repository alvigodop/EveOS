window.EveDuplicateSensor = window.EveDuplicateSensor || {};

(function () {
    const ns = window.EveDuplicateSensor;
    if (ns.ready) return;

    function getLinks() {
        return Array.isArray(window.eveState?.links) ? window.eveState.links : (window.links || []);
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

    function getScopedLinks(scope, workspaceId, categoryName, folderId) {
        const normalizedScope = normalizeScope(scope);
        const normalizedWorkspace = String(workspaceId || '').trim();
        const normalizedCategory = String(categoryName || '').trim();
        const normalizedFolderId = String(folderId || '').trim();
        const links = getLinks();

        if (normalizedScope === 'all_tabs') {
            return links.slice();
        }

        if (normalizedScope === 'workspace') {
            return links.filter((link) => String(link?.workspace || 'main') === normalizedWorkspace);
        }

        if (normalizedScope === 'card') {
            return links.filter((link) => (
                String(link?.workspace || 'main') === normalizedWorkspace
                && String(link?.category || 'Unsorted') === normalizedCategory
            ));
        }

        return links.filter((link) => (
            String(link?.workspace || 'main') === normalizedWorkspace
            && String(link?.category || 'Unsorted') === normalizedCategory
            && String(link?.folderId || '').trim() === normalizedFolderId
        ));
    }

    function scan(options = {}) {
        const scope = normalizeScope(options.scope);
        const workspaceId = String(options.workspaceId || '').trim();
        const categoryName = String(options.categoryName || '').trim();
        const folderId = String(options.folderId || '').trim();
        const scopeLinks = getScopedLinks(scope, workspaceId, categoryName, folderId);
        const folderLookupCache = new Map();
        const groupsByUrl = new Map();
        let scannedUrls = 0;

        scopeLinks.forEach((link) => {
            const normalized = normalizeUrl(link?.url);
            if (!normalized) return;
            scannedUrls += 1;

            const linkWorkspaceId = String(link?.workspace || 'main').trim() || 'main';
            const linkCategoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
            const cacheKey = buildScopedKey(linkWorkspaceId, linkCategoryName);
            if (!folderLookupCache.has(cacheKey)) {
                folderLookupCache.set(cacheKey, buildFolderLookup(linkWorkspaceId, linkCategoryName));
            }
            const folderLookup = folderLookupCache.get(cacheKey);

            if (!groupsByUrl.has(normalized)) {
                groupsByUrl.set(normalized, []);
            }
            groupsByUrl.get(normalized).push({
                linkId: String(link?.id || '').trim(),
                title: String(link?.title || 'Untitled').trim() || 'Untitled',
                url: String(link?.url || '').trim(),
                workspaceId: linkWorkspaceId,
                workspaceName: getWorkspaceName(linkWorkspaceId),
                categoryName: linkCategoryName,
                folderId: String(link?.folderId || '').trim(),
                folderLabel: folderLookup.getFolderLabel(link?.folderId)
            });
        });

        const groups = Array.from(groupsByUrl.entries())
            .filter(([, items]) => items.length > 1)
            .map(([normalizedUrl, items]) => ({
                normalizedUrl,
                count: items.length,
                duplicateCount: items.length - 1,
                items: items.slice().sort((left, right) => {
                    if (left.workspaceName !== right.workspaceName) return left.workspaceName.localeCompare(right.workspaceName);
                    if (left.categoryName !== right.categoryName) return left.categoryName.localeCompare(right.categoryName);
                    if (left.folderLabel !== right.folderLabel) return left.folderLabel.localeCompare(right.folderLabel);
                    return left.title.localeCompare(right.title);
                })
            }))
            .sort((left, right) => {
                if (right.count !== left.count) return right.count - left.count;
                return left.normalizedUrl.localeCompare(right.normalizedUrl);
            });

        const duplicateBookmarks = groups.reduce((total, group) => total + group.duplicateCount, 0);
        return {
            scope,
            workspaceId,
            categoryName,
            folderId,
            totalBookmarks: scopeLinks.length,
            scannedUrls,
            duplicateGroups: groups.length,
            duplicateBookmarks,
            groups
        };
    }

    Object.assign(ns, {
        normalizeScope,
        normalizeUrl,
        buildScopedKey,
        scan
    });

    ns.ready = true;
})();
