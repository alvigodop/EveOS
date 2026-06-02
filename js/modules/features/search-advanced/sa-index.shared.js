window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.IndexShared) return;

    const INDEX_VERSION = 2;
    const STORAGE_KEY = 'eve.nexusIndex.v2';
    const STORAGE_MANAGER_KEY = 'nexusIndexV2';
    const SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;
    const LOCAL_TYPES = new Set(['bookmark', 'card', 'folder', 'smartView', 'library', 'knowledge', 'cached']);
    const INCREMENTAL_LOCAL_RECORD_TYPES = new Set(['bookmark', 'card', 'folder', 'smartView', 'library']);
    const SEARCH_STORAGE_KEYS = new Set(['wikiEntries', 'fandomDomains', 'wikiCacheStore', 'wikiDataStore', 'fandomCacheIndex', 'wikiCategories']);

    const state = {
        snapshot: null,
        buildPromise: null,
        dirty: true,
        loaded: false,
        lastReason: 'startup',
        lastMutationMeta: null,
        lastInvalidationPlan: null,
        revision: 0,
        datapackFingerprint: ''
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
        if (typeof window.getLiveLinks === 'function') {
            return window.getLiveLinks();
        }
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
            .concat(toArray(entry?.altTitles))
            .concat(toArray(entry?.titleAltNames))
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
        if (record?.provenance?.missingFolder) {
            stateLabel = 'broken';
            reasons.push('Folder parent no longer exists.');
        }
        if (record?.provenance?.folderUnreachable) {
            stateLabel = 'broken';
            reasons.push('Folder branch is unreachable from the card root.');
        }
        if (record?.provenance?.folderParentBroken) {
            stateLabel = 'broken';
            reasons.push('Folder parent chain is broken.');
        }
        toArray(record?.provenance?.folderIssueReasons).forEach(function (reason) {
            const normalizedReason = text(reason, '');
            if (normalizedReason) reasons.push(normalizedReason);
        });
        if (record?.provenance?.missingParent) {
            stateLabel = 'broken';
            reasons.push('Parent path is missing.');
        }
        if (record?.provenance?.sourceOnly) {
            if (stateLabel !== 'broken') stateLabel = 'warning';
            reasons.push('Result exists only in saved source/cache data.');
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

    function mixHash(hash, value) {
        const input = String(value == null ? '' : value);
        let nextHash = hash >>> 0;
        for (let index = 0; index < input.length; index += 1) {
            nextHash ^= input.charCodeAt(index);
            nextHash = Math.imul(nextHash, 16777619);
        }
        nextHash ^= 31;
        return Math.imul(nextHash, 16777619) >>> 0;
    }

    function hashStableValue(hash, value, seen) {
        if (value == null) return mixHash(hash, 'null');
        const type = typeof value;
        if (type === 'string' || type === 'number' || type === 'boolean') {
            return mixHash(mixHash(hash, type), value);
        }
        if (type === 'undefined' || type === 'function' || type === 'symbol') return mixHash(hash, 'null');

        const activeSeen = seen || new Set();
        if (activeSeen.has(value)) return mixHash(hash, '[Circular]');
        activeSeen.add(value);

        let outputHash = hash >>> 0;
        if (Array.isArray(value)) {
            outputHash = mixHash(mixHash(outputHash, 'array'), value.length);
            for (let index = 0; index < value.length; index += 1) {
                outputHash = hashStableValue(outputHash, value[index], activeSeen);
            }
            activeSeen.delete(value);
            return outputHash >>> 0;
        }

        outputHash = mixHash(outputHash, 'object');
        const keys = Object.keys(value).sort();
        outputHash = mixHash(outputHash, keys.length);
        keys.forEach(function (key) {
            const entryValue = value[key];
            if (typeof entryValue === 'undefined' || typeof entryValue === 'function' || typeof entryValue === 'symbol') return;
            outputHash = mixHash(outputHash, key);
            outputHash = hashStableValue(outputHash, entryValue, activeSeen);
        });
        activeSeen.delete(value);
        return outputHash >>> 0;
    }

    function buildStreamingFingerprint(value) {
        return (hashStableValue(2166136261, value) >>> 0).toString(36);
    }

    function pickConfigFingerprintSource(configRef) {
        const cfg = configRef && typeof configRef === 'object' ? configRef : {};
        return {
            activeWorkspace: text(cfg.activeWorkspace, 'main'),
            workspaces: cfg.workspaces || [],
            sidebarGroups: cfg.sidebarGroups || [],
            sidebarOrderMode: text(cfg.sidebarOrderMode, ''),
            sidebarManualOrder: cfg.sidebarManualOrder || {},
            categoryOrder: cfg.categoryOrder || [],
            categoryOrderByWorkspace: cfg.categoryOrderByWorkspace || {},
            smartViews: cfg.smartViews || {},
            showHiddenSidebarGroups: !!cfg.showHiddenSidebarGroups,
            showInactiveTabs: !!cfg.showInactiveTabs
        };
    }

    function readLibraryFingerprintSource() {
        const stateApi = window.EveLibrary?.State;
        if (!stateApi?.getAllLibraries) return {};
        try {
            return stateApi.getAllLibraries() || {};
        } catch (error) {
            return {};
        }
    }

    function buildDatapackStateFingerprint() {
        const payload = {
            links: readLinks(),
            bookmarkFolders: readBookmarkFolders(),
            config: pickConfigFingerprintSource(readConfig()),
            libraries: readLibraryFingerprintSource()
        };
        return 'dp2:' + buildStreamingFingerprint(payload);
    }

    ns.IndexShared = {
        INDEX_VERSION,
        STORAGE_KEY,
        STORAGE_MANAGER_KEY,
        SNAPSHOT_MAX_AGE_MS,
        LOCAL_TYPES,
        INCREMENTAL_LOCAL_RECORD_TYPES,
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
        buildFolderPathLabel,
        buildDatapackStateFingerprint
    };
})();
