// --- CATEGORIES ---

function getCategoryLiveLinks() {
    if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
    if (Array.isArray(window.eveState?.links)) return window.eveState.links;
    if (Array.isArray(window.links)) return window.links;
    if (typeof links !== 'undefined' && Array.isArray(links)) return links;
    return [];
}

function setCategoryLiveLinks(nextLinks) {
    if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
    if (window.eveState) window.eveState.links = nextLinks;
    window.links = nextLinks;
    if (typeof links !== 'undefined') links = nextLinks;
    return nextLinks;
}

function normalizeCategoryWorkspaceId(workspaceId) {
    return String(workspaceId || 'main').trim() || 'main';
}

function normalizeCategoryNameValue(categoryName) {
    return String(categoryName || 'Unsorted').trim() || 'Unsorted';
}

function buildCategoryScopeKey(workspaceId, categoryName) {
    if (window.EveBookmarkFolders?.buildScopedKey) {
        return window.EveBookmarkFolders.buildScopedKey(workspaceId, categoryName);
    }
    return normalizeCategoryWorkspaceId(workspaceId) + '::' + normalizeCategoryNameValue(categoryName);
}

function moveScopedObjectConfig(cfg, storeName, sourceKey, targetKey, options) {
    if (!cfg || !cfg[storeName] || typeof cfg[storeName] !== 'object' || Array.isArray(cfg[storeName])) return false;
    var store = cfg[storeName];
    if (!Object.prototype.hasOwnProperty.call(store, sourceKey)) return false;
    var sourceValue = store[sourceKey];
    if (!Object.prototype.hasOwnProperty.call(store, targetKey)) {
        store[targetKey] = sourceValue;
    } else if (Array.isArray(store[targetKey]) && Array.isArray(sourceValue)) {
        store[targetKey] = Array.from(new Set(store[targetKey].concat(sourceValue)));
    } else if (store[targetKey] && typeof store[targetKey] === 'object' && sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        store[targetKey] = Object.assign({}, sourceValue, store[targetKey]);
    } else if (!options || !options.preserveTargetPrimitive) {
        store[targetKey] = store[targetKey] || sourceValue;
    }
    delete store[sourceKey];
    return true;
}

function moveScopedArrayConfig(cfg, storeName, sourceKey, targetKey) {
    if (!cfg || !Array.isArray(cfg[storeName])) return false;
    var hadSource = cfg[storeName].includes(sourceKey);
    if (!hadSource) return false;
    cfg[storeName] = cfg[storeName].filter(function (entry) {
        return entry !== sourceKey;
    });
    if (!cfg[storeName].includes(targetKey)) cfg[storeName].push(targetKey);
    return true;
}

function moveScopedPrefixObjectConfig(cfg, storeName, sourcePrefix, targetPrefix) {
    if (!cfg || !cfg[storeName] || typeof cfg[storeName] !== 'object' || Array.isArray(cfg[storeName])) return false;
    var store = cfg[storeName];
    var changed = false;
    Object.keys(store).forEach(function (key) {
        if (key !== sourcePrefix && key.indexOf(sourcePrefix + '::') !== 0) return;
        var nextKey = targetPrefix + key.slice(sourcePrefix.length);
        if (!Object.prototype.hasOwnProperty.call(store, nextKey)) {
            store[nextKey] = store[key];
        }
        delete store[key];
        changed = true;
    });
    return changed;
}

function transferCategoryScopedConfig(sourceWorkspaceId, sourceCategoryName, targetWorkspaceId, targetCategoryName) {
    var cfg = window.eveState?.config
        || window.config
        || (typeof config !== 'undefined' && config ? config : {});
    var sourceKey = buildCategoryScopeKey(sourceWorkspaceId, sourceCategoryName);
    var targetKey = buildCategoryScopeKey(targetWorkspaceId, targetCategoryName);
    if (sourceKey === targetKey) return false;
    var changed = false;

    ['cardDescriptions', 'cardHeaderButtonsVisible', 'cardBookmarkProgressiveReveal', 'customOrder', 'customOrderSort', 'trueValueSettings'].forEach(function (storeName) {
        changed = moveScopedObjectConfig(cfg, storeName, sourceKey, targetKey, { preserveTargetPrimitive: true }) || changed;
    });

    ['customOrderEnabled', 'trueValueEnabled', 'smartCardWeights'].forEach(function (storeName) {
        changed = moveScopedArrayConfig(cfg, storeName, sourceKey, targetKey) || changed;
    });

    changed = moveScopedPrefixObjectConfig(cfg, 'folderBookmarkProgressiveReveal', sourceKey, targetKey) || changed;
    return changed;
}

function categoryHasContentInWorkspace(workspaceId, categoryName) {
    var wsId = normalizeCategoryWorkspaceId(workspaceId);
    var catName = normalizeCategoryNameValue(categoryName);
    if (getCategoryLiveLinks().some(function (link) {
        return normalizeCategoryWorkspaceId(link?.workspace) === wsId
            && normalizeCategoryNameValue(link?.category) === catName;
    })) return true;

    var folderStore = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
    if (Object.prototype.hasOwnProperty.call(folderStore, buildCategoryScopeKey(wsId, catName))) return true;

    return !!(window.EveCategoryOrder?.hasCategory && window.EveCategoryOrder.hasCategory(wsId, catName));
}

function getCategoryStructureSummary() {
    const indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    if (!indexApi || typeof indexApi.getStructureSummary !== 'function') return null;
    if (typeof indexApi.hasReadableStructureSnapshot === 'function' && !indexApi.hasReadableStructureSnapshot()) return null;
    if (typeof indexApi.hasReadableStructureSnapshot !== 'function' && typeof indexApi.hasUsableSnapshot === 'function' && !indexApi.hasUsableSnapshot()) return null;
    const buildState = typeof indexApi.getBuildState === 'function' ? indexApi.getBuildState() : null;
    if (typeof indexApi.hasReadableStructureSnapshot !== 'function' && typeof indexApi.hasUsableSnapshot !== 'function' && Number(buildState?.builtAt || 0) <= 0) return null;
    return indexApi.getStructureSummary();
}

function buildCategoryCardMoveConfirmMessage(sourceCat, targetName, targetWs, targetExists) {
    var message = 'Move card "' + sourceCat + '" to ' + (targetName || ('tab ' + targetWs)) + '?';
    if (targetExists) {
        message += '\n\nA card with this name already exists there. Bookmarks will merge with matching title/URL entries, and folder/card settings will preserve the destination when both exist.';
    }
    return message;
}

function requestCategoryCardMoveConfirm(sourceCat, targetName, targetWs, targetExists) {
    var message = buildCategoryCardMoveConfirmMessage(sourceCat, targetName, targetWs, targetExists);
    var options = {
        title: 'Move Card',
        confirmLabel: 'Move Card',
        cancelLabel: 'Keep Here',
        kind: targetExists ? 'card-move-merge-confirm' : 'card-move-confirm'
    };
    if (typeof window.showConfirmWithTitle === 'function') {
        return window.showConfirmWithTitle('Move Card', message, options);
    }
    if (typeof window.showConfirm === 'function') {
        return window.showConfirm(message, options);
    }
    if (typeof window.confirm === 'function') return window.confirm(message);
    return true;
}

function moveCategoryCardToWorkspace(sourceWorkspaceId, categoryName, targetWorkspaceId, options) {
    options = options || {};
    var sourceWs = normalizeCategoryWorkspaceId(sourceWorkspaceId);
    var sourceCat = normalizeCategoryNameValue(categoryName);
    var targetWs = normalizeCategoryWorkspaceId(targetWorkspaceId);
    var targetCat = normalizeCategoryNameValue(options.targetCategoryName || sourceCat);
    if (!sourceCat || sourceWs === targetWs) return false;

    var targetName = options.targetWorkspaceName || '';
    var targetExists = categoryHasContentInWorkspace(targetWs, targetCat);

    function applyCardMove() {
        var liveLinks = getCategoryLiveLinks();
        var sourceLinks = liveLinks.filter(function (link) {
            return normalizeCategoryWorkspaceId(link?.workspace) === sourceWs
                && normalizeCategoryNameValue(link?.category) === sourceCat;
        });

        if (window.EveBookmarkFolders?.transferCategoryFolders) {
            window.EveBookmarkFolders.transferCategoryFolders(sourceWs, sourceCat, targetWs, targetCat, { persist: false });
        }

        var mergeApi = window.EveBookmarkMerge;
        var movedIds = [];
        var mergedIds = [];
        var removedIds = [];
        sourceLinks.forEach(function (link) {
            if (!link) return;
            var folderId = String(link.folderId || '').trim();
            if (mergeApi && typeof mergeApi.moveOrMergeLinkToScope === 'function') {
                var result = mergeApi.moveOrMergeLinkToScope(link, {
                    workspaceId: targetWs,
                    categoryName: targetCat,
                    folderId: folderId
                }, {
                    source: options.source || 'category-card-move',
                    links: liveLinks
                });
                if (result?.targetId) movedIds.push(String(result.targetId));
                if (result?.merged && result.targetId) mergedIds.push(String(result.targetId));
                if (Array.isArray(result?.removedIds)) removedIds.push.apply(removedIds, result.removedIds.map(String));
                return;
            }
            link.workspace = targetWs;
            link.category = targetCat;
            movedIds.push(String(link.id));
            if (typeof window.EveLibrary?.ConnectionsAPI?.syncFromLink === 'function') {
                window.EveLibrary.ConnectionsAPI.syncFromLink(link.id);
            }
        });

        setCategoryLiveLinks(liveLinks);
        transferCategoryScopedConfig(sourceWs, sourceCat, targetWs, targetCat);

        if (window.EveCategoryOrder?.removeCategory) window.EveCategoryOrder.removeCategory(sourceWs, sourceCat);
        if (window.EveCategoryOrder?.ensureCategory) window.EveCategoryOrder.ensureCategory(targetWs, targetCat);
        if (options.targetPositionCategoryName && window.EveCategoryOrder?.moveCategoryToPosition && window.EveCategoryOrder?.getOrder) {
            var order = window.EveCategoryOrder.getOrder(targetWs, { persist: true });
            var targetIndex = Array.isArray(order) ? order.indexOf(String(options.targetPositionCategoryName)) : -1;
            if (targetIndex >= 0) window.EveCategoryOrder.moveCategoryToPosition(targetWs, targetCat, targetIndex + 1);
        }

        var moveMutationMeta = {
            kind: 'category-card-move',
            workspaceId: sourceWs,
            categoryName: sourceCat,
            dataDelta: {
                complete: false,
                workspaceIds: [sourceWs, targetWs],
                categoryNames: [sourceCat, targetCat],
                linkIds: movedIds,
                removedLinkIds: removedIds,
                affectedScopes: [
                    { workspaceId: sourceWs, categoryName: sourceCat },
                    { workspaceId: targetWs, categoryName: targetCat }
                ],
                hasFolderStoreChanges: true
            }
        };
        var indexApi = window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
        if (indexApi && typeof indexApi.markDirty === 'function') {
            indexApi.markDirty(options.source || 'category-card-move', moveMutationMeta);
        }
        if (window.EveFolderViewV2?.invalidateCachedViewModel) {
            window.EveFolderViewV2.invalidateCachedViewModel(sourceWs, sourceCat);
            window.EveFolderViewV2.invalidateCachedViewModel(targetWs, targetCat);
        }

        if (typeof saveConfig === 'function') {
            saveConfig({
                source: options.source || 'category-card-move',
                meta: {
                    workspaceId: sourceWs,
                    categoryName: sourceCat,
                    targetWorkspaceId: targetWs,
                    targetCategoryName: targetCat
                }
            });
        }
        if (typeof saveData === 'function') {
            saveData({
                forceRender: true,
                source: options.source || 'category-card-move',
                meta: {
                    workspaceId: sourceWs,
                    categoryName: sourceCat,
                    targetWorkspaceId: targetWs,
                    targetCategoryName: targetCat,
                    linkIds: movedIds,
                    mergedLinkIds: mergedIds,
                    removedLinkIds: removedIds,
                    dataDelta: moveMutationMeta.dataDelta
                }
            });
        } else if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
        return true;
    }

    if (options.requireConfirm !== false) {
        var confirmation = requestCategoryCardMoveConfirm(sourceCat, targetName, targetWs, targetExists);
        if (confirmation && typeof confirmation.then === 'function') {
            return confirmation.then(function (confirmed) {
                return confirmed ? applyCardMove() : false;
            });
        }
        if (!confirmation) return false;
    }

    return applyCardMove();
}

window.moveCategoryCardToWorkspace = moveCategoryCardToWorkspace;

function moveCategory(cat, direction, workspaceId) {
    workspaceId = String(workspaceId || config.activeWorkspace || 'main').trim() || 'main';
    if (window.EveCategoryOrder?.moveCategory) {
        if (window.EveCategoryOrder.moveCategory(workspaceId, cat, direction)) {
            saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
        return;
    }
    const visibleLinks = getCategoryLiveLinks().filter(l => l.workspace === workspaceId);
    const summary = getCategoryStructureSummary();
    let categories = summary?.cards
        ? Object.keys(summary.cards)
            .filter(key => String(key || '').indexOf(workspaceId + '::') === 0)
            .map(key => String(key).slice((workspaceId + '::').length).trim() || 'Unsorted')
        : [];
    if (!categories.length) {
        categories = [...new Set(visibleLinks.map(l => l.category || "Unsorted"))];
    }
    if (!config.categoryOrder || config.categoryOrder.length === 0) config.categoryOrder = categories.sort();
    categories.forEach(c => { if (!config.categoryOrder.includes(c)) config.categoryOrder.push(c); });
    const idx = config.categoryOrder.indexOf(cat);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < config.categoryOrder.length) {
        const temp = config.categoryOrder[newIdx];
        config.categoryOrder[newIdx] = config.categoryOrder[idx];
        config.categoryOrder[idx] = temp;
        saveConfig();
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

async function promptMoveCategory(cat, currentIndex, workspaceId, anchorEl) {
    workspaceId = String(workspaceId || config.activeWorkspace || 'main').trim() || 'main';
    var order = window.EveCategoryOrder && window.EveCategoryOrder.getOrder
        ? window.EveCategoryOrder.getOrder(workspaceId)
        : [];
    var totalCards = Array.isArray(order) ? order.length : 0;
    if (totalCards === 0) return;

    var resolvedIndex = Array.isArray(order) ? order.indexOf(String(cat || '').trim()) : -1;
    var fallbackIndex = parseInt(currentIndex, 10);
    var currentPosition = resolvedIndex >= 0
        ? (resolvedIndex + 1)
        : (!isNaN(fallbackIndex) && fallbackIndex >= 0 ? (fallbackIndex + 1) : 1);

    var promptLabel = "Move card to position (1 to " + totalCards + "):";
    var rawValue = null;
    if (window.EveInlinePrompt && typeof window.EveInlinePrompt.show === 'function') {
        rawValue = await window.EveInlinePrompt.show({
            label: promptLabel,
            value: String(currentPosition),
            type: 'number',
            min: 1,
            max: totalCards,
            step: 1,
            inputMode: 'numeric',
            anchor: anchorEl || null
        });
    } else if (typeof window.showPrompt === 'function') {
        rawValue = await window.showPrompt(promptLabel, String(currentPosition));
    } else {
        rawValue = prompt(promptLabel, String(currentPosition));
    }

    if (rawValue === null || rawValue === undefined) return;
    var nextValue = String(rawValue).trim();
    if (!nextValue) return;

    var parsed = parseInt(nextValue, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > totalCards) {
        if (typeof window.showToast === 'function') {
            window.showToast("Enter a card position between 1 and " + totalCards + ".", 'warning');
        }
        return;
    }

    if (window.EveCategoryOrder && window.EveCategoryOrder.moveCategoryToPosition) {
        if (window.EveCategoryOrder.moveCategoryToPosition(workspaceId, cat, parsed)) {
            saveConfig();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
    }
}

function toggleCollapse(cat, workspaceId) {
    if (!config.collapsed) config.collapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${cat}`;
    var wasCollapsed = config.collapsed.includes(key) || config.collapsed.includes(cat);
    if (wasCollapsed) {
        config.collapsed = config.collapsed.filter(c => c !== key && c !== cat);
    } else {
        config.collapsed.push(key);
    }
    saveConfig();

    // Direct DOM toggle — avoid full re-render for a CSS-only change
    var card = document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"][data-card-workspace="' + CSS.escape(wsId) + '"]') 
            || document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"]');
    if (card) {
        card.classList.toggle('collapsed', !wasCollapsed);
        // If expanding a deferred card, trigger its full build
        if (wasCollapsed && card.getAttribute('data-card-deferred') === '1') {
            if (typeof renderDashboard === 'function') renderDashboard();
        }
    } else {
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

function toggleFolderCollapse(cat, workspaceId) {
    if (!config.foldersCollapsed) config.foldersCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${cat}`;
    const wasCollapsed = config.foldersCollapsed.includes(key) || config.foldersCollapsed.includes(cat);
    if (wasCollapsed) {
        config.foldersCollapsed = config.foldersCollapsed.filter(c => c !== key && c !== cat);
    } else {
        config.foldersCollapsed.push(key);
    }
    saveConfig();

    // Direct DOM toggle — avoid full re-render for a CSS-only change
    var card = document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"][data-card-workspace="' + CSS.escape(wsId) + '"]')
            || document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"]');
    if (card) {
        card.classList.toggle('folders-collapsed', !wasCollapsed);
    } else {
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

function toggleLinksCollapse(cat, workspaceId) {
    if (!config.linksCollapsed) config.linksCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${cat}`;
    const wasCollapsed = config.linksCollapsed.includes(key) || config.linksCollapsed.includes(cat);
    if (wasCollapsed) {
        config.linksCollapsed = config.linksCollapsed.filter(c => c !== key && c !== cat);
    } else {
        config.linksCollapsed.push(key);
    }
    saveConfig();

    // Direct DOM toggle — avoid full re-render for a CSS-only change
    var card = document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"][data-card-workspace="' + CSS.escape(wsId) + '"]')
            || document.querySelector('.category-card[data-card-category="' + CSS.escape(cat) + '"]');
    if (card) {
        card.classList.toggle('links-collapsed', !wasCollapsed);
    } else {
        if (typeof renderDashboard === 'function') renderDashboard();
    }
}

function toggleSubfoldersCollapse(folderId, workspaceId) {
    if (!config.subfoldersCollapsed) config.subfoldersCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${folderId}`;
    const wasCollapsed = config.subfoldersCollapsed.includes(key) || config.subfoldersCollapsed.includes(folderId);
    if (wasCollapsed) {
        config.subfoldersCollapsed = config.subfoldersCollapsed.filter(id => id !== key && id !== folderId);
    } else {
        config.subfoldersCollapsed.push(key);
    }
    saveConfig();

    // Perf mode: patch DOM directly, skip full re-render
    if (window._evePerfMode) {
        document.querySelectorAll('.bookmark-folder-group, .bookmark-folder-root-group, .manhwa-frame').forEach(function (el) {
            if (!wasCollapsed) el.classList.add('subfolders-collapsed');
            // Check if this element is relevant by seeing if folderId matches
        });
        // Re-enter current folder for folder-view cards
        const activeFolder = window.EveFolderViewV2?._activeFolderStates;
        if (activeFolder) {
            for (const [key, state] of Object.entries(activeFolder)) {
                if (state?.folderId === folderId || state?.folderId) {
                    const [ws, cat] = key.split('::');
                    if (ws && cat) window.EveFolderViewV2.enterFolder(null, cat, state.folderId, ws);
                }
            }
        }
        return;
    }
    if (typeof renderDashboard === 'function') renderDashboard();
}

function toggleSublinksCollapse(folderId, workspaceId) {
    if (!config.sublinksCollapsed) config.sublinksCollapsed = [];
    const wsId = String(workspaceId || config.activeWorkspace || 'main').trim();
    const key = `${wsId}::${folderId}`;
    const wasCollapsed = config.sublinksCollapsed.includes(key) || config.sublinksCollapsed.includes(folderId);
    if (wasCollapsed) {
        config.sublinksCollapsed = config.sublinksCollapsed.filter(id => id !== key && id !== folderId);
    } else {
        config.sublinksCollapsed.push(key);
    }
    saveConfig();

    // Perf mode: re-enter current folder to re-render with collapse state
    if (window._evePerfMode) {
        const activeFolder = window.EveFolderViewV2?._activeFolderStates;
        if (activeFolder) {
            for (const [key, state] of Object.entries(activeFolder)) {
                if (state?.folderId === folderId || state?.folderId) {
                    const [ws, cat] = key.split('::');
                    if (ws && cat) window.EveFolderViewV2.enterFolder(null, cat, state.folderId, ws);
                }
            }
        }
        return;
    }
    if (typeof renderDashboard === 'function') renderDashboard();
}

function setFocus(cat) {
    focusCategory = cat;
    if (typeof renderDashboard === 'function') renderDashboard();
}

function clearFocus() {
    focusCategory = null;
    if (typeof renderDashboard === 'function') renderDashboard();
}

async function launchCategory(catName) {
    const seen = new Set();
    const urls = getCategoryLiveLinks()
        .filter(l => l.category === catName && !l.done && l.workspace === config.activeWorkspace)
        .map(l => normalizeUrl(String(l.url || '').trim()))
        .filter(function (url) {
            if (!url) return false;
            var key = url.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    if (urls.length === 0) return;

    // Safety check for many tabs
    if (urls.length > 5) {
        if (!(await showConfirm(`Open ${urls.length} tabs?`))) return;
    }

    let launched = 0;
    urls.forEach(function (url, index) {
        try {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            launched++;
        } catch (error) {
            const opened = window.open(url, '_blank_' + Date.now() + '_' + index, 'noopener,noreferrer');
            if (opened) launched++;
        }
    });
    if (launched < urls.length && typeof showToast === 'function') {
        showToast('Some tabs may have been blocked. Allow popups for EveOS to launch full cards.', 'warning');
    }
}
