window.EveSmartViewRegistry = window.EveSmartViewRegistry || {};

(function (api) {
    if (api.ready) return;

    const SMART_VIEW_VERSION = 1;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const SOURCE_STALE_MS = 30 * DAY_MS;

    function text(value, fallback) {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function normalizeKey(value) {
        return text(value, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other';
    }

    function normalizeList(value) {
        const output = [];
        function collect(item) {
            if (Array.isArray(item)) {
                item.forEach(collect);
                return;
            }
            if (item && typeof item === 'object') {
                if (item.id || item.label || item.name || item.title || item.value) {
                    collect(item.id || item.label || item.name || item.title || item.value);
                    return;
                }
                Object.values(item).forEach(collect);
                return;
            }
            String(item == null ? '' : item)
                .split(/[|,;]/)
                .map((part) => part.trim())
                .filter(Boolean)
                .forEach((part) => output.push(part));
        }
        collect(value);
        const seen = new Set();
        return output.filter((item) => {
            const key = item.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function normalizedMatch(values, wanted) {
        const needle = normalizeKey(wanted);
        if (!needle) return true;
        return (Array.isArray(values) ? values : [values]).some((value) => {
            const hay = normalizeKey(value);
            return hay === needle || hay.includes(needle) || needle.includes(hay);
        });
    }

    function getConfig() {
        return window.eveState?.config || (typeof config !== 'undefined' ? config : {}) || {};
    }

    function getScopedKey(workspaceId, categoryName) {
        return text(workspaceId, 'main') + '::' + text(categoryName, 'Unsorted');
    }

    function ensureStore(cfg) {
        const target = cfg || getConfig();
        if (!target.smartViews || typeof target.smartViews !== 'object') {
            target.smartViews = { version: SMART_VIEW_VERSION, cardViews: {} };
        }
        if (Number(target.smartViews.version || 0) < SMART_VIEW_VERSION) {
            target.smartViews.version = SMART_VIEW_VERSION;
        }
        if (!target.smartViews.cardViews || typeof target.smartViews.cardViews !== 'object') {
            target.smartViews.cardViews = {};
        }
        if (target.cardSmartViews && typeof target.cardSmartViews === 'object') {
            Object.keys(target.cardSmartViews).forEach((key) => {
                if (!target.smartViews.cardViews[key]) target.smartViews.cardViews[key] = target.cardSmartViews[key];
            });
        }
        return target.smartViews;
    }

    function getDefinitionsById() {
        const cfg = getConfig();
        const definitions = window.EveBookmarkIdentifiers?.getDefinitions
            ? window.EveBookmarkIdentifiers.getDefinitions()
            : (Array.isArray(cfg.bookmarkIdentifiers) ? cfg.bookmarkIdentifiers : []);
        const map = new Map();
        (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
            const id = text(definition?.id, '');
            if (!id) return;
            map.set(id, {
                id,
                label: text(definition?.label || definition?.title || id, id),
                description: text(definition?.description, '')
            });
        });
        return map;
    }

    function getIdentifierIds(link) {
        return normalizeList([link?.identifiers, link?.identifierIds, link?.bookmarkIdentifiers]);
    }

    function getRelatedUrlEntries(link) {
        return (Array.isArray(link?.relatedUrls) ? link.relatedUrls : [])
            .map((entry) => {
                if (typeof entry === 'string') return { url: entry, label: '' };
                if (!entry || typeof entry !== 'object') return null;
                return {
                    url: text(entry.url || entry.href, ''),
                    label: text(entry.label || entry.title || entry.kind, ''),
                    notes: text(entry.notes, '')
                };
            })
            .filter((entry) => entry && entry.url);
    }

    function isRenderableCoverValue(value) {
        const url = text(value, '');
        if (!url) return false;
        if (window.EveBookmarkCovers && typeof window.EveBookmarkCovers.isRenderableCoverUrl === 'function') {
            return !!window.EveBookmarkCovers.isRenderableCoverUrl(url);
        }
        return !/^(?:null|undefined|none|n\/a)$/i.test(url);
    }

    function getCoverStateValues(link, entry) {
        const coverApi = window.EveBookmarkCovers;
        const additional = coverApi && typeof coverApi.getAdditionalCoverImages === 'function'
            ? coverApi.getAdditionalCoverImages(link)
            : (Array.isArray(link?.coverImages) ? link.coverImages : []).map((value) => text(value, '')).filter(isRenderableCoverValue);
        const primary = [
            link?.fixedCoverImage,
            link?.coverImage,
            entry?.image,
            entry?.imageUrl,
            entry?.coverImage,
            entry?.bannerImage
        ].map((value) => text(value, '')).filter(isRenderableCoverValue);
        const values = [];
        if (primary.length || additional.length) values.push('Has Cover');
        if (additional.length > 0) values.push('Has Additional Covers');
        if (!values.length) values.push('Missing Cover');
        return values;
    }

    function domainFromUrl(url) {
        try {
            const parsed = new URL(String(url || ''), window.location?.origin || 'https://eve.local');
            return parsed.hostname.toLowerCase().replace(/^www\./, '');
        } catch (error) {
            return '';
        }
    }

    function getSourceProviderValues(link, entry) {
        const values = [];
        const sources = []
            .concat(Array.isArray(link?.sources) ? link.sources : [])
            .concat(Array.isArray(entry?.sources) ? entry.sources : [])
            .concat(Array.isArray(entry?.apiSources) ? entry.apiSources : []);
        sources.forEach((source) => {
            if (!source) return;
            values.push(source.provider, source.source, source.type, source.name);
            const urlDomain = domainFromUrl(source.url || source.sourceUrl || source.href);
            if (urlDomain) values.push(urlDomain);
        });
        values.push(entry?.provider, entry?.sourceProvider, entry?.apiProvider);
        const sourceUrlDomain = domainFromUrl(entry?.sourceUrl || link?.sourceUrl || '');
        if (sourceUrlDomain) values.push(sourceUrlDomain);
        return normalizeList(values).map((value) => {
            const lower = value.toLowerCase();
            if (lower.includes('mangadex')) return 'MangaDex';
            if (lower.includes('anilist')) return 'AniList';
            if (lower.includes('tvmaze')) return 'TVMaze';
            if (lower.includes('google')) return 'Google';
            if (lower.includes('fandom')) return 'Fandom';
            if (lower.includes('scraper')) return 'Scraper';
            return value;
        });
    }

    function sourceTimestamp(link, entry) {
        const candidates = [
            link?.sourceUpdatedAt, link?.sourceFetchedAt, link?.cacheUpdatedAt,
            entry?.sourceUpdatedAt, entry?.sourceFetchedAt, entry?.cacheUpdatedAt,
            entry?.lastEdited, entry?.updatedAt, entry?.dateAdded
        ];
        const sources = []
            .concat(Array.isArray(link?.sources) ? link.sources : [])
            .concat(Array.isArray(entry?.sources) ? entry.sources : []);
        sources.forEach((source) => {
            candidates.push(source?.updatedAt, source?.fetchedAt, source?.timestamp, source?.date);
        });
        for (const candidate of candidates) {
            const parsed = Date.parse(String(candidate || ''));
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return 0;
    }

    function getSourceFreshnessBuckets(link, entry, nowMs) {
        const hasSource = getSourceProviderValues(link, entry).length > 0 || !!(entry?.sourceUrl || link?.sourceUrl);
        if (!hasSource) return ['No Source'];
        const stamp = sourceTimestamp(link, entry);
        if (!stamp) return ['Cache Only / Unknown'];
        if ((nowMs - stamp) > SOURCE_STALE_MS) return ['Stale Source'];
        return ['Fresh Source'];
    }

    function buildFolderHealthResolver(context) {
        const nodes = (Array.isArray(context?.scopedNodes) ? context.scopedNodes : []).filter((node) => node && !node.isGhost);
        const byId = new Map(nodes.map((node) => [text(node.id, ''), node]));
        return function getFolderHealth(link) {
            const folderId = text(link?.folderId, '');
            if (!folderId) return ['Root Item'];
            const node = byId.get(folderId);
            if (!node) return ['Orphaned Bookmark Folder'];
            const states = [];
            const seen = new Set();
            let cursor = node;
            let depth = 0;
            while (cursor && text(cursor.id, '')) {
                const id = text(cursor.id, '');
                if (seen.has(id)) {
                    states.push('Broken Parent Chain');
                    states.push('Detached Chain');
                    break;
                }
                seen.add(id);
                if (cursor.hidden || cursor.isHidden) states.push('Hidden Parent');
                const parentId = text(cursor.parentId, '');
                if (!parentId) break;
                cursor = byId.get(parentId);
                if (!cursor) {
                    states.push('Broken Parent Chain');
                    states.push('Detached Chain');
                    break;
                }
                depth += 1;
                if (depth > 100) {
                    states.push('Broken Parent Chain');
                    break;
                }
            }
            return states.length ? states : ['Healthy Folder Path'];
        };
    }

    function getOriginScopeValues(link, context) {
        const activeWorkspace = text(context?.workspaceId, 'main');
        const activeCategory = text(context?.categoryName, 'Unsorted');
        const workspace = text(link?.workspace, activeWorkspace);
        const categoryName = text(link?.category, activeCategory);
        if (workspace === activeWorkspace && categoryName === activeCategory) return ['Direct Card Item'];
        if (link?.isShortcutLocal || link?._isShortcutLocal) return ['Linked Tab Shortcut Item'];
        if (link?.inheritedFromWorkspaceId || link?._inheritedFromWorkspaceId) return ['Child Tab Item'];
        return ['Branch / Group Overview Item'];
    }

    function getPinScopeValues(link) {
        const values = [];
        const pinApi = window.EveQuickPins;
        const linkId = text(link?.id, '');
        if (!linkId) return ['Not Pinned'];
        const pins = pinApi?.filterPinsForBookmark ? (pinApi.filterPinsForBookmark(linkId) || []) : [];
        if (!pins.length) return ['Not Pinned'];
        values.push('Pinned In Card');
        pins.forEach((pin) => {
            const scopeType = text(pin?.scopeType, '').toLowerCase();
            if (pin?.inheritedFromWorkspaceId || pin?.inheritedDepth) values.push('Pinned From Child Tab');
            if (pin?.isInherited || pin?.inheritedPath) values.push('Inherited Pin');
            if (pin?.stale || pin?.missingTarget) values.push('Stale Pin Target');
            if (scopeType === 'folder') values.push('Folder Pin');
            if (scopeType === 'tab') values.push('Tab Pin');
        });
        return values;
    }

    function getNotesText(link, entry) {
        return [link?.notes, entry?.summary, entry?.notes, entry?.description]
            .map((value) => text(value, ''))
            .filter(Boolean)
            .join('\n\n');
    }

    function getMergeStateValues(link, entry, duplicateUrlCounts) {
        const values = [];
        const notes = getNotesText(link, entry);
        const normalizedUrl = normalizeIdentityUrl(link?.url);
        if (notes.includes('=== Bookmark Merge ===')) {
            values.push('Merge History');
            const modeMatch = notes.match(/^Mode:\s*(.+)$/mi);
            const mode = text(modeMatch?.[1], '').toLowerCase();
            if (mode.includes('injected')) values.push('Injected Library Merge');
            if (mode.includes('notes-only')) values.push('Notes-Only Merge');
            if (mode.includes('both-linked')) values.push('Both Linked Merge');
            if (mode.includes('unlinked-promoted')) values.push('Unlinked Promoted Merge');
        }
        if (normalizedUrl && Number(duplicateUrlCounts?.get(normalizedUrl) || 0) > 1) values.push('Duplicate Suspect');
        return values.length ? values : ['No Merge History'];
    }

    function normalizeIdentityUrl(url) {
        try {
            const parsed = new URL(String(url || ''), window.location?.origin || 'https://eve.local');
            parsed.hash = '';
            parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
            return parsed.toString().replace(/\/$/, '');
        } catch (error) {
            return text(url, '').toLowerCase();
        }
    }

    function bucketize(links, extractor, options = {}) {
        const map = new Map();
        (Array.isArray(links) ? links : []).forEach((link) => {
            const entry = options.getCachedEntry ? options.getCachedEntry(link) : null;
            const values = extractor(link, entry) || [];
            const list = Array.isArray(values) ? values : [values];
            normalizeList(list).forEach((label) => {
                const key = normalizeKey(options.normalizeKey ? options.normalizeKey(label) : label);
                if (!key) return;
                if (!map.has(key)) map.set(key, { key, label: text(label, key), links: [] });
                map.get(key).links.push(link);
            });
        });
        return Array.from(map.values())
            .filter((bucket) => bucket.links.length > 0)
            .sort((left, right) => right.links.length - left.links.length || left.label.localeCompare(right.label));
    }

    function buildDuplicateUrlCounts(links) {
        const counts = new Map();
        (Array.isArray(links) ? links : []).forEach((link) => {
            const normalized = normalizeIdentityUrl(link?.url);
            if (!normalized) return;
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
        });
        return counts;
    }

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

        const userGroups = buildUserSmartViewGroup(context);
        if (userGroups) groups.unshift(userGroups);
        return groups.filter((group) => group.buckets.length > 0);
    }

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
        const c = criteria && typeof criteria === 'object' ? criteria : {};
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
        if (c.status && !normalizedMatch([entry?.status, entry?.libraryStatus?.label, entry?.libraryStatus?.id], c.status)) return false;
        if (c.sourceFreshness) {
            if (!normalizedMatch(getSourceFreshnessBuckets(link, entry, Date.now()), c.sourceFreshness)) return false;
        }
        if (c.folderHealth) {
            if (!normalizedMatch(buildFolderHealthResolver(context)(link), c.folderHealth)) return false;
        }
        if (c.mergeState) {
            if (!normalizedMatch(getMergeStateValues(link, entry, buildDuplicateUrlCounts(context?.activeLinks || [])), c.mergeState)) return false;
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
        return links.filter((link) => matchesCriteria(link, getCachedEntry(link), view?.criteria, context));
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

    function getLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function getScopedNodes(workspaceId, categoryName) {
        const folderApi = window.EveBookmarkFolders;
        const storeApi = folderApi?._shared || folderApi;
        return typeof storeApi?.getScopedNodes === 'function'
            ? (storeApi.getScopedNodes(workspaceId, categoryName) || [])
            : [];
    }

    function getCachedEntryResolver(workspaceId, categoryName) {
        const shared = window.EveBookmarkFolders?._shared || {};
        return function (link) {
            return typeof shared.getLibraryEntryForLink === 'function'
                ? shared.getLibraryEntryForLink(workspaceId, categoryName, link?.id)
                : null;
        };
    }

    function getRecordScope(record) {
        const workspaceId = text(record?.workspaceId || record?.path?.workspaceId, 'main');
        const categoryName = text(record?.categoryName || record?.path?.categoryName, 'Unsorted');
        const folderId = text(
            record?.provenance?.smartViewFolderId
            || record?.path?.folderId
            || record?.provenance?.smartViewId,
            ''
        );
        return { workspaceId, categoryName, folderId };
    }

    function getRecordCriteria(record) {
        const criteria = record?.provenance?.criteria;
        if (criteria && typeof criteria === 'object' && !Array.isArray(criteria)) {
            return Object.assign({}, criteria);
        }
        if (typeof criteria === 'string' && criteria.trim()) {
            if (record?.provenance?.builtIn) return null;
            const parsed = parseCriteriaPrompt(criteria);
            return Object.keys(parsed).length ? parsed : null;
        }
        return null;
    }

    function getSmartViewRecordLinkIds(record) {
        const scope = getRecordScope(record);
        if (!scope.workspaceId || !scope.categoryName) return [];
        if (scope.folderId && window.EveBulkToolbar?.getScopeLinkIdsForFolder) {
            const ids = window.EveBulkToolbar.getScopeLinkIdsForFolder(scope.categoryName, scope.workspaceId, scope.folderId)
                .map((id) => text(id, ''))
                .filter(Boolean);
            if (ids.length) return ids;
        }
        if (scope.folderId && window.EveFolderViewV2?.getFolderScopedLinkIds) {
            const ids = window.EveFolderViewV2.getFolderScopedLinkIds(scope.workspaceId, scope.categoryName, scope.folderId)
                .map((id) => text(id, ''))
                .filter(Boolean);
            if (ids.length) return ids;
        }

        const criteria = getRecordCriteria(record);
        if (!criteria) return [];
        const activeLinks = getLiveLinks().filter((link) => (
            text(link?.workspace, 'main') === scope.workspaceId
            && text(link?.category, 'Unsorted') === scope.categoryName
        ));
        const matches = evaluateView(
            { criteria },
            {
                workspaceId: scope.workspaceId,
                categoryName: scope.categoryName,
                activeLinks,
                scopedNodes: getScopedNodes(scope.workspaceId, scope.categoryName),
                getCachedEntry: getCachedEntryResolver(scope.workspaceId, scope.categoryName)
            }
        );
        return matches.map((link) => text(link?.id, '')).filter(Boolean);
    }

    function revealSmartViewRecord(record, options) {
        const scope = getRecordScope(record);
        if (!scope.workspaceId || !scope.categoryName) {
            return { ok: false, error: 'Smart View scope is missing.' };
        }
        const linkIds = getSmartViewRecordLinkIds(record);
        if (!linkIds.length) {
            openSmartViewRecord(record);
            return { ok: false, opened: true, error: 'No matching bookmarks were found for this Smart View.' };
        }

        openSmartViewRecord(record);
        window.setTimeout(() => {
            const bulkApi = window.EveBulkToolbar;
            if (bulkApi?.clearSelection && bulkApi?.addSelectedIds) {
                bulkApi.clearSelection();
                bulkApi.addSelectedIds(linkIds);
                if (bulkApi.setBulkMode) bulkApi.setBulkMode(true);
            } else {
                window.selectedIds = window.selectedIds instanceof Set ? window.selectedIds : new Set();
                window.selectedIds.clear();
                linkIds.forEach((id) => window.selectedIds.add(String(id)));
                window.bulkMode = true;
            }
            document.body?.classList?.add('bulk-active');
            if (bulkApi?.updateBulkUI) bulkApi.updateBulkUI();
            if (typeof showToast === 'function' && options?.toast !== false) {
                showToast('Selected ' + linkIds.length + ' matching bookmark' + (linkIds.length === 1 ? '' : 's') + '.', 'success');
            }
        }, 140);
        return { ok: true, count: linkIds.length, linkIds };
    }

    function buildSavedViewIdFromRecord(record) {
        const scope = getRecordScope(record);
        const raw = [
            'nexus',
            scope.workspaceId,
            scope.categoryName,
            record?.provenance?.category,
            record?.provenance?.smartViewGroup,
            record?.provenance?.smartViewId || record?.title
        ].map((part) => normalizeKey(part)).filter(Boolean).join('_');
        return 'sv_' + raw.slice(0, 96);
    }

    function saveSmartViewRecordAsCardView(record, options) {
        const scope = getRecordScope(record);
        const existingId = text(record?.provenance?.smartViewUserId, '');
        if (existingId) {
            return { ok: true, alreadySaved: true, viewId: existingId };
        }
        const criteria = getRecordCriteria(record);
        if (!criteria) {
            return { ok: false, error: 'This Nexus Smart View does not expose reusable criteria yet.' };
        }
        const label = text(options?.label || record?.title, 'Nexus Smart View').replace(/^\[\s*|\s*\]$/g, '');
        const result = saveCardView(scope.workspaceId, scope.categoryName, {
            id: buildSavedViewIdFromRecord(record),
            label,
            scope: 'card',
            criteria,
            sort: { by: 'title', direction: 'asc' },
            presentation: { layout: 'folder', source: 'nexus' }
        });
        if (result.ok && typeof showToast === 'function' && options?.toast !== false) {
            showToast('Saved Smart View: ' + result.view.label, 'success');
        } else if (!result.ok && typeof showToast === 'function' && options?.toast !== false) {
            showToast(result.error || 'Could not save Smart View.', 'warning');
        }
        if (result.ok && typeof renderDashboard === 'function') renderDashboard();
        return result;
    }

    function promptCreateSmartView(workspaceId, categoryName) {
        const label = window.prompt('Smart View name');
        if (!text(label, '')) return null;
        const criteriaText = window.prompt('Criteria. Examples: label:Reading provider:MangaDex missing:cover, has:related, merge:Merge_History, or plain search text.', '');
        const result = saveCardView(workspaceId, categoryName, {
            label: text(label, 'Smart View'),
            criteria: parseCriteriaPrompt(criteriaText || '')
        });
        if (result.ok) {
            if (typeof showToast === 'function') showToast('Smart View saved: ' + result.view.label, 'success');
            if (typeof renderDashboard === 'function') renderDashboard();
        } else if (typeof showToast === 'function') {
            showToast(result.error || 'Could not save Smart View.', 'warning');
        }
        return result;
    }

    function openSmartView(workspaceId, categoryName, smartViewId) {
        const ws = text(workspaceId, 'main');
        const card = text(categoryName, 'Unsorted');
        const id = text(smartViewId, '');
        if (!id) return false;
        if (typeof switchWorkspace === 'function') switchWorkspace(ws);
        if (typeof setFocus === 'function') setFocus(card);
        if (typeof renderDashboard === 'function') renderDashboard();
        window.setTimeout(() => {
            if (window.EveFolderViewV2?.enterFolder) {
                window.EveFolderViewV2.enterFolder(null, card, id, ws);
            }
        }, 80);
        return true;
    }

    function openSmartViewRecord(record) {
        return openSmartView(
            record?.workspaceId || record?.path?.workspaceId,
            record?.categoryName || record?.path?.categoryName,
            record?.provenance?.smartViewFolderId || record?.path?.folderId || record?.provenance?.smartViewId
        );
    }

    async function deleteSmartViewFromTile(event, workspaceId, categoryName, viewId, label) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const name = text(label, 'Smart View');
        const message = 'Delete Smart View "' + name + '"? Matching bookmarks stay untouched.';
        const confirmed = typeof showConfirm === 'function'
            ? await showConfirm(message)
            : (typeof window.confirm === 'function' ? window.confirm(message) : true);
        if (!confirmed) return false;
        deleteCardView(workspaceId, categoryName, viewId);
        if (typeof showToast === 'function') showToast('Deleted Smart View: ' + name, 'success');
        if (typeof renderDashboard === 'function') renderDashboard();
        return true;
    }

    Object.assign(api, {
        ready: true,
        version: SMART_VIEW_VERSION,
        ensureStore,
        getBuiltInCatalog,
        buildGhostGroups,
        listCardViews,
        saveCardView,
        deleteCardView,
        evaluateView,
        matchesCriteria,
        describeCriteria,
        parseCriteriaPrompt,
        promptCreateSmartView,
        openSmartView,
        openSmartViewRecord,
        getSmartViewRecordLinkIds,
        revealSmartViewRecord,
        saveSmartViewRecordAsCardView,
        deleteSmartViewFromTile
    });

    window.promptCreateSmartView = function (categoryName, workspaceId) {
        return promptCreateSmartView(workspaceId || window.eveState?.config?.activeWorkspace || 'main', categoryName || (typeof focusCategory !== 'undefined' ? focusCategory : 'Unsorted'));
    };
    window.deleteSmartViewFromTile = deleteSmartViewFromTile;
})(window.EveSmartViewRegistry);
