window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const CLICK_BEHAVIOR_MODES = new Set(['inherit', 'invert', 'focus_only', 'open_and_focus', 'open_only']);
    const TASK_MODES = new Set(['inherit', 'task', 'non_task']);

    function getFolderStore() {
        if (window.eveState?.bookmarkFolders && typeof window.eveState.bookmarkFolders === 'object') {
            return window.eveState.bookmarkFolders;
        }
        if (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object') {
            return bookmarkFolders;
        }
        if (window.bookmarkFolders && typeof window.bookmarkFolders === 'object') {
            return window.bookmarkFolders;
        }
        return {};
    }

    function normalizeWorkspaceId(workspaceId) {
        const value = String(
            workspaceId
            || window.eveState?.config?.activeWorkspace
            || (typeof config !== 'undefined' ? config?.activeWorkspace : '')
            || 'main'
        ).trim();
        return value || 'main';
    }

    function normalizeCategoryName(categoryName) {
        return String(categoryName || '').trim() || 'Unsorted';
    }

    function normalizeFolderId(folderId) {
        return String(folderId || '').trim();
    }

    function normalizeParentId(parentId) {
        const normalized = normalizeFolderId(parentId);
        return normalized || null;
    }

    function normalizeClickBehaviorMode(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return CLICK_BEHAVIOR_MODES.has(normalized) ? normalized : 'inherit';
    }

    function normalizeTaskMode(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return TASK_MODES.has(normalized) ? normalized : 'inherit';
    }

    function normalizeTreeSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        return {
            clickBehaviorMode: normalizeClickBehaviorMode(source.clickBehaviorMode)
        };
    }

    function buildScopedKey(workspaceId, categoryName) {
        return `${normalizeWorkspaceId(workspaceId)}::${normalizeCategoryName(categoryName)}`;
    }

    function getToolbarConfigStore() {
        if (!window.eveState?.config) return [];
        if (!Array.isArray(window.eveState.config.bookmarkFolderToolbarExpanded)) {
            window.eveState.config.bookmarkFolderToolbarExpanded = [];
        }
        return window.eveState.config.bookmarkFolderToolbarExpanded;
    }

    function getScopedTreeByKey(scopedKey) {
        const store = getFolderStore();
        const rawTree = store[scopedKey] || {};
        return {
            nodes: dedupeNodes(rawTree?.nodes || []),
            settings: normalizeTreeSettings(rawTree?.settings)
        };
    }

    function getScopedTree(workspaceId, categoryName) {
        return getScopedTreeByKey(buildScopedKey(workspaceId, categoryName));
    }

    function normalizeNode(node, index) {
        const normalizedId = normalizeFolderId(node?.id);
        if (!normalizedId) return null;
        return {
            id: normalizedId,
            parentId: normalizeParentId(node?.parentId),
            name: String(node?.name || 'Folder').trim() || 'Folder',
            order: Number.isFinite(Number(node?.order)) ? Number(node.order) : index,
            createdAt: Number.isFinite(Number(node?.createdAt)) ? Number(node.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(node?.updatedAt)) ? Number(node.updatedAt) : Date.now(),
            clickBehaviorMode: normalizeClickBehaviorMode(node?.clickBehaviorMode),
            taskMode: normalizeTaskMode(node?.taskMode)
        };
    }

    function dedupeNodes(nodes) {
        const seen = new Set();
        return (Array.isArray(nodes) ? nodes : [])
            .map((node, index) => normalizeNode(node, index))
            .filter((node) => {
                if (!node || seen.has(node.id)) return false;
                seen.add(node.id);
                return true;
            });
    }

    function treeHasMeaningfulState(tree) {
        const settings = normalizeTreeSettings(tree?.settings);
        const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
        return nodes.length > 0 || settings.clickBehaviorMode !== 'inherit';
    }

    function getScopedNodes(workspaceId, categoryName) {
        return dedupeNodes(getScopedTree(workspaceId, categoryName)?.nodes || []);
    }

    function cloneStore() {
        const store = getFolderStore();
        const nextStore = {};
        Object.keys(store || {}).forEach((key) => {
            const normalizedTree = getScopedTreeByKey(key);
            if (!treeHasMeaningfulState(normalizedTree)) return;
            nextStore[key] = {
                nodes: normalizedTree.nodes,
                settings: normalizedTree.settings
            };
        });
        return nextStore;
    }

    function writeStore(nextStore, persist = true) {
        // Ensure all global refs point to the same object
        window.bookmarkFolders = nextStore;
        if (typeof bookmarkFolders !== 'undefined') {
            bookmarkFolders = nextStore;
        }
        if (window.eveState) {
            window.eveState.bookmarkFolders = nextStore;
        }

        if (persist && typeof saveData === 'function') {
            saveData();
        }
    }

    function setScopedTree(workspaceId, categoryName, tree, options = {}) {
        const persist = options.persist !== false;
        const normalizedNodes = dedupeNodes(tree?.nodes || []);
        const normalizedSettings = normalizeTreeSettings(tree?.settings);
        const nextStore = cloneStore();
        const scopedKey = buildScopedKey(workspaceId, categoryName);
        if (normalizedNodes.length > 0 || normalizedSettings.clickBehaviorMode !== 'inherit') {
            nextStore[scopedKey] = {
                nodes: normalizedNodes,
                settings: normalizedSettings
            };
        } else {
            delete nextStore[scopedKey];
        }
        writeStore(nextStore, persist);
        return nextStore[scopedKey] || { nodes: [], settings: normalizeTreeSettings({}) };
    }

    function setScopedNodes(workspaceId, categoryName, nodes, options = {}) {
        const currentTree = getScopedTree(workspaceId, categoryName);
        const nextTree = setScopedTree(workspaceId, categoryName, {
            nodes,
            settings: currentTree.settings
        }, options);
        return nextTree.nodes;
    }

    function buildNodeMap(nodes) {
        const map = new Map();
        dedupeNodes(nodes).forEach((node) => map.set(node.id, node));
        return map;
    }

    function buildChildrenMap(nodes) {
        const map = new Map();
        dedupeNodes(nodes).forEach((node) => {
            const parentId = normalizeParentId(node.parentId);
            if (!map.has(parentId)) map.set(parentId, []);
            map.get(parentId).push(node);
        });
        map.forEach((siblings) => {
            siblings.sort((a, b) => {
                const orderDiff = (Number(a.order) || 0) - (Number(b.order) || 0);
                if (orderDiff !== 0) return orderDiff;
                return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
            });
        });
        return map;
    }

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

    function uniqueNonEmpty(values) {
        const seen = new Set();
        return (Array.isArray(values) ? values : [])
            .map((value) => String(value || '').trim())
            .filter((value) => {
                if (!value) return false;
                const key = value.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function splitLibraryFieldValues(value) {
        if (Array.isArray(value)) return uniqueNonEmpty(value);
        return uniqueNonEmpty(String(value || '').split(/[|,;/]/g));
    }

    function normalizeLanguageLabel(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const lower = raw.toLowerCase();
        if (/^(english|en|eng)$/.test(lower)) return 'EN';
        if (/^(japanese|ja|jp|jpn)$/.test(lower)) return 'JA';
        if (/^(korean|ko|kr|kor)$/.test(lower)) return 'KO';
        if (/^(chinese|zh|cn|zho)$/.test(lower)) return 'ZH';
        if (/^[a-z]{2,3}$/.test(lower)) return lower.toUpperCase();
        return raw
            .split(/\s+/)
            .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : '')
            .join(' ')
            .trim();
    }

    function normalizeStatusLabel(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const lower = raw.toLowerCase();
        const map = {
            plan_to_read: 'Plan to Read',
            unread: 'Plan to Read',
            reading: 'Reading',
            in_progress: 'Reading',
            ongoing: 'Reading',
            completed: 'Completed',
            finished: 'Completed',
            on_hold: 'On Hold',
            paused: 'On Hold',
            dropped: 'Dropped'
        };
        if (map[lower]) return map[lower];
        return raw
            .replace(/[_-]+/g, ' ')
            .split(/\s+/)
            .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : '')
            .join(' ')
            .trim();
    }

    function getDerivedTagValues(link, entry) {
        return uniqueNonEmpty([
            ...(Array.isArray(link?.tags) ? link.tags : []),
            ...splitLibraryFieldValues(entry?.tags)
        ]);
    }

    function getDerivedGenreValues(entry) {
        return uniqueNonEmpty([
            ...splitLibraryFieldValues(entry?.genre),
            ...splitLibraryFieldValues(entry?.genres)
        ]);
    }

    function getDerivedAuthorValues(entry) {
        return uniqueNonEmpty([
            ...splitLibraryFieldValues(entry?.author),
            ...splitLibraryFieldValues(entry?.authors),
            ...splitLibraryFieldValues(entry?.authorAltNames),
            ...splitLibraryFieldValues(entry?.writer)
        ]);
    }

    function getDerivedLanguageValues(link, entry) {
        const values = uniqueNonEmpty([
            ...splitLibraryFieldValues(link?.language),
            ...splitLibraryFieldValues(entry?.language),
            ...splitLibraryFieldValues(entry?.languages),
            ...splitLibraryFieldValues(entry?.originalLanguage)
        ]);
        return uniqueNonEmpty(values.map((value) => normalizeLanguageLabel(value)));
    }

    function getDerivedStatusValue(link, entry) {
        const libraryStatus = entry?.libraryStatus;
        const raw = libraryStatus?.label || libraryStatus?.name || libraryStatus?.id || entry?.status || link?.status || '';
        const normalized = normalizeStatusLabel(raw);
        return normalized || null;
    }

    function getDerivedRatingValue(link, entry) {
        const candidates = [
            entry?.derivedRatings?.activeValue,
            entry?.derivedRatings?.unified,
            entry?.derivedRatings?.selectedRating10,
            entry?.derivedRatings?.hybrid10,
            entry?.apiRating,
            entry?.personalRating,
            entry?.rating,
            link?.rating,
            link?.priority === 'high' ? 8 : null
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric;
            }
        }
        return null;
    }

    function getDerivedConfidenceValue(entry) {
        const candidates = [
            entry?.derivedRatings?.confidence,
            entry?.confidence
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric)) {
                if (numeric <= 1) return numeric;
                return Math.max(0, Math.min(1, numeric / 10));
            }
        }
        return null;
    }

    function getRatingBucketLabel(value) {
        if (!Number.isFinite(value)) return '';
        if (value >= 9) return '9+';
        if (value >= 8) return '8-8.9';
        if (value >= 7) return '7-7.9';
        if (value >= 5) return '5-6.9';
        return 'Under 5';
    }

    function getConfidenceBucketLabel(value) {
        if (!Number.isFinite(value)) return '';
        if (value >= 0.9) return '0.90+';
        if (value >= 0.75) return '0.75-0.89';
        if (value >= 0.5) return '0.50-0.74';
        if (value > 0) return 'Below 0.50';
        return '';
    }

    function getDerivedProgressValue(entry) {
        const candidates = [
            entry?.chapter,
            entry?.graphicChapter,
            entry?.novelChapter,
            entry?.episode,
            entry?.chapterTotal,
            entry?.chapters,
            entry?.episodeTotal,
            entry?.episodes
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric) && numeric > 0) return numeric;
        }
        return null;
    }

    function getProgressBucketLabel(value) {
        if (!Number.isFinite(value)) return '';
        if (value >= 500) return '500+ Units';
        if (value >= 200) return '200-499 Units';
        if (value >= 100) return '100-199 Units';
        if (value >= 50) return '50-99 Units';
        if (value >= 10) return '10-49 Units';
        return 'Under 10 Units';
    }

    function getDerivedDemographicValue(entry) {
        const values = uniqueNonEmpty([
            ...splitLibraryFieldValues(entry?.demographic),
            ...splitLibraryFieldValues(entry?.demographics),
            ...splitLibraryFieldValues(entry?.audience)
        ]);
        return values[0] || null;
    }

    function getDerivedPublicationValue(entry) {
        const candidates = [
            entry?.publicationYear,
            entry?.year,
            entry?.releaseYear,
            entry?.publishedYear,
            entry?.startYear
        ];
        for (let i = 0; i < candidates.length; i += 1) {
            const numeric = Number(candidates[i]);
            if (Number.isFinite(numeric) && numeric >= 1900 && numeric <= 2100) {
                return Math.floor(numeric);
            }
        }
        const textCandidates = [entry?.releaseDate, entry?.publishedAt, entry?.dateAdded];
        for (let i = 0; i < textCandidates.length; i += 1) {
            const date = new Date(textCandidates[i]);
            const year = Number(date.getUTCFullYear());
            if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
                return year;
            }
        }
        return null;
    }

    function getPublicationBucketLabel(value) {
        if (!Number.isFinite(value)) return '';
        return `${Math.floor(value / 10) * 10}s`;
    }

    function getTitleInitial(title) {
        const normalized = String(title || '').trim();
        if (!normalized) return '#';
        const first = normalized.charAt(0).toUpperCase();
        if (/[A-Z]/.test(first)) return first;
        if (/[0-9]/.test(first)) return '0-9';
        return '#';
    }

    function getCoarseTitleBucket(initial) {
        if (initial === '0-9' || initial === '#') return initial;
        const code = initial.charCodeAt(0);
        if (code <= 67) return 'A-C';
        if (code <= 70) return 'D-F';
        if (code <= 73) return 'G-I';
        if (code <= 76) return 'J-L';
        if (code <= 79) return 'M-O';
        if (code <= 82) return 'P-R';
        if (code <= 85) return 'S-U';
        return 'V-Z';
    }

    function getDerivedTimelineBucket(link) {
        const raw = link?.lastVisited || link?.updatedAt || link?.createdAt || 0;
        const timestamp = Number(new Date(raw).getTime());
        if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
        const age = Date.now() - timestamp;
        const day = 24 * 60 * 60 * 1000;
        if (age < day) return 'Today';
        if (age < 7 * day) return 'This Week';
        if (age < 30 * day) return 'This Month';
        if (age < 365 * day) return 'This Year';
        return 'Older';
    }

    function buildFolderView(workspaceId, categoryName, cardLinks) {
        let scopedNodes = getScopedNodes(workspaceId, categoryName);

        // --- Inject Ghost Folders ---
        const activeLinks = Array.isArray(cardLinks) ? cardLinks : [];
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

        const derivedGhostNodeBudget = {
            count: 0,
            max: Math.min(900, Math.max(360, activeLinks.length * 18))
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
                }) }
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
            { key: 'linkHealth', label: '[ Link Health ]', enabledKey: null, buildBuckets: buildLinkHealthGhostBuckets },
            { key: 'domains', label: '[ Domains ]', enabledKey: 'domain_grouping', buildBuckets(links) {
                return buildDomainBuckets(links).map((bucket) => ({ key: bucket.key, label: `[ ${bucket.label} ]`, links: bucket.links }));
            } },
            { key: 'readingStatus', label: '[ Reading Status ]', enabledKey: null, buildBuckets: buildReadingGhostBuckets },
            { key: 'maintenance', label: '[ Maintenance ]', enabledKey: null, buildBuckets: buildMaintenanceGhostBuckets },
            { key: 'activity', label: '[ Activity ]', enabledKey: null, buildBuckets: buildActivityGhostBuckets },
            { key: 'insights', label: '[ Insights ]', enabledKey: null, buildBuckets: buildInsightsGhostBuckets }
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

        function addGhost(catKey, id, name, linksArray, enabledKey) {
            if (linksArray.length > 0 && isGhostEnabled(enabledKey)) {
                activeSubGhosts.push({
                    id: id,
                    name: name,
                    parentId: ghostCategories[catKey].id,
                    isGhost: true,
                    isGhostDerivedValue: false,
                    isGhostDerivedGroup: false,
                    _ghostLinks: linksArray
                });
                ghostCategories[catKey]._hasActiveChildren = true;
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
            if (!Array.isArray(links) || links.length < 2) return;
            if (depth >= derivedDepthLimit) return;
            if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;

            recursiveGhostGroupDefinitions.forEach((definition) => {
                if (definition.enabledKey && !isGhostEnabled(definition.enabledKey)) return;
                if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;

                const usedValueKeys = new Set(
                    (Array.isArray(chain) ? chain : [])
                        .filter((item) => item?.dimension === definition.key)
                        .map((item) => String(item.valueKey || '').trim().toLowerCase())
                        .filter(Boolean)
                );

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
                    _ghostScopeCount: links.length
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
                        _ghostScopeCount: bucket.links.length
                    });
                    derivedGhostNodeBudget.count += 1;
                });
            });
        }

        function addDerivedChildren(parentId, links, chain, depth) {
            if (!Array.isArray(links) || links.length < 2) return;
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
                    _ghostScopeCount: links.length
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
                        _ghostScopeCount: bucket.links.length
                    });
                    derivedGhostNodeBudget.count += 1;
                    pendingRecursions.push({ id: valueId, links: bucket.links, chain: nextChain });
                });
            });

            pendingRecursions.forEach((task) => {
                if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;
                addRecursiveGhostGroups(task.id, task.links, task.chain, depth + 1);
                addDerivedChildren(task.id, task.links, task.chain, depth + 1);
            });
        }

        // Link Health
        addGhost('linkHealth', '__ghost_dead_links__', '[ Dead Links ]', deadLinks, 'dead_links');
        addGhost('linkHealth', '__ghost_redirected_links__', '[ Redirected Links ]', redirectedLinks, 'redirected_links');
        addGhost('linkHealth', '__ghost_title_drift__', '[ Title Drift ]', titleDriftLinks, 'title_drift');
        addGhost('linkHealth', '__ghost_orphaned_lib__', '[ Orphaned Library Entries ]', orphanedLibEntries, 'orphaned_lib');

        // Domains
        domainGhosts.forEach(dg => {
            const id = `__ghost_domain_${dg.domain.replace(/[^a-zA-Z0-9]/g, '_')}__`;
            const name = `[ ${dg.domain.toUpperCase()} ]`;
            addGhost('domains', id, name, dg.links, 'domain_grouping');
        });

        // Reading Status
        addGhost('readingStatus', '__ghost_unread__', '[ Plan to Read ]', unreadLinks, 'unread');
        addGhost('readingStatus', '__ghost_reading__', '[ Actively Reading ]', readingLinks, 'reading');
        addGhost('readingStatus', '__ghost_completed__', '[ Completed ]', completedLinks, 'completed');
        addGhost('readingStatus', '__ghost_on_hold__', '[ On Hold ]', onHoldLinks, 'on_hold');
        addGhost('readingStatus', '__ghost_dropped__', '[ Dropped ]', droppedLinks, 'dropped');

        // Maintenance
        addGhost('maintenance', '__ghost_unlinked__', '[ Unlinked Bookmarks ]', unlinkedLinks, 'unlinked');
        addGhost('maintenance', '__ghost_missing_covers__', '[ Missing Covers ]', missingCovers, 'missing_covers');
        addGhost('maintenance', '__ghost_missing_icons__', '[ Missing Icons ]', missingIcons, 'missing_icons');
        addGhost('maintenance', '__ghost_untagged__', '[ Untagged ]', untaggedLinks, 'untagged');
        addGhost('maintenance', '__ghost_no_title__', '[ No Title ]', noTitleLinks, 'no_title');
        addGhost('maintenance', '__ghost_needs_review__', '[ Needs Review ]', needsReviewLinks, 'needs_review');
        addGhost('maintenance', '__ghost_missing_notes__', '[ Missing Notes ]', missingNotesLinks, 'missing_notes');
        addGhost('maintenance', '__ghost_broken_links__', '[ Broken / Invalid Links ]', brokenLinks, 'broken_links');

        // Activity
        addGhost('activity', '__ghost_recent__', '[ Recently Updated ]', recentLinks, 'recent');
        addGhost('activity', '__ghost_recently_visited__', '[ Recently Visited ]', recentlyVisited, 'recently_visited');
        addGhost('activity', '__ghost_stale__', '[ Stale Bookmarks ]', staleLinks, 'stale');

        // Insights
        addGhost('insights', '__ghost_top_rated__', '[ Top Rated ]', topRatedLinks, 'top_rated');
        addGhost('insights', '__ghost_duplicate_suspects__', '[ Duplicate Suspects ]', duplicateSuspects, 'duplicate_suspects');
        addGhost('insights', '__ghost_ancients__', '[ The Ancients ]', ancientsLinks, 'ancients');

        // Library Stats
        topGenres.forEach(tg => {
            const id = `__ghost_genre_${tg.genre.replace(/[^a-zA-Z0-9]/g, '_')}__`;
            const name = `[ Genre: ${tg.genre} ]`;
            addGhost('insights', id, name, tg.links, 'library_stats');
        });

        if (derivedDimensionDefinitions.some((definition) => isGhostEnabled(definition.key))) {
            addDerivedChildren(ghostCategories.indexes.id, activeLinks, [], 0);
        }

        let anyMasterEnabled = false;
        Object.values(ghostCategories).forEach(cat => {
            if (cat._hasActiveChildren) {
                anyMasterEnabled = true;
                ghostFolders.push({
                    id: cat.id,
                    name: cat.name,
                    parentId: masterGhostId,
                    isGhost: true,
                    _ghostLinks: []
                });
            }
        });

        if (anyMasterEnabled) {
            ghostFolders.unshift({
                id: masterGhostId,
                name: '[ System Views ]',
                parentId: null,
                isGhost: true,
                isMasterGhost: true,
                _ghostLinks: []
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

        // Compute Large Folders AFTER regular folder links are populated
        if (isGhostEnabled('large_folders')) {
            const largeFoldersLinks = [];
            folderLinks.forEach((links, fid) => {
                if (links.length > 15 && !nodeMap.get(fid)?.isGhost) {
                    largeFoldersLinks.push(...links);
                }
            });
            if (largeFoldersLinks.length > 0) {
                const id = '__ghost_large_folders__';
                const parentId = ghostCategories['insights'].id;

                // If insights wasn't already added to the tree, we need to add it now
                if (!ghostCategories['insights']._hasActiveChildren) {
                    scopedNodes.push({
                        id: parentId,
                        name: ghostCategories['insights'].name,
                        parentId: masterGhostId,
                        isGhost: true,
                        _ghostLinks: []
                    });
                    if (!anyMasterEnabled) {
                        scopedNodes.unshift({
                            id: masterGhostId,
                            name: '[ System Views ]',
                            parentId: null,
                            isGhost: true,
                            isMasterGhost: true,
                            _ghostLinks: []
                        });
                    }
                    nodeMap.set(parentId, scopedNodes[scopedNodes.length - 1]);
                    childrenMap.set(masterGhostId, [...(childrenMap.get(masterGhostId) || []), scopedNodes[scopedNodes.length - 1]]);
                }

                const largeGhostNode = {
                    id: id,
                    name: '[ Large Folders (>15) ]',
                    parentId: parentId,
                    isGhost: true,
                    _ghostLinks: largeFoldersLinks
                };

                scopedNodes.push(largeGhostNode);
                nodeMap.set(id, largeGhostNode);
                folderLinks.set(id, largeFoldersLinks);
                childrenMap.set(parentId, [...(childrenMap.get(parentId) || []), largeGhostNode]);
            }
        }

        return {
            nodes: scopedNodes,
            nodeMap,
            childrenMap,
            folderLinks,
            rootLinks,
            topLevelFolders: childrenMap.get(null) || []
        };
    }

    function isToolbarExpanded(workspaceId, categoryName) {
        return getToolbarConfigStore().includes(buildScopedKey(workspaceId, categoryName));
    }

    function setToolbarExpanded(workspaceId, categoryName, expanded) {
        const scopedKey = buildScopedKey(workspaceId, categoryName);
        const store = getToolbarConfigStore();
        const nextStore = store.filter((entry) => entry !== scopedKey);
        if (expanded) nextStore.push(scopedKey);
        if (window.eveState?.config) {
            window.eveState.config.bookmarkFolderToolbarExpanded = nextStore;
        }
        if (typeof saveConfig === 'function') saveConfig();
        syncToolbarDom(workspaceId, categoryName, expanded);
    }

    function toggleToolbarExpanded(workspaceId, categoryName) {
        const expanded = isToolbarExpanded(workspaceId, categoryName);
        setToolbarExpanded(workspaceId, categoryName, !expanded);
    }

    function syncToolbarDom(workspaceId, categoryName, expanded) {
        const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
        const resolvedCategoryName = normalizeCategoryName(categoryName);
        const cards = Array.from(document.querySelectorAll('.category-card'))
            .filter((card) =>
                String(card.getAttribute('data-card-workspace') || '').trim() === resolvedWorkspaceId
                && String(card.getAttribute('data-card-category') || '').trim() === resolvedCategoryName
            );

        if (!cards.length) {
            if (typeof renderDashboard === 'function') renderDashboard();
            return;
        }

        cards.forEach((card) => {
            const toolbar = card.querySelector('.bookmark-folder-toolbar');
            if (toolbar) {
                toolbar.classList.toggle('is-visible', !!expanded);
            }
            card.querySelectorAll('[data-folder-toolbar-toggle="1"]').forEach((button) => {
                button.classList.toggle('is-active', !!expanded);
            });
            const grid = card.parentElement || document.getElementById('dashboard-grid');
            if (grid && typeof window.scheduleDashboardMasonryLayout === 'function') {
                window.scheduleDashboardMasonryLayout(grid);
            }
        });
    }

    function getFolderById(workspaceId, categoryName, folderId) {
        const normalizedId = normalizeFolderId(folderId);
        if (!normalizedId) return null;
        return getScopedNodes(workspaceId, categoryName)
            .find((node) => node.id === normalizedId) || null;
    }

    function buildFolderPathLabel(workspaceId, categoryName, folderId) {
        const normalizedId = normalizeFolderId(folderId);
        if (!normalizedId) return '';
        const nodeMap = buildNodeMap(getScopedNodes(workspaceId, categoryName));
        const parts = [];
        let cursor = nodeMap.get(normalizedId) || null;
        let guard = 0;
        while (cursor && guard < 64) {
            parts.unshift(cursor.name || 'Folder');
            cursor = cursor.parentId ? (nodeMap.get(cursor.parentId) || null) : null;
            guard += 1;
        }
        return parts.join(' / ');
    }

    function collectFolderOptions(workspaceId, categoryName, parentId, depth, childrenMap, rows) {
        const siblings = childrenMap.get(parentId) || [];
        siblings.forEach((node) => {
            rows.push({
                value: node.id,
                label: `${'\u00A0\u00A0'.repeat(depth)}${depth > 0 ? '\u21B3 ' : ''}${node.name}`,
                node,
                depth
            });
            collectFolderOptions(workspaceId, categoryName, node.id, depth + 1, childrenMap, rows);
        });
    }

    function getFolderOptions(workspaceId, categoryName, options = {}) {
        const rows = [];
        const childrenMap = buildChildrenMap(getScopedNodes(workspaceId, categoryName));
        if (options.includeRoot !== false) {
            rows.push({
                value: '',
                label: options.rootLabel || 'Root / No Folder',
                node: null,
                depth: 0
            });
        }
        collectFolderOptions(workspaceId, categoryName, null, 0, childrenMap, rows);
        return rows;
    }

    function populateFolderSelect(selectEl, workspaceId, categoryName, selectedId, options = {}) {
        if (!selectEl) return;
        const normalizedSelectedId = normalizeFolderId(selectedId);
        const rows = getFolderOptions(workspaceId, categoryName, options);
        selectEl.innerHTML = rows.map((row) => {
            const isSelected = normalizeFolderId(row.value) === normalizedSelectedId;
            const option = document.createElement('option');
            option.value = row.value;
            option.textContent = row.label;
            if (isSelected) option.selected = true;
            return option.outerHTML;
        }).join('');

        if (rows.some((row) => normalizeFolderId(row.value) === normalizedSelectedId)) {
            selectEl.value = normalizedSelectedId;
        } else {
            selectEl.value = '';
        }
    }

    function getEditorWorkspaceId() {
        const editId = String(document.getElementById('editId')?.value || '').trim();
        if (editId && Array.isArray(window.eveState?.links)) {
            const match = window.eveState.links.find((link) => String(link?.id) === editId);
            if (match?.workspace) return String(match.workspace);
        }
        return normalizeWorkspaceId();
    }

    function refreshEditorFolderSelect(preferredFolderId) {
        const select = document.getElementById('newFolderId');
        if (!select) return;
        const categoryName = normalizeCategoryName(document.getElementById('newCategory')?.value);
        const selectedId = preferredFolderId !== undefined
            ? normalizeFolderId(preferredFolderId)
            : normalizeFolderId(select.value);
        populateFolderSelect(select, getEditorWorkspaceId(), categoryName, selectedId);
    }

    function generateFolderId() {
        const randomSuffix = Math.random().toString(36).slice(2, 8);
        return `bf_${Date.now().toString(36)}_${randomSuffix}`;
    }

    function getNextSiblingOrder(nodes, parentId) {
        const normalizedParentId = normalizeParentId(parentId);
        const siblings = dedupeNodes(nodes).filter((node) => normalizeParentId(node.parentId) === normalizedParentId);
        if (!siblings.length) return 0;
        return Math.max(...siblings.map((node) => Number(node.order) || 0)) + 1;
    }

    function createFolder(options = {}) {
        const workspaceId = normalizeWorkspaceId(options.workspaceId);
        const categoryName = normalizeCategoryName(options.categoryName);
        const name = String(options.name || '').trim();
        const parentId = normalizeParentId(options.parentId);
        if (!name) return null;

        const nodes = getScopedNodes(workspaceId, categoryName);
        const now = Date.now();
        const folder = {
            id: generateFolderId(),
            parentId,
            name,
            order: getNextSiblingOrder(nodes, parentId),
            createdAt: now,
            updatedAt: now,
            clickBehaviorMode: 'inherit',
            taskMode: 'inherit'
        };
        nodes.push(folder);
        setScopedNodes(workspaceId, categoryName, nodes);
        return folder;
    }

    function renameFolder(options = {}) {
        const workspaceId = normalizeWorkspaceId(options.workspaceId);
        const categoryName = normalizeCategoryName(options.categoryName);
        const folderId = normalizeFolderId(options.folderId);
        const nextName = String(options.name || '').trim();
        if (!folderId || !nextName) return false;

        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === folderId);
        if (!target) return false;
        target.name = nextName;
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes);
        return true;
    }

    function moveFolder(workspaceId, categoryName, folderId, targetParentId) {
        workspaceId = normalizeWorkspaceId(workspaceId);
        categoryName = normalizeCategoryName(categoryName);
        folderId = normalizeFolderId(folderId);
        targetParentId = normalizeParentId(targetParentId);

        if (!folderId) return false;
        if (folderId === targetParentId) return false; // Cannot move into itself

        const nodes = getScopedNodes(workspaceId, categoryName);

        // Cycle detection: ensure targetParentId is not a descendant of folderId
        let currentParent = targetParentId;
        while (currentParent) {
            if (currentParent === folderId) return false; // Cycle detected
            const pNode = nodes.find(n => n.id === currentParent);
            if (!pNode) break;
            currentParent = pNode.parentId;
        }

        const target = nodes.find((node) => node.id === folderId);
        if (!target) return false;

        target.parentId = targetParentId;
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes);
        return true;
    }

    function transferFolderToCategory(folderId, sourceWs, sourceCat, targetWs, targetCat, targetParentId) {
        try {
            const sWs = normalizeWorkspaceId(sourceWs);
            const sCat = normalizeCategoryName(sourceCat);
            const tWs = normalizeWorkspaceId(targetWs);
            const tCat = normalizeCategoryName(targetCat);
            const fId = normalizeFolderId(folderId);
            const tpId = normalizeParentId(targetParentId);

            if (!fId) {
                console.warn('[EveBookmarkFolders] Transfer Aborted: Missing Folder ID');
                return false;
            }

            // If it's the same card, just use the local moveFolder logic
            if (sWs === tWs && sCat === tCat) {
                return moveFolder(sWs, sCat, fId, tpId);
            }

            const nextStore = cloneStore();
            const sKey = buildScopedKey(sWs, sCat);
            const tKey = buildScopedKey(tWs, tCat);

            const sourceTree = nextStore[sKey];
            if (!sourceTree || !sourceTree.nodes || sourceTree.nodes.length === 0) {
                console.warn('[EveBookmarkFolders] Transfer Aborted: Source tree empty or missing', sKey);
                return false;
            }

            const targetTree = nextStore[tKey] || { nodes: [], settings: normalizeTreeSettings({}) };

            // Find the folder and all its descendants in the source
            const childrenMap = buildChildrenMap(sourceTree.nodes);

            const toMoveIds = new Set();
            function collect(id) {
                toMoveIds.add(id);
                (childrenMap.get(id) || []).forEach(child => collect(child.id));
            }

            const rootNodeId = fId;
            // Check if rootNode exists in source
            if (!sourceTree.nodes.some(n => normalizeFolderId(n.id) === rootNodeId)) {
                return false;
            }

            collect(rootNodeId);

            // 1. Prepare moved nodes
            const movedNodes = sourceTree.nodes.filter(n => toMoveIds.has(n.id)).map(n => {
                const newNode = { ...n };
                if (normalizeFolderId(n.id) === rootNodeId) {
                    newNode.parentId = tpId;
                    newNode.updatedAt = Date.now();
                }
                return newNode;
            });

            console.log('[EveBookmarkFolders] Nodes captured:', movedNodes.length);
            if (movedNodes.length === 0) return false;

            // 2. Add to target
            targetTree.nodes = [...targetTree.nodes, ...movedNodes];
            nextStore[tKey] = targetTree;

            // 3. Remove from source
            sourceTree.nodes = sourceTree.nodes.filter(n => !toMoveIds.has(n.id));
            if (sourceTree.nodes.length === 0 && sourceTree.settings.clickBehaviorMode === 'inherit') {
                delete nextStore[sKey];
            } else {
                nextStore[sKey] = sourceTree;
            }

            // 4. Update all bookmarks in these folders to the new category/workspace
            if (Array.isArray(window.eveState?.links)) {
                window.eveState.links.forEach(link => {
                    if (toMoveIds.has(normalizeFolderId(link.folderId))) {
                        link.workspace = tWs;
                        link.category = tCat;
                        if (typeof window.EveLibrary?.ConnectionsAPI?.syncFromLink === 'function') {
                            window.EveLibrary.ConnectionsAPI.syncFromLink(link.id);
                        }
                    }
                });
            }

            // 5. Final Atomic Write
            writeStore(nextStore, true);
            return true;
        } catch (err) {
            return false;
        }
    }


    function getCardClickBehaviorMode(workspaceId, categoryName) {

        return normalizeTreeSettings(getScopedTree(workspaceId, categoryName)?.settings).clickBehaviorMode;
    }

    function setCardClickBehaviorMode(workspaceId, categoryName, mode, options = {}) {
        const currentTree = getScopedTree(workspaceId, categoryName);
        return setScopedTree(workspaceId, categoryName, {
            nodes: currentTree.nodes,
            settings: {
                ...currentTree.settings,
                clickBehaviorMode: normalizeClickBehaviorMode(mode)
            }
        }, options).settings.clickBehaviorMode;
    }

    function getFolderClickBehaviorMode(workspaceId, categoryName, folderId) {
        const folder = getFolderById(workspaceId, categoryName, folderId);
        return normalizeClickBehaviorMode(folder?.clickBehaviorMode);
    }

    function setFolderClickBehaviorMode(workspaceId, categoryName, folderId, mode) {
        const normalizedFolderId = normalizeFolderId(folderId);
        if (!normalizedFolderId) return 'inherit';
        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === normalizedFolderId);
        if (!target) return 'inherit';
        target.clickBehaviorMode = normalizeClickBehaviorMode(mode);
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes);
        return target.clickBehaviorMode;
    }

    function getFolderTaskMode(workspaceId, categoryName, folderId) {
        const folder = getFolderById(workspaceId, categoryName, folderId);
        return normalizeTaskMode(folder?.taskMode);
    }

    function setFolderTaskMode(workspaceId, categoryName, folderId, mode) {
        const normalizedFolderId = normalizeFolderId(folderId);
        if (!normalizedFolderId) return 'inherit';
        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === normalizedFolderId);
        if (!target) return 'inherit';
        target.taskMode = normalizeTaskMode(mode);
        target.updatedAt = Date.now();
        setScopedNodes(workspaceId, categoryName, nodes);
        return target.taskMode;
    }

    function getFolderTaskModeChain(workspaceId, categoryName, folderId) {
        const normalizedFolderId = normalizeFolderId(folderId);
        if (!normalizedFolderId) return [];
        const nodeMap = buildNodeMap(getScopedNodes(workspaceId, categoryName));
        const chain = [];
        let cursor = nodeMap.get(normalizedFolderId) || null;
        let guard = 0;
        while (cursor && guard < 64) {
            chain.unshift(cursor);
            cursor = cursor.parentId ? (nodeMap.get(cursor.parentId) || null) : null;
            guard += 1;
        }
        return chain;
    }

    function getHideStatsStore() {
        if (Array.isArray(window.eveState?.config?.hideStats)) return window.eveState.config.hideStats;
        if (typeof config !== 'undefined' && Array.isArray(config?.hideStats)) return config.hideStats;
        return [];
    }

    function isCardTaskEnabled(workspaceId, categoryName) {
        const normalizedCategoryName = normalizeCategoryName(categoryName);
        return !getHideStatsStore().includes(normalizedCategoryName);
    }

    function resolveTaskState(workspaceId, categoryName, folderId) {
        let isEnabled = isCardTaskEnabled(workspaceId, categoryName);
        getFolderTaskModeChain(workspaceId, categoryName, folderId).forEach((node) => {
            const mode = normalizeTaskMode(node?.taskMode);
            if (mode === 'task') isEnabled = true;
            if (mode === 'non_task') isEnabled = false;
        });
        return isEnabled;
    }

    function findLinkById(linkId) {
        const targetId = String(linkId || '').trim();
        if (!targetId) return null;
        const source = Array.isArray(window.eveState?.links)
            ? window.eveState.links
            : (typeof links !== 'undefined' && Array.isArray(links) ? links : []);
        return source.find((link) => String(link?.id || '').trim() === targetId) || null;
    }

    function isTaskEnabledForLink(linkOrId) {
        const link = (linkOrId && typeof linkOrId === 'object')
            ? linkOrId
            : findLinkById(linkOrId);
        if (!link || typeof link !== 'object') return false;
        return resolveTaskState(
            normalizeWorkspaceId(link.workspace),
            normalizeCategoryName(link.category),
            normalizeFolderId(link.folderId)
        );
    }

    function getTaskModeOptions() {
        return [
            { value: 'inherit', label: 'Inherit Card Task Mode' },
            { value: 'task', label: 'Force Task' },
            { value: 'non_task', label: 'Force Non-Task' }
        ];
    }

    function describeTaskMode(mode) {
        switch (normalizeTaskMode(mode)) {
            case 'task':
                return 'Bookmarks in this folder behave as tasks even if the card is not in task mode.';
            case 'non_task':
                return 'Bookmarks in this folder do not behave as tasks even if the card is in task mode.';
            default:
                return 'This folder follows the card task mode unless a deeper subfolder overrides it.';
        }
    }

    function clearLinkFolderAssignment(link) {
        if (!link || typeof link !== 'object') return false;
        if (!normalizeFolderId(link.folderId)) {
            delete link.folderId;
            return false;
        }
        delete link.folderId;
        return true;
    }

    function deleteFolder(options = {}) {
        const workspaceId = normalizeWorkspaceId(options.workspaceId);
        const categoryName = normalizeCategoryName(options.categoryName);
        const folderId = normalizeFolderId(options.folderId);
        if (!folderId) return false;

        const nodes = getScopedNodes(workspaceId, categoryName);
        const target = nodes.find((node) => node.id === folderId);
        if (!target) return false;

        const nextParentId = normalizeParentId(target.parentId);
        const filteredNodes = nodes.filter((node) => node.id !== folderId);
        filteredNodes.forEach((node) => {
            if (normalizeParentId(node.parentId) === folderId) {
                node.parentId = nextParentId;
                node.updatedAt = Date.now();
            }
        });

        if (Array.isArray(window.eveState?.links)) {
            window.eveState.links.forEach((link) => {
                const sameWorkspace = normalizeWorkspaceId(link?.workspace) === workspaceId;
                const sameCategory = normalizeCategoryName(link?.category) === categoryName;
                if (!sameWorkspace || !sameCategory) return;
                if (normalizeFolderId(link?.folderId) !== folderId) return;
                if (nextParentId) link.folderId = nextParentId;
                else delete link.folderId;
            });
        }

        setScopedNodes(workspaceId, categoryName, filteredNodes, { persist: false });
        if (typeof saveData === 'function') saveData();
        return true;
    }

    function renameCategoryEverywhere(oldCategoryName, nextCategoryName) {
        const previous = normalizeCategoryName(oldCategoryName);
        const next = normalizeCategoryName(nextCategoryName);
        if (!previous || !next || previous === next) return;

        const nextStore = cloneStore();
        Object.keys(nextStore).forEach((key) => {
            const parts = String(key).split('::');
            const workspaceId = parts.shift() || 'main';
            const categoryName = parts.join('::') || 'Unsorted';
            if (normalizeCategoryName(categoryName) !== previous) return;
            const nextKey = buildScopedKey(workspaceId, next);
            if (!nextStore[nextKey]) {
                nextStore[nextKey] = nextStore[key];
            } else {
                const mergedSettings = normalizeTreeSettings({
                    clickBehaviorMode: nextStore[key]?.settings?.clickBehaviorMode !== 'inherit'
                        ? nextStore[key]?.settings?.clickBehaviorMode
                        : nextStore[nextKey]?.settings?.clickBehaviorMode
                });
                nextStore[nextKey] = {
                    nodes: dedupeNodes([...(nextStore[nextKey]?.nodes || []), ...(nextStore[key]?.nodes || [])]),
                    settings: mergedSettings
                };
            }
            if (nextKey !== key) delete nextStore[key];
        });
        writeStore(nextStore, false);
    }

    function deleteCategoryEverywhere(categoryName) {
        const targetCategory = normalizeCategoryName(categoryName);
        const nextStore = cloneStore();
        Object.keys(nextStore).forEach((key) => {
            const parts = String(key).split('::');
            parts.shift();
            const scopedCategory = normalizeCategoryName(parts.join('::'));
            if (scopedCategory === targetCategory) {
                delete nextStore[key];
            }
        });
        writeStore(nextStore, false);
    }

    function moveWorkspaceTrees(sourceWorkspaceId, targetWorkspaceId) {
        const sourceWorkspace = normalizeWorkspaceId(sourceWorkspaceId);
        const targetWorkspace = normalizeWorkspaceId(targetWorkspaceId);
        if (!sourceWorkspace || !targetWorkspace || sourceWorkspace === targetWorkspace) return;

        const nextStore = cloneStore();
        Object.keys(nextStore).forEach((key) => {
            const parts = String(key).split('::');
            const workspaceId = parts.shift() || 'main';
            const categoryName = normalizeCategoryName(parts.join('::'));
            if (workspaceId !== sourceWorkspace) return;
            const nextKey = buildScopedKey(targetWorkspace, categoryName);
            if (!nextStore[nextKey]) {
                nextStore[nextKey] = nextStore[key];
            } else {
                const mergedSettings = normalizeTreeSettings({
                    clickBehaviorMode: nextStore[key]?.settings?.clickBehaviorMode !== 'inherit'
                        ? nextStore[key]?.settings?.clickBehaviorMode
                        : nextStore[nextKey]?.settings?.clickBehaviorMode
                });
                nextStore[nextKey] = {
                    nodes: dedupeNodes([...(nextStore[nextKey]?.nodes || []), ...(nextStore[key]?.nodes || [])]),
                    settings: mergedSettings
                };
            }
            if (nextKey !== key) delete nextStore[key];
        });
        writeStore(nextStore, false);
    }

    function getActiveCategoryContext(categoryName) {
        return normalizeCategoryName(categoryName || window.currentCategoryCtx || window.ctxCatName || 'Unsorted');
    }

    function parseDragPayload(dataTransfer) {
        const rawJson = dataTransfer?.getData("application/json") || dataTransfer?.getData("text/plain") || '';
        let dragIds = [];
        try {
            const parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed?.ids)) {
                dragIds = parsed.ids.map((item) => String(item));
            } else if (parsed !== null && parsed !== undefined && rawJson) {
                dragIds = [String(parsed)];
            }
        } catch (error) {
            if (rawJson) dragIds = [String(rawJson)];
        }
        return dragIds.filter(Boolean);
    }

    function moveLinksToFolderTarget(linkIds, workspaceId, categoryName, folderId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const normalizedFolderId = normalizeFolderId(folderId);
        const validFolderId = normalizedFolderId && getFolderById(targetWorkspaceId, targetCategoryName, normalizedFolderId)
            ? normalizedFolderId
            : '';

        if (!Array.isArray(window.eveState?.links) || !linkIds.length) return false;
        let movedAny = false;
        const syncLinked = window.EveLibrary?.ConnectionsAPI?.syncFromLink;

        window.eveState.links.forEach((link) => {
            if (!linkIds.includes(String(link?.id))) return;
            const nextWorkspaceId = targetWorkspaceId;
            const nextCategoryName = targetCategoryName;
            const currentFolderId = normalizeFolderId(link?.folderId);
            const alreadyAtTarget = normalizeWorkspaceId(link?.workspace) === nextWorkspaceId
                && normalizeCategoryName(link?.category) === nextCategoryName
                && currentFolderId === validFolderId;
            if (alreadyAtTarget) return;

            link.workspace = nextWorkspaceId;
            link.category = nextCategoryName;
            if (validFolderId) link.folderId = validFolderId;
            else delete link.folderId;
            if (typeof syncLinked === 'function') syncLinked(link.id);
            movedAny = true;
        });

        if (movedAny && typeof saveData === 'function') saveData();
        return movedAny;
    }

    window.openBookmarkFolders = function (categoryName) {
        if (typeof openCategorySettings === 'function') {
            openCategorySettings(getActiveCategoryContext(categoryName), 'folders');
        }
    };

    window.toggleBookmarkFolderToolbar = function (categoryName, workspaceId) {
        toggleToolbarExpanded(workspaceId, getActiveCategoryContext(categoryName));
    };
    window.deleteBookmarkFolderPrompt = async function (categoryName, folderId) {
        const resolvedCategory = getActiveCategoryContext(categoryName);
        const target = getFolderById(normalizeWorkspaceId(), resolvedCategory, folderId);
        if (!target) return;
        const confirmed = typeof showConfirm === 'function'
            ? await showConfirm(`Delete "${target.name}"? Bookmarks move to the parent/root and subfolders move up one level.`)
            : window.confirm(`Delete "${target.name}"? Bookmarks move to the parent/root and subfolders move up one level.`);
        if (!confirmed) return;
        if (!deleteFolder({
            workspaceId: normalizeWorkspaceId(),
            categoryName: resolvedCategory,
            folderId
        })) return;
        if (typeof showToast === 'function') showToast(`Folder "${target.name}" removed`, 'success');
        if (typeof window.renderCategoryFolderManager === 'function') {
            window.renderCategoryFolderManager();
        }
    };

    window.openAddModalForFolder = function (categoryName, folderId) {
        if (typeof openAddModal === 'function') {
            openAddModal({
                category: getActiveCategoryContext(categoryName),
                folderId: normalizeFolderId(folderId)
            });
        }
    };

    window.promptCreateBookmarkFolder = function (categoryName, parentId) {
        const resolvedCategory = getActiveCategoryContext(categoryName);
        if (typeof window.openFolderCreator === 'function') {
            window.openFolderCreator(resolvedCategory, parentId);
        }
    };

    window.promptRenameBookmarkFolder = function (categoryName, folderId) {
        const resolvedCategory = getActiveCategoryContext(categoryName);
        if (typeof window.openFolderRenamer === 'function') {
            window.openFolderRenamer(resolvedCategory, folderId);
        }
    };


    window.moveBookmarksToFolderDrop = function (event, categoryName, folderId, workspaceId) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const rawData = event.dataTransfer?.getData('text/plain') || event.dataTransfer?.getData('application/json');
        if (!rawData) return;

        let payload = null;
        try {
            payload = JSON.parse(rawData);
        } catch (e) {
            // Not a JSON payload, probably standard bookmark link ID list
        }

        // 1. Check if it's a folder payload (Cross-Card or Intra-Card folder move)
        if (payload && payload.type === 'folder' && payload.id) {
            const folderIdToMove = payload.id;
            const targetFolderId = normalizeFolderId(folderId);
            if (folderIdToMove === targetFolderId) return;

            const isCrossCard = (payload.sourceWorkspace && payload.sourceWorkspace !== workspaceId) ||
                               (payload.sourceCategory && payload.sourceCategory !== categoryName);

            if (isCrossCard) {
                if (!payload.sourceWorkspace || !payload.sourceCategory) {
                    console.warn('[moveBookmarksToFolderDrop] Cross-card transfer aborted: Missing source metadata.', payload);
                    return;
                }
                transferFolderToCategory(
                    folderIdToMove,
                    payload.sourceWorkspace,
                    payload.sourceCategory,
                    workspaceId,
                    categoryName,
                    targetFolderId
                );
            } else {
                moveFolder(workspaceId, categoryName, folderIdToMove, targetFolderId);
            }

            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            return;
        }

        // 2. Fallback: Check for bookmark link IDs
        const linkIds = parseDragPayload(event?.dataTransfer);
        if (!linkIds.length) return;
        moveLinksToFolderTarget(linkIds, workspaceId, getActiveCategoryContext(categoryName), folderId);
    };

    if (!window.__eveBookmarkFolderEditorBinding) {
        window.__eveBookmarkFolderEditorBinding = true;
        document.addEventListener('input', (event) => {
            if (event.target?.id !== 'newCategory') return;
            refreshEditorFolderSelect();
        });
        document.addEventListener('change', (event) => {
            if (event.target?.id !== 'newCategory') return;
            refreshEditorFolderSelect();
        });
    }

    ns.buildScopedKey = buildScopedKey;
    ns.getScopedTree = getScopedTree;
    ns.setScopedTree = setScopedTree;
    ns.getScopedNodes = getScopedNodes;
    ns.setScopedNodes = setScopedNodes;
    ns.getFolderById = getFolderById;
    ns.buildFolderView = buildFolderView;
    ns.buildFolderPathLabel = buildFolderPathLabel;
    ns.isToolbarExpanded = isToolbarExpanded;
    ns.setToolbarExpanded = setToolbarExpanded;
    ns.toggleToolbarExpanded = toggleToolbarExpanded;
    ns.getFolderOptions = getFolderOptions;
    ns.populateFolderSelect = populateFolderSelect;
    ns.refreshEditorFolderSelect = refreshEditorFolderSelect;
    ns.createFolder = createFolder;
    ns.renameFolder = renameFolder;
    ns.moveFolder = moveFolder;
    ns.transferFolderToCategory = transferFolderToCategory;
    ns.deleteFolder = deleteFolder;

    ns.clearLinkFolderAssignment = clearLinkFolderAssignment;
    ns.renameCategoryEverywhere = renameCategoryEverywhere;
    ns.deleteCategoryEverywhere = deleteCategoryEverywhere;
    ns.moveWorkspaceTrees = moveWorkspaceTrees;
    ns.moveLinksToFolderTarget = moveLinksToFolderTarget;
    ns.normalizeClickBehaviorMode = normalizeClickBehaviorMode;
    ns.normalizeTaskMode = normalizeTaskMode;
    ns.getCardClickBehaviorMode = getCardClickBehaviorMode;
    ns.setCardClickBehaviorMode = setCardClickBehaviorMode;
    ns.getFolderClickBehaviorMode = getFolderClickBehaviorMode;
    ns.setFolderClickBehaviorMode = setFolderClickBehaviorMode;
    ns.getFolderTaskMode = getFolderTaskMode;
    ns.setFolderTaskMode = setFolderTaskMode;
    ns.getFolderTaskModeChain = getFolderTaskModeChain;
    ns.isCardTaskEnabled = isCardTaskEnabled;
    ns.resolveTaskState = resolveTaskState;
    ns.isTaskEnabledForLink = isTaskEnabledForLink;
    ns.getTaskModeOptions = getTaskModeOptions;
    ns.describeTaskMode = describeTaskMode;
})(window.EveBookmarkFolders);
