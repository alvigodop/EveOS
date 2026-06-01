window.EveSmartViewRegistry = window.EveSmartViewRegistry || {};

(function (api) {
    const h = api._shared || {};
    const {
        text,
        bucketize,
        getIdentifierIds,
        getRelatedUrlEntries,
        getSourceProviderValues,
        getSourceFreshnessBuckets,
        buildFolderHealthResolver,
        getOriginScopeValues,
        getPinScopeValues,
        getMergeStateValues,
        getCoverStateValues,
        buildDuplicateUrlCounts,
        getDefinitionsById
    } = h;

    function makeGroup(categoryKey, categoryName, groupKey, groupLabel, buckets, options = {}) {
        return {
            categoryKey,
            categoryName,
            groupKey,
            groupLabel,
            enabledKey: options.enabledKey || groupKey,
            relatedDimensions: options.relatedDimensions || [groupKey],
            buckets: (Array.isArray(buckets) ? buckets : []).map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                links: bucket.links || [],
                why: bucket.why || options.why || '',
                criteria: bucket.criteria || { dimension: groupKey, value: bucket.label },
                keepWhenEmpty: !!bucket.keepWhenEmpty,
                userSmartViewId: bucket.userSmartViewId || ''
            }))
        };
    }

    function getBuiltInCatalog() {
        return [
            { id: 'linkHealth', label: 'Link Health', category: 'Health', criteria: 'dead, redirected, title drift, orphaned library' },
            { id: 'domains', label: 'Domains', category: 'Organize', criteria: 'URL host/domain buckets' },
            { id: 'readingStatus', label: 'Reading Status', category: 'Library', criteria: 'library status buckets' },
            { id: 'taskStatus', label: 'Task Status', category: 'Activity', criteria: 'done/pending/not tracked' },
            { id: 'maintenance', label: 'Maintenance', category: 'Health', criteria: 'missing icons, covers, notes, titles, tags, broken URLs' },
            { id: 'activity', label: 'Activity', category: 'Activity', criteria: 'recent, recently visited, stale' },
            { id: 'insights', label: 'Insights', category: 'Library', criteria: 'top rated, duplicates, ancients, large folders, confidence' },
            { id: 'trueValue', label: 'True Value', category: 'Library', criteria: 'true value brackets' },
            { id: 'indexes', label: 'Smart Indexes', category: 'Organize', criteria: 'derived tags, genres, authors, status, rating, confidence, title, progress' },
            { id: 'identifier_labels', label: 'Bookmark Identifiers', category: 'Organize', criteria: 'Reading, Watching, Listening, and custom identifiers' },
            { id: 'related_urls', label: 'Related URLs', category: 'Source', criteria: 'mirrors, source pages, wiki pages, alternate listings' },
            { id: 'source_provider', label: 'Source Provider', category: 'Source', criteria: 'MangaDex, AniList, TVMaze, Google, Fandom, scraper sources' },
            { id: 'source_freshness', label: 'Source Freshness', category: 'Source', criteria: 'fresh, stale, cache-only, no source' },
            { id: 'folder_health', label: 'Folder Health', category: 'Debug', criteria: 'broken parent, hidden parent, orphaned, detached chain' },
            { id: 'origin_scope', label: 'Origin Scope', category: 'Debug', criteria: 'direct card, child tab, shortcut, group overview' },
            { id: 'pin_scope', label: 'Pin Scope', category: 'Organize', criteria: 'card pin, child pin, inherited pin, stale target' },
            { id: 'cover_state', label: 'Cover State', category: 'Organize', criteria: 'bookmarks with covers, additional covers, or missing cover art' },
            { id: 'merge_state', label: 'Merge State', category: 'Debug', criteria: 'merge history, duplicate suspect, injected merge, notes-only merge' }
        ].map((view) => Object.assign({
            scope: 'card',
            sort: { by: 'count', direction: 'desc' },
            presentation: { layout: 'folder' },
            enabledByDefault: true
        }, view));
    }

    function buildGhostGroups(context) {
        const activeLinks = Array.isArray(context?.activeLinks) ? context.activeLinks : [];
        const getCachedEntry = typeof context?.getCachedEntry === 'function' ? context.getCachedEntry : () => null;
        const nowMs = Date.now();
        const identifiers = getDefinitionsById();
        const folderHealth = buildFolderHealthResolver(context);
        const duplicateUrlCounts = buildDuplicateUrlCounts(activeLinks);

        const groups = [];
        groups.push(makeGroup('organize', '[ Organize ]', 'identifier_labels', '[ Bookmark Identifiers ]',
            bucketize(activeLinks, (link) => {
                const ids = getIdentifierIds(link);
                return ids.map((id) => identifiers.get(id)?.label || id);
            }, { getCachedEntry }),
            { why: 'Bookmark includes this reusable identifier.' }));
        groups.push(makeGroup('source', '[ Source ]', 'related_urls', '[ Related URLs ]',
            bucketize(activeLinks, (link) => {
                const entries = getRelatedUrlEntries(link);
                if (!entries.length) return [];
                return ['Has Related URLs'].concat(entries.map((entry) => entry.label || domainFromUrl(entry.url) || 'Related URL'));
            }, { getCachedEntry }),
            { why: 'Bookmark has mirrors, source pages, references, or alternate listings.' }));
        groups.push(makeGroup('source', '[ Source ]', 'source_provider', '[ Source Provider ]',
            bucketize(activeLinks, getSourceProviderValues, { getCachedEntry }),
            { why: 'Library/source metadata reports this provider.' }));
        groups.push(makeGroup('source', '[ Source ]', 'source_freshness', '[ Source Freshness ]',
            bucketize(activeLinks, (link, entry) => getSourceFreshnessBuckets(link, entry, nowMs), { getCachedEntry }),
            { why: 'Source/cache timestamp resolves to this freshness bucket.' }));
        groups.push(makeGroup('debug', '[ Debug ]', 'folder_health', '[ Folder Health ]',
            bucketize(activeLinks, (link) => folderHealth(link), { getCachedEntry }),
            { why: 'Folder path integrity resolves to this state.' }));
        groups.push(makeGroup('debug', '[ Debug ]', 'origin_scope', '[ Origin Scope ]',
            bucketize(activeLinks, (link) => getOriginScopeValues(link, context), { getCachedEntry }),
            { why: 'Bookmark enters this card view through this origin route.' }));
        groups.push(makeGroup('organize', '[ Organize ]', 'pin_scope', '[ Pin Scope ]',
            bucketize(activeLinks, getPinScopeValues, { getCachedEntry }),
            { why: 'Quick-pin metadata resolves to this pin scope.' }));
        groups.push(makeGroup('organize', '[ Organize ]', 'cover_state', '[ Cover State ]',
            bucketize(activeLinks, getCoverStateValues, { getCachedEntry }),
            { why: 'Bookmark cover fields or additional cover rotation fields resolve to this cover state.' }));
        groups.push(makeGroup('debug', '[ Debug ]', 'merge_state', '[ Merge State ]',
            bucketize(activeLinks, (link, entry) => getMergeStateValues(link, entry, duplicateUrlCounts), { getCachedEntry }),
            { why: 'Merge metadata in notes or duplicate evidence matches this state.' }));

        const userGroups = api.buildUserSmartViewGroup ? api.buildUserSmartViewGroup(context) : null;
        if (userGroups) groups.unshift(userGroups);
        return groups.filter((group) => group.buckets.length > 0);
    }

    Object.assign(api, {
        getBuiltInCatalog,
        buildGhostGroups
    });
})(window.EveSmartViewRegistry);
