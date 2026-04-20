window.EveBookmarkFolders = window.EveBookmarkFolders || {};
(function (ns) {
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

function buildDerivedGhostId(prefix, parts) {
return `__ghost_${prefix}_${parts.map((part) => String(part || '').replace(/[^a-zA-Z0-9]+/g, '_')).join('_')}__`;
}

function filterDerivedBuckets(definition, links, chain, derivedValueLimit) {
const usedValues = new Set((Array.isArray(chain) ? chain : []).filter((item) => item?.dimension === definition.key).map((item) => String(item.valueKey || '').trim().toLowerCase()).filter(Boolean));
return definition.buildBuckets(links).filter((bucket) => {
const bucketKey = String(bucket?.key || '').trim().toLowerCase();
if (!bucketKey) return false;
if (usedValues.has(bucketKey)) return false;
return Array.isArray(bucket?.links) && bucket.links.length > 0;
}).slice(0, derivedValueLimit);
}

ns._ghostRecursionHelpers = Object.assign(ns._ghostRecursionHelpers || {}, {
buildDerivedGhostId,
filterDerivedBuckets,
sortBuckets
});
})(window.EveBookmarkFolders);
