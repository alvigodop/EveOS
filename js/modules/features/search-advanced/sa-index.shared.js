window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexShared) return;

    const INDEX_VERSION = 2;
    const STORAGE_KEY = 'eve.nexusIndex.v2';
    const STORAGE_MANAGER_KEY = 'nexusIndexV2';
    const SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
    const LOCAL_TYPES = new Set(['bookmark', 'card', 'folder', 'library', 'knowledge', 'cached']);
    const SEARCH_STORAGE_KEYS = new Set(['wikiEntries', 'fandomDomains', 'wikiCacheStore', 'wikiDataStore', 'fandomCacheIndex', 'wikiCategories']);

    const state = {
        snapshot: null,
        buildPromise: null,
        dirty: true,
        loaded: false,
        lastReason: 'startup',
        revision: 0
    };

    function now() {
        return Date.now();
    }

    function text(value, fallback) {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function normalizeText(value) {
        return text(value, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function toArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function readConfig() {
        return window.eveState?.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function readLinks() {
        return Array.isArray(window.eveState?.links)
            ? window.eveState.links
            : (typeof window.links !== 'undefined' ? window.links : []);
    }

    function readBookmarkFolders() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {
            return window.eveState.bookmarkFolders;
        }
        if (typeof window.bookmarkFolders !== 'undefined' && window.bookmarkFolders && typeof window.bookmarkFolders === 'object') {
            return window.bookmarkFolders;
        }
        return {};
    }

    function getScopedKey(workspaceId, categoryName) {
        return text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
    }

    function getWorkspaceIdsInScope(scope) {
        const explicitWorkspaceIds = toArray(scope?.workspaceIds)
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);
        if (explicitWorkspaceIds.length) {
            return new Set(explicitWorkspaceIds);
        }
        if (!scope?.workspaceId) return null;
        const wsId = text(scope.workspaceId, 'main');
        const ids = new Set([wsId]);
        const helpers = window.EveWorkspaceHelpers;
        const workspaces = readConfig().workspaces || [];
        if (helpers?.findById && helpers?.getDescendantIds) {
            const workspace = helpers.findById(workspaces, wsId);
            if (workspace) {
                helpers.getDescendantIds(workspace).forEach(function (id) {
                    ids.add(text(id, ''));
                });
            }
        }
        return ids;
    }

    function getCurrentFocusCategory() {
        try {
            return typeof focusCategory !== 'undefined' ? text(focusCategory, '') : '';
        } catch (error) {
            return '';
        }
    }

    function getWorkspaceGroupMeta(workspaceId) {
        const groups = window.EveSidebarGroupsRuntime;
        if (!groups?.getWorkspaceRoot || !groups?.getWorkspaceGroupId || !groups?.findGroupById) {
            return { groupId: '', groupName: '', hidden: false };
        }

        const rootWorkspace = groups.getWorkspaceRoot(workspaceId, readConfig());
        const groupId = text(groups.getWorkspaceGroupId(rootWorkspace || workspaceId, readConfig()), '');
        const group = groupId ? groups.findGroupById(groupId, readConfig()) : null;
        return {
            groupId: groupId,
            groupName: text(group?.name, ''),
            hidden: !!group?.hidden
        };
    }

    function getLinkedLibraryMeta(linkId) {
        const linked = window.EveLibrary?.ConnectionsAPI?.getLinkedEntry?.(text(linkId, '')) || null;
        const entry = linked?.entry || null;
        if (!entry) {
            return {
                linked: false,
                entryId: '',
                categoryName: '',
                workspaceId: '',
                title: '',
                summary: '',
                status: '',
                mediaType: '',
                author: '',
                genre: '',
                aliases: []
            };
        }

        const aliases = []
            .concat(toArray(entry?.aliases))
            .concat(toArray(entry?.alternativeTitles))
            .map(function (value) { return text(value, ''); })
            .filter(Boolean);

        return {
            linked: true,
            entryId: text(entry?.id, ''),
            categoryName: text(linked?.categoryName, ''),
            workspaceId: text(linked?.workspaceId, ''),
            title: text(entry?.title, ''),
            summary: text(entry?.summary, ''),
            status: text(entry?.status, ''),
            mediaType: text(entry?.mediaType || entry?.type, ''),
            author: text(entry?.author, ''),
            genre: text(entry?.genre, ''),
            aliases: aliases
        };
    }

    function computeFreshness(updatedAt) {
        const stamp = Number(updatedAt || 0);
        if (!stamp) {
            return { state: 'unknown', label: 'Unknown', ageMs: 0 };
        }

        const ageMs = Math.max(0, now() - stamp);
        if (ageMs < 7 * 24 * 60 * 60 * 1000) {
            return { state: 'fresh', label: 'Fresh', ageMs: ageMs };
        }
        if (ageMs < 30 * 24 * 60 * 60 * 1000) {
            return { state: 'aging', label: 'Aging', ageMs: ageMs };
        }
        return { state: 'stale', label: 'Stale', ageMs: ageMs };
    }

    function deriveBaseHealth(record) {
        const reasons = [];
        let stateLabel = 'healthy';

        if (record?.provenance?.orphaned) {
            stateLabel = 'broken';
            reasons.push('Workspace reference no longer exists.');
        }
        if (record?.path?.ambiguousWorkspace) {
            if (stateLabel !== 'broken') stateLabel = 'warning';
            reasons.push('Card exists in multiple tabs; path uses the preferred match.');
        }
        if (record?.type === 'cached' && !record?.url) {
            if (stateLabel !== 'broken') stateLabel = 'warning';
            reasons.push('Cached result is missing a launch URL.');
        }
        if (record?.type === 'bookmark' && !record?.url) {
            if (stateLabel !== 'broken') stateLabel = 'warning';
            reasons.push('Bookmark is missing a URL.');
        }
        if (!record?.path?.workspaceId || !record?.path?.categoryName) {
            stateLabel = 'broken';
            reasons.push('Path metadata is incomplete.');
        }

        return {
            state: stateLabel,
            reasons: reasons
        };
    }

    function buildFolderPathLabel(workspaceId, categoryName, folderId) {
        if (!folderId || typeof window.EveBookmarkFolders?.buildFolderPathLabel !== 'function') return '';
        return text(window.EveBookmarkFolders.buildFolderPathLabel(workspaceId, categoryName, folderId), '');
    }

    ns.IndexShared = {
        INDEX_VERSION,
        STORAGE_KEY,
        STORAGE_MANAGER_KEY,
        SNAPSHOT_MAX_AGE_MS,
        LOCAL_TYPES,
        SEARCH_STORAGE_KEYS,
        state,
        now,
        text,
        normalizeText,
        toArray,
        readConfig,
        readLinks,
        readBookmarkFolders,
        getScopedKey,
        getWorkspaceIdsInScope,
        getCurrentFocusCategory,
        getWorkspaceGroupMeta,
        getLinkedLibraryMeta,
        computeFreshness,
        deriveBaseHealth,
        buildFolderPathLabel
    };
})();
