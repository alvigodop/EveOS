window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    const h = searchNs._NebulaJsonPatchShared || {};
    const parts = searchNs._NebulaJsonPatchParts = searchNs._NebulaJsonPatchParts || {};
    const {
        text,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeIdentifierList,
        getConfig,
        getLiveLinks,
        setLiveLinks,
        getFolderStores,
        getLinkedLibraryForBookmark,
        normalizeLibraryPatchFields,
        getScopedKey,
        findWorkspaceById,
        getCategoryNamesForWorkspace
    } = h;
    const validatePatch = (...args) => parts.validatePatch(...args);
    const previewPatch = (...args) => parts.previewPatch(...args);

    function renameFolderScopeFallback(workspaceId, oldCategoryName, nextCategoryName) {
        const oldKey = getScopedKey(workspaceId, oldCategoryName);
        const nextKey = getScopedKey(workspaceId, nextCategoryName);
        let changed = false;
        getFolderStores().forEach(function (store) {
            if (!Object.prototype.hasOwnProperty.call(store, oldKey)) return;
            if (!Object.prototype.hasOwnProperty.call(store, nextKey)) {
                store[nextKey] = store[oldKey];
            }
            delete store[oldKey];
            changed = true;
        });
        return changed;
    }

    function applyRenameCard(validation) {
        const parsed = validation.resolution.parsed;
        const oldCategoryName = normalizeCategoryName(parsed.categoryName);
        const nextCategoryName = normalizeCategoryName(validation.patch.changes.name || validation.patch.changes.categoryName);
        const workspaceId = normalizeWorkspaceId(parsed.workspaceId);
        const liveLinks = getLiveLinks();
        let changedLinks = 0;

        liveLinks.forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) !== workspaceId) return;
            if (normalizeCategoryName(link?.category) !== oldCategoryName) return;
            link.category = nextCategoryName;
            window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
            changedLinks += 1;
        });
        setLiveLinks(liveLinks);

        window.EveBookmarkFolders?.renameCategoryScope?.(workspaceId, oldCategoryName, nextCategoryName);
        renameFolderScopeFallback(workspaceId, oldCategoryName, nextCategoryName);
        window.EveCategoryOrder?.renameCategory?.(workspaceId, oldCategoryName, nextCategoryName);
        window.EveBookmarkFolders?.renameCardTaskScope?.(workspaceId, oldCategoryName, nextCategoryName);

        const cfg = getConfig();
        if (cfg.cardDescriptions && typeof cfg.cardDescriptions === 'object') {
            const oldKey = getScopedKey(workspaceId, oldCategoryName);
            const nextKey = getScopedKey(workspaceId, nextCategoryName);
            if (Object.prototype.hasOwnProperty.call(cfg.cardDescriptions, oldKey)) {
                if (!Object.prototype.hasOwnProperty.call(cfg.cardDescriptions, nextKey)) {
                    cfg.cardDescriptions[nextKey] = cfg.cardDescriptions[oldKey];
                }
                delete cfg.cardDescriptions[oldKey];
            }
        }

        return { dataChanged: changedLinks > 0, configChanged: true, changed: changedLinks };
    }

    function applySetCardDescription(validation) {
        const parsed = validation.resolution.parsed;
        const cfg = getConfig();
        if (!cfg.cardDescriptions || typeof cfg.cardDescriptions !== 'object' || Array.isArray(cfg.cardDescriptions)) {
            cfg.cardDescriptions = {};
        }
        const key = getScopedKey(parsed.workspaceId, parsed.categoryName);
        cfg.cardDescriptions[key] = String(validation.patch.changes.description == null ? '' : validation.patch.changes.description);
        return { dataChanged: false, configChanged: true, changed: 1 };
    }

    function applyReorderCard(validation) {
        const parsed = validation.resolution.parsed;
        const workspaceId = normalizeWorkspaceId(parsed.workspaceId);
        const categoryName = normalizeCategoryName(parsed.categoryName);
        const cfg = getConfig();
        const order = Math.max(1, Number(validation.patch.changes.order || validation.patch.changes.position || 1));
        if (!cfg.categoryOrderByWorkspace || typeof cfg.categoryOrderByWorkspace !== 'object') {
            cfg.categoryOrderByWorkspace = {};
        }
        const existing = window.EveCategoryOrder?.getOrder
            ? window.EveCategoryOrder.getOrder(workspaceId, { persist: true })
            : (Array.isArray(cfg.categoryOrderByWorkspace[workspaceId]) ? cfg.categoryOrderByWorkspace[workspaceId].slice() : []);
        const categoryNames = getCategoryNamesForWorkspace(workspaceId);
        const base = existing.length ? existing.slice() : categoryNames.slice();
        if (!base.includes(categoryName)) base.push(categoryName);
        const without = base.filter(function (name) {
            return normalizeCategoryName(name) !== categoryName;
        });
        const insertIndex = Math.max(0, Math.min(without.length, order - 1));
        without.splice(insertIndex, 0, categoryName);
        const changed = without.join('\n') !== base.join('\n');
        cfg.categoryOrderByWorkspace[workspaceId] = without;
        return { dataChanged: false, configChanged: changed, changed: changed ? 1 : 0 };
    }

    function applyRenameWorkspace(validation) {
        const parsed = validation.resolution.parsed;
        const cfg = getConfig();
        const workspace = findWorkspaceById(cfg.workspaces || [], parsed.workspaceId);
        if (!workspace) return { dataChanged: false, configChanged: false, changed: 0 };
        workspace.name = text(validation.patch.changes.name, workspace.name || parsed.workspaceId);
        if (Object.prototype.hasOwnProperty.call(validation.patch.changes, 'icon')) {
            workspace.icon = text(validation.patch.changes.icon, workspace.icon || 'folder');
        }
        return { dataChanged: false, configChanged: true, changed: 1 };
    }

    function applyRenameFolder(validation) {
        const parsed = validation.resolution.parsed;
        const nextName = text(validation.patch.changes.name, '');
        let changed = 0;
        getFolderStores().forEach(function (store) {
            const tree = store[getScopedKey(parsed.workspaceId, parsed.categoryName)];
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            nodes.forEach(function (folder) {
                if (String(folder?.id || '') !== String(parsed.folderId || '')) return;
                folder.name = nextName;
                folder.updatedAt = folder.updatedAt || new Date().toISOString();
                changed += 1;
            });
        });
        return { dataChanged: changed > 0, configChanged: false, changed };
    }

    function applyRenameBookmark(validation) {
        const parsed = validation.resolution.parsed;
        const link = getLiveLinks().find(function (candidate) {
            return String(candidate?.id || '') === String(parsed.bookmarkId || '');
        });
        if (!link) return { dataChanged: false, configChanged: false, changed: 0 };
        link.title = text(validation.patch.changes.title, link.title || 'Untitled');
        window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
        return { dataChanged: true, configChanged: false, changed: 1 };
    }

    function applySetBookmarkUrl(validation) {
        const parsed = validation.resolution.parsed;
        const link = getLiveLinks().find(function (candidate) {
            return String(candidate?.id || '') === String(parsed.bookmarkId || '');
        });
        if (!link) return { dataChanged: false, configChanged: false, changed: 0 };
        const nextUrl = text(validation.patch.changes.url, '');
        if (String(link.url || '') === nextUrl) return { dataChanged: false, configChanged: false, changed: 0 };
        link.url = nextUrl;
        window.EveLibrary?.ConnectionsAPI?.syncFromLink?.(link.id);
        return { dataChanged: true, configChanged: false, changed: 1 };
    }

    function applySetBookmarkNotes(validation) {
        const parsed = validation.resolution.parsed;
        const link = getLiveLinks().find(function (candidate) {
            return String(candidate?.id || '') === String(parsed.bookmarkId || '');
        });
        if (!link) return { dataChanged: false, configChanged: false, changed: 0 };
        const nextNotes = String(validation.patch.changes.notes == null ? '' : validation.patch.changes.notes);
        if (String(link.notes || '') === nextNotes) return { dataChanged: false, configChanged: false, changed: 0 };
        link.notes = nextNotes;
        return { dataChanged: true, configChanged: false, changed: 1 };
    }

    function applySetBookmarkFolder(validation) {
        const parsed = validation.resolution.parsed;
        const link = getLiveLinks().find(function (candidate) {
            return String(candidate?.id || '') === String(parsed.bookmarkId || '');
        });
        if (!link) return { dataChanged: false, configChanged: false, changed: 0 };
        const nextFolderId = normalizeFolderId(validation.patch.changes.folderId);
        const currentFolderId = normalizeFolderId(link.folderId);
        if (currentFolderId === nextFolderId) return { dataChanged: false, configChanged: false, changed: 0 };
        if (nextFolderId) link.folderId = nextFolderId;
        else delete link.folderId;
        return { dataChanged: true, configChanged: false, changed: 1 };
    }

    function applySetBookmarkIdentifiers(validation) {
        const parsed = validation.resolution.parsed;
        const link = getLiveLinks().find(function (candidate) {
            return String(candidate?.id || '') === String(parsed.bookmarkId || '');
        });
        if (!link) return { dataChanged: false, configChanged: false, changed: 0 };
        const nextIdentifiers = normalizeIdentifierList(validation.patch.changes.identifiers);
        const currentIdentifiers = normalizeIdentifierList(link.identifiers);
        if (currentIdentifiers.join('\n') === nextIdentifiers.join('\n')) {
            return { dataChanged: false, configChanged: false, changed: 0 };
        }
        link.identifiers = nextIdentifiers;
        return { dataChanged: true, configChanged: false, changed: 1 };
    }

    function applySetLinkedLibraryFields(validation) {
        const parsed = validation.resolution.parsed;
        const linked = getLinkedLibraryForBookmark(parsed.bookmarkId);
        if (!linked?.entry) return { dataChanged: false, configChanged: false, libraryChanged: false, changed: 0 };
        const entry = linked.entry;
        const next = normalizeLibraryPatchFields(validation.patch.changes);
        let changed = 0;
        Object.keys(next).forEach(function (field) {
            const value = next[field];
            const current = Array.isArray(entry[field]) ? entry[field].join('\n') : String(entry[field] == null ? '' : entry[field]);
            const incoming = Array.isArray(value) ? value.join('\n') : String(value == null ? '' : value);
            if (current === incoming) return;
            entry[field] = Array.isArray(value) ? value.slice() : value;
            changed += 1;
        });
        if (!changed) return { dataChanged: false, configChanged: false, libraryChanged: false, changed: 0 };
        entry.lastEdited = new Date().toISOString();
        window.EveLibrary?.Ratings?.applyDerivedRatings?.(entry);
        window.EveLibrary?.ConnectionsAPI?.syncFromLibraryEntry?.(linked.categoryName, entry, linked.workspaceId || linked.connection?.workspace);
        return { dataChanged: false, configChanged: false, libraryChanged: true, changed };
    }

    function persistAndRender(result, options) {
        if (options?.persist === false) return;
        if (result.libraryChanged && window.EveLibrary?.Storage?.saveLibrary) {
            window.EveLibrary.Storage.saveLibrary();
        }
        if (result.configChanged && typeof saveConfig === 'function') {
            saveConfig({
                immediate: true,
                source: 'nebula-json-patch-config',
                meta: { op: result.op, changed: result.changed }
            });
        }
        if (result.dataChanged && typeof saveData === 'function') {
            saveData({
                immediate: true,
                forceRender: !!options?.forceRender,
                skipRender: !!options?.skipRender,
                source: 'nebula-json-patch-data',
                meta: { op: result.op, changed: result.changed }
            });
        }
        if (!options?.skipRender) {
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof renderDashboard === 'function') renderDashboard();
        }
    }

    function applyPatch(patch, options) {
        const validation = validatePatch(patch);
        if (!validation.ok) {
            return {
                ok: false,
                applied: false,
                validation,
                errors: validation.errors,
                warnings: validation.warnings
            };
        }

        const preview = previewPatch(patch);
        let mutation = { dataChanged: false, configChanged: false, changed: 0 };
        if (validation.op === 'rename-workspace') mutation = applyRenameWorkspace(validation);
        if (validation.op === 'reorder-card') mutation = applyReorderCard(validation);
        if (validation.op === 'rename-card') mutation = applyRenameCard(validation);
        if (validation.op === 'set-card-description') mutation = applySetCardDescription(validation);
        if (validation.op === 'rename-folder') mutation = applyRenameFolder(validation);
        if (validation.op === 'rename-bookmark') mutation = applyRenameBookmark(validation);
        if (validation.op === 'set-bookmark-url') mutation = applySetBookmarkUrl(validation);
        if (validation.op === 'set-bookmark-notes') mutation = applySetBookmarkNotes(validation);
        if (validation.op === 'set-bookmark-folder') mutation = applySetBookmarkFolder(validation);
        if (validation.op === 'set-bookmark-identifiers') mutation = applySetBookmarkIdentifiers(validation);
        if (validation.op === 'set-linked-library-fields') mutation = applySetLinkedLibraryFields(validation);

        const result = {
            ok: true,
            applied: mutation.changed > 0 || mutation.configChanged || mutation.dataChanged || mutation.libraryChanged,
            op: validation.op,
            changed: mutation.changed,
            dataChanged: mutation.dataChanged,
            configChanged: mutation.configChanged,
            libraryChanged: mutation.libraryChanged,
            validation,
            preview,
            errors: [],
            warnings: validation.warnings
        };
        persistAndRender(result, options || {});
        return result;
    }

    Object.assign(parts, {
        persistAndRender,
        applyPatch
    });
})();
