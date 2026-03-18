window.EveBookmarkFolders = window.EveBookmarkFolders || {};
(function (ns) {
const shared = ns._shared || {};
const {
buildNodeMap, normalizeFolderId, getNormalizedDuplicateUrl,
hasMeaningfulIcon, hasBookmarkTags, hasLibraryTaxonomy, hasMeaningfulCover,
isAutoSourceSummary, uniqueNonEmpty,
getDerivedTagValues, getDerivedGenreValues, getDerivedAuthorValues, getDerivedLanguageValues,
getDerivedStatusValue, getDerivedRatingValue, getDerivedConfidenceValue,
getRatingBucketLabel, getConfidenceBucketLabel,
getDerivedProgressValue, getProgressBucketLabel,
getDerivedDemographicValue, getDerivedPublicationValue, getPublicationBucketLabel,
getTitleInitial, getCoarseTitleBucket, getDerivedTimelineBucket
} = shared;

function populateGhostHierarchy(env) {
const {
workspaceId, categoryName, activeLinks, scopedNodes, activeRealFolderId,
isGhostEnabled, ghostCategories, activeSubGhosts, rootRecursiveTasks,
getCachedEntry, preferredGhostChain, derivedGhostNodeBudget, derivedValueLimit, derivedDepthLimit,
recentTime, nowMs, staleMs, recentVisMs, ancientsMs,
deadLinks, redirectedLinks, titleDriftLinks, orphanedLibEntries,
recentLinks, unlinkedLinks, missingIcons, missingCovers, duplicateSuspects,
untaggedLinks, needsReviewLinks, unreadLinks, readingLinks, completedLinks, onHoldLinks, droppedLinks,
brokenLinks, missingNotesLinks, topRatedLinks, recentlyVisited, staleLinks, ancientsLinks, noTitleLinks,
domainGhosts, topGenres
} = env;

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

function sortBuckets(buckets, preferredOrder) {
const orderMap = new Map();
(Array.isArray(preferredOrder) ? preferredOrder : []).forEach((value, index) => orderMap.set(String(value), index));
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
if (!map.has(key)) map.set(key, { key, label: String(label).trim(), links: [] });
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
{ key: 'publication_index', label: '[ By Publication Era ]', buildBuckets(links) { return buildBucketsFromExtractor(links, (_, entry) => { const year = getDerivedPublicationValue(entry); const bucket = getPublicationBucketLabel(year); return bucket ? [bucket] : []; }); } }
];

const recursiveGhostGroupDefinitions = [
{ key: 'linkHealth', label: '[ Link Health ]', enabledKey: null, relatedDimensions: ['linkHealth'], buildBuckets: buildLinkHealthGhostBuckets },
{ key: 'domains', label: '[ Domains ]', enabledKey: 'domain_grouping', relatedDimensions: ['domains'], buildBuckets(links) { return buildDomainBuckets(links).map((bucket) => ({ key: bucket.key, label: `[ ${bucket.label} ]`, links: bucket.links })); } },
{ key: 'readingStatus', label: '[ Reading Status ]', enabledKey: null, relatedDimensions: ['readingStatus', 'status_index'], suppressIfRelatedDimensionPresent: true, buildBuckets: buildReadingGhostBuckets },
{ key: 'maintenance', label: '[ Maintenance ]', enabledKey: null, relatedDimensions: ['maintenance'], buildBuckets: buildMaintenanceGhostBuckets },
{ key: 'activity', label: '[ Activity ]', enabledKey: null, relatedDimensions: ['activity'], buildBuckets: buildActivityGhostBuckets },
{ key: 'insights', label: '[ Insights ]', enabledKey: null, relatedDimensions: ['insights'], buildBuckets: buildInsightsGhostBuckets }
];

function addGhost(catKey, id, name, linksArray, enabledKey, bucketKey) {
if (linksArray.length > 0 && isGhostEnabled(enabledKey)) {
activeSubGhosts.push({ id, name, parentId: ghostCategories[catKey].id, isGhost: true, isGhostDerivedValue: false, isGhostDerivedGroup: false, _ghostLinks: linksArray, _ghostScopeRootId: activeRealFolderId || null });
ghostCategories[catKey]._hasActiveChildren = true;
rootRecursiveTasks.push({ id, links: linksArray, chain: [{ dimension: catKey, valueKey: String(bucketKey || id || name || '').trim().toLowerCase(), label: name }] });
}
}

function buildDerivedGhostId(prefix, parts) {
return `__ghost_${prefix}_${parts.map((part) => String(part || '').replace(/[^a-zA-Z0-9]+/g, '_')).join('_')}__`;
}

function filterDerivedBuckets(definition, links, chain) {
const usedValues = new Set((Array.isArray(chain) ? chain : []).filter((item) => item?.dimension === definition.key).map((item) => String(item.valueKey || '').trim().toLowerCase()).filter(Boolean));
return definition.buildBuckets(links).filter((bucket) => {
const bucketKey = String(bucket?.key || '').trim().toLowerCase();
if (!bucketKey) return false;
if (usedValues.has(bucketKey)) return false;
return Array.isArray(bucket?.links) && bucket.links.length > 0;
}).slice(0, derivedValueLimit);
}

function addRecursiveGhostGroups(parentId, links, chain, depth) {
if (!Array.isArray(links) || links.length < 1) return [];
if (depth >= derivedDepthLimit) return [];
if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return [];
const pendingRecursions = [];
recursiveGhostGroupDefinitions.forEach((definition) => {
if (definition.enabledKey && !isGhostEnabled(definition.enabledKey)) return;
if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;
const usedValueKeys = new Set((Array.isArray(chain) ? chain : []).filter((item) => item?.dimension === definition.key).map((item) => String(item.valueKey || '').trim().toLowerCase()).filter(Boolean));
const relatedDimensions = Array.isArray(definition.relatedDimensions) && definition.relatedDimensions.length ? definition.relatedDimensions : [definition.key];
const hasMatchingDimension = (Array.isArray(chain) ? chain : []).some((item) => relatedDimensions.includes(item?.dimension));
if (definition.suppressIfRelatedDimensionPresent && hasMatchingDimension) return;
const buckets = (definition.buildBuckets(links) || []).filter((bucket) => {
const key = String(bucket?.key || '').trim().toLowerCase();
if (!key) return false;
if (usedValueKeys.has(key)) return false;
return Array.isArray(bucket?.links) && bucket.links.length > 0;
}).slice(0, derivedValueLimit);
if (!buckets.length) return;
const groupId = buildDerivedGhostId('group', [parentId, definition.key, depth]);
activeSubGhosts.push({ id: groupId, name: definition.label, parentId, isGhost: true, isGhostDerivedGroup: true, isGhostDerivedValue: false, _ghostLinks: [], _ghostFilterChain: Array.isArray(chain) ? chain.slice() : [], _ghostScopeCount: links.length, _ghostScopeRootId: activeRealFolderId || null });
derivedGhostNodeBudget.count += 1;
buckets.forEach((bucket, bucketIndex) => {
if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;
const nextChain = [...(Array.isArray(chain) ? chain : []), { dimension: definition.key, valueKey: String(bucket.key || '').trim().toLowerCase(), label: bucket.label }];
const valueId = buildDerivedGhostId('value', [parentId, definition.key, depth, bucketIndex, bucket.key]);
activeSubGhosts.push({ id: valueId, name: bucket.label, parentId: groupId, isGhost: true, isGhostDerivedGroup: false, isGhostDerivedValue: true, _ghostLinks: bucket.links, _ghostFilterChain: nextChain, _ghostScopeCount: bucket.links.length, _ghostScopeRootId: activeRealFolderId || null });
derivedGhostNodeBudget.count += 1;
pendingRecursions.push({ id: valueId, links: bucket.links, chain: nextChain });
});
});
return pendingRecursions;
}

function addDerivedChildren(parentId, links, chain, depth) {
if (!Array.isArray(links) || links.length < 1) return [];
if (depth >= derivedDepthLimit) return [];
if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return [];
const pendingRecursions = [];
derivedDimensionDefinitions.forEach((definition) => {
if (!isGhostEnabled(definition.key)) return;
if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;
const buckets = filterDerivedBuckets(definition, links, chain);
if (!buckets.length) return;
const groupId = buildDerivedGhostId('index_group', [parentId, definition.key, depth]);
activeSubGhosts.push({ id: groupId, name: definition.label, parentId, isGhost: true, isGhostDerivedGroup: true, isGhostDerivedValue: false, _ghostLinks: [], _ghostFilterChain: Array.isArray(chain) ? chain.slice() : [], _ghostScopeCount: links.length, _ghostScopeRootId: activeRealFolderId || null });
derivedGhostNodeBudget.count += 1;
ghostCategories.indexes._hasActiveChildren = true;
buckets.forEach((bucket, bucketIndex) => {
if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;
const nextChain = [...(Array.isArray(chain) ? chain : []), { dimension: definition.key, valueKey: String(bucket.key || '').trim().toLowerCase(), label: bucket.label }];
const valueId = buildDerivedGhostId('index_value', [parentId, definition.key, depth, bucketIndex, bucket.key]);
activeSubGhosts.push({ id: valueId, name: `[ ${bucket.label} ]`, parentId: groupId, isGhost: true, isGhostDerivedGroup: false, isGhostDerivedValue: true, _ghostLinks: bucket.links, _ghostFilterChain: nextChain, _ghostScopeCount: bucket.links.length, _ghostScopeRootId: activeRealFolderId || null });
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
if ((Number(task.depth || 0)) <= 1) seedQueue.push(task);
else deepQueue.push(task);
}
while ((seedQueue.length > 0 || deepQueue.length > 0) && derivedGhostNodeBudget.count < derivedGhostNodeBudget.max) {
let task = null;
if (seedQueue.length > 0) {
seedQueue.sort((left, right) => {
const leftScore = getPreferredChainScore(left?.chain);
const rightScore = getPreferredChainScore(right?.chain);
if (leftScore !== rightScore) return rightScore - leftScore;
const leftDepth = Number(left?.depth || 0); const rightDepth = Number(right?.depth || 0);
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
const leftDepth = Number(left?.depth || 0); const rightDepth = Number(right?.depth || 0);
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
const shouldAddRecursiveGroups = !(task.depth === 0 && String(task.id || '') === String(ghostCategories.indexes.id) && (!Array.isArray(task.chain) || task.chain.length === 0));
const recursiveTasks = shouldAddRecursiveGroups ? (addRecursiveGhostGroups(task.id, task.links, task.chain, task.depth) || []) : [];
derivedTasks.forEach((childTask) => pushTask({ id: childTask.id, links: childTask.links, chain: childTask.chain, depth: task.depth + 1 }));
recursiveTasks.forEach((childTask) => pushTask({ id: childTask.id, links: childTask.links, chain: childTask.chain, depth: task.depth + 1 }));
}
}

addGhost('linkHealth', '__ghost_dead_links__', '[ Dead Links ]', deadLinks, 'dead_links', 'dead_links');
addGhost('linkHealth', '__ghost_redirected_links__', '[ Redirected Links ]', redirectedLinks, 'redirected_links', 'redirected_links');
addGhost('linkHealth', '__ghost_title_drift__', '[ Title Drift ]', titleDriftLinks, 'title_drift', 'title_drift');
addGhost('linkHealth', '__ghost_orphaned_lib__', '[ Orphaned Library Entries ]', orphanedLibEntries, 'orphaned_lib', 'orphaned_lib');

domainGhosts.forEach((domainGhost) => {
const id = `__ghost_domain_${domainGhost.domain.replace(/[^a-zA-Z0-9]/g, '_')}__`;
const name = `[ ${domainGhost.domain.toUpperCase()} ]`;
addGhost('domains', id, name, domainGhost.links, 'domain_grouping', domainGhost.domain);
});

addGhost('readingStatus', '__ghost_unread__', '[ Plan to Read ]', unreadLinks, 'unread', 'unread');
addGhost('readingStatus', '__ghost_reading__', '[ Actively Reading ]', readingLinks, 'reading', 'reading');
addGhost('readingStatus', '__ghost_completed__', '[ Completed ]', completedLinks, 'completed', 'completed');
addGhost('readingStatus', '__ghost_on_hold__', '[ On Hold ]', onHoldLinks, 'on_hold', 'on_hold');
addGhost('readingStatus', '__ghost_dropped__', '[ Dropped ]', droppedLinks, 'dropped', 'dropped');

addGhost('maintenance', '__ghost_unlinked__', '[ Unlinked Bookmarks ]', unlinkedLinks, 'unlinked', 'unlinked');
addGhost('maintenance', '__ghost_missing_covers__', '[ Missing Covers ]', missingCovers, 'missing_covers', 'missing_covers');
addGhost('maintenance', '__ghost_missing_icons__', '[ Missing Icons ]', missingIcons, 'missing_icons', 'missing_icons');
addGhost('maintenance', '__ghost_untagged__', '[ Untagged ]', untaggedLinks, 'untagged', 'untagged');
addGhost('maintenance', '__ghost_no_title__', '[ No Title ]', noTitleLinks, 'no_title', 'no_title');
addGhost('maintenance', '__ghost_needs_review__', '[ Needs Review ]', needsReviewLinks, 'needs_review', 'needs_review');
addGhost('maintenance', '__ghost_missing_notes__', '[ Missing Notes ]', missingNotesLinks, 'missing_notes', 'missing_notes');
addGhost('maintenance', '__ghost_broken_links__', '[ Broken / Invalid Links ]', brokenLinks, 'broken_links', 'broken_links');

addGhost('activity', '__ghost_recent__', '[ Recently Updated ]', recentLinks, 'recent', 'recent');
addGhost('activity', '__ghost_recently_visited__', '[ Recently Visited ]', recentlyVisited, 'recently_visited', 'recently_visited');
addGhost('activity', '__ghost_stale__', '[ Stale Bookmarks ]', staleLinks, 'stale', 'stale');

addGhost('insights', '__ghost_top_rated__', '[ Top Rated ]', topRatedLinks, 'top_rated', 'top_rated');
addGhost('insights', '__ghost_duplicate_suspects__', '[ Duplicate Suspects ]', duplicateSuspects, 'duplicate_suspects', 'duplicate_suspects');
addGhost('insights', '__ghost_ancients__', '[ The Ancients ]', ancientsLinks, 'ancients', 'ancients');
addGhost('insights', '__ghost_large_folders__', '[ Large Folders (>15) ]', buildLargeFolderScopeLinks(activeLinks), 'large_folders', 'large_folders');

topGenres.forEach((genreBucket) => {
const id = `__ghost_genre_${genreBucket.genre.replace(/[^a-zA-Z0-9]/g, '_')}__`;
const name = `[ Genre: ${genreBucket.genre} ]`;
addGhost('insights', id, name, genreBucket.links, 'library_stats', genreBucket.genre);
});

const derivedExpansionRoots = [];
if (derivedDimensionDefinitions.some((definition) => isGhostEnabled(definition.key))) derivedExpansionRoots.push({ id: ghostCategories.indexes.id, links: activeLinks, chain: [], depth: 0 });
rootRecursiveTasks.forEach((task) => derivedExpansionRoots.push({ id: task.id, links: task.links, chain: task.chain, depth: 1 }));
expandDerivedScopesBreadthFirst(derivedExpansionRoots);
}

ns._ghostRecursion = ns._ghostRecursion || {};
ns._ghostRecursion.populateGhostHierarchy = populateGhostHierarchy;
})(window.EveBookmarkFolders);
