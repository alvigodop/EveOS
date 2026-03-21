window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};

function getLibraryEntryForLink(workspaceId, categoryName, linkId) {

        const connectionsApi = window.EveLibrary?.ConnectionsAPI;

        if (typeof connectionsApi?.getLinkedEntry === 'function') {

            const linked = connectionsApi.getLinkedEntry(linkId);

            if (linked?.entry) return linked.entry;

        }



        if (typeof connectionsApi?.findConnectionByLinkId !== 'function') return null;

        const conn = connectionsApi.findConnectionByLinkId(linkId);

        if (!conn || typeof window.EveLibrary?.EntriesAPI?.getEntryById !== 'function') return null;

        const entryId = String(conn.libraryEntryId || conn.entryId || '').trim();

        if (!entryId) return null;

        return window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, entryId) || null;

    }



    function isAutoSourceSummary(value) {

        return /^Source:\s*https?:\/\//i.test(String(value || '').trim());

    }



    function getLibraryFallbackImage(entry) {

        if (!entry || typeof entry !== 'object') return '';

        return String(entry.image || entry.imageUrl || entry.coverImage || entry.bannerImage || '').trim();

    }



    function getNormalizedDuplicateUrl(link) {

        const rawUrl = String(link?.url || '').trim();

        if (!rawUrl) return '';

        if (typeof window.EveDuplicateSensor?.normalizeUrl === 'function') {

            return window.EveDuplicateSensor.normalizeUrl(rawUrl);

        }



        try {

            const parsed = new URL(rawUrl, window.location.origin);

            const protocol = String(parsed.protocol || '').toLowerCase();

            if (!protocol || protocol === 'file:' || protocol === 'about:') {

                return rawUrl.toLowerCase().replace(/\/+$/, '');

            }



            const host = String(parsed.hostname || '').replace(/^www\./i, '').toLowerCase();

            const port = String(parsed.port || '').trim();

            let pathname = String(parsed.pathname || '/').replace(/\/+/g, '/');

            if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');



            const sortedParams = Array.from(parsed.searchParams.entries())

                .sort(([leftKey, leftValue], [rightKey, rightValue]) => {

                    if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);

                    return leftValue.localeCompare(rightValue);

                })

                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);

            const search = sortedParams.length > 0 ? `?${sortedParams.join('&')}` : '';

            const hostWithPort = port ? `${host}:${port}` : host;

            return `${hostWithPort}${pathname}${search}`;

        } catch (error) {

            return rawUrl.toLowerCase().replace(/\/+$/, '');

        }

    }



    function hasMeaningfulIcon(link) {

        const iconRaw = String(link?.icon || '').trim();

        const iconNormalized = iconRaw.replace(/\uFE0F/g, '');

        const isLegacyLinkIcon = iconNormalized === '\u{1F517}';

        if (iconNormalized && !isLegacyLinkIcon) return true;



        const sourceUrl = String(link?.url || '').trim();

        if (!sourceUrl || sourceUrl === '#') return false;



        try {

            const parsed = new URL(sourceUrl, window.location.origin);

            const protocol = String(parsed.protocol || '').toLowerCase();

            if (protocol === 'file:' || protocol === 'about:' || protocol === 'blob:' || protocol === 'data:') {

                return false;

            }

            const host = String(parsed.hostname || '').trim();

            return !!host && host.includes('.');

        } catch (error) {

            return false;

        }

    }



    function hasBookmarkTags(link) {

        return Array.isArray(link?.tags) && link.tags.some((tag) => String(tag || '').trim().length > 0);

    }



    function hasLibraryTaxonomy(entry) {

        if (!entry || typeof entry !== 'object') return false;

        const hasTags = Array.isArray(entry.tags)

            ? entry.tags.some((tag) => String(tag || '').trim().length > 0)

            : String(entry.tags || '').trim().length > 0;

        if (hasTags) return true;

        return String(entry.genre || '').split(/[|,;]/).some((genre) => genre.trim().length > 0);

    }



    function hasMeaningfulCover(workspaceId, categoryName, link) {

        const entry = getLibraryEntryForLink(workspaceId, categoryName, link?.id);

        const fallbackImage = getLibraryFallbackImage(entry);



        if (typeof window.EveBookmarkCovers?.getDisplayCover === 'function') {

            const resolved = String(window.EveBookmarkCovers.getDisplayCover(link, fallbackImage) || '').trim();

            return !!resolved;

        }



        return !!String(

            link?.image

            || link?.cover

            || link?.coverImage

            || link?.fixedCoverImage

            || (Array.isArray(link?.coverImages) && link.coverImages.length ? link.coverImages[0] : '')

            || fallbackImage

        ).trim();

    }



    

    Object.assign(shared, {
        getLibraryEntryForLink,
        isAutoSourceSummary,
        getLibraryFallbackImage,
        getNormalizedDuplicateUrl,
        hasMeaningfulIcon,
        hasBookmarkTags,
        hasLibraryTaxonomy,
        hasMeaningfulCover
    });
})(window.EveBookmarkFolders);
