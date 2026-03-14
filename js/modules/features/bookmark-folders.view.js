window.EveBookmarkFolders = window.EveBookmarkFolders || {};



(function (ns) {

    const shared = ns._shared || {};

    const {

        getScopedNodes,

        buildScopedKey,

        buildNodeMap,

        buildChildrenMap,

        normalizeFolderId,

        getLibraryEntryForLink,

        getNormalizedDuplicateUrl,

        hasMeaningfulIcon,

        hasBookmarkTags,

        hasLibraryTaxonomy,

        hasMeaningfulCover,

        isAutoSourceSummary,

        uniqueNonEmpty,

        splitLibraryFieldValues,

        normalizeLanguageLabel,

        normalizeStatusLabel,

        getDerivedTagValues,

        getDerivedGenreValues,

        getDerivedAuthorValues,

        getDerivedLanguageValues,

        getDerivedStatusValue,

        getDerivedRatingValue,

        getDerivedConfidenceValue,

        getRatingBucketLabel,

        getConfidenceBucketLabel,

        getDerivedProgressValue,

        getProgressBucketLabel,

        getDerivedDemographicValue,

        getDerivedPublicationValue,

        getPublicationBucketLabel,

        getTitleInitial,

        getCoarseTitleBucket,

        getDerivedTimelineBucket

    } = shared;



    function buildFolderView(workspaceId, categoryName, cardLinks) {

        let scopedNodes = getScopedNodes(workspaceId, categoryName);

        const scopedCardKey = buildScopedKey(workspaceId, categoryName);

        const realScopedNodes = scopedNodes.filter((node) => !node?.isGhost);

        const realNodeMap = buildNodeMap(realScopedNodes);

        const realChildrenMap = buildChildrenMap(realScopedNodes);

        const configuredScopeRootId = normalizeFolderId(window.eveState?.config?.activeManhwaScopeRoots?.[scopedCardKey]);

        const configuredActiveFolderId = normalizeFolderId(window.eveState?.config?.activeManhwaFolders?.[scopedCardKey]);

        const activeRealFolderId = configuredScopeRootId && realNodeMap.has(configuredScopeRootId)

            ? configuredScopeRootId

            : (configuredActiveFolderId && realNodeMap.has(configuredActiveFolderId)

                ? configuredActiveFolderId

                : null);



        function collectFolderScopeIds(rootFolderId) {

            if (!rootFolderId || !realNodeMap.has(rootFolderId)) return null;

            const ids = new Set();

            const stack = [rootFolderId];

            while (stack.length > 0) {

                const currentId = stack.pop();

                if (!currentId || ids.has(currentId)) continue;

                ids.add(currentId);

                (realChildrenMap.get(currentId) || []).forEach((childNode) => {

                    if (childNode?.id) stack.push(childNode.id);

                });

            }

            return ids;

        }



        function filterLinksToActiveFolderScope(links, rootFolderId) {

            if (!rootFolderId) return Array.isArray(links) ? links.slice() : [];

            const allowedFolderIds = collectFolderScopeIds(rootFolderId);

            if (!allowedFolderIds || allowedFolderIds.size === 0) return [];

            return (Array.isArray(links) ? links : []).filter((link) => {

                const folderId = normalizeFolderId(link?.folderId);

                return !!folderId && allowedFolderIds.has(folderId);

            });

        }



        // --- Inject Ghost Folders ---

        const activeLinks = filterLinksToActiveFolderScope(cardLinks, activeRealFolderId);

        const sevenDaysAgo = new Date();

        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentTime = sevenDaysAgo.getTime();



        const recentLinks = activeLinks.filter(l => {

            if (!l.updatedAt) return false;

            const updatedTime = new Date(l.updatedAt).getTime();

            return updatedTime >= recentTime;

        });



        const unlinkedLinks = activeLinks.filter(l => {

            const isUnlinked = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   !window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);

            if (!isUnlinked) return false;



            // Exclude root/base domains that act as search engines or primary hubs

            // e.g. "Google", "Bing" where title is just the site name and URL is just the root or generic search.

            try {

                const urlObj = new URL(l.url);

                const isRootPath = urlObj.pathname === '/' || urlObj.pathname === '';



                // If it's a known generic search engine root or generic hub, skip it

                const domain = urlObj.hostname.toLowerCase().replace('www.', '');

                const genericDomains = ['google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'youtube.com', 'reddit.com', 'wikipedia.org'];



                if (genericDomains.includes(domain) && isRootPath) {

                    return false;

                }



                // Also optionally exclude if title perfectly matches domain name (basic generic link)

                if (l.title && l.title.toLowerCase() === domain) {

                    return false;

                }



                // Ensure generic video streaming/hub base domains aren't flagged when pointing to specific content

                // If there's an active path, we assume it's valid content and needs a library link.

                // However, the user specifically mentioned a "putlocker misfire" where a *linked* site was showing as unlinked.

                // If `isUnlinked` is true, it means `findConnectionByLinkId` returned false.

                // This means the item is *truly* unlinked in the database schema.

                // If putlocker is considered a "usable source" but shouldn't be in the ghost folder, it might be

                // because it's a generic hub root (like google.com).

                // Let's explicitly ignore putlocker variants entirely, as the user considers them fully fledged sources

                // that don't need dedicated library entries to be considered "valid" in their workflow.

                if (domain.includes('putlocker')) {

                    return false;

                }



            } catch(e) {

                // Invalid URL, keep it in unlinked to be safe

            }



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

            const entry = getLibraryEntryForLink(workspaceId, categoryName, link?.id);

            if (entry && hasLibraryTaxonomy(entry)) return false;

            return true;

        });



        const needsReviewLinks = activeLinks.filter(l => {

            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);

            if (!conn) return false;



            // If it's linked, check if the library entry has missing data like confidence < 5 or missing derivedRatings

            const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                          window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);



            if (entry) {

                if (entry.confidence && entry.confidence < 5) return true;

                if (!entry.derivedRatings || entry.derivedRatings.activeValue === undefined || entry.derivedRatings.activeValue === null) return true;

            }

            return false;

        });



        const unreadLinks = activeLinks.filter(l => {

            // Checks for some indicator of unread state, like no read count, empty progress, or explicit "unread" flag

            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);



            if (conn) {

                const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                              window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);

                if (entry && entry.progress !== undefined && entry.progress === 0) return true;

                if (entry && entry.libraryStatus && entry.libraryStatus.id === 'plan_to_read') return true;

            }

            return false;

        });



        const readingLinks = activeLinks.filter(l => {

            // Checks for items actively being read

            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);



            if (conn) {

                const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                              window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);

                if (entry && entry.libraryStatus && entry.libraryStatus.id === 'reading') return true;

            }

            return false;

        });



        const completedLinks = activeLinks.filter(l => {

            // Checks for items completed

            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);



            if (conn) {

                const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                              window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);

                if (entry && entry.libraryStatus && entry.libraryStatus.id === 'completed') return true;

            }

            return false;

        });



        const onHoldLinks = activeLinks.filter(l => {

            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);

            if (conn) {

                const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                              window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);

                if (entry && entry.libraryStatus && entry.libraryStatus.id === 'on_hold') return true;

            }

            return false;

        });



        const droppedLinks = activeLinks.filter(l => {

            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);

            if (conn) {

                const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                              window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);

                if (entry && entry.libraryStatus && entry.libraryStatus.id === 'dropped') return true;

            }

            return false;

        });



        const brokenLinks = activeLinks.filter(l => {

            if (!l.url || typeof l.url !== 'string') return true;

            const urlStr = l.url.trim().toLowerCase();

            return urlStr === '' || urlStr === '#' || urlStr.startsWith('javascript:');

        });



        const missingNotesLinks = activeLinks.filter((link) => {

            const entry = getLibraryEntryForLink(workspaceId, categoryName, link?.id);

            if (!entry) return false;



            const hasBookmarkNote = typeof link?.notes === 'string' && link.notes.trim().length > 0;

            if (hasBookmarkNote) return false;



            const hasLibraryNotes = [entry.summary, entry.notes, entry.description]

                .some((value) => {

                    if (typeof value !== 'string') return false;

                    const trimmed = value.trim();

                    if (!trimmed) return false;

                    if (isAutoSourceSummary(trimmed)) return false;

                    return true;

                });

            if (hasLibraryNotes) return false;



            return true;

        });



        const topRatedLinks = activeLinks.filter(l => {

            // High priority flag fallback

            if (l.priority === 'high') return true;



            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                   window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);

            if (conn) {

                const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                              window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);

                if (entry) {

                    if (entry.rating === '5' || entry.rating === '10' || entry.rating === '9') return true;

                    if (entry.derivedRatings && entry.derivedRatings.activeValue >= 8) return true;

                }

            }

            return false;

        });



        const ghostFolders = [];

        const isGhostEnabled = (type) => {

            return !window.EveFolderViewV2 || window.EveFolderViewV2.isGhostFolderEnabled(workspaceId, categoryName, type);

        };



        const masterGhostId = '__ghost_master__';



        // ----------------------------------------------------

        // --- NEW DRIFT GHOST FOLDER FILTERS ---

        // ----------------------------------------------------

        const deadLinks = [];

        const redirectedLinks = [];

        const titleDriftLinks = [];



        const nowMs = Date.now();

        const staleMs = 90 * 24 * 60 * 60 * 1000;

        const recentVisMs = 7 * 24 * 60 * 60 * 1000;

        const ancientsMs = 2 * 365 * 24 * 60 * 60 * 1000;



        const recentlyVisited = [];

        const staleLinks = [];

        const ancientsLinks = [];

        const noTitleLinks = [];

        const orphanedLibEntries = [];



        if (window.EveSemanticDrift) {

            activeLinks.forEach(l => {

                const health = window.EveSemanticDrift.getHealthInfo(l.url);

                if (health) {

                    if (health.status === 'dead') deadLinks.push(l);

                    if (health.status === 'redirected') redirectedLinks.push(l);

                    if (health.hasTitleDrift) titleDriftLinks.push(l);

                }



                // Check orphaned

                const isLinked = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                    window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);

                if (isLinked && health && health.status === 'dead') {

                    orphanedLibEntries.push(l);

                }

            });

        }



        activeLinks.forEach(l => {

            // Activity tracking (requires click instrumentation later, using mocked/inferred for now)

            const lastVis = l.lastVisited || l.updatedAt || l.createdAt || 0;

            const age = nowMs - lastVis;

            if (lastVis && age < recentVisMs) {

                recentlyVisited.push(l);

            }

            if (lastVis && age > staleMs) {

                staleLinks.push(l);

            }

            if (l.createdAt && (nowMs - l.createdAt) > ancientsMs) {

                ancientsLinks.push(l);

            }



            // No title

            const t = String(l.title || '').trim().toLowerCase();

            if (!t || t === 'untitled' || t === l.url.trim().toLowerCase()) {

                noTitleLinks.push(l);

            }

        });



        // ----------------------------------------------------

        // --- DOMAIN GROUPING LOGIC ---

        // ----------------------------------------------------

        const domainMap = new Map();

        activeLinks.forEach(l => {

            try {

                const d = new URL(l.url).hostname.toLowerCase().replace(/^www\./, '');

                if (d && d.includes('.')) {

                    if (!domainMap.has(d)) domainMap.set(d, []);

                    domainMap.get(d).push(l);

                }

            } catch(e) {}

        });



        const domainGhosts = [];

        domainMap.forEach((links, domain) => {

            if (links.length >= 3 && isGhostEnabled('domain_grouping')) {

                domainGhosts.push({

                    domain: domain,

                    links: links

                });

            }

        });

        domainGhosts.sort((a, b) => b.links.length - a.links.length);



        // ----------------------------------------------------

        // --- LIBRARY STATS LOGIC ---

        // ----------------------------------------------------

        const genreMap = new Map();

        activeLinks.forEach(l => {

            const conn = typeof window.EveLibrary?.ConnectionsAPI?.findConnectionByLinkId === 'function' &&

                         window.EveLibrary.ConnectionsAPI.findConnectionByLinkId(l.id);

            if (conn) {

                const entry = typeof window.EveLibrary?.EntriesAPI?.getEntryById === 'function' &&

                              window.EveLibrary.EntriesAPI.getEntryById(workspaceId, categoryName, conn.entryId);

                if (entry && entry.genre) {

                    const genres = String(entry.genre).split(/[|,;]/).map(g => g.trim()).filter(Boolean);

                    genres.forEach(g => {

                        if (!genreMap.has(g)) genreMap.set(g, []);

                        genreMap.get(g).push(l);

                    });

                }

            }

        });



        const topGenres = [];

        genreMap.forEach((links, genre) => {

            if (links.length >= 2 && isGhostEnabled('library_stats')) {

                topGenres.push({ genre, links });

            }

        });

        topGenres.sort((a, b) => b.links.length - a.links.length);



        const libraryEntryCache = new Map();

        activeLinks.forEach((link) => {

            libraryEntryCache.set(String(link?.id || ''), getLibraryEntryForLink(workspaceId, categoryName, link?.id));

        });



        const preferredGhostChain = Array.isArray(window.eveState?.config?.activeManhwaFolderChains?.[scopedCardKey])

            ? window.eveState.config.activeManhwaFolderChains[scopedCardKey]

                .map((item) => ({

                    dimension: String(item?.dimension || '').trim(),

                    valueKey: String(item?.valueKey || '').trim().toLowerCase(),

                    label: String(item?.label || '').trim()

                }))

                .filter((item) => item.dimension && item.valueKey)

            : [];



        function getPreferredChainScore(chain) {

            if (!preferredGhostChain.length || !Array.isArray(chain) || !chain.length) return 0;

            let score = 0;

            const limit = Math.min(preferredGhostChain.length, chain.length);

            for (let index = 0; index < limit; index += 1) {

                const left = preferredGhostChain[index];

                const right = chain[index];

                if (!left || !right) break;

                if (String(left.dimension || '') !== String(right.dimension || '')) break;

                if (String(left.valueKey || '') !== String(right.valueKey || '').toLowerCase()) break;

                score += 1;

            }

            return score;

        }



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



        function getCachedEntry(link) {

            return libraryEntryCache.get(String(link?.id || '')) || null;

        }



        function sortBuckets(buckets, preferredOrder) {

            const orderMap = new Map();

            (Array.isArray(preferredOrder) ? preferredOrder : []).forEach((value, index) => {

                orderMap.set(String(value), index);

            });

            return buckets.sort((left, right) => {

                const leftOrder = orderMap.has(left.label) ? orderMap.get(left.label) : Number.MAX_SAFE_INTEGER;

                const rightOrder = orderMap.has(right.label) ? orderMap.get(right.label) : Number.MAX_SAFE_INTEGER;

                if (leftOrder !== rightOrder) return leftOrder - rightOrder;

                if (right.links.length !== left.links.length) return right.links.length - left.links.length;

                return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });

            });

        }



        function buildBucketsFromExtractor(links, extractor, options = {}) {

            const map = new Map();

            (Array.isArray(links) ? links : []).forEach((link) => {

                const entry = getCachedEntry(link);

                const values = extractor(link, entry) || [];

                const normalizedValues = Array.isArray(values) ? values : [values];

                uniqueNonEmpty(normalizedValues).forEach((label) => {

                    const key = String(options.normalizeKey ? options.normalizeKey(label) : label).trim();

                    if (!key) return;

                    if (!map.has(key)) {

                        map.set(key, { key, label: String(label).trim(), links: [] });

                    }

                    map.get(key).links.push(link);

                });

            });

            return sortBuckets(Array.from(map.values()), options.order);

        }



        function buildTitleBucketsForLinks(links) {

            const initials = Array.from(new Set((Array.isArray(links) ? links : []).map((link) => getTitleInitial(link?.title))));

            const useCoarse = initials.filter((value) => value !== '0-9' && value !== '#').length > 10;

            return buildBucketsFromExtractor(links, (link) => {

                const initial = getTitleInitial(link?.title);

                return useCoarse ? [getCoarseTitleBucket(initial)] : [initial];

            }, {

                order: useCoarse

                    ? ['A-C', 'D-F', 'G-I', 'J-L', 'M-O', 'P-R', 'S-U', 'V-Z', '0-9', '#']

                    : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0-9', '#']

            });

        }



        const derivedDimensionDefinitions = [

            {

                key: 'tag_index',

                label: '[ By Tags ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (link, entry) => getDerivedTagValues(link, entry), {

                        normalizeKey: (value) => String(value || '').trim().toLowerCase()

                    });

                }

            },

            {

                key: 'genre_index',

                label: '[ By Genres ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (_, entry) => getDerivedGenreValues(entry), {

                        normalizeKey: (value) => String(value || '').trim().toLowerCase()

                    });

                }

            },

            {

                key: 'author_index',

                label: '[ By Authors ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (_, entry) => getDerivedAuthorValues(entry), {

                        normalizeKey: (value) => String(value || '').trim().toLowerCase()

                    });

                }

            },

            {

                key: 'language_index',

                label: '[ By Language ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (link, entry) => getDerivedLanguageValues(link, entry), {

                        normalizeKey: (value) => String(value || '').trim().toLowerCase()

                    });

                }

            },

            {

                key: 'status_index',

                label: '[ By Status ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (link, entry) => {

                        const value = getDerivedStatusValue(link, entry);

                        return value ? [value] : [];

                    }, {

                        normalizeKey: (value) => String(value || '').trim().toLowerCase(),

                        order: ['Reading', 'Plan to Read', 'Completed', 'On Hold', 'Dropped']

                    });

                }

            },

            {

                key: 'rating_index',

                label: '[ By Rating ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (link, entry) => {

                        const rating = getDerivedRatingValue(link, entry);

                        const bucket = getRatingBucketLabel(rating);

                        return bucket ? [bucket] : [];

                    }, {

                        order: ['9+', '8-8.9', '7-7.9', '5-6.9', 'Under 5']

                    });

                }

            },

            {

                key: 'confidence_index',

                label: '[ By Confidence ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (_, entry) => {

                        const confidence = getDerivedConfidenceValue(entry);

                        const bucket = getConfidenceBucketLabel(confidence);

                        return bucket ? [bucket] : [];

                    }, {

                        order: ['0.90+', '0.75-0.89', '0.50-0.74', 'Below 0.50']

                    });

                }

            },

            {

                key: 'title_index',

                label: '[ By Title ]',

                buildBuckets(links) {

                    return buildTitleBucketsForLinks(links);

                }

            },

            {

                key: 'last_read_index',

                label: '[ By Last Read ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (link) => {

                        const bucket = getDerivedTimelineBucket(link);

                        return bucket ? [bucket] : [];

                    }, {

                        order: ['Today', 'This Week', 'This Month', 'This Year', 'Older']

                    });

                }

            },

            {

                key: 'progress_index',

                label: '[ By Progress Units ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (_, entry) => {

                        const progress = getDerivedProgressValue(entry);

                        const bucket = getProgressBucketLabel(progress);

                        return bucket ? [bucket] : [];

                    }, {

                        order: ['500+ Units', '200-499 Units', '100-199 Units', '50-99 Units', '10-49 Units', 'Under 10 Units']

                    });

                }

            },

            {

                key: 'demographic_index',

                label: '[ By Demographic ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (_, entry) => {

                        const value = getDerivedDemographicValue(entry);

                        return value ? [value] : [];

                    }, {

                        normalizeKey: (value) => String(value || '').trim().toLowerCase()

                    });

                }

            },

            {

                key: 'publication_index',

                label: '[ By Publication Era ]',

                buildBuckets(links) {

                    return buildBucketsFromExtractor(links, (_, entry) => {

                        const year = getDerivedPublicationValue(entry);

                        const bucket = getPublicationBucketLabel(year);

                        return bucket ? [bucket] : [];

                    });

                }

            }

        ];



        function buildDomainBuckets(links) {

            const domainMap = new Map();

            (Array.isArray(links) ? links : []).forEach((link) => {

                try {

                    const domain = new URL(String(link?.url || ''), window.location.origin).hostname.toLowerCase().replace(/^www\./, '');

                    if (!domain || !domain.includes('.')) return;

                    if (!domainMap.has(domain)) domainMap.set(domain, []);

                    domainMap.get(domain).push(link);

                } catch (error) {}

            });

            return sortBuckets(Array.from(domainMap.entries()).map(([domain, bucketLinks]) => ({

                key: domain,

                label: domain.toUpperCase(),

                links: bucketLinks

            })));

        }



        function buildLargeFolderScopeLinks(links) {

            const realNodeMap = buildNodeMap(scopedNodes.filter((node) => !node?.isGhost));

            const counts = new Map();

            const groupedLinks = new Map();



            (Array.isArray(links) ? links : []).forEach((link) => {

                const folderId = normalizeFolderId(link?.folderId);

                if (!folderId || !realNodeMap.has(folderId)) return;

                counts.set(folderId, (counts.get(folderId) || 0) + 1);

                if (!groupedLinks.has(folderId)) groupedLinks.set(folderId, []);

                groupedLinks.get(folderId).push(link);

            });



            const largeLinks = [];

            groupedLinks.forEach((bucketLinks, folderId) => {

                if ((counts.get(folderId) || 0) > 15) {

                    largeLinks.push(...bucketLinks);

                }

            });



            return largeLinks;

        }



        function buildMaintenanceGhostBuckets(links) {

            return [

                { key: 'unlinked', label: '[ Unlinked Bookmarks ]', links: links.filter((link) => unlinkedLinks.includes(link)) },

                { key: 'missing_covers', label: '[ Missing Covers ]', links: links.filter((link) => !hasMeaningfulCover(workspaceId, categoryName, link)) },

                { key: 'missing_icons', label: '[ Missing Icons ]', links: links.filter((link) => !hasMeaningfulIcon(link)) },

                { key: 'untagged', label: '[ Untagged ]', links: links.filter((link) => {

                    if (hasBookmarkTags(link)) return false;

                    const entry = getCachedEntry(link);

                    return !(entry && hasLibraryTaxonomy(entry));

                }) },

                { key: 'no_title', label: '[ No Title ]', links: links.filter((link) => {

                    const title = String(link?.title || '').trim().toLowerCase();

                    return !title || title === 'untitled' || title === String(link?.url || '').trim().toLowerCase();

                }) },

                { key: 'needs_review', label: '[ Needs Review ]', links: links.filter((link) => {

                    const entry = getCachedEntry(link);

                    if (!entry) return false;

                    const confidence = getDerivedConfidenceValue(entry);

                    return (Number.isFinite(confidence) && confidence < 0.5)

                        || !Number.isFinite(getDerivedRatingValue(link, entry));

                }) },

                { key: 'missing_notes', label: '[ Missing Notes ]', links: links.filter((link) => {

                    const entry = getCachedEntry(link);

                    if (!entry) return false;

                    const hasBookmarkNote = typeof link?.notes === 'string' && link.notes.trim().length > 0;

                    if (hasBookmarkNote) return false;

                    return ![entry.summary, entry.notes, entry.description].some((value) => {

                        if (typeof value !== 'string') return false;

                        const trimmed = value.trim();

                        if (!trimmed) return false;

                        if (isAutoSourceSummary(trimmed)) return false;

                        return true;

                    });

                }) },

                { key: 'broken_links', label: '[ Broken / Invalid Links ]', links: links.filter((link) => {

                    if (!link?.url || typeof link.url !== 'string') return true;

                    const normalized = link.url.trim().toLowerCase();

                    return normalized === '' || normalized === '#' || normalized.startsWith('javascript:');

                }) }

            ];

        }



        function buildReadingGhostBuckets(links) {

            return [

                { key: 'unread', label: '[ Plan to Read ]', links: links.filter((link) => {

                    const entry = getCachedEntry(link);

                    if (!entry) return false;

                    return entry?.progress === 0 || entry?.libraryStatus?.id === 'plan_to_read';

                }) },

                { key: 'reading', label: '[ Actively Reading ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'reading') },

                { key: 'completed', label: '[ Completed ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'completed') },

                { key: 'on_hold', label: '[ On Hold ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'on_hold') },

                { key: 'dropped', label: '[ Dropped ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'dropped') }

            ];

        }



        function buildActivityGhostBuckets(links) {

            return [

                { key: 'recent', label: '[ Recently Updated ]', links: links.filter((link) => {

                    if (!link?.updatedAt) return false;

                    return Number(new Date(link.updatedAt).getTime()) >= recentTime;

                }) },

                { key: 'recently_visited', label: '[ Recently Visited ]', links: links.filter((link) => {

                    const value = link?.lastVisited || link?.updatedAt || link?.createdAt || 0;

                    const ts = Number(new Date(value).getTime());

                    return Number.isFinite(ts) && ts > 0 && (nowMs - ts) < recentVisMs;

                }) },

                { key: 'stale', label: '[ Stale Bookmarks ]', links: links.filter((link) => {

                    const value = link?.lastVisited || link?.updatedAt || link?.createdAt || 0;

                    const ts = Number(new Date(value).getTime());

                    return Number.isFinite(ts) && ts > 0 && (nowMs - ts) > staleMs;

                }) }

            ];

        }



        function buildInsightsGhostBuckets(links) {

            const duplicateCounts = {};

            links.forEach((link) => {

                const normalized = getNormalizedDuplicateUrl(link);

                if (!normalized) return;

                duplicateCounts[normalized] = (duplicateCounts[normalized] || 0) + 1;

            });



            const largeFolderLinks = buildLargeFolderScopeLinks(links);



            return [

                { key: 'top_rated', label: '[ Top Rated ]', links: links.filter((link) => {

                    const rating = getDerivedRatingValue(link, getCachedEntry(link));

                    return Number.isFinite(rating) && rating >= 8;

                }) },

                { key: 'duplicate_suspects', label: '[ Duplicate Suspects ]', links: links.filter((link) => {

                    const normalized = getNormalizedDuplicateUrl(link);

                    return !!normalized && duplicateCounts[normalized] > 1;

                }) },

                { key: 'ancients', label: '[ The Ancients ]', links: links.filter((link) => {

                    const createdAt = Number(new Date(link?.createdAt).getTime());

                    return Number.isFinite(createdAt) && createdAt > 0 && (nowMs - createdAt) > ancientsMs;

                }) },

                { key: 'large_folders', label: '[ Large Folders (>15) ]', links: largeFolderLinks }

            ];

        }



        function buildLinkHealthGhostBuckets(links) {

            if (!window.EveSemanticDrift) return [];

            return [

                { key: 'dead_links', label: '[ Dead Links ]', links: links.filter((link) => window.EveSemanticDrift.getHealthInfo(link.url)?.status === 'dead') },

                { key: 'redirected_links', label: '[ Redirected Links ]', links: links.filter((link) => window.EveSemanticDrift.getHealthInfo(link.url)?.status === 'redirected') },

                { key: 'title_drift', label: '[ Title Drift ]', links: links.filter((link) => !!window.EveSemanticDrift.getHealthInfo(link.url)?.hasTitleDrift) },

                { key: 'orphaned_lib', label: '[ Orphaned Library Entries ]', links: links.filter((link) => {

                    const entry = getCachedEntry(link);

                    const health = window.EveSemanticDrift.getHealthInfo(link.url);

                    return !!entry && health?.status === 'dead';

                }) }

            ];

        }



        const recursiveGhostGroupDefinitions = [

            { key: 'linkHealth', label: '[ Link Health ]', enabledKey: null, relatedDimensions: ['linkHealth'], buildBuckets: buildLinkHealthGhostBuckets },

            { key: 'domains', label: '[ Domains ]', enabledKey: 'domain_grouping', buildBuckets(links) {

                return buildDomainBuckets(links).map((bucket) => ({ key: bucket.key, label: `[ ${bucket.label} ]`, links: bucket.links }));

            }, relatedDimensions: ['domains'] },

            { key: 'readingStatus', label: '[ Reading Status ]', enabledKey: null, relatedDimensions: ['readingStatus', 'status_index'], suppressIfRelatedDimensionPresent: true, buildBuckets: buildReadingGhostBuckets },

            { key: 'maintenance', label: '[ Maintenance ]', enabledKey: null, relatedDimensions: ['maintenance'], buildBuckets: buildMaintenanceGhostBuckets },

            { key: 'activity', label: '[ Activity ]', enabledKey: null, relatedDimensions: ['activity'], buildBuckets: buildActivityGhostBuckets },

            { key: 'insights', label: '[ Insights ]', enabledKey: null, relatedDimensions: ['insights'], buildBuckets: buildInsightsGhostBuckets }

        ];



        // ----------------------------------------------------

        // --- GHOST HIERARCHY BUILDER ---

        // ----------------------------------------------------

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



        function addGhost(catKey, id, name, linksArray, enabledKey, bucketKey) {

            if (linksArray.length > 0 && isGhostEnabled(enabledKey)) {

                activeSubGhosts.push({

                    id: id,

                    name: name,

                    parentId: ghostCategories[catKey].id,

                    isGhost: true,

                    isGhostDerivedValue: false,

                    isGhostDerivedGroup: false,

                    _ghostLinks: linksArray,

                    _ghostScopeRootId: activeRealFolderId || null

                });

                ghostCategories[catKey]._hasActiveChildren = true;

                rootRecursiveTasks.push({

                    id,

                    links: linksArray,

                    chain: [{

                        dimension: catKey,

                        valueKey: String(bucketKey || id || name || '').trim().toLowerCase(),

                        label: name

                    }]

                });

            }

        }



        function buildDerivedGhostId(prefix, parts) {

            return `__ghost_${prefix}_${parts.map((part) => String(part || '').replace(/[^a-zA-Z0-9]+/g, '_')).join('_')}__`;

        }



        function filterDerivedBuckets(definition, links, chain) {

            const usedValues = new Set(

                (Array.isArray(chain) ? chain : [])

                    .filter((item) => item?.dimension === definition.key)

                    .map((item) => String(item.valueKey || '').trim().toLowerCase())

                    .filter(Boolean)

            );



            const buckets = definition.buildBuckets(links)

                .filter((bucket) => {

                    const bucketKey = String(bucket?.key || '').trim().toLowerCase();

                    if (!bucketKey) return false;

                    if (usedValues.has(bucketKey)) return false;

                    return Array.isArray(bucket?.links) && bucket.links.length > 0;

                });



            return buckets.slice(0, derivedValueLimit);

        }



        function addRecursiveGhostGroups(parentId, links, chain, depth) {

            if (!Array.isArray(links) || links.length < 1) return;

            if (depth >= derivedDepthLimit) return;

            if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;



            const pendingRecursions = [];



            recursiveGhostGroupDefinitions.forEach((definition) => {

                if (definition.enabledKey && !isGhostEnabled(definition.enabledKey)) return;

                if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;



                const usedValueKeys = new Set(

                    (Array.isArray(chain) ? chain : [])

                        .filter((item) => item?.dimension === definition.key)

                        .map((item) => String(item.valueKey || '').trim().toLowerCase())

                        .filter(Boolean)

                );

                const relatedDimensions = Array.isArray(definition.relatedDimensions) && definition.relatedDimensions.length

                    ? definition.relatedDimensions

                    : [definition.key];

                const hasMatchingDimension = (Array.isArray(chain) ? chain : []).some((item) => relatedDimensions.includes(item?.dimension));

                if (definition.suppressIfRelatedDimensionPresent && hasMatchingDimension) return;



                const buckets = (definition.buildBuckets(links) || [])

                    .filter((bucket) => {

                        const key = String(bucket?.key || '').trim().toLowerCase();

                        if (!key) return false;

                        if (usedValueKeys.has(key)) return false;

                        return Array.isArray(bucket?.links) && bucket.links.length > 0;

                    })

                    .slice(0, derivedValueLimit);



                if (!buckets.length) return;



                const groupId = buildDerivedGhostId('group', [parentId, definition.key, depth]);

                activeSubGhosts.push({

                    id: groupId,

                    name: definition.label,

                    parentId,

                    isGhost: true,

                    isGhostDerivedGroup: true,

                    isGhostDerivedValue: false,

                    _ghostLinks: [],

                    _ghostFilterChain: Array.isArray(chain) ? chain.slice() : [],

                    _ghostScopeCount: links.length,

                    _ghostScopeRootId: activeRealFolderId || null

                });

                derivedGhostNodeBudget.count += 1;



                buckets.forEach((bucket, bucketIndex) => {

                    if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;

                    const nextChain = [

                        ...(Array.isArray(chain) ? chain : []),

                        {

                            dimension: definition.key,

                            valueKey: String(bucket.key || '').trim().toLowerCase(),

                            label: bucket.label

                        }

                    ];

                    const valueId = buildDerivedGhostId('value', [parentId, definition.key, depth, bucketIndex, bucket.key]);

                    activeSubGhosts.push({

                        id: valueId,

                        name: bucket.label,

                        parentId: groupId,

                        isGhost: true,

                        isGhostDerivedGroup: false,

                        isGhostDerivedValue: true,

                        _ghostLinks: bucket.links,

                        _ghostFilterChain: nextChain,

                        _ghostScopeCount: bucket.links.length,

                        _ghostScopeRootId: activeRealFolderId || null

                    });

                    derivedGhostNodeBudget.count += 1;

                    pendingRecursions.push({ id: valueId, links: bucket.links, chain: nextChain });

                });

            });



            return pendingRecursions;

        }



        function addDerivedChildren(parentId, links, chain, depth) {

            if (!Array.isArray(links) || links.length < 1) return;

            if (depth >= derivedDepthLimit) return;

            if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;



            const pendingRecursions = [];



            derivedDimensionDefinitions.forEach((definition) => {

                if (!isGhostEnabled(definition.key)) return;

                if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;



                const buckets = filterDerivedBuckets(definition, links, chain);

                if (!buckets.length) return;



                const groupId = buildDerivedGhostId('index_group', [parentId, definition.key, depth]);

                activeSubGhosts.push({

                    id: groupId,

                    name: definition.label,

                    parentId,

                    isGhost: true,

                    isGhostDerivedGroup: true,

                    isGhostDerivedValue: false,

                    _ghostLinks: [],

                    _ghostFilterChain: Array.isArray(chain) ? chain.slice() : [],

                    _ghostScopeCount: links.length,

                    _ghostScopeRootId: activeRealFolderId || null

                });

                derivedGhostNodeBudget.count += 1;

                ghostCategories.indexes._hasActiveChildren = true;



                buckets.forEach((bucket, bucketIndex) => {

                    if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;

                    const nextChain = [

                        ...(Array.isArray(chain) ? chain : []),

                        {

                            dimension: definition.key,

                            valueKey: String(bucket.key || '').trim().toLowerCase(),

                            label: bucket.label

                        }

                    ];

                    const valueId = buildDerivedGhostId('index_value', [parentId, definition.key, depth, bucketIndex, bucket.key]);

                    activeSubGhosts.push({

                        id: valueId,

                        name: `[ ${bucket.label} ]`,

                        parentId: groupId,

                        isGhost: true,

                        isGhostDerivedGroup: false,

                        isGhostDerivedValue: true,

                        _ghostLinks: bucket.links,

                        _ghostFilterChain: nextChain,

                        _ghostScopeCount: bucket.links.length,

                        _ghostScopeRootId: activeRealFolderId || null

                    });

                    derivedGhostNodeBudget.count += 1;

                    pendingRecursions.push({ id: valueId, links: bucket.links, chain: nextChain });

                });

            });



            return pendingRecursions;

        }



        function expandDerivedScopesBreadthFirst(initialTasks) {

            const seedQueue = Array.isArray(initialTasks) ? initialTasks.slice() : [];

            const deepQueue = [];



            function pushTask(task) {

                if (!task || !Array.isArray(task.links) || task.links.length < 1) return;

                if ((Number(task.depth || 0)) <= 1) {

                    seedQueue.push(task);

                } else {

                    deepQueue.push(task);

                }

            }



            while ((seedQueue.length > 0 || deepQueue.length > 0) && derivedGhostNodeBudget.count < derivedGhostNodeBudget.max) {

                let task = null;

                if (seedQueue.length > 0) {

                    seedQueue.sort((left, right) => {

                        const leftScore = getPreferredChainScore(left?.chain);

                        const rightScore = getPreferredChainScore(right?.chain);

                        if (leftScore !== rightScore) return rightScore - leftScore;



                        const leftDepth = Number(left?.depth || 0);

                        const rightDepth = Number(right?.depth || 0);

                        if (leftDepth !== rightDepth) return leftDepth - rightDepth;



                        const leftCount = Array.isArray(left?.links) ? left.links.length : Number.MAX_SAFE_INTEGER;

                        const rightCount = Array.isArray(right?.links) ? right.links.length : Number.MAX_SAFE_INTEGER;

                        if (leftCount !== rightCount) return leftCount - rightCount;



                        return String(left?.id || '').localeCompare(String(right?.id || ''));

                    });

                    task = seedQueue.shift();

                } else {

                    deepQueue.sort((left, right) => {

                        const leftScore = getPreferredChainScore(left?.chain);

                        const rightScore = getPreferredChainScore(right?.chain);

                        if (leftScore !== rightScore) return rightScore - leftScore;



                        const leftDepth = Number(left?.depth || 0);

                        const rightDepth = Number(right?.depth || 0);

                        if (leftDepth !== rightDepth) return rightDepth - leftDepth;



                        const leftCount = Array.isArray(left?.links) ? left.links.length : Number.MAX_SAFE_INTEGER;

                        const rightCount = Array.isArray(right?.links) ? right.links.length : Number.MAX_SAFE_INTEGER;

                        if (leftCount !== rightCount) return leftCount - rightCount;



                        return String(left?.id || '').localeCompare(String(right?.id || ''));

                    });

                    task = deepQueue.shift();

                }



                if (!task || !Array.isArray(task.links) || task.links.length < 1) continue;

                if (task.depth >= derivedDepthLimit) continue;



                const derivedTasks = addDerivedChildren(task.id, task.links, task.chain, task.depth) || [];

                const shouldAddRecursiveGroups = !(

                    task.depth === 0

                    && String(task.id || '') === String(ghostCategories.indexes.id)

                    && (!Array.isArray(task.chain) || task.chain.length === 0)

                );

                const recursiveTasks = shouldAddRecursiveGroups

                    ? (addRecursiveGhostGroups(task.id, task.links, task.chain, task.depth) || [])

                    : [];



                derivedTasks.forEach((childTask) => {

                    pushTask({

                        id: childTask.id,

                        links: childTask.links,

                        chain: childTask.chain,

                        depth: task.depth + 1

                    });

                });

                recursiveTasks.forEach((childTask) => {

                    pushTask({

                        id: childTask.id,

                        links: childTask.links,

                        chain: childTask.chain,

                        depth: task.depth + 1

                    });

                });

            }

        }



        // Link Health

        addGhost('linkHealth', '__ghost_dead_links__', '[ Dead Links ]', deadLinks, 'dead_links', 'dead_links');

        addGhost('linkHealth', '__ghost_redirected_links__', '[ Redirected Links ]', redirectedLinks, 'redirected_links', 'redirected_links');

        addGhost('linkHealth', '__ghost_title_drift__', '[ Title Drift ]', titleDriftLinks, 'title_drift', 'title_drift');

        addGhost('linkHealth', '__ghost_orphaned_lib__', '[ Orphaned Library Entries ]', orphanedLibEntries, 'orphaned_lib', 'orphaned_lib');



        // Domains

        domainGhosts.forEach(dg => {

            const id = `__ghost_domain_${dg.domain.replace(/[^a-zA-Z0-9]/g, '_')}__`;

            const name = `[ ${dg.domain.toUpperCase()} ]`;

            addGhost('domains', id, name, dg.links, 'domain_grouping', dg.domain);

        });



        // Reading Status

        addGhost('readingStatus', '__ghost_unread__', '[ Plan to Read ]', unreadLinks, 'unread', 'unread');

        addGhost('readingStatus', '__ghost_reading__', '[ Actively Reading ]', readingLinks, 'reading', 'reading');

        addGhost('readingStatus', '__ghost_completed__', '[ Completed ]', completedLinks, 'completed', 'completed');

        addGhost('readingStatus', '__ghost_on_hold__', '[ On Hold ]', onHoldLinks, 'on_hold', 'on_hold');

        addGhost('readingStatus', '__ghost_dropped__', '[ Dropped ]', droppedLinks, 'dropped', 'dropped');



        // Maintenance

        addGhost('maintenance', '__ghost_unlinked__', '[ Unlinked Bookmarks ]', unlinkedLinks, 'unlinked', 'unlinked');

        addGhost('maintenance', '__ghost_missing_covers__', '[ Missing Covers ]', missingCovers, 'missing_covers', 'missing_covers');

        addGhost('maintenance', '__ghost_missing_icons__', '[ Missing Icons ]', missingIcons, 'missing_icons', 'missing_icons');

        addGhost('maintenance', '__ghost_untagged__', '[ Untagged ]', untaggedLinks, 'untagged', 'untagged');

        addGhost('maintenance', '__ghost_no_title__', '[ No Title ]', noTitleLinks, 'no_title', 'no_title');

        addGhost('maintenance', '__ghost_needs_review__', '[ Needs Review ]', needsReviewLinks, 'needs_review', 'needs_review');

        addGhost('maintenance', '__ghost_missing_notes__', '[ Missing Notes ]', missingNotesLinks, 'missing_notes', 'missing_notes');

        addGhost('maintenance', '__ghost_broken_links__', '[ Broken / Invalid Links ]', brokenLinks, 'broken_links', 'broken_links');



        // Activity

        addGhost('activity', '__ghost_recent__', '[ Recently Updated ]', recentLinks, 'recent', 'recent');

        addGhost('activity', '__ghost_recently_visited__', '[ Recently Visited ]', recentlyVisited, 'recently_visited', 'recently_visited');

        addGhost('activity', '__ghost_stale__', '[ Stale Bookmarks ]', staleLinks, 'stale', 'stale');



        // Insights

        addGhost('insights', '__ghost_top_rated__', '[ Top Rated ]', topRatedLinks, 'top_rated', 'top_rated');

        addGhost('insights', '__ghost_duplicate_suspects__', '[ Duplicate Suspects ]', duplicateSuspects, 'duplicate_suspects', 'duplicate_suspects');

        addGhost('insights', '__ghost_ancients__', '[ The Ancients ]', ancientsLinks, 'ancients', 'ancients');

        addGhost('insights', '__ghost_large_folders__', '[ Large Folders (>15) ]', buildLargeFolderScopeLinks(activeLinks), 'large_folders', 'large_folders');



        // Library Stats

        topGenres.forEach(tg => {

            const id = `__ghost_genre_${tg.genre.replace(/[^a-zA-Z0-9]/g, '_')}__`;

            const name = `[ Genre: ${tg.genre} ]`;

            addGhost('insights', id, name, tg.links, 'library_stats', tg.genre);

        });



        const derivedExpansionRoots = [];

        if (derivedDimensionDefinitions.some((definition) => isGhostEnabled(definition.key))) {

            derivedExpansionRoots.push({

                id: ghostCategories.indexes.id,

                links: activeLinks,

                chain: [],

                depth: 0

            });

        }



        rootRecursiveTasks.forEach((task) => {

            derivedExpansionRoots.push({

                id: task.id,

                links: task.links,

                chain: task.chain,

                depth: 1

            });

        });



        expandDerivedScopesBreadthFirst(derivedExpansionRoots);



        let anyMasterEnabled = false;

        Object.values(ghostCategories).forEach(cat => {

            if (cat._hasActiveChildren) {

                anyMasterEnabled = true;

                ghostFolders.push({

                    id: cat.id,

                    name: cat.name,

                    parentId: masterGhostId,

                    isGhost: true,

                    _ghostLinks: [],

                    _ghostScopeRootId: activeRealFolderId || null

                });

            }

        });



        if (anyMasterEnabled) {

            ghostFolders.unshift({

                id: masterGhostId,

                name: '[ System Views ]',

                parentId: activeRealFolderId || null,

                isGhost: true,

                isMasterGhost: true,

                _ghostLinks: [],

                _ghostScopeRootId: activeRealFolderId || null

            });

            ghostFolders.push(...activeSubGhosts);

        }



        scopedNodes = [...ghostFolders, ...scopedNodes];

        // --- End Ghost Folders ---



        const nodeMap = buildNodeMap(scopedNodes);

        const childrenMap = buildChildrenMap(scopedNodes);

        const folderLinks = new Map();

        const rootLinks = [];



        // Pre-fill ghost folder links

        ghostFolders.forEach(gf => {

            folderLinks.set(gf.id, gf._ghostLinks);

        });



        activeLinks.forEach((link) => {

            const folderId = normalizeFolderId(link?.folderId);

            if (folderId && nodeMap.has(folderId) && !nodeMap.get(folderId).isGhost) {

                if (!folderLinks.has(folderId)) folderLinks.set(folderId, []);

                folderLinks.get(folderId).push(link);

                return;

            }

            rootLinks.push(link);

        });



        return {

            nodes: scopedNodes,

            nodeMap,

            childrenMap,

            folderLinks,

            rootLinks,

            topLevelFolders: childrenMap.get(null) || []

        };

    }



    ns.buildFolderView = buildFolderView;

})(window.EveBookmarkFolders);

