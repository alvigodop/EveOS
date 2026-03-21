window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core = ns._core || {};

const TARGET_TYPES = new Set(['bookmark', 'card', 'folder']);

    const BOOKMARK_SCOPE_TYPES = new Set(['tab', 'card', 'folder']);

    const TARGET_VISIBILITY_SCOPE_TYPES = new Set(['tab', 'card']);

    const BOOKMARK_SCOPE_OPTIONS = [

        { value: 'tab', label: 'Tab' },

        { value: 'card', label: 'Card' },

        { value: 'folder', label: 'Folder' }

    ];

    const TARGET_VISIBILITY_SCOPE_OPTIONS = [

        { value: 'tab', label: 'This Tab' },

        { value: 'card', label: 'Focused Card Only' }

    ];
    const PERSIST_IDLE_TIMEOUT_MS = 1200;
    const PERSIST_FALLBACK_DELAY_MS = 180;
    let persistFlushHandle = null;
    let persistFlushScheduled = false;



    function getLinks() {

        if (window.eveState?.links) return window.eveState.links;

        if (typeof links !== 'undefined' && Array.isArray(links)) return links;

        return [];

    }



    function getConfig() {

        if (window.eveState?.config) return window.eveState.config;

        if (typeof config !== 'undefined') return config;

        return window.config || {};

    }



    function getFolderApi() {

        return window.EveBookmarkFolders || null;

    }



    function getStore() {

        if (window.eveState?.quickPins && Array.isArray(window.eveState.quickPins)) {

            return window.eveState.quickPins;

        }

        if (typeof quickPins !== 'undefined' && Array.isArray(quickPins)) {

            return quickPins;

        }

        if (Array.isArray(window.quickPins)) return window.quickPins;

        return [];

    }



    function setRawStore(nextPins) {

        const sanitized = Array.isArray(nextPins) ? nextPins : [];

        if (window.eveState) window.eveState.quickPins = sanitized;

        if (typeof quickPins !== 'undefined') {

            quickPins = sanitized;

        } else {

            window.quickPins = sanitized;

        }

    }



    function toId(value) {

        return String(value ?? '').trim();

    }



    function normalizeCategoryName(value) {

        return toId(value) || 'Unsorted';

    }



    function normalizeWorkspaceId(value) {

        return toId(value) || 'main';

    }



    function normalizeBookmarkScopeType(value) {

        const normalized = toId(value).toLowerCase();

        return BOOKMARK_SCOPE_TYPES.has(normalized) ? normalized : 'tab';

    }



    function normalizeTargetVisibilityScopeType(value) {

        const normalized = toId(value).toLowerCase();

        return TARGET_VISIBILITY_SCOPE_TYPES.has(normalized) ? normalized : 'tab';

    }



    function buildCardTargetId(workspaceId, categoryName) {

        return `${normalizeWorkspaceId(workspaceId)}::${normalizeCategoryName(categoryName)}`;

    }



    function buildFolderTargetId(workspaceId, categoryName, folderId) {

        const normalizedFolderId = toId(folderId);

        return normalizedFolderId

            ? `${buildCardTargetId(workspaceId, categoryName)}::${normalizedFolderId}`

            : '';

    }



    function parseCardTargetId(value) {

        const raw = toId(value);

        if (!raw.includes('::')) {

            return {

                workspaceId: 'main',

                categoryName: normalizeCategoryName(raw)

            };

        }

        const [workspaceId, categoryName] = raw.split('::', 2);

        return {

            workspaceId: normalizeWorkspaceId(workspaceId),

            categoryName: normalizeCategoryName(categoryName)

        };

    }



    function parseFolderTargetId(value) {

        const raw = toId(value);

        const parts = raw.split('::');

        if (parts.length < 3) {

            return {

                workspaceId: 'main',

                categoryName: 'Unsorted',

                folderId: ''

            };

        }

        return {

            workspaceId: normalizeWorkspaceId(parts[0]),

            categoryName: normalizeCategoryName(parts[1]),

            folderId: toId(parts.slice(2).join('::'))

        };

    }



    function getLinkById(linkId) {

        const targetId = toId(linkId);

        return getLinks().find((link) => toId(link?.id) === targetId) || null;

    }



    

    Object.assign(core, {
        TARGET_TYPES,
        BOOKMARK_SCOPE_TYPES,
        TARGET_VISIBILITY_SCOPE_TYPES,
        BOOKMARK_SCOPE_OPTIONS,
        TARGET_VISIBILITY_SCOPE_OPTIONS,
        getLinks,
        getConfig,
        getFolderApi,
        getStore,
        setRawStore,
        toId,
        normalizeCategoryName,
        normalizeWorkspaceId,
        normalizeBookmarkScopeType,
        normalizeTargetVisibilityScopeType,
        buildCardTargetId,
        buildFolderTargetId,
        parseCardTargetId,
        parseFolderTargetId,
        getLinkById
    });
})();
