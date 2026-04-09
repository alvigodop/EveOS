window.EveBookmarkClickBehavior = window.EveBookmarkClickBehavior || {};

(function (ns) {
    if (ns.ready) return;

    const MODE_OPTIONS = [
        {
            value: 'inherit',
            label: 'Inherit Current Behavior',
            description: 'Use the current result from the global/card/folder chain.'
        },
        {
            value: 'invert',
            label: 'Invert Current Behavior',
            description: 'Flip whether clicking opens the link immediately, while keeping the bookmark popup available.'
        },
        {
            value: 'focus_only',
            label: 'Popup Only',
            description: 'Open only the bookmark popup.'
        },
        {
            value: 'internal_only',
            label: 'Internal View',
            description: 'Open the bookmark inside EveOS using the in-site viewer.'
        },
        {
            value: 'open_and_focus',
            label: 'Open Link + Popup',
            description: 'Open the link in a new tab and also open the bookmark popup.'
        },
        {
            value: 'open_only',
            label: 'Open Link Only',
            description: 'Open the link in a new tab without opening the bookmark popup.'
        }
    ];
    const VALID_MODES = new Set(MODE_OPTIONS.map((option) => option.value));

    function normalizeMode(mode) {
        const normalized = String(mode || '').trim().toLowerCase();
        return VALID_MODES.has(normalized) ? normalized : 'inherit';
    }

    function getModeOptions() {
        return MODE_OPTIONS.map((option) => ({ ...option }));
    }

    function isExplicitDefaultMode(mode) {
        const normalized = normalizeMode(mode);
        return normalized !== 'inherit' && normalized !== 'invert';
    }

    function getRawConfig() {
        return (typeof config !== 'undefined' && config)
            ? config
            : (window.eveState?.config || {});
    }

    function getDefaultMode() {
        const rawConfig = getRawConfig();
        const explicitMode = normalizeMode(rawConfig?.bookmarkClickDefaultMode);
        if (isExplicitDefaultMode(explicitMode)) {
            return explicitMode;
        }

        return !!rawConfig?.bookmarkClickOpensLink ? 'open_and_focus' : 'focus_only';
    }

    function setDefaultMode(mode) {
        const rawConfig = getRawConfig();
        if (!rawConfig || typeof rawConfig !== 'object') return getDefaultMode();

        const normalized = normalizeMode(mode);
        const nextMode = isExplicitDefaultMode(normalized) ? normalized : 'focus_only';
        rawConfig.bookmarkClickDefaultMode = nextMode;
        rawConfig.bookmarkClickOpensLink = nextMode === 'open_and_focus' || nextMode === 'open_only';

        if (typeof saveConfig === 'function') saveConfig();
        return nextMode;
    }

    function getLinks() {
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function findLinkById(linkId) {
        const targetId = String(linkId || '').trim();
        if (!targetId) return null;
        return getLinks().find((entry) => String(entry?.id || '').trim() === targetId) || null;
    }

    function getFolderApi() {
        return window.EveBookmarkFolders || null;
    }

    function getWorkspaceId(link) {
        return String(
            link?.workspace
            || window.eveState?.config?.activeWorkspace
            || (typeof config !== 'undefined' ? config?.activeWorkspace : '')
            || 'main'
        ).trim() || 'main';
    }

    function getCategoryName(link) {
        return String(link?.category || 'Unsorted').trim() || 'Unsorted';
    }

    function getBookmarkMode(linkOrId) {
        const link = typeof linkOrId === 'object' ? linkOrId : findLinkById(linkOrId);
        return normalizeMode(link?.clickBehaviorMode);
    }

    function setBookmarkMode(linkId, mode) {
        const link = findLinkById(linkId);
        if (!link) return 'inherit';
        const normalized = normalizeMode(mode);
        if (normalized === 'inherit') delete link.clickBehaviorMode;
        else link.clickBehaviorMode = normalized;
        if (typeof saveData === 'function') saveData();
        if (typeof renderDashboard === 'function') renderDashboard();
        return normalized;
    }

    function getCardMode(workspaceId, categoryName) {
        const folderApi = getFolderApi();
        if (!folderApi?.getCardClickBehaviorMode) return 'inherit';
        return normalizeMode(folderApi.getCardClickBehaviorMode(workspaceId, categoryName));
    }

    function setCardMode(workspaceId, categoryName, mode) {
        const folderApi = getFolderApi();
        if (!folderApi?.setCardClickBehaviorMode) return 'inherit';
        const normalized = normalizeMode(mode);
        folderApi.setCardClickBehaviorMode(workspaceId, categoryName, normalized);
        if (typeof renderDashboard === 'function') renderDashboard();
        return normalized;
    }

    function getFolderMode(workspaceId, categoryName, folderId) {
        const folderApi = getFolderApi();
        if (!folderApi?.getFolderClickBehaviorMode) return 'inherit';
        return normalizeMode(folderApi.getFolderClickBehaviorMode(workspaceId, categoryName, folderId));
    }

    function getFolderModeChain(workspaceId, categoryName, folderId) {
        const folderApi = getFolderApi();
        const targetId = String(folderId || '').trim();
        if (!targetId || !folderApi?.getFolderById) return [];

        const visited = new Set();
        const chain = [];
        let currentId = targetId;
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const folder = folderApi.getFolderById(workspaceId, categoryName, currentId);
            if (!folder) break;
            chain.unshift({
                id: currentId,
                mode: normalizeMode(folder.clickBehaviorMode),
                name: String(folder.name || 'Folder').trim() || 'Folder'
            });
            currentId = String(folder.parentId || '').trim();
        }
        return chain;
    }

    function setFolderMode(workspaceId, categoryName, folderId, mode) {
        const folderApi = getFolderApi();
        if (!folderApi?.setFolderClickBehaviorMode) return 'inherit';
        const normalized = normalizeMode(mode);
        folderApi.setFolderClickBehaviorMode(workspaceId, categoryName, folderId, normalized);
        if (typeof renderDashboard === 'function') renderDashboard();
        return normalized;
    }

    function applyMode(state, mode) {
        const normalized = normalizeMode(mode);
        if (normalized === 'inherit') return { ...state };
        if (normalized === 'invert') {
            return {
                openTarget: state.openTarget === 'none'
                    ? 'newtab'
                    : 'none',
                openFocus: true
            };
        }
        if (normalized === 'focus_only') {
            return {
                openTarget: 'none',
                openFocus: true
            };
        }
        if (normalized === 'internal_only') {
            return {
                openTarget: 'internal',
                openFocus: false
            };
        }
        if (normalized === 'open_and_focus') {
            return {
                openTarget: 'newtab',
                openFocus: true
            };
        }
        return {
            openTarget: 'newtab',
            openFocus: false
        };
    }

    function describeResolvedBehavior(result) {
        if (result?.openTarget === 'internal' && result?.openFocus) return 'Open internal view and popup';
        if (result?.openTarget === 'internal') return 'Open internal view';
        if (result?.openTarget === 'newtab' && result?.openFocus) return 'Open link in new tab and popup';
        if (result?.openTarget === 'newtab') return 'Open link in new tab';
        return 'Open popup only';
    }

    function describeMode(mode) {
        const normalized = normalizeMode(mode);
        return MODE_OPTIONS.find((option) => option.value === normalized)?.description || MODE_OPTIONS[0].description;
    }

    function preserveBookmarkFocusAccess(result, bookmarkMode) {
        const normalizedBookmarkMode = normalizeMode(bookmarkMode);
        if ((normalizedBookmarkMode === 'internal_only' || normalizedBookmarkMode === 'open_only') && result?.openTarget !== 'none') {
            return {
                ...result,
                openFocus: true
            };
        }
        return { ...(result || {}) };
    }

    function resolveBehaviorForLink(linkOrId) {
        const link = typeof linkOrId === 'object' ? linkOrId : findLinkById(linkOrId);
        if (!link) {
            const baseState = {
                ...applyMode({ openTarget: 'none', openFocus: false }, getDefaultMode())
            };
            return {
                openTarget: baseState.openTarget,
                openLink: baseState.openTarget !== 'none',
                openInternal: baseState.openTarget === 'internal',
                openFocus: baseState.openFocus,
                cardMode: 'inherit',
                folderMode: 'inherit',
                folderModeChain: [],
                bookmarkMode: 'inherit',
                summary: describeResolvedBehavior(baseState)
            };
        }

        const workspaceId = getWorkspaceId(link);
        const categoryName = getCategoryName(link);
        const folderId = String(link?.folderId || '').trim();

        const baseState = applyMode({ openTarget: 'none', openFocus: false }, getDefaultMode());
        const cardMode = getCardMode(workspaceId, categoryName);
        const folderModeChain = folderId ? getFolderModeChain(workspaceId, categoryName, folderId) : [];
        const folderMode = folderModeChain.length ? folderModeChain[folderModeChain.length - 1].mode : 'inherit';
        const bookmarkMode = getBookmarkMode(link);

        let result = applyMode(baseState, cardMode);
        folderModeChain.forEach((step) => {
            result = applyMode(result, step.mode);
        });
        result = applyMode(result, bookmarkMode);
        result = preserveBookmarkFocusAccess(result, bookmarkMode);

        return {
            link,
            workspaceId,
            categoryName,
            folderId,
            cardMode,
            folderModeChain,
            folderMode,
            bookmarkMode,
            openTarget: result.openTarget,
            openLink: result.openTarget !== 'none',
            openInternal: result.openTarget === 'internal',
            openFocus: !!result.openFocus,
            summary: describeResolvedBehavior(result)
        };
    }

    Object.assign(ns, {
        normalizeMode,
        getModeOptions,
        getDefaultMode,
        setDefaultMode,
        getBookmarkMode,
        setBookmarkMode,
        getCardMode,
        setCardMode,
        getFolderMode,
        getFolderModeChain,
        setFolderMode,
        resolveBehaviorForLink,
        describeResolvedBehavior,
        describeMode
    });

    ns.ready = true;
})(window.EveBookmarkClickBehavior);
