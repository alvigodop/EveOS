window.EveBookmarkCovers = window.EveBookmarkCovers || {};

(function (ns) {
    const selectionCache = new Map();

    function toLinkId(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function trimUrl(value) {
        return String(value || '').trim();
    }

    function uniqueUrls(values) {
        const seen = new Set();
        return (Array.isArray(values) ? values : [])
            .map(trimUrl)
            .filter(Boolean)
            .filter((value) => {
                const key = value.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function getAdditionalCoverImages(link) {
        return uniqueUrls(link?.coverImages);
    }

    function getFixedCoverImage(link) {
        const fixed = trimUrl(link?.fixedCoverImage);
        if (!fixed) return '';
        const candidates = getAdditionalCoverImages(link);
        return candidates.some((value) => value.toLowerCase() === fixed.toLowerCase()) ? fixed : '';
    }

    function getCoverCandidates(link) {
        return getAdditionalCoverImages(link);
    }

    function getDisplayCover(link, fallbackImage) {
        const primary = trimUrl(link?.coverImage) || trimUrl(fallbackImage);
        const candidates = getCoverCandidates(link);
        const fixed = getFixedCoverImage(link);
        if (fixed) return fixed;
        if (!candidates.length) return primary;

        const linkId = toLinkId(link?.id);
        if (!linkId) return candidates[0];

        const key = `fixed:${fixed}|extras:${candidates.join('\n')}|primary:${primary}`;
        const cached = selectionCache.get(linkId);
        if (cached && cached.key === key && candidates.includes(cached.url)) {
            return cached.url;
        }

        const nextUrl = candidates[Math.floor(Math.random() * candidates.length)] || candidates[0];
        selectionCache.set(linkId, { key, url: nextUrl });
        return nextUrl;
    }

    function clearSelection(linkId) {
        const normalizedId = toLinkId(linkId);
        if (!normalizedId) return;
        selectionCache.delete(normalizedId);
    }

    function getLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined') return links;
        return [];
    }

    function getActiveWorkspaceId() {
        if (window.eveState?.config?.activeWorkspace) return String(window.eveState.config.activeWorkspace);
        if (typeof config !== 'undefined' && config?.activeWorkspace) return String(config.activeWorkspace);
        return 'main';
    }

    function getLinkedBookmarkForLibraryEntry(categoryName, entry, workspaceId) {
        const entryId = toLinkId(entry?.id);
        if (!entryId) return null;

        const category = String(categoryName || '').trim() || 'Unsorted';
        const workspace = String(workspaceId || getActiveWorkspaceId()).trim() || 'main';
        const connections = window.EveLibrary?.ConnectionsAPI?.getAll?.() || [];
        const match = connections.find((item) => {
            if (toLinkId(item?.libraryEntryId) !== entryId) return false;
            if (String(item?.categoryName || '').trim() !== category) return false;
            return String(item?.workspace || '').trim() === workspace;
        });
        if (!match) return null;

        return getLinks().find((link) => toLinkId(link?.id) === toLinkId(match.linkId)) || null;
    }

    function getDisplayCoverForLibraryEntry(categoryName, entry, workspaceId) {
        const fallbackImage = trimUrl(entry?.image || entry?.imageUrl);
        const linkedBookmark = getLinkedBookmarkForLibraryEntry(categoryName, entry, workspaceId);
        if (!linkedBookmark) return fallbackImage;
        return getDisplayCover(linkedBookmark, fallbackImage);
    }

    Object.assign(ns, {
        getAdditionalCoverImages,
        getFixedCoverImage,
        getCoverCandidates,
        getDisplayCover,
        clearSelection,
        getLinkedBookmarkForLibraryEntry,
        getDisplayCoverForLibraryEntry
    });
})(window.EveBookmarkCovers);
