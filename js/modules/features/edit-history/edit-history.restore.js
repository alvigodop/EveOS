// --- EveOS Scoped Edit History Restore ---
window.EveEditHistory = window.EveEditHistory || {};

(function () {
    const ns = window.EveEditHistory;
    if (ns.restoreReady) return;
    if (!ns.coreReady || !ns._helpers) {
        console.warn('[EditHistory] Core helpers missing; restore helpers not initialized.');
        return;
    }

    const { text, clone, scopedKey, splitScopedKey, pinKey } = ns._helpers;

    function getLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function setLinks(nextLinks) {
        const normalized = Array.isArray(nextLinks) ? nextLinks.map(clone) : [];
        if (typeof window.setLiveLinks === 'function') {
            window.setLiveLinks(normalized);
        } else if (typeof links !== 'undefined') {
            links = normalized;
            window.links = normalized;
        } else {
            window.links = normalized;
        }
        if (window.eveState) window.eveState.links = normalized;
    }

    function getFolders() {
        return (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object')
            ? window.eveState.bookmarkFolders
            : (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object' ? bookmarkFolders : {});
    }

    function setFolders(nextFolders) {
        const normalized = nextFolders && typeof nextFolders === 'object' ? clone(nextFolders) : {};
        if (typeof bookmarkFolders !== 'undefined') bookmarkFolders = normalized;
        else window.bookmarkFolders = normalized;
        window.bookmarkFolders = normalized;
        if (window.eveState) window.eveState.bookmarkFolders = normalized;
        window.EveFolderViewV2?.invalidateAllCachedViewModels?.();
    }

    function getPins() {
        if (Array.isArray(window.eveState?.quickPins)) return window.eveState.quickPins;
        if (typeof quickPins !== 'undefined' && Array.isArray(quickPins)) return quickPins;
        if (Array.isArray(window.quickPins)) return window.quickPins;
        return [];
    }

    function setPins(nextPins) {
        const normalized = Array.isArray(nextPins) ? nextPins.map(clone) : [];
        if (window.EveQuickPins?._core?.setRawStore) {
            window.EveQuickPins._core.setRawStore(normalized);
        } else if (typeof quickPins !== 'undefined') {
            quickPins = normalized;
            window.quickPins = normalized;
        } else {
            window.quickPins = normalized;
        }
        if (window.eveState) window.eveState.quickPins = normalized;
    }

    function setConfig(nextConfig) {
        const normalized = nextConfig && typeof nextConfig === 'object' ? clone(nextConfig) : {};
        if (typeof config !== 'undefined') config = normalized;
        window.config = normalized;
        if (window.eveState) window.eveState.config = normalized;
    }

    function mergePins(currentPins, beforePins, afterPins) {
        const affected = new Set([...(beforePins || []), ...(afterPins || [])].map(pinKey).filter(Boolean));
        const kept = (currentPins || []).filter((pin) => !affected.has(pinKey(pin)));
        const seen = new Set(kept.map(pinKey));
        (beforePins || []).forEach((pin) => {
            const key = pinKey(pin);
            if (!key || seen.has(key)) return;
            seen.add(key);
            kept.push(clone(pin));
        });
        return kept;
    }

    function applyDatapackData(snapshot) {
        setLinks(snapshot?.links || []);
        setFolders(snapshot?.bookmarkFolders || {});
        setPins(snapshot?.quickPins || []);
        if (window.constellationDetachedChains !== undefined) {
            window.constellationDetachedChains = clone(snapshot?.constellationDetachedChains || {});
            if (window.eveState) window.eveState.constellationDetachedChains = window.constellationDetachedChains;
        }
    }

    function applyWorkspaceData(before, after) {
        const beforeWs = text(before?.workspaceId, '');
        const afterWs = text(after?.workspaceId, beforeWs);
        const affectedWs = new Set([beforeWs, afterWs].filter(Boolean));
        const nextLinks = getLinks().filter((link) => !affectedWs.has(text(link?.workspace, 'main'))).concat(clone(before?.links || []));
        const nextFolders = clone(getFolders());
        Object.keys(nextFolders).forEach((key) => {
            if (affectedWs.has(splitScopedKey(key).workspaceId)) delete nextFolders[key];
        });
        Object.assign(nextFolders, clone(before?.bookmarkFolders || {}));
        setLinks(nextLinks);
        setFolders(nextFolders);
        setPins(mergePins(getPins(), before?.quickPins || [], after?.quickPins || []));
    }

    function applyCardData(before, after) {
        const beforeKey = text(before?.scopedKey, scopedKey(before?.workspaceId, before?.categoryName));
        const afterKey = text(after?.scopedKey, scopedKey(after?.workspaceId || before?.workspaceId, after?.categoryName || before?.categoryName));
        const affectedKeys = new Set([beforeKey, afterKey].filter(Boolean));
        const affectedIds = new Set([...(before?.links || []), ...(after?.links || [])].map((link) => text(link?.id, '')).filter(Boolean));
        const nextLinks = getLinks().filter((link) => {
            const key = scopedKey(link?.workspace, link?.category);
            return !affectedKeys.has(key) && !affectedIds.has(text(link?.id, ''));
        }).concat(clone(before?.links || []));
        const nextFolders = clone(getFolders());
        affectedKeys.forEach((key) => delete nextFolders[key]);
        if (before?.folderTree) nextFolders[beforeKey] = clone(before.folderTree);
        setLinks(nextLinks);
        setFolders(nextFolders);
        setPins(mergePins(getPins(), before?.quickPins || [], after?.quickPins || []));
    }

    function applyBookmarkData(before, after) {
        const affectedIds = new Set([text(before?.linkId, ''), text(after?.linkId, ''), text(before?.link?.id, ''), text(after?.link?.id, '')].filter(Boolean));
        const nextLinks = getLinks().filter((link) => !affectedIds.has(text(link?.id, '')));
        if (before?.link) nextLinks.push(clone(before.link));
        setLinks(nextLinks);
        setPins(mergePins(getPins(), before?.quickPins || [], after?.quickPins || []));
    }

    function applyFolderData(before, after) {
        const key = text(before?.scopedKey || after?.scopedKey, scopedKey(before?.workspaceId || after?.workspaceId, before?.categoryName || after?.categoryName));
        const affectedFolderIds = new Set([...(before?.folderIds || []), ...(after?.folderIds || [])].map((id) => text(id, '')).filter(Boolean));
        const affectedLinkIds = new Set([...(before?.links || []), ...(after?.links || [])].map((link) => text(link?.id, '')).filter(Boolean));
        const nextLinks = getLinks().filter((link) => !affectedLinkIds.has(text(link?.id, ''))).concat(clone(before?.links || []));
        const nextFolders = clone(getFolders());
        const existingTree = nextFolders[key];
        const existingNodes = Array.isArray(existingTree?.nodes) ? existingTree.nodes : (Array.isArray(existingTree) ? existingTree : []);
        const keptNodes = existingNodes.filter((node) => !affectedFolderIds.has(text(node?.id, '')));
        const restoredNodes = clone(before?.nodes || []);
        nextFolders[key] = Array.isArray(existingTree)
            ? keptNodes.concat(restoredNodes)
            : { ...(existingTree || {}), nodes: keptNodes.concat(restoredNodes) };
        if (!nextFolders[key].nodes?.length && !Array.isArray(nextFolders[key])) delete nextFolders[key];
        setLinks(nextLinks);
        setFolders(nextFolders);
        setPins(mergePins(getPins(), before?.quickPins || [], after?.quickPins || []));
    }

    function replaceWorkspaceNode(workspaces, beforeNode, afterNode, allowAppend = false) {
        const afterId = text(afterNode?.id || beforeNode?.id, '');
        const beforeId = text(beforeNode?.id, afterId);
        const next = [];
        let inserted = false;
        (Array.isArray(workspaces) ? workspaces : []).forEach((workspace) => {
            const id = text(workspace?.id, '');
            if (id === afterId || id === beforeId) {
                if (beforeNode && !inserted) {
                    next.push(clone(beforeNode));
                    inserted = true;
                }
                return;
            }
            next.push({ ...workspace, subTabs: replaceWorkspaceNode(workspace?.subTabs || [], beforeNode, afterNode, false) });
        });
        if (beforeNode && !inserted && allowAppend) next.push(clone(beforeNode));
        return next;
    }

    function applyWorkspaceConfig(before, after) {
        const current = window.eveState?.config || (typeof config !== 'undefined' ? config : window.config || {});
        setConfig({ ...current, workspaces: replaceWorkspaceNode(current?.workspaces || [], before?.node || null, after?.node || null, true) });
    }

    function restoreScopedConfigStores(nextConfig, before, after) {
        const beforeStores = before?.stores || {};
        const afterStores = after?.stores || {};
        const beforeKey = text(before?.scopedKey, '');
        const afterKey = text(after?.scopedKey, beforeKey);
        const storeNames = new Set([...Object.keys(beforeStores), ...Object.keys(afterStores)]);
        storeNames.forEach((storeName) => {
            const store = nextConfig[storeName] && typeof nextConfig[storeName] === 'object' && !Array.isArray(nextConfig[storeName])
                ? { ...nextConfig[storeName] }
                : {};
            if (afterKey) delete store[afterKey];
            if (beforeKey) delete store[beforeKey];
            if (beforeKey && Object.prototype.hasOwnProperty.call(beforeStores, storeName)) {
                store[beforeKey] = clone(beforeStores[storeName]);
            }
            nextConfig[storeName] = store;
        });
    }

    function applyCardConfig(before, after) {
        const current = window.eveState?.config || (typeof config !== 'undefined' ? config : window.config || {});
        const nextConfig = clone(current);
        restoreScopedConfigStores(nextConfig, before, after);
        const workspaceId = text(before?.workspaceId || after?.workspaceId, 'main');
        if (Array.isArray(before?.categoryOrder)) {
            nextConfig.categoryOrderByWorkspace = {
                ...(nextConfig.categoryOrderByWorkspace || {}),
                [workspaceId]: clone(before.categoryOrder)
            };
        } else if (Array.isArray(after?.categoryOrder) && nextConfig.categoryOrderByWorkspace) {
            delete nextConfig.categoryOrderByWorkspace[workspaceId];
        }
        if (Array.isArray(before?.legacyCategoryOrder)) {
            nextConfig.categoryOrder = clone(before.legacyCategoryOrder);
        } else if (Array.isArray(after?.legacyCategoryOrder)) {
            delete nextConfig.categoryOrder;
        }
        setConfig(nextConfig);
    }

    function applyFolderConfig(before, after) {
        const current = window.eveState?.config || (typeof config !== 'undefined' ? config : window.config || {});
        const nextConfig = clone(current);
        restoreScopedConfigStores(nextConfig, before, after);
        setConfig(nextConfig);
    }

    function persistAfterRestore(entry) {
        const meta = { skipEditHistory: true, editHistoryRestore: true, editHistoryEntryId: entry.id };
        if (entry.mutationKind === 'config') {
            return typeof saveConfig === 'function' ? saveConfig({ immediate: true, source: 'edit-history-restore', meta }) : Promise.resolve(true);
        }
        return typeof saveData === 'function'
            ? saveData({ immediate: true, forceRender: true, source: 'edit-history-restore', meta })
            : Promise.resolve(true);
    }

    async function restoreEntry(entryOrId) {
        const entry = typeof entryOrId === 'string' ? ns.findEntry(entryOrId) : entryOrId;
        if (!entry) return { ok: false, error: 'History entry not found.' };
        const layer = text(entry.scope?.layer, 'datapack');
        try {
            if (entry.mutationKind === 'config') {
                if (layer === 'workspace') applyWorkspaceConfig(entry.before, entry.after);
                else if (layer === 'card') applyCardConfig(entry.before, entry.after);
                else if (layer === 'folder') applyFolderConfig(entry.before, entry.after);
                else setConfig(entry.before?.config || {});
            } else if (layer === 'workspace') applyWorkspaceData(entry.before, entry.after);
            else if (layer === 'card') applyCardData(entry.before, entry.after);
            else if (layer === 'bookmark') applyBookmarkData(entry.before, entry.after);
            else if (layer === 'folder') applyFolderData(entry.before, entry.after);
            else applyDatapackData(entry.before);
            await Promise.resolve(persistAfterRestore(entry));
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof showToast === 'function') showToast(`Restored ${entry.scope?.label || layer} from edit history.`, 'success');
            return { ok: true, entry };
        } catch (error) {
            console.error('[EditHistory] Restore failed:', error);
            if (typeof showToast === 'function') showToast(`Edit history restore failed: ${error.message || error}`, 'error');
            return { ok: false, error: error.message || String(error), entry };
        }
    }

    Object.assign(ns, {
        restoreEntry,
        _restoreHelpers: {
            applyDatapackData,
            applyWorkspaceData,
            applyCardData,
            applyBookmarkData,
            applyFolderData
        }
    });

    ns.restoreReady = true;
})();
