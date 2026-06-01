window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    if (root.NebulaJsonLink && searchNs.NebulaJsonLink) return;
    const h = searchNs._NebulaJsonLinkShared || {};
    const {
        SCHEME,
        text,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeId,
        encodeSegment,
        decodeSegment,
        getLinks,
        getWorkspaceById,
        getWorkspacePath,
        getScopedKey,
        getFolderById,
        getFolderPathLabel,
        getFolderChain,
        getCategoryNamesForWorkspace,
        getCardDescription,
        findBookmarkById,
        getGroupVisibility,
        inferEntityType
    } = h;

    function createLink(source) {
        const entity = source && typeof source === 'object' ? source : { workspaceId: source };
        const type = inferEntityType(entity);
        const workspaceId = normalizeWorkspaceId(entity.workspaceId || entity.workspace || entity.path?.workspaceId);
        const categoryName = normalizeCategoryName(entity.categoryName || entity.category || entity.cardId || entity.path?.categoryName);
        const folderId = normalizeId(entity.folderId || entity.path?.folderId);
        const bookmarkId = normalizeId(entity.bookmarkId || entity.linkId || (type === 'bookmark' ? entity.id : '') || entity.path?.bookmarkId);

        if (type === 'workspace') {
            return SCHEME + 'workspace/' + encodeSegment(workspaceId);
        }
        if (type === 'card') {
            if (!categoryName) return '';
            return SCHEME + 'workspace/' + encodeSegment(workspaceId)
                + '/card/' + encodeSegment(categoryName);
        }
        if (type === 'folder') {
            if (!categoryName || !folderId) return '';
            return SCHEME + 'workspace/' + encodeSegment(workspaceId)
                + '/card/' + encodeSegment(categoryName)
                + '/folder/' + encodeSegment(folderId);
        }
        if (type === 'bookmark') {
            if (!categoryName || !bookmarkId) return '';
            return SCHEME + 'workspace/' + encodeSegment(workspaceId)
                + '/card/' + encodeSegment(categoryName)
                + (folderId ? '/folder/' + encodeSegment(folderId) : '')
                + '/bookmark/' + encodeSegment(bookmarkId);
        }
        return '';
    }

    function parseLink(value) {
        const raw = text(value, '');
        const errors = [];
        if (!raw) {
            return { ok: false, errors: ['empty_link'], raw: '' };
        }
        if (!raw.toLowerCase().startsWith(SCHEME)) {
            return { ok: false, errors: ['invalid_scheme'], raw };
        }

        const body = raw.slice(SCHEME.length).split(/[?#]/, 1)[0];
        const segments = body.split('/').filter(Boolean).map(decodeSegment);
        const parsed = {
            ok: true,
            raw,
            scheme: 'eve',
            type: '',
            workspaceId: '',
            categoryName: '',
            folderId: '',
            bookmarkId: '',
            segments,
            errors
        };

        if (segments[0] !== 'workspace') errors.push('missing_workspace_segment');
        parsed.workspaceId = normalizeWorkspaceId(segments[1]);
        let index = 2;
        parsed.type = 'workspace';

        if (segments[index] === 'card') {
            parsed.type = 'card';
            parsed.categoryName = normalizeCategoryName(segments[index + 1]);
            if (!segments[index + 1]) errors.push('missing_card_segment');
            index += 2;
        }

        if (segments[index] === 'folder') {
            parsed.type = 'folder';
            parsed.folderId = normalizeId(segments[index + 1]);
            if (!parsed.categoryName) errors.push('folder_without_card');
            if (!segments[index + 1]) errors.push('missing_folder_segment');
            index += 2;
        }

        if (segments[index] === 'bookmark') {
            parsed.type = 'bookmark';
            parsed.bookmarkId = normalizeId(segments[index + 1]);
            if (!parsed.categoryName) errors.push('bookmark_without_card');
            if (!segments[index + 1]) errors.push('missing_bookmark_segment');
            index += 2;
        }

        if (index < segments.length) errors.push('unexpected_segments');
        parsed.ok = errors.length === 0;
        parsed.canonical = parsed.ok ? createLink(parsed) : '';
        return parsed;
    }

    function buildBreadcrumb(parsed, entity) {
        const workspaceNodes = getWorkspacePath(parsed.workspaceId);
        const breadcrumb = workspaceNodes.map(function (workspace) {
            return {
                type: 'workspace',
                id: text(workspace?.id, ''),
                label: text(workspace?.name, workspace?.id)
            };
        });
        if (parsed.categoryName) {
            breadcrumb.push({
                type: 'card',
                id: parsed.categoryName,
                label: parsed.categoryName
            });
        }
        if (parsed.folderId) {
            getFolderChain(parsed.workspaceId, parsed.categoryName, parsed.folderId).nodes.forEach(function (folder) {
                breadcrumb.push({
                    type: 'folder',
                    id: text(folder?.id, ''),
                    label: text(folder?.name, folder?.id)
                });
            });
        }
        if (parsed.bookmarkId) {
            breadcrumb.push({
                type: 'bookmark',
                id: parsed.bookmarkId,
                label: text(entity?.title, parsed.bookmarkId)
            });
        }
        return breadcrumb;
    }

    function buildVisibility(parsed) {
        const workspacePath = getWorkspacePath(parsed.workspaceId);
        const group = getGroupVisibility(parsed.workspaceId);
        const hiddenInParent = workspacePath.filter(function (workspace) { return !!workspace?.hiddenInParent; });
        const inactive = workspacePath.filter(function (workspace) { return !!workspace?.inactive; });
        return {
            visible: hiddenInParent.length === 0 && inactive.length === 0 && !group.hidden,
            hiddenInParent: hiddenInParent.length > 0,
            hiddenParentChain: hiddenInParent.map(function (workspace) { return text(workspace?.id, ''); }).filter(Boolean),
            inactive: inactive.length > 0,
            inactiveChain: inactive.map(function (workspace) { return text(workspace?.id, ''); }).filter(Boolean),
            groupId: group.groupId,
            groupName: group.groupName,
            groupHidden: group.hidden
        };
    }

    function buildActions(parsed, exists) {
        const base = [
            { id: 'go-to-path', label: 'Go to Path', available: !!exists },
            { id: 'open-json-state', label: 'Open JSON State', available: !!exists },
            { id: 'inspect-provenance', label: 'Inspect Provenance', available: true },
            { id: 'validate', label: 'Validate', available: true },
            { id: 'apply-patch', label: 'Apply Patch', available: !!exists && !!(root.NebulaJsonPatch || searchNs.NebulaJsonPatch || window.NebulaJsonPatch) }
        ];
        if (parsed.type !== 'workspace') {
            base.splice(2, 0, { id: 'reveal-in-unidex', label: 'Reveal in Unidex', available: !!exists });
        }
        if (parsed.type === 'bookmark') {
            base.splice(2, 0, { id: 'open-card', label: 'Open Card', available: !!exists });
        }
        return base;
    }

    function resolveLink(value) {
        const parsed = typeof value === 'string' ? parseLink(value) : value;
        if (!parsed || !parsed.ok) {
            return {
                ok: false,
                exists: false,
                parsed,
                entity: null,
                health: { state: 'broken', reasons: ['Link could not be parsed.'].concat(parsed?.errors || []) },
                errors: parsed?.errors || ['invalid_link']
            };
        }

        const reasons = [];
        const warnings = [];
        let entity = null;
        let exists = false;
        const workspace = getWorkspaceById(parsed.workspaceId);
        if (!workspace) reasons.push('workspace_missing');

        if (parsed.type === 'workspace') {
            entity = workspace;
            exists = !!workspace;
        } else if (workspace) {
            const categoryNames = getCategoryNamesForWorkspace(parsed.workspaceId);
            const categoryExists = categoryNames.includes(parsed.categoryName);
            if (!categoryExists) reasons.push('card_missing');

            if (parsed.type === 'card') {
                entity = categoryExists ? {
                    workspaceId: parsed.workspaceId,
                    categoryName: parsed.categoryName,
                    description: getCardDescription(parsed.workspaceId, parsed.categoryName)
                } : null;
                exists = !!entity;
            } else if (categoryExists && parsed.type === 'folder') {
                const folder = getFolderById(parsed.workspaceId, parsed.categoryName, parsed.folderId);
                entity = folder;
                exists = !!folder;
                const chain = getFolderChain(parsed.workspaceId, parsed.categoryName, parsed.folderId);
                chain.issues.forEach(function (issue) { reasons.push(issue); });
            } else if (categoryExists && parsed.type === 'bookmark') {
                const bookmark = findBookmarkById(parsed.bookmarkId);
                entity = bookmark;
                exists = !!bookmark;
                if (!bookmark) {
                    reasons.push('bookmark_missing');
                } else {
                    if (normalizeWorkspaceId(bookmark.workspace) !== parsed.workspaceId) warnings.push('bookmark_workspace_mismatch');
                    if (normalizeCategoryName(bookmark.category) !== parsed.categoryName) warnings.push('bookmark_card_mismatch');
                    const bookmarkFolderId = normalizeId(bookmark.folderId);
                    if (parsed.folderId && bookmarkFolderId !== parsed.folderId) warnings.push('bookmark_folder_mismatch');
                    if (bookmarkFolderId && !getFolderById(bookmark.workspace, bookmark.category, bookmarkFolderId)) {
                        reasons.push('bookmark_folder_missing');
                    }
                }
                if (parsed.folderId) {
                    const chain = getFolderChain(parsed.workspaceId, parsed.categoryName, parsed.folderId);
                    chain.issues.forEach(function (issue) { reasons.push(issue); });
                }
            }
        }

        const visibility = buildVisibility(parsed);
        const healthReasons = reasons.concat(warnings);
        const healthState = reasons.length ? 'broken' : (warnings.length || !visibility.visible ? 'warning' : 'healthy');
        const breadcrumb = buildBreadcrumb(parsed, entity);
        return {
            ok: reasons.length === 0,
            exists,
            type: parsed.type,
            link: parsed.canonical,
            parsed,
            entity,
            path: {
                workspaceId: parsed.workspaceId,
                workspaceName: text(workspace?.name, parsed.workspaceId),
                categoryName: parsed.categoryName,
                folderId: parsed.folderId,
                folderPath: parsed.folderId ? getFolderPathLabel(parsed.workspaceId, parsed.categoryName, parsed.folderId) : '',
                bookmarkId: parsed.bookmarkId,
                breadcrumb,
                breadcrumbLabel: breadcrumb.map(function (entry) { return entry.label; }).filter(Boolean).join(' > ')
            },
            visibility,
            health: {
                state: healthState,
                reasons: healthReasons
            },
            provenance: {
                source: 'live-state',
                scopedKey: parsed.categoryName ? getScopedKey(parsed.workspaceId, parsed.categoryName) : '',
                cardIdentityMode: 'categoryName'
            },
            actions: buildActions(parsed, exists),
            errors: reasons,
            warnings
        };
    }

    function validateLink(value) {
        const parsed = typeof value === 'string' ? parseLink(value) : value;
        const resolution = parsed?.ok ? resolveLink(parsed) : null;
        const errors = []
            .concat(parsed?.errors || [])
            .concat(resolution?.errors || []);
        const warnings = [].concat(resolution?.warnings || []);
        return {
            ok: errors.length === 0,
            valid: errors.length === 0,
            parsed,
            resolution,
            errors,
            warnings
        };
    }

    function toNavigationResult(resolution) {
        const path = resolution?.path || {};
        const parsed = resolution?.parsed || {};
        return {
            type: resolution?.type || parsed.type || '',
            title: text(resolution?.entity?.title || resolution?.entity?.name || path.categoryName || path.workspaceName, 'Entity'),
            path: {
                workspaceId: path.workspaceId || parsed.workspaceId || '',
                workspaceLabel: path.workspaceName || '',
                categoryName: path.categoryName || parsed.categoryName || '',
                folderId: path.folderId || parsed.folderId || '',
                folderLabel: path.folderPath || '',
                pathLabel: path.breadcrumbLabel || '',
                linkId: path.bookmarkId || parsed.bookmarkId || ''
            },
            provenance: {
                kind: resolution?.type || parsed.type || '',
                linkId: path.bookmarkId || parsed.bookmarkId || '',
                folderId: path.folderId || parsed.folderId || '',
                source: resolution?.provenance?.source || 'nebula-json-link',
                entityLink: resolution?.link || parsed.canonical || ''
            },
            visibility: resolution?.visibility,
            health: resolution?.health
        };
    }

    function executeAction(actionId, value, options) {
        const id = text(actionId, '');
        const validation = validateLink(value);
        const resolution = validation.resolution;
        if (id === 'validate') return validation;
        if (!resolution?.exists && id !== 'inspect-provenance') {
            return { ok: false, action: id, errors: validation.errors.concat(['target_missing']), validation };
        }

        const navigation = root.SearchAdvanced?.Navigation || window.EveOS?.SearchAdvanced?.Navigation || null;
        const navResult = toNavigationResult(resolution);
        if (id === 'go-to-path') {
            return { ok: !!navigation?.goToPath?.(navResult, options || {}), action: id, resolution };
        }
        if (id === 'open-card') {
            return { ok: !!navigation?.openCard?.(navResult), action: id, resolution };
        }
        if (id === 'reveal-in-unidex') {
            return { ok: !!navigation?.openInUnidex?.(navResult), action: id, resolution };
        }
        if (id === 'inspect-provenance') {
            return { ok: true, action: id, resolution, provenance: resolution?.provenance || null };
        }
        if (id === 'open-json-state') {
            const view = root.SearchAdvanced?.DatapackView || window.EveOS?.SearchAdvanced?.DatapackView || null;
            if (!view) return { ok: false, action: id, errors: ['datapack_view_unavailable'], resolution };
            const parsed = resolution.parsed || {};
            if (parsed.type === 'workspace') {
                view.openGateway?.({ scope: { workspaceId: parsed.workspaceId } });
            } else if (parsed.type === 'card' || parsed.type === 'folder' || parsed.type === 'bookmark') {
                view.openCardInternals?.(parsed.workspaceId, parsed.categoryName);
            }
            return { ok: true, action: id, resolution };
        }
        if (id === 'apply-patch') {
            const patchApi = root.NebulaJsonPatch || searchNs.NebulaJsonPatch || window.NebulaJsonPatch || null;
            const patch = options?.patch || null;
            if (!patchApi?.applyPatch || !patch) {
                return { ok: false, action: id, errors: ['missing_patch_or_patch_api'], resolution };
            }
            return patchApi.applyPatch(patch, options || {});
        }
        return { ok: false, action: id, errors: ['unsupported_action'], resolution };
    }


    const api = {
        scheme: SCHEME,
        createLink,
        parseLink,
        resolveLink,
        validateLink,
        executeAction,
        normalizeWorkspaceId,
        normalizeCategoryName
    };
    root.NebulaJsonLink = api;
    searchNs.NebulaJsonLink = api;
    window.NebulaJsonLink = api;
})();
