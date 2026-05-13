window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    if (root.NebulaJsonPatch && searchNs.NebulaJsonPatch) return;

    const SUPPORTED_OPS = new Set([
        'rename-workspace',
        'rename-card',
        'set-card-description',
        'rename-folder',
        'rename-bookmark'
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
                    names.add(normalizeCategoryName(String(key).slice(prefix.length)));
                }
            });
        });
        const descriptions = getConfig().cardDescriptions;
        if (descriptions && typeof descriptions === 'object' && !Array.isArray(descriptions)) {
            Object.keys(descriptions).forEach(function (key) {
                if (String(key).startsWith(prefix)) {
                    names.add(normalizeCategoryName(String(key).slice(prefix.length)));
                }
            });
        }
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
        } else if (validation.op === 'set-card-description') {
            before = text(resolution?.entity?.description, '');
            after = String(changes.description == null ? '' : changes.description);
        } else if (validation.op === 'rename-folder') {
            before = text(resolution?.entity?.name, parsed.folderId);
            after = text(changes.name, before);
        } else if (validation.op === 'rename-bookmark') {
            before = text(resolution?.entity?.title, parsed.bookmarkId);
            after = text(changes.title, before);
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
        if (validation.op === 'rename-card') mutation = applyRenameCard(validation);
        if (validation.op === 'set-card-description') mutation = applySetCardDescription(validation);
        if (validation.op === 'rename-folder') mutation = applyRenameFolder(validation);
        if (validation.op === 'rename-bookmark') mutation = applyRenameBookmark(validation);

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

    const api = {
        supportedOps: Array.from(SUPPORTED_OPS),
        buildPatch,
        validatePatch,
        previewPatch,
        applyPatch
    };

    root.NebulaJsonPatch = api;
    searchNs.NebulaJsonPatch = api;
    window.NebulaJsonPatch = api;
})();
