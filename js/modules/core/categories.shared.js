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

function findCategoryCard(workspaceId, categoryName) {
    if (!categoryName) return null;
    var wsLower = normalizeCategoryWorkspaceId(workspaceId).toLowerCase();
    var catLower = normalizeCategoryNameValue(categoryName).toLowerCase();
    var cards = document.querySelectorAll('.category-card');
    
    // First, try exact case-insensitive match for both workspace and category
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var cWs = (card.getAttribute('data-card-workspace') || '').trim().toLowerCase();
        var cCat = (card.getAttribute('data-card-category') || '').trim().toLowerCase();
        if ((cWs === wsLower || (!cWs && wsLower === 'main')) && cCat === catLower) {
            return card;
        }
    }
    
    // Second, try fallback: match category only (case-insensitively)
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var cCat = (card.getAttribute('data-card-category') || '').trim().toLowerCase();
        if (cCat === catLower) {
            return card;
        }
    }
    
    return null;
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
        return normalizeCategoryWorkspaceId(link?.workspace).toLowerCase() === wsId.toLowerCase()
            && normalizeCategoryNameValue(link?.category).toLowerCase() === catName.toLowerCase();
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
    return false;
}

