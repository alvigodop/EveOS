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

    function normalizeTitle(rawTitle) {
        const cleaned = String(rawTitle || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        // Ignore extremely short or generic titles to prevent catastrophic over-merging
        if (!cleaned || cleaned === 'untitled' || cleaned.length < 3) return null;
        return cleaned;
    }

    function scan(options = {}) {
        const scope = normalizeScope(options.scope);
        const workspaceId = String(options.workspaceId || '').trim();
        const categoryName = String(options.categoryName || '').trim();
        const folderId = String(options.folderId || '').trim();
        const scopeLinks = getScopedLinks(scope, workspaceId, categoryName, folderId);
        const folderLookupCache = new Map();

        let scannedUrls = scopeLinks.length;

        // DSU Structures
        const parent = new Map();
        const find = (i) => {
            if (!parent.has(i)) parent.set(i, i);
            let root = i;
            while (root !== parent.get(root)) root = parent.get(root);
            let curr = i;
            while (curr !== root) {
                let nxt = parent.get(curr);
                parent.set(curr, root);
                curr = nxt;
            }
            return root;
        };
        const union = (i, j) => {
            let rootI = find(i);
            let rootJ = find(j);
            if (rootI !== rootJ) parent.set(rootI, rootJ);
        };

        const urlToNode = new Map();
        const titleToNode = new Map();

        const nodes = scopeLinks.map((link, idx) => {
            const nUrl = normalizeUrl(link?.url);
            const nTitle = normalizeTitle(link?.title);

            const linkWorkspaceId = String(link?.workspace || 'main').trim() || 'main';
            const linkCategoryName = String(link?.category || 'Unsorted').trim() || 'Unsorted';
            const cacheKey = buildScopedKey(linkWorkspaceId, linkCategoryName);
            if (!folderLookupCache.has(cacheKey)) {
                folderLookupCache.set(cacheKey, buildFolderLookup(linkWorkspaceId, linkCategoryName));
            }
            const folderLookup = folderLookupCache.get(cacheKey);

            return {
                idx,
                linkId: String(link?.id || '').trim(),
                title: String(link?.title || 'Untitled').trim() || 'Untitled',
                url: String(link?.url || '').trim(),
                workspaceId: linkWorkspaceId,
                workspaceName: getWorkspaceName(linkWorkspaceId),
                categoryName: linkCategoryName,
                folderId: String(link?.folderId || '').trim(),
                folderLabel: folderLookup.getFolderLabel(link?.folderId),
                nUrl,
                nTitle
            };
        });

        // Group by URL and Title
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
            .filter(items => items.length > 1)
            .map(items => {
                const uniqueUrls = new Set(items.map(i => i.nUrl).filter(Boolean));
                const uniqueTitles = new Set(items.map(i => i.nTitle).filter(Boolean));
                let mainLabel = Array.from(uniqueUrls)[0] || Array.from(uniqueTitles)[0] || 'Unknown';
                if (uniqueUrls.size > 1) mainLabel = `${mainLabel} (+${uniqueUrls.size - 1} related)`;
                else if (uniqueTitles.size > 1) mainLabel = `${mainLabel} (Title matched)`;

                return {
                    normalizedUrl: mainLabel, // Repurposed as mainLabel for UI
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
            scannedUrls,
            duplicateGroups: groups.length,
            duplicateBookmarks,
            groups
        };
    }

    function mergeDuplicateGroup(linkIds) {
        if (!Array.isArray(linkIds) || linkIds.length < 2) return null;

        const links = getLinks();
        const targetLinks = links.filter(l => linkIds.includes(String(l.id)));
        if (targetLinks.length < 2) return null;

        // 1. Determine best URL and trace discarded URLs
        const isSearch = (url) => {
            const lower = String(url || '').toLowerCase();
            return lower.includes('google.com/search') || lower.includes('duckduckgo.com/?q=') || lower.includes('bing.com/search');
        };

        const nonSearchLinks = targetLinks.filter(l => !isSearch(l.url));
        let bestUrlLink = targetLinks[0];
        if (nonSearchLinks.length > 0) {
            bestUrlLink = nonSearchLinks.reduce((best, curr) => (String(curr.url).length > String(best.url).length) ? curr : best);
        } else {
            bestUrlLink = targetLinks.reduce((best, curr) => (String(curr.url).length > String(best.url).length) ? curr : best);
        }
        const bestUrl = String(bestUrlLink.url || '');
        const baseLinkId = String(bestUrlLink.id);
        const baseLink = links.find(l => String(l.id) === baseLinkId);
        if (!baseLink) return null;

        // Track discarded data for notes
        const discardedUrls = new Set();
        const discardedTitles = new Set();
        targetLinks.forEach(l => {
            const u = String(l.url || '').trim();
            if (u && u !== bestUrl) discardedUrls.add(u);
        });

        // 2. Determine best Title and trace discarded Titles
        const isRawUrl = (title) => {
            const lower = String(title || '').toLowerCase().trim();
            return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('www.');
        };

        let bestTitleLink = targetLinks[0];
        const nonRawUrlTitles = targetLinks.filter(l => !isRawUrl(l.title));
        if (nonRawUrlTitles.length > 0) {
            bestTitleLink = nonRawUrlTitles.reduce((best, curr) => (String(curr.title).length > String(best.title).length) ? curr : best);
        } else {
            bestTitleLink = targetLinks.reduce((best, curr) => (String(curr.title).length > String(best.title).length) ? curr : best);
        }
        const bestTitle = String(bestTitleLink.title || 'Untitled');

        targetLinks.forEach(l => {
            const t = String(l.title || '').trim();
            if (t && t !== bestTitle && !isRawUrl(t)) discardedTitles.add(t);
        });

        // 3. Merge primitives (icon, priority, fixedCoverImage)
        const firstWithIcon = targetLinks.find(l => !!String(l.icon || '').trim());
        const firstWithPriority = targetLinks.find(l => !!String(l.priority || '').trim());
        const firstWithFixedCover = targetLinks.find(l => !!String(l.fixedCoverImage || '').trim());

        baseLink.url = bestUrl;
        baseLink.title = bestTitle;
        if (firstWithIcon && !String(baseLink.icon || '').trim()) baseLink.icon = firstWithIcon.icon;
        if (firstWithPriority && !String(baseLink.priority || '').trim()) baseLink.priority = firstWithPriority.priority;
        if (firstWithFixedCover && !String(baseLink.fixedCoverImage || '').trim()) baseLink.fixedCoverImage = firstWithFixedCover.fixedCoverImage;

        // 4. Merge Primary Cover Image
        const allMainCovers = targetLinks.map(l => String(l.coverImage || '').trim()).filter(Boolean);
        if (allMainCovers.length > 0 && !String(baseLink.coverImage || '').trim()) {
            baseLink.coverImage = allMainCovers[0];
        }

        // 5. Merge Arrays (coverImages, sources)
        const mergedCoverImages = new Set(Array.isArray(baseLink.coverImages) ? baseLink.coverImages : []);
        targetLinks.forEach(l => {
            if (Array.isArray(l.coverImages)) l.coverImages.forEach(img => mergedCoverImages.add(img));
            const mainCov = String(l.coverImage || '').trim();
            if (mainCov && mainCov !== String(baseLink.coverImage || '').trim()) mergedCoverImages.add(mainCov);
        });
        if (mergedCoverImages.size > 0) baseLink.coverImages = Array.from(mergedCoverImages);

        const mergedSourcesMap = new Map();
        if (Array.isArray(baseLink.sources)) {
            baseLink.sources.forEach(src => {
                if (!src) return;
                const key = typeof src === 'object' ? JSON.stringify(src) : String(src);
                mergedSourcesMap.set(key, src);
            });
        }
        targetLinks.forEach(l => {
            if (Array.isArray(l.sources)) {
                l.sources.forEach(src => {
                    if (!src) return;
                    const key = typeof src === 'object' ? JSON.stringify(src) : String(src);
                    mergedSourcesMap.set(key, src);
                });
            }
        });
        if (mergedSourcesMap.size > 0) baseLink.sources = Array.from(mergedSourcesMap.values());

        // 6. Merge Library Connections
        let maxProgress = null;
        let maxProgressKey = null;
        let maxScore = null;
        let maxScoreKey = null;
        let mergedStatus = '';
        let mergedLibImage = '';
        const notesLines = [];

        const connectionsApi = window.EveLibrary?.ConnectionsAPI;
        let baseHasConnection = false;
        let bestConnection = null;
        let maxEntryKeys = -1;
        let mergedEntryData = {};

        if (connectionsApi) {
            targetLinks.forEach(l => {
                const conn = connectionsApi.findConnectionByLinkId?.(String(l.id));
                const linked = connectionsApi.getLinkedEntry(String(l.id));
                const entry = linked?.entry;

                if (String(l.id) === baseLinkId && conn) {
                    baseHasConnection = true;
                }

                if (conn && entry) {
                    let keysCount = 0;
                    for (const [k, v] of Object.entries(entry)) {
                        if (k === 'id' || k === 'dateAdded' || k === 'lastEdited') continue;
                        if (v !== null && v !== '' && (!Array.isArray(v) || v.length > 0)) keysCount++;
                    }
                    if (keysCount > maxEntryKeys) {
                        maxEntryKeys = keysCount;
                        bestConnection = conn;
                    }

                    for (const [k, v] of Object.entries(entry)) {
                        if (k === 'id' || k === 'dateAdded' || k === 'lastEdited') continue;
                        if (v !== null && v !== '' && (!Array.isArray(v) || v.length > 0)) {
                            if (Array.isArray(v)) {
                                const currentArr = Array.isArray(mergedEntryData[k]) ? mergedEntryData[k] : [];
                                const combinedMap = new Map();
                                currentArr.forEach(item => {
                                    if (!item) return;
                                    const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
                                    combinedMap.set(key, item);
                                });
                                v.forEach(item => {
                                    if (!item) return;
                                    const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
                                    combinedMap.set(key, item);
                                });
                                mergedEntryData[k] = Array.from(combinedMap.values());
                            } else {
                                if (!mergedEntryData[k]) mergedEntryData[k] = v;
                            }
                        }
                    }
                }

                if (!entry) return;

                const parseNum = (val) => { const n = Number.parseInt(val, 10); return Number.isNaN(n) ? null : n; };

                const ep = parseNum(entry.episode);
                const ch = parseNum(entry.chapter);
                const pr = parseNum(entry.progress);
                let localMaxP = null;
                let localPKey = null;
                if (ep !== null && ep > (localMaxP || -1)) { localMaxP = ep; localPKey = 'episode'; }
                if (ch !== null && ch > (localMaxP || -1)) { localMaxP = ch; localPKey = 'chapter'; }
                if (pr !== null && pr > (localMaxP || -1)) { localMaxP = pr; localPKey = 'progress'; }

                if (localMaxP !== null && (maxProgress === null || localMaxP > maxProgress)) {
                    maxProgress = localMaxP;
                    maxProgressKey = localPKey;
                }

                const ra = parseNum(entry.rating);
                const sc = parseNum(entry.score);
                let localMaxS = null;
                let localSKey = null;
                if (ra !== null && ra > (localMaxS || -1)) { localMaxS = ra; localSKey = 'rating'; }
                if (sc !== null && sc > (localMaxS || -1)) { localMaxS = sc; localSKey = 'score'; }

                if (localMaxS !== null && (maxScore === null || localMaxS > maxScore)) {
                    maxScore = localMaxS;
                    maxScoreKey = localSKey;
                }

                if (!mergedStatus && entry.status) mergedStatus = entry.status;
                if (!mergedLibImage && entry.image) mergedLibImage = entry.image;

                const n = String(entry.summary || '').trim();
                if (n && !notesLines.includes(n)) notesLines.push(n);
            });
        }

        // 7. Inject Discarded Data into Notes
        if (discardedTitles.size > 0) {
            notesLines.push(`=== Other Titles ===\n${Array.from(discardedTitles).join('\n')}`);
        }
        if (discardedUrls.size > 0) {
            notesLines.push(`=== Alternate Links ===\n${Array.from(discardedUrls).join('\n')}`);
        }

        const finalSummary = notesLines.join('\n\n').trim();

        // 8. Output Library Data & Relink Connection
        if (connectionsApi) {
            if (bestConnection && bestConnection.linkId !== baseLinkId) {
                if (baseHasConnection) {
                    if (connectionsApi.unlinkLink) connectionsApi.unlinkLink(baseLinkId, true);
                    else connectionsApi.removeByLinkId(baseLinkId);
                }

                // Move the entry safely BEFORE reassigning the connection linkId to avoid EveOS cloning ghosts
                if (connectionsApi.moveLinkedEntryToScope) {
                    const workspaceFallback = window.EveDuplicateSensor.getConfig?.()?.activeWorkspace || 'main';
                    connectionsApi.moveLinkedEntryToScope(bestConnection.linkId, baseLink.category || 'Unsorted', baseLink.workspace || workspaceFallback);
                }

                const allConns = connectionsApi.getAll();
                const connToSteal = allConns.find(c => c.id === bestConnection.id);
                if (connToSteal) {
                    connToSteal.linkId = baseLinkId;
                    if (connectionsApi.setAll) connectionsApi.setAll(allConns);
                    baseHasConnection = true;
                }
            }

            if (baseHasConnection) {
                // Wipe legacy fields from mergedEntryData so they don't leak
                delete mergedEntryData.progress;
                delete mergedEntryData.chapter;
                delete mergedEntryData.episode;
                delete mergedEntryData.score;
                delete mergedEntryData.rating;

                const patchData = {
                    ...mergedEntryData,
                    title: bestTitle,
                    sourceUrl: bestUrl
                };

                if (maxProgress !== null && maxProgressKey) {
                    patchData[maxProgressKey] = maxProgress;
                }
                if (maxScore !== null && maxScoreKey) {
                    patchData[maxScoreKey] = maxScore;
                }

                if (mergedStatus) patchData.status = mergedStatus;
                if (mergedLibImage) patchData.image = mergedLibImage;
                if (finalSummary) patchData.summary = finalSummary;

                if (baseHasConnection && connectionsApi.updateLinkedEntry) {
                    connectionsApi.updateLinkedEntry(baseLinkId, patchData);
                } else if (connectionsApi.promoteLinkWithData) {
                    connectionsApi.promoteLinkWithData(baseLinkId, patchData);
                }
            }
        }

        // 9. Remove redundant links
        const idsToRemove = targetLinks.map(l => String(l.id)).filter(id => id !== baseLinkId);
        if (idsToRemove.length > 0) {
            const actualLinksArray = getLinks();
            for (let i = actualLinksArray.length - 1; i >= 0; i--) {
                if (idsToRemove.includes(String(actualLinksArray[i].id))) {
                    actualLinksArray.splice(i, 1);
                }
            }
            if (connectionsApi && connectionsApi.unlinkLink) {
                idsToRemove.forEach(id => connectionsApi.unlinkLink(id, true));
            } else if (connectionsApi && connectionsApi.removeByLinkId) {
                idsToRemove.forEach(id => connectionsApi.removeByLinkId(id));
            }
        }

        if (typeof window.saveData === 'function') window.saveData();

        // 10. Force UI Resyncs
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (window.EveLibrary && window.EveLibrary.UI && typeof window.EveLibrary.UI.renderLibrary === 'function') {
            window.EveLibrary.UI.renderLibrary();
        } else if (typeof window.renderLibrary === 'function') {
            window.renderLibrary();
        }

        return { mergedId: baseLinkId, removedIds: idsToRemove };
    }

    Object.assign(ns, {
        normalizeScope,
        normalizeUrl,
        buildScopedKey,
        scan,
        mergeDuplicateGroup
    });

    ns.ready = true;
})();
