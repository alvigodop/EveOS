window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {

    const shared = ns._shared || {};

    const {
        normalizeFolderId,
        getLibraryEntryForLink,
        getNormalizedDuplicateUrl,
        hasMeaningfulIcon,
        hasBookmarkTags,
        hasLibraryTaxonomy,
        hasMeaningfulCover,
        isAutoSourceSummary
    } = shared;

    function collectFolderScopeIds(rootFolderId, realNodeMap, realChildrenMap) {

        if (!rootFolderId || !realNodeMap?.has(rootFolderId)) return null;

        const ids = new Set();
        const stack = [rootFolderId];

        while (stack.length > 0) {

            const currentId = stack.pop();

            if (!currentId || ids.has(currentId)) continue;

            ids.add(currentId);

            (realChildrenMap?.get(currentId) || []).forEach((childNode) => {

                if (childNode?.id) stack.push(childNode.id);

            });

        }

        return ids;

    }

    function filterLinksToActiveFolderScope(links, rootFolderId, realNodeMap, realChildrenMap) {

        if (!rootFolderId) return Array.isArray(links) ? links.slice() : [];

        const allowedFolderIds = collectFolderScopeIds(rootFolderId, realNodeMap, realChildrenMap);

        if (!allowedFolderIds || allowedFolderIds.size === 0) return [];

        return (Array.isArray(links) ? links : []).filter((link) => {

            const folderId = normalizeFolderId(link?.folderId);

            return !!folderId && allowedFolderIds.has(folderId);

        });

    }

    function buildGhostSensorState(context) {

        const {
            workspaceId,
            categoryName,
            cardLinks,
            scopedNodes,
            scopedCardKey,
            activeRealFolderId,
            realNodeMap,
            realChildrenMap
        } = context || {};

        const activeLinks = filterLinksToActiveFolderScope(cardLinks, activeRealFolderId, realNodeMap, realChildrenMap);

        const isGhostEnabled = (type) => !window.EveFolderViewV2 || window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, type);

        const ghostFolders = [];
        const masterGhostId = '__ghost_master__';
        const ghostCategories = {
            linkHealth: { id: '__ghost_cat_linkHealth__', name: '[ Link Health ]', links: [] },
            domains: { id: '__ghost_cat_domains__', name: '[ Domains ]', links: [] },
            readingStatus: { id: '__ghost_cat_readingStatus__', name: '[ Reading Status ]', links: [] },
            maintenance: { id: '__ghost_cat_maintenance__', name: '[ Maintenance ]', links: [] },
            activity: { id: '__ghost_cat_activity__', name: '[ Activity ]', links: [] },
            insights: { id: '__ghost_cat_insights__', name: '[ Insights ]', links: [] },
            indexes: { id: '__ghost_cat_indexes__', name: '[ Smart Indexes ]', links: [] }
        };
        const activeSubGhosts = [];
        const rootRecursiveTasks = [];

        const libraryEntryCache = new Map();

        activeLinks.forEach((link) => {

            libraryEntryCache.set(String(link?.id || ''), getLibraryEntryForLink(workspaceId, categoryName, link?.id));

        });

        const getCachedEntry = (link) => libraryEntryCache.get(String(link?.id || '')) || null;

        const preferredGhostChain = Array.isArray(window.eveState?.config?.activeManhwaFolderChains?.[scopedCardKey])
            ? window.eveState.config.activeManhwaFolderChains[scopedCardKey]
                .map((item) => ({
                    dimension: String(item?.dimension || '').trim(),
                    valueKey: String(item?.valueKey || '').trim().toLowerCase(),
                    label: String(item?.label || '').trim()
                }))
                .filter((item) => item.dimension && item.valueKey)
            : [];

        const derivedGhostNodeBudget = {
            count: 0,
            max: activeLinks.length <= 16
                ? 12000
                : activeLinks.length <= 48
                    ? 10000
                    : Math.min(12000, Math.max(5000, activeLinks.length * 70))
        };
        const derivedValueLimit = activeLinks.length > 120 ? 8 : 10;
        const derivedDepthLimit = 4;

        const sevenDaysAgo = new Date();

        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentTime = sevenDaysAgo.getTime();
        const nowMs = Date.now();
        const staleMs = 90 * 24 * 60 * 60 * 1000;
        const recentVisMs = 7 * 24 * 60 * 60 * 1000;
        const ancientsMs = 2 * 365 * 24 * 60 * 60 * 1000;

        const recentLinks = activeLinks.filter((link) => {

            if (!link?.updatedAt) return false;

            const updatedTime = Number(new Date(link.updatedAt).getTime());

            return Number.isFinite(updatedTime) && updatedTime >= recentTime;

        });

        const unlinkedLinks = activeLinks.filter((link) => {

            const isUnlinked = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function'
                && !window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(link.id);

            if (!isUnlinked) return false;

            try {

                const urlObj = new URL(String(link?.url || ''));
                const isRootPath = urlObj.pathname === '/' || urlObj.pathname === '';
                const domain = urlObj.hostname.toLowerCase().replace('www.', '');
                const genericDomains = ['google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'youtube.com', 'reddit.com', 'wikipedia.org'];

                if (genericDomains.includes(domain) && isRootPath) return false;
                if (link?.title && String(link.title).toLowerCase() === domain) return false;
                if (domain.includes('putlocker')) return false;

            } catch (error) {}

            return true;

        });

        const missingIcons = activeLinks.filter((link) => !hasMeaningfulIcon(link));
        const missingCovers = activeLinks.filter((link) => !hasMeaningfulCover(workspaceId, categoryName, link));

        const urlCounts = {};

        activeLinks.forEach((link) => {

            const normalized = getNormalizedDuplicateUrl(link);

            if (!normalized) return;

            urlCounts[normalized] = (urlCounts[normalized] || 0) + 1;

        });

        const duplicateSuspects = activeLinks.filter((link) => {

            const normalized = getNormalizedDuplicateUrl(link);

            return !!normalized && urlCounts[normalized] > 1;

        });

        const untaggedLinks = activeLinks.filter((link) => {

            if (hasBookmarkTags(link)) return false;

            const entry = getCachedEntry(link);

            if (entry && hasLibraryTaxonomy(entry)) return false;

            return true;

        });

        const needsReviewLinks = activeLinks.filter((link) => {

            const entry = getCachedEntry(link);

            if (!entry) return false;

            if (entry.confidence && entry.confidence < 5) return true;

            return !entry.derivedRatings || entry.derivedRatings.activeValue === undefined || entry.derivedRatings.activeValue === null;

        });

        const unreadLinks = activeLinks.filter((link) => {

            const entry = getCachedEntry(link);

            if (!entry) return false;

            return entry?.progress === 0 || entry?.libraryStatus?.id === 'plan_to_read';

        });

        const readingLinks = activeLinks.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'reading');
        const completedLinks = activeLinks.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'completed');
        const onHoldLinks = activeLinks.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'on_hold');
        const droppedLinks = activeLinks.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'dropped');

        const brokenLinks = activeLinks.filter((link) => {

            if (!link?.url || typeof link.url !== 'string') return true;

            const normalized = link.url.trim().toLowerCase();

            return normalized === '' || normalized === '#' || normalized.startsWith('javascript:');

        });

        const missingNotesLinks = activeLinks.filter((link) => {

            const entry = getCachedEntry(link);

            if (!entry) return false;

            const hasBookmarkNote = typeof link?.notes === 'string' && link.notes.trim().length > 0;

            if (hasBookmarkNote) return false;

            const hasLibraryNotes = [entry.summary, entry.notes, entry.description].some((value) => {

                if (typeof value !== 'string') return false;

                const trimmed = value.trim();

                if (!trimmed) return false;
                if (isAutoSourceSummary(trimmed)) return false;

                return true;

            });

            return !hasLibraryNotes;

        });

        const topRatedLinks = activeLinks.filter((link) => {

            if (link?.priority === 'high') return true;

            const entry = getCachedEntry(link);

            if (!entry) return false;
            if (entry.rating === '5' || entry.rating === '10' || entry.rating === '9') return true;

            return !!(entry.derivedRatings && entry.derivedRatings.activeValue >= 8);

        });

        const deadLinks = [];
        const redirectedLinks = [];
        const titleDriftLinks = [];
        const recentlyVisited = [];
        const staleLinks = [];
        const ancientsLinks = [];
        const noTitleLinks = [];
        const orphanedLibEntries = [];

        if (window.EveSemanticDrift) {

            activeLinks.forEach((link) => {

                const health = window.EveSemanticDrift.getHealthInfo(link.url);

                if (health) {

                    if (health.status === 'dead') deadLinks.push(link);
                    if (health.status === 'redirected') redirectedLinks.push(link);
                    if (health.hasTitleDrift) titleDriftLinks.push(link);

                }

                const isLinked = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function'
                    && window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(link.id);

                if (isLinked && health?.status === 'dead') {

                    orphanedLibEntries.push(link);

                }

            });

        }

        activeLinks.forEach((link) => {

            const value = link?.lastVisited || link?.updatedAt || link?.createdAt || 0;
            const lastVisited = Number(new Date(value).getTime());

            if (Number.isFinite(lastVisited) && lastVisited > 0) {

                const age = nowMs - lastVisited;

                if (age < recentVisMs) recentlyVisited.push(link);
                if (age > staleMs) staleLinks.push(link);

            }

            const createdAt = Number(new Date(link?.createdAt).getTime());

            if (Number.isFinite(createdAt) && createdAt > 0 && (nowMs - createdAt) > ancientsMs) {

                ancientsLinks.push(link);

            }

            const title = String(link?.title || '').trim().toLowerCase();
            const url = String(link?.url || '').trim().toLowerCase();

            if (!title || title === 'untitled' || title === url) {

                noTitleLinks.push(link);

            }

        });

        const domainMap = new Map();

        activeLinks.forEach((link) => {

            try {

                const domain = new URL(String(link?.url || '')).hostname.toLowerCase().replace(/^www\./, '');

                if (!domain || !domain.includes('.')) return;

                if (!domainMap.has(domain)) domainMap.set(domain, []);

                domainMap.get(domain).push(link);

            } catch (error) {}

        });

        const domainGhosts = [];

        domainMap.forEach((links, domain) => {

            if (links.length >= 3 && isGhostEnabled('domain_grouping')) {

                domainGhosts.push({ domain, links });

            }

        });

        domainGhosts.sort((left, right) => right.links.length - left.links.length);

        const genreMap = new Map();

        activeLinks.forEach((link) => {

            const entry = getCachedEntry(link);

            if (!entry?.genre) return;

            String(entry.genre).split(/[|,;]/).map((value) => value.trim()).filter(Boolean).forEach((genre) => {

                if (!genreMap.has(genre)) genreMap.set(genre, []);

                genreMap.get(genre).push(link);

            });

        });

        const topGenres = [];

        genreMap.forEach((links, genre) => {

            if (links.length >= 2 && isGhostEnabled('library_stats')) {

                topGenres.push({ genre, links });

            }

        });

        topGenres.sort((left, right) => right.links.length - left.links.length);

        return {
            workspaceId,
            categoryName,
            activeRealFolderId,
            scopedNodes,
            activeLinks,
            recentTime,
            nowMs,
            staleMs,
            recentVisMs,
            ancientsMs,
            isGhostEnabled,
            ghostFolders,
            masterGhostId,
            ghostCategories,
            activeSubGhosts,
            rootRecursiveTasks,
            libraryEntryCache,
            getCachedEntry,
            preferredGhostChain,
            derivedGhostNodeBudget,
            derivedValueLimit,
            derivedDepthLimit,
            recentLinks,
            unlinkedLinks,
            missingIcons,
            missingCovers,
            duplicateSuspects,
            untaggedLinks,
            needsReviewLinks,
            unreadLinks,
            readingLinks,
            completedLinks,
            onHoldLinks,
            droppedLinks,
            brokenLinks,
            missingNotesLinks,
            topRatedLinks,
            deadLinks,
            redirectedLinks,
            titleDriftLinks,
            recentlyVisited,
            staleLinks,
            ancientsLinks,
            noTitleLinks,
            orphanedLibEntries,
            domainGhosts,
            topGenres
        };

    }

    ns._ghostSensors = ns._ghostSensors || {};
    ns._ghostSensors.buildGhostSensorState = buildGhostSensorState;

})(window.EveBookmarkFolders);
