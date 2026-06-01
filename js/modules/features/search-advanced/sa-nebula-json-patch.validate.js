window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    const h = searchNs._NebulaJsonPatchShared || {};
    const parts = searchNs._NebulaJsonPatchParts = searchNs._NebulaJsonPatchParts || {};
    const {
        SUPPORTED_OPS,
        text,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeIdentifierList,
        getLinkApi,
        getFolderById,
        getCategoryNamesForWorkspace
    } = h;

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
        } else if (op === 'set-linked-library-fields') {
            if (parsed?.type !== 'bookmark') errors.push('target_type_mismatch');
            ['bookmark_workspace_mismatch', 'bookmark_card_mismatch', 'bookmark_folder_mismatch'].forEach(function (warning) {
                if (warnings.includes(warning)) errors.push(warning);
            });
            if (!getLinkedLibraryForBookmark(parsed?.bookmarkId)) errors.push('linked_library_missing');
            const normalized = normalizeLibraryPatchFields(changes);
            if (!Object.keys(normalized).length) errors.push('missing_library_changes');
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
        } else if (validation.op === 'set-linked-library-fields') {
            const linked = getLinkedLibraryForBookmark(parsed.bookmarkId);
            before = text(linked?.entry?.title, parsed.bookmarkId);
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

    Object.assign(parts, {
        buildPatch,
        buildTransaction,
        resolvePatchTarget,
        validatePatch,
        previewPatch
    });
})();
