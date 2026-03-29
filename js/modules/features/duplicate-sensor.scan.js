window.EveDuplicateSensor = window.EveDuplicateSensor || {};

(function () {
    const ns = window.EveDuplicateSensor;
    const runtime = ns._runtime = ns._runtime || {};
    if (runtime.scanLoaded) return;

    function normalizeTitle(rawTitle) {
        let title = String(rawTitle || '').trim();
        const seasonMatch = title.match(/\b(?:S|Season\s*)(\d+)(.*)$/i);
        if (seasonMatch) {
            title = title.substring(0, seasonMatch.index).trim();
        }

        const cleaned = title.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (!cleaned || cleaned === 'untitled' || cleaned.length < 3) return null;
        return cleaned;
    }

    function scan(options = {}) {
        const scope = runtime.normalizeScope(options.scope);
        const workspaceId = String(options.workspaceId || '').trim();
        const categoryName = String(options.categoryName || '').trim();
        const folderId = String(options.folderId || '').trim();
        const scopeLinks = runtime.getScopedLinks(scope, workspaceId, categoryName, folderId);
        const folderLookupCache = new Map();
        const parent = new Map();

        const find = (index) => {
            if (!parent.has(index)) parent.set(index, index);
            let root = index;
            while (root !== parent.get(root)) root = parent.get(root);
            let current = index;
            while (current !== root) {
                const next = parent.get(current);
                parent.set(current, root);
                current = next;
            }
            return root;
        };
        const union = (left, right) => {
            const rootLeft = find(left);
            const rootRight = find(right);
            if (rootLeft !== rootRight) parent.set(rootLeft, rootRight);
        };

        const urlToNode = new Map();
        const titleToNode = new Map();
        const nodes = scopeLinks.map((link, idx) => {
            const nUrl = runtime.normalizeUrl(link?.url);
            const nTitle = normalizeTitle(link?.title);
            const linkWorkspaceId = String(link?.workspace || 'main').trim() || 'main';
            const linkCategoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
            const cacheKey = runtime.buildScopedKey(linkWorkspaceId, linkCategoryName);
            if (!folderLookupCache.has(cacheKey)) {
                folderLookupCache.set(cacheKey, runtime.buildFolderLookup(linkWorkspaceId, linkCategoryName));
            }
            const folderLookup = folderLookupCache.get(cacheKey);

            return {
                idx,
                linkId: String(link?.id || '').trim(),
                title: String(link?.title || 'Untitled').trim() || 'Untitled',
                url: String(link?.url || '').trim(),
                workspaceId: linkWorkspaceId,
                workspaceName: runtime.getWorkspaceName(linkWorkspaceId),
                categoryName: linkCategoryName,
                folderId: String(link?.folderId || '').trim(),
                folderLabel: folderLookup.getFolderLabel(link?.folderId),
                nUrl,
                nTitle
            };
        });

        nodes.forEach((node) => {
            if (node.nUrl) {
                if (urlToNode.has(node.nUrl)) union(node.idx, urlToNode.get(node.nUrl));
                else urlToNode.set(node.nUrl, node.idx);
            }
            if (node.nTitle) {
                if (titleToNode.has(node.nTitle)) union(node.idx, titleToNode.get(node.nTitle));
                else titleToNode.set(node.nTitle, node.idx);
            }
        });

        const groupsByRoot = new Map();
        nodes.forEach((node) => {
            const root = find(node.idx);
            if (!groupsByRoot.has(root)) groupsByRoot.set(root, []);
            groupsByRoot.get(root).push(node);
        });

        const groups = Array.from(groupsByRoot.values())
            .filter((items) => items.length > 1)
            .map((items) => {
                const uniqueUrls = new Set(items.map((item) => item.nUrl).filter(Boolean));
                const uniqueTitles = new Set(items.map((item) => item.nTitle).filter(Boolean));
                let mainLabel = Array.from(uniqueUrls)[0] || Array.from(uniqueTitles)[0] || 'Unknown';
                if (uniqueUrls.size > 1) mainLabel = `${mainLabel} (+${uniqueUrls.size - 1} related)`;
                else if (uniqueTitles.size > 1) mainLabel = `${mainLabel} (Title matched)`;

                return {
                    normalizedUrl: mainLabel,
                    count: items.length,
                    duplicateCount: items.length - 1,
                    items: items.slice().sort((left, right) => {
                        if (left.workspaceName !== right.workspaceName) return left.workspaceName.localeCompare(right.workspaceName);
                        if (left.categoryName !== right.categoryName) return left.categoryName.localeCompare(right.categoryName);
                        if (left.folderLabel !== right.folderLabel) return left.folderLabel.localeCompare(right.folderLabel);
                        return left.title.localeCompare(right.title);
                    })
                };
            })
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
            scannedUrls: scopeLinks.length,
            duplicateGroups: groups.length,
            duplicateBookmarks,
            groups
        };
    }

    Object.assign(runtime, {
        normalizeTitle,
        scan
    });

    runtime.scanLoaded = true;
})();
