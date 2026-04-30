window.EveBulkImport = window.EveBulkImport || {};

(function () {
    const api = window.EveBulkImport._api = window.EveBulkImport._api || {};
    if (api.processHelpersReady) return;

    function isUnlabeledProgressToken(value) {
        const text = String(value || '').trim();
        if (!text) return false;
        return /^(?:[\[\(\{]\s*)?\d+(?:\.\d+)?(?:\s*[\]\)\}])?$/.test(text);
    }

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function setLiveLinks(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    function normalizeBulkFolderKeyPart(value) {
        return String(value || '').trim().toLowerCase();
    }

    function buildBulkFolderTreeKey(categoryName, parts) {
        const normalizedCategory = normalizeBulkFolderKeyPart(categoryName);
        const normalizedParts = (Array.isArray(parts) ? parts : String(parts || '').split('/'))
            .map((part) => normalizeBulkFolderKeyPart(part))
            .filter(Boolean);
        return `${normalizedCategory}::${normalizedParts.join('/')}`;
    }

    function primeExistingBulkFolderMap(folderManager, workspaceId, categoryNames, createdFolders) {
        if (!folderManager || typeof folderManager.getScopedNodes !== 'function' || !(createdFolders instanceof Map)) return;

        const uniqueCategoryNames = Array.from(new Set(
            (Array.isArray(categoryNames) ? categoryNames : [categoryNames])
                .map((name) => String(name || '').trim())
                .filter(Boolean)
        ));

        uniqueCategoryNames.forEach((categoryName) => {
            const scopedNodes = Array.isArray(folderManager.getScopedNodes(workspaceId, categoryName))
                ? folderManager.getScopedNodes(workspaceId, categoryName)
                : [];
            if (!scopedNodes.length) return;

            const nodeMap = new Map();
            const pathCache = new Map();

            scopedNodes.forEach((node) => {
                const nodeId = String(node?.id || '').trim();
                if (!nodeId) return;
                nodeMap.set(nodeId, node);
            });

            function buildNodeParts(nodeId, depth = 0) {
                const normalizedId = String(nodeId || '').trim();
                if (!normalizedId || depth > 64) return [];
                if (pathCache.has(normalizedId)) return pathCache.get(normalizedId).slice();

                const node = nodeMap.get(normalizedId);
                if (!node) return [];

                const parentParts = buildNodeParts(node.parentId, depth + 1);
                const name = String(node.name || '').trim();
                const nextParts = name ? parentParts.concat(name) : parentParts;
                pathCache.set(normalizedId, nextParts);
                return nextParts.slice();
            }

            scopedNodes.forEach((node) => {
                const nodeId = String(node?.id || '').trim();
                if (!nodeId) return;
                const nodeParts = buildNodeParts(nodeId);
                const treeKey = buildBulkFolderTreeKey(categoryName, nodeParts);
                if (!treeKey || createdFolders.has(treeKey)) return;
                createdFolders.set(treeKey, nodeId);
            });
        });
    }

    function pushBulkLink(liveLinks, categoryName, title, rawUrl, folderId = '') {
        liveLinks.push({
            id: Date.now() + Math.random(),
            title: title,
            url: normalizeUrl(rawUrl),
            category: categoryName,
            workspace: config.activeWorkspace,
            folderId: folderId || undefined,
            icon: '',
            done: false
        });
    }

    function processSmartTextBlock(textToProcess, targetCategory, liveLinks, folderId = '') {
        const lines = String(textToProcess || '').split('\n');
        let addedCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i].trim();
            if (!raw) continue;

            let parsedUrl = '';
            let parsedTitle = '';

            const urlMatch = raw.match(/(https?:\/\/[^\s]+)/i);
            if (urlMatch) {
                parsedUrl = urlMatch[1];
                parsedTitle = raw.replace(parsedUrl, '').trim();
                parsedTitle = parsedTitle.replace(/^[\-\|:;\s]+|[\-\|:;\s]+$/g, '').trim();
            }

            if (!parsedUrl) {
                if (i + 1 < lines.length) {
                    const nextRaw = lines[i + 1].trim();
                    if (nextRaw) {
                        const nextUrlMatch = nextRaw.match(/^(https?:\/\/[^\s]+)$/i);
                        if (nextUrlMatch) {
                            parsedUrl = nextUrlMatch[1];
                            parsedTitle = raw;
                            i++;
                        }
                    }
                }
            }

            if (!parsedUrl) {
                parsedUrl = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
                parsedTitle = raw;
            } else if (!parsedTitle) {
                parsedTitle = parsedUrl;
            }

            pushBulkLink(liveLinks, targetCategory, parsedTitle, parsedUrl, folderId);
            addedCount++;
        }

        return addedCount;
    }

    function persistBulkLibraryState(options = {}) {
        const shouldSaveLibrary = !!options.saveLibrary;
        const shouldSaveConnections = !!options.saveConnections;
        if (!shouldSaveLibrary && !shouldSaveConnections) return true;
        window.setTimeout(function () {
            let succeeded = true;

            if (shouldSaveLibrary && window.EveLibrary?.Storage?.saveLibrary) {
                try {
                    window.EveLibrary.Storage.saveLibrary();
                } catch (error) {
                    succeeded = false;
                    console.error('Bulk import: failed to persist library state', error);
                }
            }

            if (shouldSaveConnections && window.EveLibrary?.ConnectionsCore?.saveConnections) {
                try {
                    window.EveLibrary.ConnectionsCore.saveConnections({ immediate: true });
                } catch (error) {
                    succeeded = false;
                    console.error('Bulk import: failed to persist library connections', error);
                }
            }

            if (!succeeded) {
                showToast('Imported items, but some library links could not be fully persisted.', 'warning');
            }
        }, 0);

        return true;
    }

    Object.assign(api, {
        isUnlabeledProgressToken,
        getLiveLinks,
        setLiveLinks,
        normalizeBulkFolderKeyPart,
        buildBulkFolderTreeKey,
        primeExistingBulkFolderMap,
        pushBulkLink,
        processSmartTextBlock,
        persistBulkLibraryState
    });
    api.processHelpersReady = true;
})();
