window.EveBookmarkFolders = window.EveBookmarkFolders || {};

(function (ns) {
ns._ghostRecursionDefinitions = ns._ghostRecursionDefinitions || {};
ns._ghostRecursionDefinitions.create = function createGhostRecursionDefinitions(ctx) {
const {
workspaceId, categoryName, scopedNodes, recentTime, nowMs, staleMs, recentVisMs, ancientsMs,
getCachedEntry, buildNodeMap, normalizeFolderId, getNormalizedDuplicateUrl, hasMeaningfulIcon,
hasBookmarkTags, hasLibraryTaxonomy, hasMeaningfulCover, isAutoSourceSummary, uniqueNonEmpty,
getDerivedTagValues, getDerivedGenreValues, getDerivedAuthorValues, getDerivedLanguageValues,
getDerivedStatusValue, getDerivedRatingValue, getDerivedConfidenceValue, getRatingBucketLabel,
getConfidenceBucketLabel, getDerivedProgressValue, getProgressBucketLabel, getDerivedDemographicValue,
getDerivedPublicationValue, getPublicationBucketLabel, getTitleInitial, getCoarseTitleBucket,
getDerivedTimelineBucket, sortBuckets, buildBucketsFromExtractor, unlinkedLinks
} = ctx;

function buildTitleBucketsForLinks(links) {
const initials = Array.from(new Set((Array.isArray(links) ? links : []).map((link) => getTitleInitial(link?.title))));
const useCoarse = initials.filter((value) => value !== '0-9' && value !== '#').length > 10;
return buildBucketsFromExtractor(links, (link) => {
const initial = getTitleInitial(link?.title);
return useCoarse ? [getCoarseTitleBucket(initial)] : [initial];
}, {
order: useCoarse ? ['A-C', 'D-F', 'G-I', 'J-L', 'M-O', 'P-R', 'S-U', 'V-Z', '0-9', '#'] : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0-9', '#']
});
}

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
return sortBuckets(Array.from(domainMap.entries()).map(([domain, bucketLinks]) => ({ key: domain, label: domain.toUpperCase(), links: bucketLinks })));
}

function buildLargeFolderScopeLinks(links) {
const realNodeMap = buildNodeMap((Array.isArray(scopedNodes) ? scopedNodes : []).filter((node) => !node?.isGhost));
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
if ((counts.get(folderId) || 0) > 15) largeLinks.push(...bucketLinks);
});
return largeLinks;
}

function buildMaintenanceGhostBuckets(links) {
return [
{ key: 'unlinked', label: '[ Unlinked Bookmarks ]', links: links.filter((link) => unlinkedLinks.includes(link)) },
{ key: 'missing_covers', label: '[ Missing Covers ]', links: links.filter((link) => !hasMeaningfulCover(workspaceId, categoryName, link)) },
{ key: 'missing_icons', label: '[ Missing Icons ]', links: links.filter((link) => !hasMeaningfulIcon(link)) },
{ key: 'untagged', label: '[ Untagged ]', links: links.filter((link) => { if (hasBookmarkTags(link)) return false; const entry = getCachedEntry(link); return !(entry && hasLibraryTaxonomy(entry)); }) },
{ key: 'no_title', label: '[ No Title ]', links: links.filter((link) => { const title = String(link?.title || '').trim().toLowerCase(); return !title || title === 'untitled' || title === String(link?.url || '').trim().toLowerCase(); }) },
{ key: 'needs_review', label: '[ Needs Review ]', links: links.filter((link) => { const entry = getCachedEntry(link); if (!entry) return false; const confidence = getDerivedConfidenceValue(entry); return (Number.isFinite(confidence) && confidence < 0.5) || !Number.isFinite(getDerivedRatingValue(link, entry)); }) },
{ key: 'missing_notes', label: '[ Missing Notes ]', links: links.filter((link) => { const entry = getCachedEntry(link); if (!entry) return false; const hasBookmarkNote = typeof link?.notes === 'string' && link.notes.trim().length > 0; if (hasBookmarkNote) return false; return ![entry.summary, entry.notes, entry.description].some((value) => { if (typeof value !== 'string') return false; const trimmed = value.trim(); if (!trimmed) return false; if (isAutoSourceSummary(trimmed)) return false; return true; }); }) },
{ key: 'broken_links', label: '[ Broken / Invalid Links ]', links: links.filter((link) => { if (!link?.url || typeof link.url !== 'string') return true; const normalized = link.url.trim().toLowerCase(); return normalized === '' || normalized === '#' || normalized.startsWith('javascript:'); }) }
];
}

function buildReadingGhostBuckets(links) {
return [
{ key: 'unread', label: '[ Plan to Read ]', links: links.filter((link) => { const entry = getCachedEntry(link); if (!entry) return false; return entry?.progress === 0 || entry?.libraryStatus?.id === 'plan_to_read'; }) },
{ key: 'reading', label: '[ Actively Reading ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'reading') },
{ key: 'completed', label: '[ Completed ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'completed') },
{ key: 'on_hold', label: '[ On Hold ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'on_hold') },
{ key: 'dropped', label: '[ Dropped ]', links: links.filter((link) => getCachedEntry(link)?.libraryStatus?.id === 'dropped') }
];
}

function buildTaskStatusGhostBuckets(links) {
const isTaskEnabledFn = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
    ? window.EveBookmarkFolders.isTaskEnabledForLink : null;
if (!isTaskEnabledFn) return [];
return [
{ key: 'done', label: '[ Done ]', links: links.filter((link) => isTaskEnabledFn(link) && !!link.done) },
{ key: 'pending', label: '[ Pending ]', links: links.filter((link) => isTaskEnabledFn(link) && !link.done) },
{ key: 'not_task', label: '[ Not Tracked ]', links: links.filter((link) => !isTaskEnabledFn(link)) }
];
}

function buildTrueValueGhostBuckets(links) {
const tvApi = window.EveTrueValue;
if (!tvApi) return [];
const tvData = tvApi.computeTrueValues(links, workspaceId, categoryName, { forceEnabled: true });
if (!tvData || !Object.keys(tvData).length) return [];
const locked = []; const above = []; const near = []; const below = [];
links.forEach((link) => {
    const tv = tvData[String(link?.id || '')];
    if (!tv) return;
    if (tv.locked) { locked.push(link); return; }
    if (tv.percent > 100) above.push(link);
    else if (tv.percent >= 95) near.push(link);
    else below.push(link);
});
return [
{ key: 'tv_locked', label: '[ Locked (100%) ]', links: locked },
{ key: 'tv_above', label: '[ Above True (>100%) ]', links: above },
{ key: 'tv_near', label: '[ Near True (95â€“100%) ]', links: near },
{ key: 'tv_below', label: '[ Below True (<95%) ]', links: below }
];
}

function buildActivityGhostBuckets(links) {
return [
{ key: 'recent', label: '[ Recently Updated ]', links: links.filter((link) => { if (!link?.updatedAt) return false; return Number(new Date(link.updatedAt).getTime()) >= recentTime; }) },
{ key: 'recently_visited', label: '[ Recently Visited ]', links: links.filter((link) => { const value = link?.lastVisited || link?.updatedAt || link?.createdAt || 0; const ts = Number(new Date(value).getTime()); return Number.isFinite(ts) && ts > 0 && (nowMs - ts) < recentVisMs; }) },
{ key: 'stale', label: '[ Stale Bookmarks ]', links: links.filter((link) => { const value = link?.lastVisited || link?.updatedAt || link?.createdAt || 0; const ts = Number(new Date(value).getTime()); return Number.isFinite(ts) && ts > 0 && (nowMs - ts) > staleMs; }) }
];
}

function buildInsightsGhostBuckets(links) {
const duplicateCounts = {};
links.forEach((link) => { const normalized = getNormalizedDuplicateUrl(link); if (!normalized) return; duplicateCounts[normalized] = (duplicateCounts[normalized] || 0) + 1; });
const largeFolderLinks = buildLargeFolderScopeLinks(links);
return [
{ key: 'top_rated', label: '[ Top Rated ]', links: links.filter((link) => { const rating = getDerivedRatingValue(link, getCachedEntry(link)); return Number.isFinite(rating) && rating >= 8; }) },
{ key: 'duplicate_suspects', label: '[ Duplicate Suspects ]', links: links.filter((link) => { const normalized = getNormalizedDuplicateUrl(link); return !!normalized && duplicateCounts[normalized] > 1; }) },
{ key: 'ancients', label: '[ The Ancients ]', links: links.filter((link) => { const createdAt = Number(new Date(link?.createdAt).getTime()); return Number.isFinite(createdAt) && createdAt > 0 && (nowMs - createdAt) > ancientsMs; }) },
{ key: 'large_folders', label: '[ Large Folders (>15) ]', links: largeFolderLinks }
];
}

function buildLinkHealthGhostBuckets(links) {
if (!window.EveSemanticDrift) return [];
return [
{ key: 'dead_links', label: '[ Dead Links ]', links: links.filter((link) => window.EveSemanticDrift.getHealthInfo(link.url)?.status === 'dead') },
{ key: 'redirected_links', label: '[ Redirected Links ]', links: links.filter((link) => window.EveSemanticDrift.getHealthInfo(link.url)?.status === 'redirected') },
{ key: 'title_drift', label: '[ Title Drift ]', links: links.filter((link) => !!window.EveSemanticDrift.getHealthInfo(link.url)?.hasTitleDrift) },
{ key: 'orphaned_lib', label: '[ Orphaned Library Entries ]', links: links.filter((link) => { const entry = getCachedEntry(link); const health = window.EveSemanticDrift.getHealthInfo(link.url); return !!entry && health?.status === 'dead'; }) }
];
}

const derivedDimensionDefinitions = [
{ key: 'tag_index', label: '[ By Tags ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (link, entry) => getDerivedTagValues(link, entry), { normalizeKey: (value) => String(value || '').trim().toLowerCase() }); } },
{ key: 'genre_index', label: '[ By Genres ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (_, entry) => getDerivedGenreValues(entry), { normalizeKey: (value) => String(value || '').trim().toLowerCase() }); } },
{ key: 'author_index', label: '[ By Authors ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (_, entry) => getDerivedAuthorValues(entry), { normalizeKey: (value) => String(value || '').trim().toLowerCase() }); } },
{ key: 'language_index', label: '[ By Language ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (link, entry) => getDerivedLanguageValues(link, entry), { normalizeKey: (value) => String(value || '').trim().toLowerCase() }); } },
{ key: 'status_index', label: '[ By Status ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (link, entry) => { const value = getDerivedStatusValue(link, entry); return value ? [value] : []; }, { normalizeKey: (value) => String(value || '').trim().toLowerCase(), order: ['Reading', 'Plan to Read', 'Completed', 'On Hold', 'Dropped'] }); } },
{ key: 'rating_index', label: '[ By Rating ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (link, entry) => { const rating = getDerivedRatingValue(link, entry); const bucket = getRatingBucketLabel(rating); return bucket ? [bucket] : []; }, { order: ['9+', '8-8.9', '7-7.9', '5-6.9', 'Under 5'] }); } },
{ key: 'confidence_index', label: '[ By Confidence ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (_, entry) => { const confidence = getDerivedConfidenceValue(entry); const bucket = getConfidenceBucketLabel(confidence); return bucket ? [bucket] : []; }, { order: ['0.90+', '0.75-0.89', '0.50-0.74', 'Below 0.50'] }); } },
{ key: 'title_index', label: '[ By Title ]', buildBuckets(links) { return buildTitleBucketsForLinks(links); } },
{ key: 'last_read_index', label: '[ By Last Read ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (link) => { const bucket = getDerivedTimelineBucket(link); return bucket ? [bucket] : []; }, { order: ['Today', 'This Week', 'This Month', 'This Year', 'Older'] }); } },
{ key: 'progress_index', label: '[ By Progress Units ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (_, entry) => { const progress = getDerivedProgressValue(entry); const bucket = getProgressBucketLabel(progress); return bucket ? [bucket] : []; }, { order: ['500+ Units', '200-499 Units', '100-199 Units', '50-99 Units', '10-49 Units', 'Under 10 Units'] }); } },
{ key: 'demographic_index', label: '[ By Demographic ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (_, entry) => { const value = getDerivedDemographicValue(entry); return value ? [value] : []; }, { normalizeKey: (value) => String(value || '').trim().toLowerCase() }); } },
{ key: 'publication_index', label: '[ By Publication Era ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (_, entry) => { const year = getDerivedPublicationValue(entry); const bucket = getPublicationBucketLabel(year); return bucket ? [bucket] : []; }); } },
{ key: 'truevalue_index', label: '[ By True Value Bracket ]', buildBuckets(links) {
    const tvApi = window.EveTrueValue;
    if (!tvApi) return [];
    const tvData = tvApi.computeTrueValues(links, workspaceId, categoryName, { forceEnabled: true });
    if (!tvData || !Object.keys(tvData).length) return [];
    const bucketMap = new Map([
        ['locked', { key: 'locked', label: 'Locked (100%)', links: [] }],
        ['120+', { key: '120+', label: '120%+', links: [] }],
        ['110-120', { key: '110-120', label: '110\u2013120%', links: [] }],
        ['100-110', { key: '100-110', label: '100\u2013110%', links: [] }],
        ['90-100', { key: '90-100', label: '90\u2013100%', links: [] }],
        ['below-90', { key: 'below-90', label: 'Below 90%', links: [] }]
    ]);
    links.forEach((link) => {
        const tv = tvData[String(link?.id || '')];
        if (!tv) return;
        if (tv.locked) { bucketMap.get('locked').links.push(link); return; }
        const p = tv.percent;
        if (p >= 120) bucketMap.get('120+').links.push(link);
        else if (p >= 110) bucketMap.get('110-120').links.push(link);
        else if (p >= 100) bucketMap.get('100-110').links.push(link);
        else if (p >= 90) bucketMap.get('90-100').links.push(link);
        else bucketMap.get('below-90').links.push(link);
    });
    return Array.from(bucketMap.values()).filter((b) => b.links.length > 0);
} },
{ key: 'task_index', label: '[ By Task Completion ]', buildBuckets(links) {
    const isTaskEnabledFn = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
        ? window.EveBookmarkFolders.isTaskEnabledForLink : null;
    if (!isTaskEnabledFn) return [];
    return [
        { key: 'done', label: 'Done', links: links.filter((link) => isTaskEnabledFn(link) && !!link.done) },
        { key: 'pending', label: 'Pending', links: links.filter((link) => isTaskEnabledFn(link) && !link.done) },
        { key: 'not_tracked', label: 'Not Tracked', links: links.filter((link) => !isTaskEnabledFn(link)) }
    ].filter((b) => b.links.length > 0);
} }
];

const recursiveGhostGroupDefinitions = [
{ key: 'linkHealth', label: '[ Link Health ]', enabledKey: null, relatedDimensions: ['linkHealth'], buildBuckets: buildLinkHealthGhostBuckets },
{ key: 'domains', label: '[ Domains ]', enabledKey: 'domain_grouping', relatedDimensions: ['domains'], buildBuckets(links) { return buildDomainBuckets(links).map((bucket) => ({ key: bucket.key, label: `[ ${bucket.label} ]`, links: bucket.links })); } },
{ key: 'readingStatus', label: '[ Reading Status ]', enabledKey: null, relatedDimensions: ['readingStatus', 'status_index'], suppressIfRelatedDimensionPresent: true, buildBuckets: buildReadingGhostBuckets },
{ key: 'taskStatus', label: '[ Task Status ]', enabledKey: null, relatedDimensions: ['taskStatus', 'task_index'], suppressIfRelatedDimensionPresent: true, buildBuckets: buildTaskStatusGhostBuckets },
{ key: 'maintenance', label: '[ Maintenance ]', enabledKey: null, relatedDimensions: ['maintenance'], buildBuckets: buildMaintenanceGhostBuckets },
{ key: 'activity', label: '[ Activity ]', enabledKey: null, relatedDimensions: ['activity'], buildBuckets: buildActivityGhostBuckets },
{ key: 'insights', label: '[ Insights ]', enabledKey: null, relatedDimensions: ['insights'], buildBuckets: buildInsightsGhostBuckets },
{ key: 'trueValue', label: '[ True Value ]', enabledKey: null, relatedDimensions: ['trueValue', 'truevalue_index'], suppressIfRelatedDimensionPresent: true, buildBuckets: buildTrueValueGhostBuckets }
];

return { buildLargeFolderScopeLinks, derivedDimensionDefinitions, recursiveGhostGroupDefinitions };
};
})(window.EveBookmarkFolders);
