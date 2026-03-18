window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
    const shared = ns._shared = ns._shared || {};
    if (shared.loaded) return;

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

    Object.assign(shared, {
        CLICK_BEHAVIOR_MODES,
        TASK_MODES,
        getFolderStore,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        normalizeParentId,
        normalizeClickBehaviorMode,
        normalizeTaskMode,
        normalizeTreeSettings,
        buildScopedKey,
        getToolbarConfigStore,
        getScopedTreeByKey,
        getScopedTree,
        normalizeNode,
        dedupeNodes,
        treeHasMeaningfulState,
        getScopedNodes,
        cloneStore,
        writeStore,
        setScopedTree,
        setScopedNodes,
        buildNodeMap,
        buildChildrenMap,
        getLibraryEntryForLink,
        isAutoSourceSummary,
        getLibraryFallbackImage,
        getNormalizedDuplicateUrl,
        hasMeaningfulIcon,
        hasBookmarkTags,
        hasLibraryTaxonomy,
        hasMeaningfulCover,
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
    });

    ns.buildScopedKey = buildScopedKey;
    ns.getScopedTree = getScopedTree;
    ns.setScopedTree = setScopedTree;
    ns.getScopedNodes = getScopedNodes;
    ns.setScopedNodes = setScopedNodes;
    ns.normalizeClickBehaviorMode = normalizeClickBehaviorMode;
    ns.normalizeTaskMode = normalizeTaskMode;

    shared.loaded = true;
})(window.EveBookmarkFolders);
