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
const recursionHelpers = ns._ghostRecursionHelpers || {};
const sortBuckets = recursionHelpers.sortBuckets;
const buildDerivedGhostId = recursionHelpers.buildDerivedGhostId;

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
domainGhosts, topGenres,
doneLinks, pendingLinks, notTaskLinks,
tvLockedLinks, tvAboveTrueLinks, tvNearTrueLinks, tvBelowTrueLinks,
linkedLinks, lowConfidenceLinks, highConfidenceLinks
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

const recursionDefinitions = ns._ghostRecursionDefinitions.create({
workspaceId, categoryName, scopedNodes, recentTime, nowMs, staleMs, recentVisMs, ancientsMs,
getCachedEntry, buildNodeMap, normalizeFolderId, getNormalizedDuplicateUrl, hasMeaningfulIcon,
hasBookmarkTags, hasLibraryTaxonomy, hasMeaningfulCover, isAutoSourceSummary, uniqueNonEmpty,
getDerivedTagValues, getDerivedGenreValues, getDerivedAuthorValues, getDerivedLanguageValues,
getDerivedStatusValue, getDerivedRatingValue, getDerivedConfidenceValue, getRatingBucketLabel,
getConfidenceBucketLabel, getDerivedProgressValue, getProgressBucketLabel, getDerivedDemographicValue,
getDerivedPublicationValue, getPublicationBucketLabel, getTitleInitial, getCoarseTitleBucket,
getDerivedTimelineBucket, sortBuckets, buildBucketsFromExtractor, unlinkedLinks
});
const { buildLargeFolderScopeLinks, derivedDimensionDefinitions, recursiveGhostGroupDefinitions } = recursionDefinitions;

function addGhost(catKey, id, name, linksArray, enabledKey, bucketKey) {
if (linksArray.length > 0 && isGhostEnabled(enabledKey)) {
activeSubGhosts.push({ id, name, parentId: ghostCategories[catKey].id, isGhost: true, isGhostDerivedValue: false, isGhostDerivedGroup: false, _ghostLinks: linksArray, _ghostScopeRootId: activeRealFolderId || null });
ghostCategories[catKey]._hasActiveChildren = true;
rootRecursiveTasks.push({ id, links: linksArray, chain: [{ dimension: catKey, valueKey: String(bucketKey || id || name || '').trim().toLowerCase(), label: name }] });
}
}

function ensureGhostCategory(catKey, name) {
if (!catKey) return null;
if (!ghostCategories[catKey]) {
ghostCategories[catKey] = {
id: `__ghost_cat_${String(catKey).replace(/[^a-zA-Z0-9_]/g, '_')}__`,
name: name || `[ ${catKey} ]`,
links: []
};
}
return ghostCategories[catKey];
}

function addRegistrySmartViewGroups() {
const registry = window.EveSmartViewRegistry;
if (!registry || typeof registry.buildGhostGroups !== 'function') return;
let groups = [];
try {
groups = registry.buildGhostGroups(env) || [];
} catch (error) {
console.warn('[SmartViewRegistry] Failed to build smart view groups', error);
return;
}
groups.forEach((group, groupIndex) => {
const catKey = String(group?.categoryKey || 'smartViews').trim();
const category = ensureGhostCategory(catKey, group?.categoryName || '[ Smart Views ]');
if (!category) return;
const buckets = (Array.isArray(group?.buckets) ? group.buckets : []).filter((bucket) => {
return Array.isArray(bucket?.links) && (bucket.links.length > 0 || bucket.keepWhenEmpty);
});
if (!buckets.length || !isGhostEnabled(group?.enabledKey || group?.groupKey || catKey)) return;
category._hasActiveChildren = true;
const groupId = buildDerivedGhostId('registry_group', [catKey, group?.groupKey || groupIndex]);
activeSubGhosts.push({
id: groupId,
name: group?.groupLabel || '[ Smart View ]',
parentId: category.id,
isGhost: true,
isGhostDerivedGroup: true,
isGhostDerivedValue: false,
_ghostLinks: [],
_ghostFilterChain: [],
_ghostScopeCount: activeLinks.length,
_ghostScopeRootId: activeRealFolderId || null,
_smartViewGroup: group?.groupKey || catKey
});
derivedGhostNodeBudget.count += 1;
buckets.slice(0, derivedValueLimit).forEach((bucket, bucketIndex) => {
if (derivedGhostNodeBudget.count >= derivedGhostNodeBudget.max) return;
const bucketKey = String(bucket?.key || bucket?.label || bucketIndex).trim().toLowerCase();
const valueId = buildDerivedGhostId('registry_value', [catKey, group?.groupKey || groupIndex, bucketKey]);
const chain = [{
dimension: group?.groupKey || catKey,
valueKey: bucketKey,
label: bucket?.label || '[ Smart View ]'
}];
activeSubGhosts.push({
id: valueId,
name: bucket?.label || '[ Smart View ]',
parentId: groupId,
isGhost: true,
isGhostDerivedGroup: false,
isGhostDerivedValue: true,
_ghostLinks: bucket.links,
_ghostFilterChain: chain,
_ghostScopeCount: bucket.links.length,
_ghostScopeRootId: activeRealFolderId || null,
_smartViewGroup: group?.groupKey || catKey,
_smartViewCriteria: bucket.criteria || null,
_smartViewWhy: bucket.why || '',
_smartViewUserId: bucket.userSmartViewId || ''
});
derivedGhostNodeBudget.count += 1;
if (!bucket.links.length) return;
rootRecursiveTasks.push({ id: valueId, links: bucket.links, chain });
});
});
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
const buckets = recursionHelpers.filterDerivedBuckets(definition, links, chain, derivedValueLimit);
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
// --- Lazy expansion: only expand along the user's preferred chain path + 1 depth ahead ---
const hasChain = preferredGhostChain.length > 0;
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

// --- Lazy gate: skip deep expansion for off-path branches ---
// Depth 0 (root Smart Indexes, root recursive groups) always expands.
// Depth 1+ only expands if the task's chain overlaps the user's preferred chain
// or if no chain exists (user at root), only expand depth 0 and 1.
if (hasChain && task.depth > 0) {
    const chainScore = getPreferredChainScore(task.chain);
    // Only expand if this branch is on or adjacent to the user's current path
    if (chainScore < task.depth) continue;
} else if (!hasChain && task.depth > 1) {
    // No navigation chain: the user is at root. Only expand depth 0 and 1.
    continue;
}

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

addGhost('taskStatus', '__ghost_done__', '[ Done ]', doneLinks || [], 'task_done', 'done');
addGhost('taskStatus', '__ghost_pending__', '[ Pending ]', pendingLinks || [], 'task_pending', 'pending');
addGhost('taskStatus', '__ghost_not_task__', '[ Not Tracked ]', notTaskLinks || [], 'task_not_tracked', 'not_task');

addGhost('trueValue', '__ghost_tv_locked__', '[ Locked (Unlinked) ]', tvLockedLinks || [], 'tv_locked', 'tv_locked');
addGhost('trueValue', '__ghost_tv_above__', '[ Above True (>100%) ]', tvAboveTrueLinks || [], 'tv_above', 'tv_above');
addGhost('trueValue', '__ghost_tv_near__', '[ Near True (95\u2013100%) ]', tvNearTrueLinks || [], 'tv_near', 'tv_near');
addGhost('trueValue', '__ghost_tv_below__', '[ Below True (<95%) ]', tvBelowTrueLinks || [], 'tv_below', 'tv_below');

addGhost('insights', '__ghost_linked__', '[ Library-Linked ]', linkedLinks || [], 'library_linked', 'library_linked');
addGhost('insights', '__ghost_low_confidence__', '[ Low Confidence ]', lowConfidenceLinks || [], 'low_confidence', 'low_confidence');
addGhost('insights', '__ghost_high_confidence__', '[ High Confidence ]', highConfidenceLinks || [], 'high_confidence', 'high_confidence');

addRegistrySmartViewGroups();

const derivedExpansionRoots = [];
if (derivedDimensionDefinitions.some((definition) => isGhostEnabled(definition.key))) derivedExpansionRoots.push({ id: ghostCategories.indexes.id, links: activeLinks, chain: [], depth: 0 });
rootRecursiveTasks.forEach((task) => derivedExpansionRoots.push({ id: task.id, links: task.links, chain: task.chain, depth: 1 }));
expandDerivedScopesBreadthFirst(derivedExpansionRoots);
}

ns._ghostRecursion = ns._ghostRecursion || {};
ns._ghostRecursion.populateGhostHierarchy = populateGhostHierarchy;
})(window.EveBookmarkFolders);
