window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {

    const shared = ns._shared || {};

    const {
        getNormalizedDuplicateUrl,
        hasMeaningfulIcon,
        hasBookmarkTags,
        hasLibraryTaxonomy,
        hasMeaningfulCover,
        isAutoSourceSummary
    } = shared;

    function computeGhostDerivedState(context) {

        const {
            activeLinks,
            isGhostEnabled,
            getCachedEntry,
            workspaceId,
            categoryName,
            isMegaSensor
        } = context || {};

        const links = Array.isArray(activeLinks) ? activeLinks : [];
        const resolveEntry = typeof getCachedEntry === 'function' ? getCachedEntry : () => null;
        const isEnabled = typeof isGhostEnabled === 'function' ? isGhostEnabled : () => true;
        const findConnectionByLinkId = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function'
            ? window.EveLibrary.ConnectionsAPI.findConnectionByLinkId
            : null;

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentTime = sevenDaysAgo.getTime();
        const nowMs = Date.now();
        const staleMs = 90 * 24 * 60 * 60 * 1000;
        const recentVisMs = 7 * 24 * 60 * 60 * 1000;
        const ancientsMs = 2 * 365 * 24 * 60 * 60 * 1000;

        const recentLinks = links.filter((link) => {

            if (!link?.updatedAt) return false;

            const updatedTime = Number(new Date(link.updatedAt).getTime());

            return Number.isFinite(updatedTime) && updatedTime >= recentTime;

        });

        const unlinkedLinks = links.filter((link) => {

            const isUnlinked = !!findConnectionByLinkId && !findConnectionByLinkId(link.id);

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

        const missingIcons = links.filter((link) => !hasMeaningfulIcon(link));
        const missingCovers = links.filter((link) => !hasMeaningfulCover(workspaceId, categoryName, link));

        const urlCounts = {};

        links.forEach((link) => {

            const normalized = getNormalizedDuplicateUrl(link);

            if (!normalized) return;

            urlCounts[normalized] = (urlCounts[normalized] || 0) + 1;

        });

        const duplicateSuspects = links.filter((link) => {

            const normalized = getNormalizedDuplicateUrl(link);

            return !!normalized && urlCounts[normalized] > 1;

        });

        const untaggedLinks = links.filter((link) => {

            if (hasBookmarkTags(link)) return false;

            const entry = resolveEntry(link);

            if (entry && hasLibraryTaxonomy(entry)) return false;

            return true;

        });

        const needsReviewLinks = links.filter((link) => {

            const entry = resolveEntry(link);

            if (!entry) return false;

            if (entry.confidence && entry.confidence < 5) return true;

            return !entry.derivedRatings || entry.derivedRatings.activeValue === undefined || entry.derivedRatings.activeValue === null;

        });

        const unreadLinks = links.filter((link) => {

            const entry = resolveEntry(link);

            if (!entry) return false;

            return entry?.progress === 0 || entry?.libraryStatus?.id === 'plan_to_read';

        });

        const readingLinks = links.filter((link) => resolveEntry(link)?.libraryStatus?.id === 'reading');
        const completedLinks = links.filter((link) => resolveEntry(link)?.libraryStatus?.id === 'completed');
        const onHoldLinks = links.filter((link) => resolveEntry(link)?.libraryStatus?.id === 'on_hold');
        const droppedLinks = links.filter((link) => resolveEntry(link)?.libraryStatus?.id === 'dropped');

        const brokenLinks = links.filter((link) => {

            if (!link?.url || typeof link.url !== 'string') return true;

            const normalized = link.url.trim().toLowerCase();

            return normalized === '' || normalized === '#' || normalized.startsWith('javascript:');

        });

        const missingNotesLinks = links.filter((link) => {

            const entry = resolveEntry(link);

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

        const topRatedLinks = links.filter((link) => {

            if (link?.priority === 'high') return true;

            const entry = resolveEntry(link);

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

            links.forEach((link) => {

                const health = window.EveSemanticDrift.getHealthInfo(link.url);

                if (health) {

                    if (health.status === 'dead') deadLinks.push(link);
                    if (health.status === 'redirected') redirectedLinks.push(link);
                    if (health.hasTitleDrift) titleDriftLinks.push(link);

                }

                const isLinked = !!findConnectionByLinkId && !!findConnectionByLinkId(link.id);

                if (isLinked && health?.status === 'dead') {

                    orphanedLibEntries.push(link);

                }

            });

        }

        links.forEach((link) => {

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

        links.forEach((link) => {

            try {

                const domain = new URL(String(link?.url || '')).hostname.toLowerCase().replace(/^www\./, '');

                if (!domain || !domain.includes('.')) return;

                if (!domainMap.has(domain)) domainMap.set(domain, []);

                domainMap.get(domain).push(link);

            } catch (error) {}

        });

        const domainGhosts = [];

        domainMap.forEach((domainLinks, domain) => {

            if (domainLinks.length >= 3 && isEnabled('domain_grouping')) {

                domainGhosts.push({ domain, links: domainLinks });

            }

        });

        domainGhosts.sort((left, right) => right.links.length - left.links.length);

        const genreMap = new Map();

        links.forEach((link) => {

            const entry = resolveEntry(link);

            if (!entry?.genre) return;

            String(entry.genre).split(/[|,;]/).map((value) => value.trim()).filter(Boolean).forEach((genre) => {

                if (!genreMap.has(genre)) genreMap.set(genre, []);

                genreMap.get(genre).push(link);

            });

        });

        const topGenres = [];

        genreMap.forEach((genreLinks, genre) => {

            if (genreLinks.length >= 2 && isEnabled('library_stats')) {

                topGenres.push({ genre, links: genreLinks });

            }

        });

        topGenres.sort((left, right) => right.links.length - left.links.length);

        const isTaskEnabledFn = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? window.EveBookmarkFolders.isTaskEnabledForLink
            : null;
        const doneLinks = isTaskEnabledFn
            ? links.filter((link) => isTaskEnabledFn(link) && !!link.done)
            : [];
        const pendingLinks = isTaskEnabledFn
            ? links.filter((link) => isTaskEnabledFn(link) && !link.done)
            : [];
        const notTaskLinks = isTaskEnabledFn
            ? links.filter((link) => !isTaskEnabledFn(link))
            : [];

        const tvApi = window.EveTrueValue;
        let tvLockedLinks = [];
        let tvAboveTrueLinks = [];
        let tvNearTrueLinks = [];
        let tvBelowTrueLinks = [];
        if (tvApi && !isMegaSensor) {
            const tvData = tvApi.computeTrueValues(links, workspaceId, categoryName, { forceEnabled: true });
            if (tvData && Object.keys(tvData).length) {
                links.forEach((link) => {
                    const tv = tvData[String(link?.id || '')];
                    if (!tv) return;
                    if (tv.locked) { tvLockedLinks.push(link); return; }
                    if (tv.percent > 100) tvAboveTrueLinks.push(link);
                    else if (tv.percent >= 95) tvNearTrueLinks.push(link);
                    else tvBelowTrueLinks.push(link);
                });
            }
        }

        const linkedLinks = links.filter((link) => !!findConnectionByLinkId && !!findConnectionByLinkId(link.id));
        const lowConfidenceLinks = links.filter((link) => {
            const entry = resolveEntry(link);
            if (!entry) return false;
            const derived = entry.derivedRatings || {};
            const confidence = typeof derived.confidence === 'number' ? derived.confidence : null;
            return Number.isFinite(confidence) && confidence < 0.5;
        });
        const highConfidenceLinks = links.filter((link) => {
            const entry = resolveEntry(link);
            if (!entry) return false;
            const derived = entry.derivedRatings || {};
            const confidence = typeof derived.confidence === 'number' ? derived.confidence : null;
            return Number.isFinite(confidence) && confidence >= 0.75;
        });

        return {
            recentTime,
            nowMs,
            staleMs,
            recentVisMs,
            ancientsMs,
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
            topGenres,
            doneLinks,
            pendingLinks,
            notTaskLinks,
            tvLockedLinks,
            tvAboveTrueLinks,
            tvNearTrueLinks,
            tvBelowTrueLinks,
            linkedLinks,
            lowConfidenceLinks,
            highConfidenceLinks
        };

    }

    ns._ghostSensorsHelpers = ns._ghostSensorsHelpers || {};
    ns._ghostSensorsHelpers.computeGhostDerivedState = computeGhostDerivedState;

})(window.EveBookmarkFolders);
