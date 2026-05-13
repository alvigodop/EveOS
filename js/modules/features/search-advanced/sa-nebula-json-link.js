window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const root = window.EveOS;
    const searchNs = root.SearchAdvanced;
    if (root.NebulaJsonLink && searchNs.NebulaJsonLink) return;

    const SCHEME = 'eve://';
    const ENTITY_TYPES = new Set(['workspace', 'card', 'folder', 'bookmark']);

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

    function normalizeId(value) {
        return text(value, '');
    }

    function encodeSegment(value) {
        return encodeURIComponent(text(value, ''));
    }

    function decodeSegment(value) {
        try {
            return decodeURIComponent(String(value || ''));
        } catch (error) {
            return String(value || '');
        }
    }

    function getConfig() {
        return window.eveState?.config
            || window.config
            || (typeof config !== 'undefined' ? config : {})
            || {};
    }

    function getLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function getFolderStore() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {
            return window.eveState.bookmarkFolders;
        }
        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') return window.bookmarkFolders;
        if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') {
            return bookmarkFolders;
        }
        return {};
    }

    function getWorkspaces() {
        const cfg = getConfig();
        return Array.isArray(cfg.workspaces) ? cfg.workspaces : [];
    }

    function getWorkspaceHelpers() {
        return window.EveWorkspaceHelpers || null;
    }

    function getWorkspaceById(workspaceId) {
        const helpers = getWorkspaceHelpers();
        const targetId = normalizeWorkspaceId(workspaceId);
        if (helpers && typeof helpers.findById === 'function') {
            return helpers.findById(getWorkspaces(), targetId) || null;
        }
        return getWorkspaces().find(function (workspace) {
            return String(workspace?.id || '') === targetId;
        }) || null;
    }

    function getWorkspacePath(workspaceId) {
        const helpers = getWorkspaceHelpers();
        const targetId = normalizeWorkspaceId(workspaceId);
        if (helpers && typeof helpers.getPath === 'function') {
            const path = helpers.getPath(getWorkspaces(), targetId);
            if (Array.isArray(path) && path.length) return path.filter(Boolean);
        }
        const workspace = getWorkspaceById(targetId);
        return workspace ? [workspace] : [];
    }

    function getScopedKey(workspaceId, categoryName) {
        return normalizeWorkspaceId(workspaceId) + '::' + normalizeCategoryName(categoryName);
    }

    function getFolderNodes(workspaceId, categoryName) {
        const folderApi = window.EveBookmarkFolders || null;
        if (folderApi && typeof folderApi.getScopedNodes === 'function') {
            const nodes = folderApi.getScopedNodes(workspaceId, categoryName);
            if (Array.isArray(nodes)) return nodes;
        }
        const tree = getFolderStore()[getScopedKey(workspaceId, categoryName)];
        if (Array.isArray(tree?.nodes)) return tree.nodes;
        if (Array.isArray(tree)) return tree;
        return [];
    }

    function getFolderById(workspaceId, categoryName, folderId) {
        const targetId = normalizeId(folderId);
        if (!targetId) return null;
        const folderApi = window.EveBookmarkFolders || null;
        if (folderApi && typeof folderApi.getFolderById === 'function') {
            const folder = folderApi.getFolderById(workspaceId, categoryName, targetId);
            if (folder) return folder;
        }
        return getFolderNodes(workspaceId, categoryName).find(function (folder) {
            return String(folder?.id || '') === targetId;
        }) || null;
    }

    function getFolderPathLabel(workspaceId, categoryName, folderId) {
        const targetId = normalizeId(folderId);
        if (!targetId) return 'Root';
        const folderApi = window.EveBookmarkFolders || null;
        if (folderApi && typeof folderApi.buildFolderPathLabel === 'function') {
            const label = text(folderApi.buildFolderPathLabel(workspaceId, categoryName, targetId), '');
            if (label) return label;
        }
        const chain = getFolderChain(workspaceId, categoryName, targetId);
        return chain.nodes.length
            ? chain.nodes.map(function (folder) { return text(folder?.name, folder?.id); }).join(' / ')
            : targetId;
    }

    function getFolderChain(workspaceId, categoryName, folderId) {
        const targetId = normalizeId(folderId);
        const byId = new Map(getFolderNodes(workspaceId, categoryName).map(function (folder) {
            return [String(folder?.id || ''), folder];
        }).filter(function (entry) { return !!entry[0]; }));
        const nodes = [];
        const issues = [];
        const seen = new Set();
        let cursorId = targetId;
        while (cursorId) {
            if (seen.has(cursorId)) {
                issues.push('folder_parent_cycle');
                break;
            }
            seen.add(cursorId);
            const folder = byId.get(cursorId);
            if (!folder) {
                issues.push(nodes.length ? 'folder_parent_missing' : 'folder_missing');
                break;
            }
            nodes.unshift(folder);
            cursorId = normalizeId(folder.parentId);
        }
        return { nodes, issues };
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const ws = normalizeWorkspaceId(workspaceId);
        const names = new Set();
        if (window.EveCategoryOrder && typeof window.EveCategoryOrder.getOrder === 'function') {
            window.EveCategoryOrder.getOrder(ws).forEach(function (categoryName) {
                names.add(normalizeCategoryName(categoryName));
            });
        }
        getLinks().forEach(function (link) {
            if (normalizeWorkspaceId(link?.workspace) === ws) {
                names.add(normalizeCategoryName(link?.category));
            }
        });
        const prefix = ws + '::';
        Object.keys(getFolderStore()).forEach(function (key) {
            if (String(key).startsWith(prefix)) {
                names.add(normalizeCategoryName(String(key).slice(prefix.length)));
            }
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

    function getCardDescription(workspaceId, categoryName) {
        const descriptions = getConfig().cardDescriptions;
        if (!descriptions || typeof descriptions !== 'object' || Array.isArray(descriptions)) return '';
        return text(descriptions[getScopedKey(workspaceId, categoryName)], '');
    }

    function findBookmarkById(bookmarkId) {
        const targetId = normalizeId(bookmarkId);
        if (!targetId) return null;
        return getLinks().find(function (link) {
            return String(link?.id || '') === targetId;
        }) || null;
    }

    function getGroupVisibility(workspaceId) {
        const groups = window.EveSidebarGroupsRuntime || window.EveSidebarGroups || null;
        if (!groups) return { groupId: '', groupName: '', hidden: false };
        const cfg = getConfig();
        const rootWorkspace = typeof groups.getWorkspaceRoot === 'function'
            ? groups.getWorkspaceRoot(workspaceId, cfg)
            : getWorkspacePath(workspaceId)[0];
        const groupId = typeof groups.getWorkspaceGroupId === 'function'
            ? text(groups.getWorkspaceGroupId(rootWorkspace || workspaceId, cfg), '')
            : '';
        const group = groupId && typeof groups.findGroupById === 'function'
            ? groups.findGroupById(groupId, cfg)
            : null;
        return {
            groupId,
            groupName: text(group?.name, ''),
            hidden: !!group?.hidden
        };
    }

    function inferEntityType(source) {
        const explicit = text(source?.type || source?.entityType, '').toLowerCase();
        if (ENTITY_TYPES.has(explicit)) return explicit;
        if (source?.bookmarkId || source?.linkId || source?.url) return 'bookmark';
        if (source?.folderId) return 'folder';
        if (source?.categoryName || source?.category || source?.cardId) return 'card';
        return 'workspace';
    }

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

    const api = {
        scheme: SCHEME,
        createLink,
        parseLink,
        resolveLink,
        validateLink,
        normalizeWorkspaceId,
        normalizeCategoryName
    };

    root.NebulaJsonLink = api;
    searchNs.NebulaJsonLink = api;
    window.NebulaJsonLink = api;
})();
