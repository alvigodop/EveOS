window.EveSmartViewRegistry = window.EveSmartViewRegistry || {};

(function (api) {
    const h = api._shared || {};
    const {
        text,
        normalizeKey,
        normalizedMatch,
        ensureStore,
        getScopedKey,
        getIdentifierIds,
        getRelatedUrlEntries,
        getSourceProviderValues,
        getSourceFreshnessBuckets,
        buildFolderHealthResolver,
        getOriginScopeValues,
        getPinScopeValues,
        getMergeStateValues,
        getCoverStateValues,
        normalizeReusableCriteria
    } = h;

    function listCardViews(workspaceId, categoryName) {
        const store = ensureStore();
        const scopedKey = getScopedKey(workspaceId, categoryName);
        return (Array.isArray(store.cardViews[scopedKey]) ? store.cardViews[scopedKey] : [])
            .filter((view) => view && view.enabled !== false);
    }

    function validateView(view) {
        const label = text(view?.label || view?.name, '');
        if (!label) return { ok: false, error: 'Smart View name is required.' };
        const criteria = view?.criteria && typeof view.criteria === 'object' ? view.criteria : {};
        return {
            ok: true,
            value: {
                id: text(view?.id, 'sv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
                label,
                scope: view?.scope || 'card',
                criteria,
                sort: view?.sort || { by: 'title', direction: 'asc' },
                presentation: view?.presentation || { layout: 'folder' },
                enabledByDefault: view?.enabledByDefault !== false,
                enabled: view?.enabled !== false,
                createdAt: view?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };
    }

    function saveCardView(workspaceId, categoryName, view) {
        const store = ensureStore();
        const checked = validateView(view);
        if (!checked.ok) return checked;
        const scopedKey = getScopedKey(workspaceId, categoryName);
        const list = Array.isArray(store.cardViews[scopedKey]) ? store.cardViews[scopedKey].slice() : [];
        const next = checked.value;
        const index = list.findIndex((item) => text(item?.id, '') === next.id);
        if (index >= 0) list[index] = next;
        else list.unshift(next);
        store.cardViews[scopedKey] = list;
        if (typeof saveConfig === 'function') {
            saveConfig({
                source: 'smart-view-save',
                meta: { workspaceId: text(workspaceId, 'main'), categoryName: text(categoryName, 'Unsorted') }
            });
        }
        return { ok: true, view: next };
    }

    function deleteCardView(workspaceId, categoryName, viewId) {
        const store = ensureStore();
        const scopedKey = getScopedKey(workspaceId, categoryName);
        const list = Array.isArray(store.cardViews[scopedKey]) ? store.cardViews[scopedKey] : [];
        store.cardViews[scopedKey] = list.filter((view) => text(view?.id, '') !== text(viewId, ''));
        if (typeof saveConfig === 'function') {
            saveConfig({
                source: 'smart-view-delete',
                meta: { workspaceId: text(workspaceId, 'main'), categoryName: text(categoryName, 'Unsorted') }
            });
        }
        return true;
    }

    function matchesCriteria(link, entry, criteria, context) {
        const c = normalizeReusableCriteria(criteria);
        const haystack = [
            link?.title, link?.url, link?.notes,
            entry?.title, entry?.summary, entry?.author, entry?.genre,
            normalizeList(entry?.tags).join(' '),
            normalizeList(entry?.titleAltNames || entry?.altTitles).join(' '),
            getIdentifierIds(link).join(' '),
            getRelatedUrlEntries(link).map((item) => item.url + ' ' + item.label).join(' ')
        ].join(' ').toLowerCase();
        const query = text(c.query, '').toLowerCase();
        if (query && !haystack.includes(query)) return false;

        if (c.hasRelatedUrls && !getRelatedUrlEntries(link).length) return false;
        if (c.identifiers && normalizeList(c.identifiers).length) {
            const ids = new Set(getIdentifierIds(link).map((id) => id.toLowerCase()));
            const labels = new Set(getIdentifierIds(link).map((id) => (getDefinitionsById().get(id)?.label || id).toLowerCase()));
            const wanted = normalizeList(c.identifiers).map((id) => id.toLowerCase());
            if (!wanted.some((id) => ids.has(id) || labels.has(id))) return false;
        }
        if (c.provider) {
            if (!normalizedMatch(getSourceProviderValues(link, entry), c.provider)) return false;
        }
        if (c.status && !normalizedMatch([entry?.status, entry?.libraryStatus?.label, entry?.libraryStatus?.id], c.status, { exact: true })) return false;
        if (c.sourceFreshness) {
            if (!normalizedMatch(getSourceFreshnessBuckets(link, entry, Date.now()), c.sourceFreshness, { exact: true })) return false;
        }
        if (c.folderHealth) {
            if (!normalizedMatch(buildFolderHealthResolver(context)(link), c.folderHealth, { exact: true })) return false;
        }
        if (c.originScope) {
            if (!normalizedMatch(getOriginScopeValues(link, context), c.originScope, { exact: true })) return false;
        }
        if (c.mergeState) {
            const duplicateUrlCounts = context?.duplicateUrlCounts || buildDuplicateUrlCounts(context?.activeLinks || []);
            if (!normalizedMatch(getMergeStateValues(link, entry, duplicateUrlCounts), c.mergeState, { exact: true })) return false;
        }
        if (c.pinScope) {
            if (!normalizedMatch(getPinScopeValues(link), c.pinScope, { exact: true })) return false;
        }
        if (c.pinned === true && getPinScopeValues(link).includes('Not Pinned')) return false;
        if (c.hasCover === true && !getCoverStateValues(link, entry).includes('Has Cover')) return false;
        if (c.hasAdditionalCovers === true && !getCoverStateValues(link, entry).includes('Has Additional Covers')) return false;
        if (c.missingCover === true) {
            if (!getCoverStateValues(link, entry).includes('Missing Cover')) return false;
        }
        return true;
    }

    function evaluateView(view, context) {
        const links = Array.isArray(context?.activeLinks) ? context.activeLinks : [];
        const getCachedEntry = typeof context?.getCachedEntry === 'function' ? context.getCachedEntry : () => null;
        const evaluationContext = Object.assign({}, context, {
            activeLinks: links,
            duplicateUrlCounts: context?.duplicateUrlCounts || buildDuplicateUrlCounts(links)
        });
        return links.filter((link) => matchesCriteria(link, getCachedEntry(link), view?.criteria, evaluationContext));
    }

    function evaluateViewFromIndex(view, context) {
        const indexedRecords = getIndexedBookmarkRecords(context);
        if (!indexedRecords) return null;
        const liveLinks = Array.isArray(context?.activeLinks) ? context.activeLinks : getLiveLinks();
        const liveById = buildLiveLinkMap(liveLinks);
        const getCachedEntry = typeof context?.getCachedEntry === 'function' ? context.getCachedEntry : () => null;
        const evaluationContext = Object.assign({}, context, {
            activeLinks: liveLinks,
            duplicateUrlCounts: context?.duplicateUrlCounts || buildDuplicateUrlCounts(liveLinks)
        });
        return indexedRecords.map(({ linkId, record }) => {
            const link = liveById.get(linkId) || buildIndexedLinkFallback(record, linkId);
            const entry = getCachedEntry(link) || buildIndexedEntryFallback(record);
            return matchesCriteria(link, entry, view?.criteria, evaluationContext) ? link : null;
        }).filter(Boolean);
    }

    function buildUserSmartViewGroup(context) {
        const workspaceId = text(context?.workspaceId, 'main');
        const categoryName = text(context?.categoryName, 'Unsorted');
        const views = listCardViews(workspaceId, categoryName);
        if (!views.length) return null;
        const buckets = views.map((view) => {
            const links = evaluateView(view, context);
            return {
                key: view.id,
                label: '[ ' + view.label + ' ]',
                links,
                why: 'User-created Smart View. Criteria: ' + describeCriteria(view.criteria),
                criteria: view.criteria,
                keepWhenEmpty: true,
                userSmartViewId: view.id
            };
        });
        return makeGroup('userSmartViews', '[ User Smart Views ]', 'user_smart_views', '[ Pinned Smart Views ]', buckets, {
            enabledKey: 'user_smart_views',
            why: 'Saved criteria matched this bookmark.'
        });
    }

    function describeCriteria(criteria) {
        const c = criteria && typeof criteria === 'object' ? criteria : {};
        const parts = [];
        Object.keys(c).forEach((key) => {
            const value = c[key];
            if (value === undefined || value === null || value === '') return;
            parts.push(key + '=' + (Array.isArray(value) ? value.join(',') : String(value)));
        });
        return parts.join('; ') || 'all card bookmarks';
    }

    function parseCriteriaPrompt(value) {
        const raw = text(value, '');
        const criteria = {};
        if (!raw) return criteria;
        const queryParts = [];
        raw.split(/\s+/).forEach((token) => {
            const clean = token.trim();
            const index = clean.indexOf(':');
            if (index <= 0) {
                queryParts.push(clean);
                return;
            }
            const key = clean.slice(0, index).toLowerCase();
            const val = clean.slice(index + 1);
            if (key === 'label' || key === 'identifier') criteria.identifiers = normalizeList(val);
            else if (key === 'provider') criteria.provider = val;
            else if (key === 'status') criteria.status = val;
            else if (key === 'freshness') criteria.sourceFreshness = val.replace(/_/g, ' ');
            else if (key === 'folder') criteria.folderHealth = val.replace(/_/g, ' ');
            else if (key === 'merge') criteria.mergeState = val.replace(/_/g, ' ');
            else if (key === 'pin') criteria.pinned = val !== 'false' && val !== 'none';
            else if (key === 'missing' && val.toLowerCase() === 'cover') criteria.missingCover = true;
            else if (key === 'has' && val.toLowerCase() === 'cover') criteria.hasCover = true;
            else if (key === 'has' && ['covers', 'additional_cover', 'additional_covers', 'extra_cover', 'extra_covers'].includes(val.toLowerCase())) criteria.hasAdditionalCovers = true;
            else if (key === 'has' && val.toLowerCase() === 'related') criteria.hasRelatedUrls = true;
            else queryParts.push(clean);
        });
        if (queryParts.length) criteria.query = queryParts.join(' ');
        return criteria;
    }

    Object.assign(api, {
        listCardViews,
        saveCardView,
        deleteCardView,
        evaluateView,
        evaluateViewFromIndex,
        matchesCriteria,
        describeCriteria,
        parseCriteriaPrompt,
        buildUserSmartViewGroup
    });
})(window.EveSmartViewRegistry);
