window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    if (root.NebulaJsonPatch && searchNs.NebulaJsonPatch) return;

    const SUPPORTED_OPS = new Set([
        'rename-workspace',
        'rename-card',
        'reorder-card',
        'set-card-description',
        'rename-folder',
        'rename-bookmark',
        'set-bookmark-url',
        'set-bookmark-notes',
        'set-bookmark-folder',
        'set-bookmark-identifiers'
    ]);

    function text(value, fallback) {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function normalizeWorkspaceId(value) {
        return text(value, 'main');
    }

    function normalizeCategoryName(value) {
        return text(value, 'Unsorted');
    }

    function normalizeFolderId(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeIdentifierList(value) {
        const source = Array.isArray(value)
            ? value
            : String(value == null ? '' : value).split(',');
        const seen = new Set();
        return source.map(function (entry) {
            return String(entry == null ? '' : entry).trim();
        }).filter(function (entry) {
            if (!entry || seen.has(entry)) return false;
            seen.add(entry);
            return true;
        });
    }

    function cloneData(value) {
        if (value == null) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            if (Array.isArray(value)) return value.map(function (item) { return cloneData(item); });
            if (typeof value === 'object') return { ...value };
            return value;
        }
    }

    function getLinkApi() {
        return root.NebulaJsonLink || searchNs.NebulaJsonLink || window.NebulaJsonLink || null;
    }

    function getConfig() {
        return window.eveState?.config
            || window.config
            || (typeof config !== 'undefined' ? config : {})
            || {};
    }

    function getLiveLinks() {
        const live = typeof window.getLiveLinks === 'function' ? window.getLiveLinks() : null;
        const candidates = [
            Array.isArray(window.links) ? window.links : null,
            typeof links !== 'undefined' && Array.isArray(links) ? links : null,
            Array.isArray(window.eveState?.links) ? window.eveState.links : null,
            Array.isArray(live) ? live : null
        ].filter(Array.isArray);
        if (!candidates.length) return [];
        return candidates.sort(function (left, right) {
            return right.length - left.length;
        })[0];
    }

    function setLiveLinks(nextLinks) {
        let storedLinks = nextLinks;
        if (typeof window.setLiveLinks === 'function') {
            const result = window.setLiveLinks(nextLinks);
            if (Array.isArray(result)) storedLinks = result;
        }
        if (window.eveState) window.eveState.links = storedLinks;
        window.links = storedLinks;
        if (typeof links !== 'undefined') links = storedLinks;
        return storedLinks;
    }

    function getFolderStores() {
        const stores = [];
        function add(store) {
            if (!store || typeof store !== 'object' || stores.includes(store)) return;
            stores.push(store);
        }
        add(window.eveState?.bookmarkFolders);
        add(window.bookmarkFolders);
        if (typeof bookmarkFolders !== 'undefined') add(bookmarkFolders);
        return stores;
    }

    function getScopedKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
    }

    function getFolderById(workspaceId, categoryName, folderId) {
        const id = normalizeFolderId(folderId);
        if (!id) return null;
        if (typeof window.EveBookmarkFolders?.getFolderById === 'function') {
            const folder = window.EveBookmarkFolders.getFolderById(workspaceId, categoryName, id);
            if (folder) return folder;
        }
        for (const store of getFolderStores()) {
            const tree = store[getScopedKey(workspaceId, categoryName)];
            const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
            const found = nodes.find(function (node) {
                return String(node?.id || '') === id;
            });
            if (found) return found;
        }
        return null;
    }

    function findWorkspaceById(workspaces, workspaceId) {
        const targetId = normalizeWorkspaceId(workspaceId);
        for (const workspace of Array.isArray(workspaces) ? workspaces : []) {
            if (String(workspace?.id || '') === targetId) return workspace;
            const found = findWorkspaceById(workspace?.subTabs || [], targetId);
            if (found) return found;
        }
        return null;
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const names = new Set();
        if (window.EveCategoryOrder && typeof window.EveCategoryOrder.getOrder === 'function') {
            window.EveCategoryOrder.getOrder(ws).forEach(function (categoryName) {
                names.add(normalizeCategoryName(categoryName));
            });
        }
        getLiveLinks().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) === ws) {
                names.add(normalizeCategoryName(link?.category));
            }
        });
        const prefix = ws + '::';
        getFolderStores().forEach(function (store) {
            Object.keys(store || {}).forEach(function (key) {
                if (String(key).startsWith(prefix)) {
                    const tree = store[key];
                    const nodes = Array.isArray(tree?.nodes) ? tree.nodes : (Array.isArray(tree) ? tree : []);
                    if (nodes.length) names.add(normalizeCategoryName(String(key).slice(prefix.length)));
                }
            });
        });
        return Array.from(names);
    }

    function buildPatch(op, target, changes, options) {
        const patch = {
            schema: 'eveos.nebula-json-patch.v1',
            id: 'njp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
            op: text(op, ''),
            target: typeof target === 'string' ? target : '',
            changes: changes && typeof changes === 'object' ? { ...changes } : {},
            source: text(options?.source, 'nebula-json-link'),
            createdAt: new Date().toISOString()
        };
        if (!patch.target && target && typeof target === 'object') {
            const linkApi = getLinkApi();
            patch.target = linkApi?.createLink ? linkApi.createLink(target) : '';
        }
        if (options?.reason) patch.reason = text(options.reason, '');
        return patch;
    }

    function buildTransaction(patches, options) {
        const list = Array.isArray(patches) ? patches.filter(Boolean) : [];
        return {
            schema: 'eveos.nebula-json-transaction.v1',
            id: 'njt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
            source: text(options?.source, 'nebula-json-link'),
            reason: text(options?.reason, ''),
            createdAt: new Date().toISOString(),
            patches: list
        };
    }

    function resolvePatchTarget(patch) {
        const linkApi = getLinkApi();
        if (!linkApi || typeof linkApi.resolveLink !== 'function') {
            return {
                ok: false,
                resolution: null,
                errors: ['nebula_json_link_unavailable'],
                warnings: []
            };
        }
        const validation = linkApi.validateLink(patch?.target || '');
        return {
            ok: !!validation.valid,
            resolution: validation.resolution || null,
            errors: validation.errors || [],
            warnings: validation.warnings || []
        };
    }

    function validatePatch(patch) {
        const source = patch && typeof patch === 'object' ? patch : {};
        const errors = [];
        const warnings = [];
        const op = text(source.op, '');
        if (!SUPPORTED_OPS.has(op)) errors.push('unsupported_patch_op');
        if (!source.target) errors.push('missing_patch_target');
        if (!source.changes || typeof source.changes !== 'object') errors.push('missing_patch_changes');

        const target = errors.includes('missing_patch_target') ? null : resolvePatchTarget(source);
        if (target) {
            errors.push(...target.errors);
            warnings.push(...target.warnings);
        }
        const resolution = target?.resolution || null;
        const parsed = resolution?.parsed || null;
        const changes = source.changes || {};

        if (op === 'rename-workspace') {
            if (parsed?.type !== 'workspace') errors.push('target_type_mismatch');
            if (!text(changes.name, '')) errors.push('missing_workspace_name');
        } else if (op === 'rename-card') {
            if (parsed?.type !== 'card') errors.push('target_type_mismatch');
            const nextName = normalizeCategoryName(changes.name || changes.categoryName);
            if (!nextName) errors.push('missing_card_name');
            if (resolution?.exists && nextName.toLowerCase() !== normalizeCategoryName(parsed.categoryName).toLowerCase()) {
                const duplicate = getCategoryNamesForWorkspace(parsed.workspaceId).some(function (categoryName) {
                    return normalizeCategoryName(categoryName).toLowerCase() === nextName.toLowerCase()
                        && normalizeCategoryName(categoryName).toLowerCase() !== normalizeCategoryName(parsed.categoryName).toLowerCase();
                });
                if (duplicate) errors.push('duplicate_card_name');
            }
        } else if (op === 'reorder-card') {
            if (parsed?.type !== 'card') errors.push('target_type_mismatch');
            const order = Number(changes.order || changes.position || 0);
            if (!Number.isFinite(order) || order < 1) errors.push('invalid_card_order');
        } else if (op === 'set-card-description') {
            if (parsed?.type !== 'card') errors.push('target_type_mismatch');
            if (!Object.prototype.hasOwnProperty.call(changes, 'description')) errors.push('missing_card_description');
        } else if (op === 'rename-folder') {
            if (parsed?.type !== 'folder') errors.push('target_type_mismatch');
            if (!text(changes.name, '')) errors.push('missing_folder_name');
        } else if (op === 'rename-bookmark') {
            if (parsed?.type !== 'bookmark') errors.push('target_type_mismatch');
            if (!text(changes.title, '')) errors.push('missing_bookmark_title');
            ['bookmark_workspace_mismatch', 'bookmark_card_mismatch', 'bookmark_folder_mismatch'].forEach(function (warning) {
                if (warnings.includes(warning)) errors.push(warning);
            });
        } else if (op === 'set-bookmark-url') {
            if (parsed?.type !== 'bookmark') errors.push('target_type_mismatch');
            if (!text(changes.url, '')) errors.push('missing_bookmark_url');
            ['bookmark_workspace_mismatch', 'bookmark_card_mismatch', 'bookmark_folder_mismatch'].forEach(function (warning) {
                if (warnings.includes(warning)) errors.push(warning);
            });
        } else if (op === 'set-bookmark-notes') {
            if (parsed?.type !== 'bookmark') errors.push('target_type_mismatch');
            if (!Object.prototype.hasOwnProperty.call(changes, 'notes')) errors.push('missing_bookmark_notes');
            ['bookmark_workspace_mismatch', 'bookmark_card_mismatch', 'bookmark_folder_mismatch'].forEach(function (warning) {
                if (warnings.includes(warning)) errors.push(warning);
            });
        } else if (op === 'set-bookmark-folder') {
            if (parsed?.type !== 'bookmark') errors.push('target_type_mismatch');
            if (!Object.prototype.hasOwnProperty.call(changes, 'folderId')) errors.push('missing_bookmark_folder');
            ['bookmark_workspace_mismatch', 'bookmark_card_mismatch', 'bookmark_folder_mismatch'].forEach(function (warning) {
                if (warnings.includes(warning)) errors.push(warning);
            });
            const nextFolderId = normalizeFolderId(changes.folderId);
            if (nextFolderId && !getFolderById(parsed?.workspaceId, parsed?.categoryName, nextFolderId)) {
                errors.push('target_folder_missing');
            }
        } else if (op === 'set-bookmark-identifiers') {
            if (parsed?.type !== 'bookmark') errors.push('target_type_mismatch');
            if (!Object.prototype.hasOwnProperty.call(changes, 'identifiers')) errors.push('missing_bookmark_identifiers');
            ['bookmark_workspace_mismatch', 'bookmark_card_mismatch', 'bookmark_folder_mismatch'].forEach(function (warning) {
                if (warnings.includes(warning)) errors.push(warning);
            });
        }

        return {
            ok: errors.length === 0,
            valid: errors.length === 0,
            patch: source,
            op,
            resolution,
            errors,
            warnings
        };
    }

    function previewPatch(patch) {
        const validation = validatePatch(patch);
        const resolution = validation.resolution;
        const parsed = resolution?.parsed || {};
        const changes = patch?.changes || {};
        let before = '';
        let after = '';

        if (validation.op === 'rename-workspace') {
            before = text(resolution?.entity?.name, parsed.workspaceId);
            after = text(changes.name, before);
        } else if (validation.op === 'rename-card') {
            before = text(parsed.categoryName, '');
            after = normalizeCategoryName(changes.name || changes.categoryName);
        } else if (validation.op === 'reorder-card') {
            before = text(parsed.categoryName, '');
            after = 'position ' + Math.max(1, Number(changes.order || changes.position || 1));
        } else if (validation.op === 'set-card-description') {
            before = text(resolution?.entity?.description, '');
            after = String(changes.description == null ? '' : changes.description);
        } else if (validation.op === 'rename-folder') {
            before = text(resolution?.entity?.name, parsed.folderId);
            after = text(changes.name, before);
        } else if (validation.op === 'rename-bookmark') {
            before = text(resolution?.entity?.title, parsed.bookmarkId);
            after = text(changes.title, before);
        } else if (validation.op === 'set-bookmark-url') {
            before = text(resolution?.entity?.url, '');
            after = text(changes.url, before);
        } else if (validation.op === 'set-bookmark-notes') {
            before = String(resolution?.entity?.notes == null ? '' : resolution.entity.notes);
            after = String(changes.notes == null ? '' : changes.notes);
        } else if (validation.op === 'set-bookmark-folder') {
            before = normalizeFolderId(resolution?.entity?.folderId) || 'Root';
            after = normalizeFolderId(changes.folderId) || 'Root';
        } else if (validation.op === 'set-bookmark-identifiers') {
            before = normalizeIdentifierList(resolution?.entity?.identifiers).join(', ');
            after = normalizeIdentifierList(changes.identifiers).join(', ');
        }

        return {
            ok: validation.ok,
            valid: validation.valid,
            op: validation.op,
            target: patch?.target || '',
            before,
            after,
            summary: validation.op + ': ' + before + ' -> ' + after,
            errors: validation.errors,
            warnings: validation.warnings
        };
    }

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

    function persistAndRender(result, options) {
        if (options?.persist === false) return;
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

        const result = {
            ok: true,
            applied: mutation.changed > 0 || mutation.configChanged || mutation.dataChanged,
            op: validation.op,
            changed: mutation.changed,
            dataChanged: mutation.dataChanged,
            configChanged: mutation.configChanged,
            validation,
            preview,
            errors: [],
            warnings: validation.warnings
        };
        persistAndRender(result, options || {});
        return result;
    }

    function snapshotMutableState() {
        const cfg = getConfig();
        return {
            configRef: cfg,
            configSnapshot: cloneData(cfg),
            linksSnapshot: cloneData(getLiveLinks()),
            folderSnapshots: getFolderStores().map(function (store) {
                return { ref: store, snapshot: cloneData(store) };
            })
        };
    }

    function restoreObject(ref, snapshot) {
        if (!ref || typeof ref !== 'object') return;
        Object.keys(ref).forEach(function (key) {
            delete ref[key];
        });
        Object.assign(ref, cloneData(snapshot) || {});
    }

    function restoreMutableState(snapshot) {
        if (!snapshot) return;
        restoreObject(snapshot.configRef, snapshot.configSnapshot);
        setLiveLinks(cloneData(snapshot.linksSnapshot) || []);
        (snapshot.folderSnapshots || []).forEach(function (entry) {
            restoreObject(entry.ref, entry.snapshot);
        });
    }

    function validateTransaction(transaction) {
        const tx = transaction && typeof transaction === 'object'
            ? transaction
            : buildTransaction([], { source: 'invalid-transaction' });
        const patches = Array.isArray(tx.patches) ? tx.patches : [];
        const patchValidations = patches.map(validatePatch);
        const errors = [];
        const warnings = [];
        if (!patches.length) errors.push('empty_transaction');
        patchValidations.forEach(function (validation, index) {
            validation.errors.forEach(function (error) {
                errors.push('patch_' + index + ':' + error);
            });
            validation.warnings.forEach(function (warning) {
                warnings.push('patch_' + index + ':' + warning);
            });
        });
        return {
            ok: errors.length === 0,
            valid: errors.length === 0,
            transaction: tx,
            patches: patchValidations,
            errors,
            warnings
        };
    }

    function previewTransaction(transaction) {
        const tx = transaction && typeof transaction === 'object' ? transaction : buildTransaction([], {});
        const previews = (Array.isArray(tx.patches) ? tx.patches : []).map(previewPatch);
        const errors = [];
        const warnings = [];
        previews.forEach(function (preview, index) {
            (preview.errors || []).forEach(function (error) {
                errors.push('patch_' + index + ':' + error);
            });
            (preview.warnings || []).forEach(function (warning) {
                warnings.push('patch_' + index + ':' + warning);
            });
        });
        return {
            ok: errors.length === 0,
            valid: errors.length === 0,
            transaction: tx,
            previews,
            summary: previews.map(function (preview) { return preview.summary; }).join('\n'),
            errors,
            warnings
        };
    }

    function applyTransaction(transaction, options) {
        const tx = transaction && typeof transaction === 'object' ? transaction : buildTransaction([], {});
        const validation = validateTransaction(tx);
        const preview = previewTransaction(tx);
        if (!validation.ok) {
            return {
                ok: false,
                applied: false,
                transaction: tx,
                validation,
                preview,
                rolledBack: false,
                errors: validation.errors,
                warnings: validation.warnings
            };
        }

        const snapshot = snapshotMutableState();
        const results = [];
        let aggregate = { dataChanged: false, configChanged: false, changed: 0 };
        try {
            tx.patches.forEach(function (patch) {
                const result = applyPatch(patch, { persist: false, skipRender: true });
                results.push(result);
                if (!result.ok) throw new Error((result.errors || ['patch_apply_failed']).join(','));
                aggregate.dataChanged = aggregate.dataChanged || !!result.dataChanged;
                aggregate.configChanged = aggregate.configChanged || !!result.configChanged;
                aggregate.changed += Number(result.changed || 0);
            });
        } catch (error) {
            restoreMutableState(snapshot);
            return {
                ok: false,
                applied: false,
                transaction: tx,
                validation,
                preview,
                results,
                rolledBack: true,
                errors: [String(error?.message || error || 'transaction_failed')],
                warnings: validation.warnings
            };
        }

        const result = {
            ok: true,
            applied: aggregate.changed > 0 || aggregate.dataChanged || aggregate.configChanged,
            transaction: tx,
            validation,
            preview,
            results,
            rolledBack: false,
            changed: aggregate.changed,
            dataChanged: aggregate.dataChanged,
            configChanged: aggregate.configChanged,
            op: 'transaction',
            errors: [],
            warnings: validation.warnings
        };
        persistAndRender(result, options || {});
        return result;
    }

    const api = {
        supportedOps: Array.from(SUPPORTED_OPS),
        buildPatch,
        buildTransaction,
        validatePatch,
        previewPatch,
        applyPatch,
        validateTransaction,
        previewTransaction,
        applyTransaction
    };

    root.NebulaJsonPatch = api;
    searchNs.NebulaJsonPatch = api;
    window.NebulaJsonPatch = api;
})();
