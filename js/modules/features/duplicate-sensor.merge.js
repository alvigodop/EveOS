window.EveDuplicateSensor = window.EveDuplicateSensor || {};

(function () {
    const ns = window.EveDuplicateSensor;
    const runtime = ns._runtime = ns._runtime || {};
    if (runtime.mergeLoaded) return;
    const mergeHelpers = ns._mergeHelpers || {};
    const buildStoreWriter = mergeHelpers.buildStoreWriter;
    const collectDescendantIds = mergeHelpers.collectDescendantIds;
    const getFolderDepth = mergeHelpers.getFolderDepth;
    const isRawUrl = mergeHelpers.isRawTitle;
    const isSearch = mergeHelpers.isSearchUrl;
    const parseNum = mergeHelpers.parseNum;

    function mergeDuplicateGroup(linkIds) {
        if (!Array.isArray(linkIds) || linkIds.length < 2) return null;

        const links = runtime.getLinks();
        const targetLinks = links.filter((link) => linkIds.includes(String(link.id)));
        if (targetLinks.length < 2) return null;

        const nonSearchLinks = targetLinks.filter((link) => !isSearch(link.url));
        const bestUrlLink = (nonSearchLinks.length > 0 ? nonSearchLinks : targetLinks)
            .reduce((best, current) => (String(current.url).length > String(best.url).length ? current : best));
        const bestUrl = String(bestUrlLink.url || '');
        const baseLinkId = String(bestUrlLink.id);
        const baseLink = links.find((link) => String(link.id) === baseLinkId);
        if (!baseLink) return null;

        const nonRawUrlTitles = targetLinks.filter((link) => !isRawUrl(link.title));
        const bestTitleLink = (nonRawUrlTitles.length > 0 ? nonRawUrlTitles : targetLinks)
            .reduce((best, current) => (String(current.title).length > String(best.title).length ? current : best));
        let bestTitle = String(bestTitleLink.title || 'Untitled');
        const seasonMatch = bestTitle.match(/\b(?:S|Season\s*)(\d+)(.*)$/i);
        if (seasonMatch) {
            bestTitle = bestTitle.substring(0, seasonMatch.index).trim();
        }

        const discardedUrls = new Set();
        const discardedTitles = new Set();
        targetLinks.forEach((link) => {
            const currentUrl = String(link.url || '').trim();
            if (currentUrl && currentUrl !== bestUrl) discardedUrls.add(currentUrl);
            const currentTitle = String(link.title || '').trim();
            if (currentTitle && currentTitle !== bestTitle && !isRawUrl(currentTitle)) discardedTitles.add(currentTitle);
        });

        const firstWithIcon = targetLinks.find((link) => !!String(link.icon || '').trim());
        const firstWithPriority = targetLinks.find((link) => !!String(link.priority || '').trim());
        const firstWithFixedCover = targetLinks.find((link) => !!String(link.fixedCoverImage || '').trim());
        const allMainCovers = targetLinks.map((link) => String(link.coverImage || '').trim()).filter(Boolean);

        baseLink.url = bestUrl;
        baseLink.title = bestTitle;
        if (firstWithIcon && !String(baseLink.icon || '').trim()) baseLink.icon = firstWithIcon.icon;
        if (firstWithPriority && !String(baseLink.priority || '').trim()) baseLink.priority = firstWithPriority.priority;
        if (firstWithFixedCover && !String(baseLink.fixedCoverImage || '').trim()) baseLink.fixedCoverImage = firstWithFixedCover.fixedCoverImage;
        if (allMainCovers.length > 0 && !String(baseLink.coverImage || '').trim()) baseLink.coverImage = allMainCovers[0];

        const mergedCoverImages = new Set(Array.isArray(baseLink.coverImages) ? baseLink.coverImages : []);
        targetLinks.forEach((link) => {
            if (Array.isArray(link.coverImages)) link.coverImages.forEach((image) => mergedCoverImages.add(image));
            const mainCover = String(link.coverImage || '').trim();
            if (mainCover && mainCover !== String(baseLink.coverImage || '').trim()) mergedCoverImages.add(mainCover);
        });
        if (mergedCoverImages.size > 0) baseLink.coverImages = Array.from(mergedCoverImages);

        const mergedSourcesMap = new Map();
        if (Array.isArray(baseLink.sources)) {
            baseLink.sources.forEach((source) => {
                if (!source) return;
                const key = typeof source === 'object' ? JSON.stringify(source) : String(source);
                mergedSourcesMap.set(key, source);
            });
        }
        targetLinks.forEach((link) => {
            if (!Array.isArray(link.sources)) return;
            link.sources.forEach((source) => {
                if (!source) return;
                const key = typeof source === 'object' ? JSON.stringify(source) : String(source);
                mergedSourcesMap.set(key, source);
            });
        });
        if (mergedSourcesMap.size > 0) baseLink.sources = Array.from(mergedSourcesMap.values());

        const connectionsApi = window.EveLibrary?.ConnectionsAPI;
        let maxProgress = null;
        let maxProgressKey = null;
        let maxSeason = null;
        let maxSeasonPairedEpisode = null;
        let maxScore = null;
        let maxScoreKey = null;
        let mergedStatus = '';
        let mergedLibImage = '';
        const notesLines = [];
        const detectedSeasonPairs = new Set();
        let baseHasConnection = false;
        let bestConnection = null;
        let maxEntryKeys = -1;
        let mergedEntryData = {};

        if (connectionsApi) {
            targetLinks.forEach((link) => {
                const connection = connectionsApi.findConnectionByLinkId?.(String(link.id));
                const linked = connectionsApi.getLinkedEntry(String(link.id));
                const entry = linked?.entry;

                if (String(link.id) === baseLinkId && connection) {
                    baseHasConnection = true;
                }

                if (connection && entry) {
                    let keysCount = 0;
                    for (const [key, value] of Object.entries(entry)) {
                        if (key === 'id' || key === 'dateAdded' || key === 'lastEdited') continue;
                        if (value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)) keysCount += 1;
                    }
                    if (keysCount > maxEntryKeys) {
                        maxEntryKeys = keysCount;
                        bestConnection = connection;
                    }

                    for (const [key, value] of Object.entries(entry)) {
                        if (key === 'id' || key === 'dateAdded' || key === 'lastEdited') continue;
                        if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
                        if (Array.isArray(value)) {
                            const currentArray = Array.isArray(mergedEntryData[key]) ? mergedEntryData[key] : [];
                            const combinedMap = new Map();
                            currentArray.forEach((item) => {
                                if (!item) return;
                                const itemKey = typeof item === 'object' ? JSON.stringify(item) : String(item);
                                combinedMap.set(itemKey, item);
                            });
                            value.forEach((item) => {
                                if (!item) return;
                                const itemKey = typeof item === 'object' ? JSON.stringify(item) : String(item);
                                combinedMap.set(itemKey, item);
                            });
                            mergedEntryData[key] = Array.from(combinedMap.values());
                        } else if (!mergedEntryData[key]) {
                            mergedEntryData[key] = value;
                        }
                    }
                }

                if (!entry) return;

                const season = parseNum(entry.season);
                const episode = parseNum(entry.episode);
                const chapter = parseNum(entry.chapter);
                const progress = parseNum(entry.progress);

                if (season !== null) {
                    const pairString = `Season ${season}` + (episode !== null ? `, Episode ${episode}` : '');
                    detectedSeasonPairs.add(pairString);
                    if (maxSeason === null || season > maxSeason) {
                        maxSeason = season;
                        maxSeasonPairedEpisode = episode !== null ? episode : 0;
                    } else if (season === maxSeason && episode !== null && (maxSeasonPairedEpisode === null || episode > maxSeasonPairedEpisode)) {
                        maxSeasonPairedEpisode = episode;
                    }
                }

                let localMaxProgress = null;
                let localProgressKey = null;
                if (episode !== null && episode > (localMaxProgress || -1)) { localMaxProgress = episode; localProgressKey = 'episode'; }
                if (chapter !== null && chapter > (localMaxProgress || -1)) { localMaxProgress = chapter; localProgressKey = 'chapter'; }
                if (progress !== null && progress > (localMaxProgress || -1)) { localMaxProgress = progress; localProgressKey = 'progress'; }
                if (localMaxProgress !== null && (maxProgress === null || localMaxProgress > maxProgress)) {
                    maxProgress = localMaxProgress;
                    maxProgressKey = localProgressKey;
                }

                const rating = parseNum(entry.rating);
                const score = parseNum(entry.score);
                let localMaxScore = null;
                let localScoreKey = null;
                if (rating !== null && rating > (localMaxScore || -1)) { localMaxScore = rating; localScoreKey = 'rating'; }
                if (score !== null && score > (localMaxScore || -1)) { localMaxScore = score; localScoreKey = 'score'; }
                if (localMaxScore !== null && (maxScore === null || localMaxScore > maxScore)) {
                    maxScore = localMaxScore;
                    maxScoreKey = localScoreKey;
                }

                if (!mergedStatus && entry.status) mergedStatus = entry.status;
                if (!mergedLibImage && entry.image) mergedLibImage = entry.image;

                const summary = String(entry.summary || '').trim();
                if (summary && !notesLines.includes(summary)) notesLines.push(summary);
            });
        }

        if (discardedTitles.size > 0) {
            notesLines.push(`=== Other Titles ===\n${Array.from(discardedTitles).join('\n')}`);
        }
        if (discardedUrls.size > 0) {
            notesLines.push(`=== Alternate Links ===\n${Array.from(discardedUrls).join('\n')}`);
        }
        if (detectedSeasonPairs.size > 0) {
            const chosenPair = `Season ${maxSeason}` + (maxSeasonPairedEpisode !== null && maxSeasonPairedEpisode > 0 ? `, Episode ${maxSeasonPairedEpisode}` : '');
            const discardedPairs = Array.from(detectedSeasonPairs).filter((pair) => pair !== chosenPair);
            if (discardedPairs.length > 0) {
                notesLines.push(`=== Previous Seasons/Episodes ===\n${discardedPairs.join('\n')}`);
            }
        }
        const finalSummary = notesLines.join('\n\n').trim();

        if (connectionsApi) {
            if (bestConnection && bestConnection.linkId !== baseLinkId) {
                if (baseHasConnection) {
                    if (connectionsApi.unlinkLink) connectionsApi.unlinkLink(baseLinkId, true);
                    else connectionsApi.removeByLinkId(baseLinkId);
                }
                if (connectionsApi.moveLinkedEntryToScope) {
                    const workspaceFallback = runtime.getConfig()?.activeWorkspace || 'main';
                    connectionsApi.moveLinkedEntryToScope(bestConnection.linkId, baseLink.category || 'Unsorted', baseLink.workspace || workspaceFallback);
                }
                const allConnections = connectionsApi.getAll();
                const connectionToSteal = allConnections.find((connection) => connection.id === bestConnection.id);
                if (connectionToSteal) {
                    connectionToSteal.linkId = baseLinkId;
                    if (connectionsApi.setAll) connectionsApi.setAll(allConnections);
                    baseHasConnection = true;
                }
            }

            if (baseHasConnection) {
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
                if (maxProgress !== null && maxProgressKey) patchData[maxProgressKey] = maxProgress;
                if (maxSeason !== null) {
                    patchData.season = maxSeason;
                    if (maxSeasonPairedEpisode !== null) patchData.episode = maxSeasonPairedEpisode;
                }
                if (maxScore !== null && maxScoreKey) patchData[maxScoreKey] = maxScore;
                if (mergedStatus) patchData.status = mergedStatus;
                if (mergedLibImage) patchData.image = mergedLibImage;
                if (finalSummary) patchData.summary = finalSummary;

                if (connectionsApi.updateLinkedEntry) {
                    connectionsApi.updateLinkedEntry(baseLinkId, patchData);
                } else if (connectionsApi.promoteLinkWithData) {
                    connectionsApi.promoteLinkWithData(baseLinkId, patchData);
                }
            }
        }

        const idsToRemove = targetLinks.map((link) => String(link.id)).filter((id) => id !== baseLinkId);
        if (idsToRemove.length > 0) {
            for (let index = links.length - 1; index >= 0; index--) {
                if (idsToRemove.includes(String(links[index].id))) {
                    links.splice(index, 1);
                }
            }
            if (connectionsApi?.unlinkLink) {
                idsToRemove.forEach((id) => connectionsApi.unlinkLink(id, true));
            } else if (connectionsApi?.removeByLinkId) {
                idsToRemove.forEach((id) => connectionsApi.removeByLinkId(id));
            }
        }

        // Standardized sync using the same logic as folder merge
        const writeStore = buildStoreWriter(runtime);

        writeStore(runtime.getFolderTrees());
        
        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (window.EveLibrary?.UI && typeof window.EveLibrary.UI.renderLibrary === 'function') {
            window.EveLibrary.UI.renderLibrary();
        } else if (typeof window.renderLibrary === 'function') {
            window.renderLibrary();
        }

        return { mergedId: baseLinkId, removedIds: idsToRemove };
    }

    function mergeDuplicateFolderGroup(folderIds) {
        if (!Array.isArray(folderIds) || folderIds.length < 2) return null;

        const folderTrees = runtime.getFolderTrees();
        
        // Use the official writeStore if available, or fallback to the manual sync
        const writeStore = buildStoreWriter(runtime);

        const allNodes = [];
        Object.entries(folderTrees).forEach(([scopedKey, tree]) => {
            const [wsId, ...catParts] = scopedKey.split('::');
            const catName = catParts.length > 0 ? catParts.join('::') : 'Unsorted';
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            nodes.forEach(node => {
                if (node && node.id) allNodes.push({ ...node, workspaceId: wsId, categoryName: catName });
            });
        });

        const targetFolders = allNodes.filter(f => folderIds.includes(f.id));
        if (targetFolders.length < 2) return null;

        // Base folder priority: shortest path length, else oldest folder
        const nodeLookup = new Map();
        allNodes.forEach(n => nodeLookup.set(n.id, n));
        
        targetFolders.forEach(f => f._depth = getFolderDepth(f.id, nodeLookup));
        targetFolders.sort((a, b) => a._depth - b._depth || (a.createdAt || 0) - (b.createdAt || 0));
        
        const baseFolder = targetFolders[0];
        const removedIds = targetFolders.slice(1).map(f => f.id);

        const nextStore = JSON.parse(JSON.stringify(folderTrees));
        const baseScopedKey = `${baseFolder.workspaceId}::${baseFolder.categoryName}`;
        if (!nextStore[baseScopedKey]) nextStore[baseScopedKey] = { nodes: [], settings: { clickBehaviorMode: 'inherit' } };

        // 1. Reparent Links
        const links = runtime.getLinks();
        if (Array.isArray(links)) {
            links.forEach(link => {
                const fId = String(link.folderId || '').trim();
                if (removedIds.includes(fId)) {
                    link.folderId = baseFolder.id;
                    link.workspace = baseFolder.workspaceId;
                    link.category = baseFolder.categoryName;
                    if (typeof window.EveLibrary?.ConnectionsAPI?.syncFromLink === 'function') {
                        window.EveLibrary.ConnectionsAPI.syncFromLink(link.id);
                    }
                }
            });
        }

        // 2. Helper for recursive subtree migration
        // 3. Reparent Folders
        Object.entries(nextStore).forEach(([scopedKey, tree]) => {
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            const nodesToKeep = [];
            const nodesToMoveWithKeys = []; // Array of {node, originalScopedKey}
            
            nodes.forEach(node => {
                // If it is one of the duplicated folders themselves, DELETE IT completely.
                if (removedIds.includes(node.id)) return;
                
                // If its parent is one of the duplicates, it now belongs to the baseFolder
                const pId = String(node.parentId || '').trim();
                if (removedIds.includes(pId)) {
                    node.parentId = baseFolder.id;
                    node.updatedAt = Date.now();
                    
                    if (scopedKey !== baseScopedKey) {
                        nodesToMoveWithKeys.push({ node, key: scopedKey });
                        // Also must recursively find all its descendants and tag them for moving!
                        const descendants = collectDescendantIds(nextStore, node.id, scopedKey);
                        descendants.forEach(dId => {
                            const dNode = nodes.find(n => n.id === dId);
                            if (dNode) nodesToMoveWithKeys.push({ node: dNode, key: scopedKey });
                        });
                    } else {
                        nodesToKeep.push(node);
                    }
                } else {
                    nodesToKeep.push(node);
                }
            });
            
            // Clean up the moved items from this specific tree
            const movedIds = new Set(nodesToMoveWithKeys.map(m => m.node.id));
            const finalNodes = nodesToKeep.filter(n => !movedIds.has(n.id));

            if (Array.isArray(tree?.nodes)) tree.nodes = finalNodes;
            else nextStore[scopedKey] = finalNodes;

            // Perform the global move
            nodesToMoveWithKeys.forEach(({ node }) => {
                const targetTree = nextStore[baseScopedKey];
                const targetNodes = Array.isArray(targetTree?.nodes) ? targetTree.nodes : targetTree;
                if (Array.isArray(targetNodes)) {
                     // Ensure no double-add
                    if (!targetNodes.find(n => n.id === node.id)) targetNodes.push(node);
                }
            });
        });

        // Cleanup empty trees
        Object.keys(nextStore).forEach(key => {
            const tree = nextStore[key];
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : tree;
            const settings = tree?.settings || { clickBehaviorMode: 'inherit' };
            if (Array.isArray(nodes) && nodes.length === 0 && settings.clickBehaviorMode === 'inherit') {
                delete nextStore[key];
            }
        });

        writeStore(nextStore);

        if (typeof window.renderSidebar === 'function') window.renderSidebar();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (window.EveBookmarkFolders?.refreshEditorFolderSelect) {
            window.EveBookmarkFolders.refreshEditorFolderSelect();
        }

        return { mergedId: baseFolder.id, removedIds };
    }

    Object.assign(runtime, { mergeDuplicateGroup, mergeDuplicateFolderGroup });
    runtime.mergeLoaded = true;
})();
