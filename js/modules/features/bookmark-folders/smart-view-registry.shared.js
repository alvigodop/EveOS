window.EveSmartViewRegistry = window.EveSmartViewRegistry || {};

(function (api) {
    if (api._shared) return;

    const SMART_VIEW_VERSION = 1;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const SOURCE_STALE_MS = 30 * DAY_MS;

    function text(value, fallback) {
        const raw = String(value == null ? '' : value).trim();
        return raw || String(fallback || '').trim();
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    function normalizedMatch(values, wanted, options = {}) {
        const needle = normalizeKey(wanted);
        if (!needle) return true;
        const exact = !!options.exact;
        return (Array.isArray(values) ? values : [values]).some((value) => {
            const hay = normalizeKey(value);
            if (!hay) return false;
            if (hay === needle) return true;
            if (exact) return false;
            return hay.includes(needle);
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

    function cleanBucketValue(value) {
        return text(value, '').replace(/^\[\s*|\s*\]$/g, '').trim();
    }

    function normalizeReusableCriteria(criteria) {
        const source = criteria && typeof criteria === 'object' && !Array.isArray(criteria) ? criteria : {};
        const c = Object.assign({}, source);
        const dimension = normalizeKey(c.dimension || '');
        const rawValue = cleanBucketValue(c.value || c.label || '');
        if (dimension && rawValue) {
            if (dimension === 'identifier_labels') c.identifiers = normalizeList([c.identifiers, rawValue]);
            else if (dimension === 'related_urls') {
                c.hasRelatedUrls = true;
                if (normalizeKey(rawValue) !== 'has_related_urls') c.query = [c.query, rawValue].filter(Boolean).join(' ');
            } else if (dimension === 'source_provider') c.provider = rawValue;
            else if (dimension === 'source_freshness') c.sourceFreshness = rawValue;
            else if (dimension === 'folder_health') c.folderHealth = rawValue;
            else if (dimension === 'origin_scope') c.originScope = rawValue;
            else if (dimension === 'pin_scope') c.pinScope = rawValue;
            else if (dimension === 'cover_state') {
                const coverKey = normalizeKey(rawValue);
                if (coverKey === 'has_cover') c.hasCover = true;
                else if (coverKey === 'has_additional_covers') c.hasAdditionalCovers = true;
                else if (coverKey === 'missing_cover') c.missingCover = true;
            } else if (dimension === 'merge_state') c.mergeState = rawValue;
        }
        delete c.dimension;
        delete c.value;
        delete c.label;
        Object.keys(c).forEach((key) => {
            const value = c[key];
            if (value === undefined || value === null || value === '' || value === false) delete c[key];
            if (Array.isArray(value) && !value.length) delete c[key];
        });
        return c;
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

    api._shared = {
        SMART_VIEW_VERSION,
        DAY_MS,
        SOURCE_STALE_MS,
        text,
        escapeHtml,
        normalizeKey,
        normalizeList,
        normalizedMatch,
        getConfig,
        getScopedKey,
        ensureStore,
        getDefinitionsById,
        getIdentifierIds,
        getRelatedUrlEntries,
        isRenderableCoverValue,
        getCoverStateValues,
        domainFromUrl,
        getSourceProviderValues,
        sourceTimestamp,
        getSourceFreshnessBuckets,
        buildFolderHealthResolver,
        getOriginScopeValues,
        getPinScopeValues,
        getNotesText,
        getMergeStateValues,
        cleanBucketValue,
        normalizeReusableCriteria,
        normalizeIdentityUrl,
        bucketize,
        buildDuplicateUrlCounts
    };
})(window.EveSmartViewRegistry);
