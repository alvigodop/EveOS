window.EveBookmarkCovers = window.EveBookmarkCovers || {};

(function (ns) {
    const selectionCache = new Map();
    const warmedCoverUrls = new Set();
    const warmingCoverUrls = new Set();
    const failedCoverUrls = new Map();
    const COVER_FAILURE_TTL_MS = 12 * 60 * 60 * 1000;
    let warmupTimer = 0;

    function toLinkId(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function trimUrl(value) {
        return String(value || '').trim();
    }

    function isRenderableCoverUrl(value) {
        const normalized = trimUrl(value);
        if (!normalized) return false;
        if (/^(?:null|undefined|none|n\/a)$/i.test(normalized)) return false;
        if (typeof window.isRenderableImageUrl === 'function') {
            return !!window.isRenderableImageUrl(normalized);
        }
        return /^(?:https?:\/\/|file:\/\/|blob:|data:image\/|\/|\.{1,2}\/)/i.test(normalized);
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

    function isReservedTestImageHost(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return host === 'example'
                || host.endsWith('.example')
                || host === 'test'
                || host.endsWith('.test')
                || host === 'invalid'
                || host.endsWith('.invalid')
                || host === 'example.com'
                || host.endsWith('.example.com')
                || host === 'example.org'
                || host.endsWith('.example.org')
                || host === 'example.net'
                || host.endsWith('.example.net');
        } catch (error) {
            return false;
        }
    }

    function normalizeCoverFailureKey(value) {
        return trimUrl(value);
    }

    function isCoverFailureCoolingDown(url) {
        const key = normalizeCoverFailureKey(url);
        if (!key) return false;
        const failedAt = Number(failedCoverUrls.get(key) || 0);
        if (!failedAt) return false;
        if (Date.now() - failedAt <= COVER_FAILURE_TTL_MS) return true;
        failedCoverUrls.delete(key);
        return false;
    }

    function markCoverFailure(url) {
        const key = normalizeCoverFailureKey(url);
        if (!key) return false;
        failedCoverUrls.set(key, Date.now());
        if (failedCoverUrls.size > 1200) {
            const first = failedCoverUrls.keys().next();
            if (!first.done) failedCoverUrls.delete(first.value);
        }
        return true;
    }

    function isDisplayableCoverUrl(value) {
        const normalized = trimUrl(value);
        if (!isRenderableCoverUrl(normalized)) return false;
        if (isReservedTestImageHost(normalized)) return false;
        if (isCoverFailureCoolingDown(normalized)) return false;
        return true;
    }

    function getAdditionalCoverImages(link) {
        return uniqueUrls(link?.coverImages).filter(isRenderableCoverUrl);
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
        const primaryLink = trimUrl(link?.coverImage);
        const primaryFallback = trimUrl(fallbackImage);
        const primary = isDisplayableCoverUrl(primaryLink)
            ? primaryLink
            : (isDisplayableCoverUrl(primaryFallback) ? primaryFallback : '');
        const candidates = getCoverCandidates(link).filter(isDisplayableCoverUrl);
        const fixed = getFixedCoverImage(link);
        if (fixed && isDisplayableCoverUrl(fixed)) {
            warmCoverUrl(fixed);
            return fixed;
        }
        if (!candidates.length) {
            warmCoverUrl(primary);
            return primary;
        }

        const linkId = toLinkId(link?.id);
        if (!linkId) return candidates[0];

        const key = `fixed:${fixed}|extras:${candidates.join('\n')}|primary:${primary}`;
        const cached = selectionCache.get(linkId);
        if (cached && cached.key === key && candidates.includes(cached.url)) {
            return cached.url;
        }

        const nextUrl = candidates[Math.floor(Math.random() * candidates.length)] || candidates[0];
        selectionCache.set(linkId, { key, url: nextUrl });
        warmCoverUrl(nextUrl);
        return nextUrl;
    }

    function warmCoverUrl(url) {
        const normalized = trimUrl(url);
        if (!normalized || !/^https?:\/\//i.test(normalized)) return false;
        if (isReservedTestImageHost(normalized)) return false;
        if (typeof Image !== 'function') return false;
        if (warmedCoverUrls.has(normalized) || warmingCoverUrls.has(normalized)) return false;
        warmingCoverUrls.add(normalized);
        const img = new Image();
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.onload = img.onerror = function () {
            warmingCoverUrls.delete(normalized);
            if (img.naturalWidth === 0 && img.naturalHeight === 0) {
                markCoverFailure(normalized);
            }
            warmedCoverUrls.add(normalized);
            if (warmedCoverUrls.size > 900) {
                const first = warmedCoverUrls.values().next();
                if (!first.done) warmedCoverUrls.delete(first.value);
            }
        };
        img.src = normalized;
        return true;
    }

    function warmupCoversForLinks(links, options = {}) {
        const sourceLinks = Array.isArray(links) ? links : getLinks();
        const limit = Math.max(0, Number(options.limit || 80) || 80);
        if (!sourceLinks.length || !limit) return 0;
        let count = 0;
        sourceLinks.slice(0, limit).forEach(function (link) {
            const urls = uniqueUrls([link?.fixedCoverImage, link?.coverImage].concat(Array.isArray(link?.coverImages) ? link.coverImages : []))
                .filter(isDisplayableCoverUrl)
                .filter(function (url) { return /^https?:\/\//i.test(url); });
            urls.slice(0, 3).forEach(function (url) {
                if (warmCoverUrl(url)) count += 1;
            });
        });
        return count;
    }

    function handleCoverImageError(image) {
        if (!image) return false;
        const src = trimUrl(image.currentSrc || image.src || image.dataset?.coverUrl || '');
        markCoverFailure(src);
        image.onerror = null;
        image.removeAttribute('src');
        image.style.display = 'none';
        const coverSlot = image.closest?.('.unidex-entry-cover-slot, .hatch-bookmark-cover, .folder-tile-hatch-cover');
        if (coverSlot) coverSlot.classList.add('is-cover-error');
        return true;
    }

    function scheduleWarmup(links, options = {}) {
        if (warmupTimer) return;
        const delay = Math.max(300, Number(options.delayMs || 1200) || 1200);
        warmupTimer = setTimeout(function () {
            warmupTimer = 0;
            warmupCoversForLinks(links, options);
        }, delay);
    }

    function clearSelection(linkId) {
        const normalizedId = toLinkId(linkId);
        if (!normalizedId) return;
        selectionCache.delete(normalizedId);
    }

    function getDatapackIndexApi() {
        return window.EveOS?.DatapackIndex || window.EveOS?.SearchAdvanced?.Index || null;
    }

    function getLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
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

        const indexApi = getDatapackIndexApi();
        if (indexApi && typeof indexApi.resolveBookmarkLink === 'function') {
            const resolved = indexApi.resolveBookmarkLink(toLinkId(match.linkId));
            if (resolved) return resolved;
        }

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
        isRenderableCoverUrl,
        isDisplayableCoverUrl,
        markCoverFailure,
        handleCoverImageError,
        clearSelection,
        warmCoverUrl,
        warmupCoversForLinks,
        scheduleWarmup,
        getLinkedBookmarkForLibraryEntry,
        getDisplayCoverForLibraryEntry
    });
})(window.EveBookmarkCovers);
