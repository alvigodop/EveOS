// --- Modular State Sync API: Local Gemini Context Fallback ---
window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    if (ns.apiContextLocalReady) return;

    function text(value, fallback = '') {
        const normalized = String(value == null ? '' : value).trim();
        return normalized || String(fallback || '').trim();
    }

    function asArray(value) {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        }
        return [];
    }

    const LOCAL_CONTEXT_MODE_PROFILES = {
        brief: { budget: 24, sampleMultiplier: 1, header: 'EveOS lean scoped state brief' },
        summary: { budget: 60, sampleMultiplier: 2, header: 'EveOS scoped state summary' },
        deep: { budget: 120, sampleMultiplier: 3, header: 'EveOS deep scoped state snapshot' },
        full: { budget: 180, sampleMultiplier: 4, header: 'EveOS complete scoped state snapshot' }
    };

    function normalizeContextMode(mode) {
        const value = text(mode, 'summary').toLowerCase();
        if (value === 'json' || value === 'complete') return 'full';
        return LOCAL_CONTEXT_MODE_PROFILES[value] ? value : 'summary';
    }

    function detailBudget(detail, limit) {
        const mode = normalizeContextMode(detail);
        const profile = LOCAL_CONTEXT_MODE_PROFILES[mode] || LOCAL_CONTEXT_MODE_PROFILES.summary;
        return Math.min(profile.budget, Math.max(limit, Math.ceil(limit * profile.sampleMultiplier)));
    }

    function clone(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return fallback;
        }
    }

    const DEFAULT_IDENTIFIERS = [
        { id: 'reading', label: 'Reading', description: 'Long-form text, books, manga, articles, or written research.' },
        { id: 'watching', label: 'Watching', description: 'Video-first content such as films, shows, clips, or streams.' },
        { id: 'listening', label: 'Listening', description: 'Audio-first content such as podcasts, music, or spoken material.' },
        { id: 'playing', label: 'Playing', description: 'Games, interactive media, or playable experiences.' },
        { id: 'research', label: 'Research', description: 'Material kept for investigation, study, or later synthesis.' },
        { id: 'reference', label: 'Reference', description: 'Stable reference material worth keeping distinct from active consumption.' }
    ];

    function scopedKey(workspace, category) {
        return `${text(workspace, 'main')}::${text(category, 'Unsorted')}`;
    }

    function splitScopedKey(value) {
        const raw = text(value, '');
        const idx = raw.indexOf('::');
        return idx >= 0
            ? { workspace: raw.slice(0, idx) || 'main', category: raw.slice(idx + 2) || 'Unsorted' }
            : { workspace: 'main', category: raw || 'Unsorted' };
    }

    function getStoreState() {
        const store = ns.getStore?.() || window.EveDataStore?.Store;
        if (store?.captureState) {
            try {
                return store.captureState();
            } catch (error) {
                console.warn('[ModularStateSync] Local Gemini context capture failed:', error);
            }
        }
        return {
            metadata: { source: 'browser-runtime-fallback' },
            bookmarks: {
                links: Array.isArray(window.eveState?.links) ? window.eveState.links : (Array.isArray(window.links) ? window.links : []),
                config: window.eveState?.config || window.config || (typeof config !== 'undefined' ? config : {}),
                folders: window.eveState?.folders || window.bookmarkFolders || {},
                pins: window.eveState?.pins || window.bookmarkPins || []
            },
            library: {
                categories: window.eveState?.library?.categories || window.libraryCategories || {},
                connections: window.eveState?.library?.connections || window.libraryConnections || []
            },
            knowledge: window.eveState?.knowledge || {}
        };
    }

    function getConfig(state) {
        return state?.bookmarks?.config || window.eveState?.config || window.config || {};
    }

    function getLinks(state) {
        return Array.isArray(state?.bookmarks?.links) ? state.bookmarks.links : [];
    }

    function findWorkspace(workspaceId, nodes) {
        const target = text(workspaceId, '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (text(node?.id, '').toLowerCase() === target) return node;
            const nested = findWorkspace(workspaceId, node?.subTabs);
            if (nested) return nested;
        }
        return null;
    }

    function collectBranchIds(workspace) {
        const ids = new Set();
        function visit(node) {
            const id = text(node?.id, '');
            if (id) ids.add(id);
            (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach(visit);
        }
        visit(workspace);
        return ids;
    }

    function normalizeScope(scope) {
        const value = text(scope, 'workspace').toLowerCase();
        if (['all', 'store', 'datapack'].includes(value)) return 'all';
        if (['card', 'category'].includes(value)) return 'card';
        return 'workspace';
    }

    function normalizeScopeOptions(state, options = {}) {
        const cfg = getConfig(state);
        const raw = options?.scope && typeof options.scope === 'object' ? options.scope : (options || {});
        const scope = normalizeScope(raw.scope);
        const workspaceId = text(raw.workspaceId, cfg.activeWorkspace || 'main');
        let workspaceIds = asArray(raw.workspaceIds).map((id) => text(id, '')).filter(Boolean);
        if (!workspaceIds.length && scope !== 'all') {
            const root = findWorkspace(workspaceId, cfg.workspaces);
            workspaceIds = Array.from(root ? collectBranchIds(root) : new Set([workspaceId]));
        }
        return {
            scope,
            workspaceId,
            workspaceIds,
            categoryName: text(raw.categoryName, ''),
            label: text(raw.label, scope === 'all' ? 'Whole datapack' : (scope === 'card' ? 'Specific card' : 'Current tab branch')),
            source: text(raw.source, 'browser-local-fallback')
        };
    }

    function categoryMatches(scoped, scope) {
        const parsed = splitScopedKey(scoped);
        if (scope.scope !== 'all' && !scope.workspaceIds.includes(parsed.workspace)) return false;
        return !(scope.scope === 'card' && scope.categoryName && parsed.category !== scope.categoryName);
    }

    function connectionEntryId(conn) {
        return text(conn?.entryId || conn?.libraryEntryId || conn?.targetEntryId || conn?.targetId || conn?.entry);
    }

    function buildLibraryIndexes(categories, connections) {
        const entriesById = {};
        const linkToEntry = {};
        Object.values(categories || {}).forEach((data) => {
            (Array.isArray(data?.entries) ? data.entries : []).forEach((entry) => {
                const id = text(entry?.id, '');
                if (id) entriesById[id] = entry;
            });
        });
        (connections || []).forEach((conn) => {
            const linkId = text(conn?.linkId || conn?.bookmarkId, '');
            const entry = entriesById[connectionEntryId(conn)];
            if (linkId && entry) linkToEntry[linkId] = entry;
        });
        return { entriesById, linkToEntry };
    }

    function filterStateForScope(state, scope) {
        if (scope.scope === 'all' && !scope.workspaceIds.length) {
            const full = clone(state, state);
            full.metadata = Object.assign({}, full.metadata || {}, { geminiScope: scope });
            return full;
        }
        const workspaceSet = new Set(scope.workspaceIds.length ? scope.workspaceIds : [scope.workspaceId]);
        const targetCategory = scope.scope === 'card' ? scope.categoryName : '';
        const links = getLinks(state).filter((link) => {
            const workspace = text(link?.workspace, 'main');
            const category = text(link?.category, 'Unsorted');
            return workspaceSet.has(workspace) && (!targetCategory || category === targetCategory);
        }).map((link) => clone(link, link));
        const linkIds = new Set(links.map((link) => text(link?.id, '')).filter(Boolean));
        const categories = {};
        Object.entries(state?.library?.categories || {}).forEach(([key, value]) => {
            if (categoryMatches(key, scope)) categories[key] = clone(value, value);
        });
        const entryIds = new Set();
        Object.values(categories).forEach((data) => {
            (Array.isArray(data?.entries) ? data.entries : []).forEach((entry) => {
                const id = text(entry?.id, '');
                if (id) entryIds.add(id);
            });
        });
        const connections = (state?.library?.connections || []).filter((conn) => {
            return workspaceSet.has(text(conn?.workspaceId || conn?.workspace, ''))
                || linkIds.has(text(conn?.linkId || conn?.bookmarkId, ''))
                || entryIds.has(connectionEntryId(conn));
        }).map((conn) => clone(conn, conn));
        const folders = {};
        Object.entries(state?.bookmarks?.folders || {}).forEach(([key, value]) => {
            if (categoryMatches(key, scope)) folders[key] = clone(value, value);
        });
        return {
            metadata: Object.assign({}, clone(state?.metadata || {}, {}), { geminiScope: scope }),
            bookmarks: {
                links,
                config: clone(getConfig(state), {}),
                folders,
                pins: clone(state?.bookmarks?.pins || [], [])
            },
            library: { categories, connections },
            knowledge: clone(state?.knowledge || {}, {})
        };
    }

    function first(source, keys) {
        for (const key of keys) {
            if (source?.[key] != null && source[key] !== '') return source[key];
        }
        return '';
    }

    function progress(source) {
        return {
            chapter: first(source, ['chapter', 'graphicChapter', 'novelChapter']),
            episode: first(source, ['episode']),
            season: first(source, ['season']),
            volume: first(source, ['volume']),
            progress: first(source, ['progress', 'progressUnits'])
        };
    }

    function timestamp(source) {
        return first(source, ['lastEdited', 'lastUpdated', 'updatedAt', 'dateAdded', 'createdAt', 'lastVisited']);
    }

    function uniqueList(items, limit = 12) {
        const out = [];
        (Array.isArray(items) ? items : []).forEach((item) => {
            const value = text(item, '');
            if (value && !out.includes(value)) out.push(value);
        });
        return out.slice(0, limit);
    }

    function urlValue(item) {
        if (item && typeof item === 'object') return text(item.url || item.href || item.link || item.source || item.value, '');
        return text(item, '');
    }

    function relatedUrls(link) {
        const out = [];
        ['relatedUrls', 'additionalUrls', 'extraUrls', 'alternateUrls', 'urlAlternates', 'mirrors', 'sources', 'sourceUrls'].forEach((key) => {
            asArray(link?.[key]).forEach((item) => out.push(urlValue(item)));
        });
        ['mirrorUrl', 'sourceUrl', 'wikiUrl', 'alternateUrl', 'additionalUrl', 'mangaDexUrl', 'anilistUrl', 'malUrl', 'fandomUrl'].forEach((key) => out.push(text(link?.[key], '')));
        return uniqueList(out.filter(Boolean), 12);
    }

    function coverState(link) {
        const additional = [];
        ['additionalCovers', 'coverImages', 'extraCovers', 'alternateCovers'].forEach((key) => {
            asArray(link?.[key]).forEach((item) => additional.push(urlValue(item) || text(item?.src, '')));
        });
        const primary = text(first(link, ['coverImage', 'cover', 'imageUrl', 'thumbnail', 'thumbnailUrl']), '');
        return { primary, additional: uniqueList(additional, 8), hasCover: !!(primary || additional.length), hasAdditionalCovers: additional.length > 0 };
    }
    const RATING_PROVIDER_LABELS = {
        anilist: 'AniList',
        myanimelist: 'MyAnimeList',
        mangadex: 'MangaDex',
        kitsu: 'Kitsu',
        tvmaze: 'TVmaze',
        mangaupdates: 'MangaUpdates',
        comick: 'ComicK',
        openlibrary: 'OpenLibrary',
        wlnupdates: 'WlnUpdates',
        itunes: 'iTunes'
    };

    function scalar(value) {
        return value == null || value === '' ? null : value;
    }

    function compactApiRatings(apiRatings) {
        const values = {};
        if (apiRatings && typeof apiRatings === 'object') {
            Object.entries(RATING_PROVIDER_LABELS).forEach(([key, label]) => {
                const value = scalar(apiRatings[key] ?? apiRatings[label] ?? apiRatings[label.toLowerCase()]);
                if (value !== null) values[key] = { label, score: value };
            });
        }
        const presentProviders = Object.keys(values);
        return { values, presentProviders, count: presentProviders.length };
    }

    function compactDerivedRatings(derivedRatings) {
        const source = derivedRatings && typeof derivedRatings === 'object' ? derivedRatings : {};
        const map = {
            activeValue: 'unified',
            hybrid10: 'hybrid',
            personal10: 'personal10',
            apiAverage10: 'apiAverage',
            apiWeighted10: 'apiWeighted',
            confidence: 'confidence'
        };
        const out = {};
        Object.entries(map).forEach(([key, label]) => {
            const value = scalar(source[key]);
            if (value !== null) out[label] = value;
        });
        return out;
    }

    function sourceContext(source) {
        if (!source || typeof source !== 'object') return null;
        const provider = text(source.source || source.provider || source.site || source.name, '');
        const title = text(source.title || source.name || source.label, '');
        const url = text(source.providerUrl || source.url || source.sourceUrl || source.link, '');
        const score = scalar(source.score ?? source.rating ?? source.averageScore);
        return {
            provider,
            title,
            status: text(source.status || source.state, ''),
            score,
            url,
            type: text(source.type || source.mediaType || source.format, ''),
            author: text(source.author, ''),
            tags: uniqueList(asArray(source.tags), 16),
            genres: uniqueList(asArray(source.genres), 16),
            synonyms: uniqueList(asArray(source.synonyms).concat(asArray(source.altTitles || source.alternativeTitles)), 12),
            progress: progress(source),
            coverUrl: text(source.coverUrl || source.image || source.imageUrl || '', '')
        };
    }

    function attachedSources(link, entry) {
        const raw = []
            .concat(Array.isArray(link?.sources) ? link.sources : [])
            .concat(Array.isArray(entry?.sources) ? entry.sources : []);
        const seen = new Set();
        return raw.map(sourceContext).filter((source) => {
            if (!source) return false;
            const key = `${source.provider}|${source.title}|${source.url}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return source.provider || source.title || source.url || source.score !== null;
        }).slice(0, 8);
    }

    function ratingContext(link, entry) {
        const api = compactApiRatings(entry?.apiRatings || link?.apiRatings);
        const derived = compactDerivedRatings(entry?.derivedRatings || link?.derivedRatings);
        const personal = scalar(first(entry, ['rating', 'personalRating']) || first(link, ['rating', 'personalRating']));
        return {
            personal,
            api,
            derived,
            summary: {
                unified: derived.unified ?? derived.hybrid ?? null,
                apiAverage: derived.apiAverage ?? null,
                apiWeighted: derived.apiWeighted ?? null,
                confidence: derived.confidence ?? null
            }
        };
    }

    function mediaContext(link, entry, categoryData) {
        const mediaTypes = uniqueList(asArray(entry?.mediaTypes).concat(asArray(link?.mediaTypes)), 8);
        return {
            dataType: text(categoryData?.dataType || entry?.dataType || link?.dataType, ''),
            mediaTypes,
            flags: {
                graphicNovels: mediaTypes.includes('graphicNovels'),
                films: mediaTypes.includes('films'),
                novels: mediaTypes.includes('novels')
            }
        };
    }

    function identifierDefinitions(state) {
        const runtime = window.EveBookmarkIdentifiers?.getDefinitions?.();
        const cfg = getConfig(state);
        const source = Array.isArray(runtime) && runtime.length ? runtime : (Array.isArray(cfg.bookmarkIdentifiers) && cfg.bookmarkIdentifiers.length ? cfg.bookmarkIdentifiers : DEFAULT_IDENTIFIERS);
        const map = new Map();
        source.forEach((definition) => {
            const id = text(definition?.id, '');
            if (!id) return;
            map.set(id, {
                id,
                label: text(definition?.label, id),
                description: text(definition?.description, ''),
                icon: text(definition?.icon, ''),
                color: text(definition?.color, '')
            });
        });
        return map;
    }

    function bookmarkIdentifiers(link, definitions) {
        const ids = uniqueList([].concat(asArray(link?.identifiers), asArray(link?.identifierIds), asArray(link?.bookmarkIdentifiers)), 20);
        const details = ids.map((id) => definitions.get(id) || { id, label: id, description: '' });
        return {
            ids,
            labels: details.map((definition) => definition.label),
            details: details.map((definition) => ({
                id: definition.id,
                label: definition.label,
                description: definition.description || '',
                icon: definition.icon || ''
            }))
        };
    }

    function pinLookup(state) {
        const bookmarkPins = new Map();
        const cardPins = new Map();
        const folderPins = new Map();
        asArray(state?.bookmarks?.pins).forEach((pin) => {
            if (!pin || typeof pin !== 'object') return;
            const targetType = text(pin.targetType, '').toLowerCase();
            const targetId = text(pin.targetId, '');
            if (!targetType || !targetId) return;
            const ref = { id: text(pin.id, ''), targetType, targetId, scopeType: text(pin.scopeType, 'tab'), order: pin.order };
            if (targetType === 'bookmark') bookmarkPins.set(targetId, ref);
            if (targetType === 'card') cardPins.set(targetId, ref);
            if (targetType === 'folder') folderPins.set(targetId, ref);
        });
        return { bookmarkPins, cardPins, folderPins };
    }

    function bookmarkContext(link, linkedEntry, context = {}) {
        const entry = linkedEntry || {};
        const workspace = text(link?.workspace, 'main');
        const cardName = text(link?.category, 'Unsorted');
        const markerState = bookmarkIdentifiers(link, context.identifierDefs || new Map());
        const pin = context.pin || null;
        const sources = attachedSources(link, entry);
        const media = mediaContext(link, entry, context.categoryData || {});
        const ratings = ratingContext(link, entry);
        return {
            id: link?.id,
            title: text(link?.title, 'Untitled'),
            urls: { primary: text(link?.url || link?.href, ''), related: relatedUrls(link) },
            relatedUrls: relatedUrls(link),
            location: {
                workspace,
                cardName,
                cardCategoryName: cardName,
                folderId: text(link?.folderId, ''),
                folderPath: text(context.folderPath, ''),
                note: 'cardName/cardCategoryName is the EveOS card container. bookmarkIdentifiers are the user-facing category/marker pills.'
            },
            card: { workspace, name: cardName, scopedKey: scopedKey(workspace, cardName) },
            category: { type: 'card-container', name: cardName, note: 'Not the bookmark identifier marker.' },
            cardCategory: cardName,
            bookmarkIdentifiers: markerState,
            bookmarkLabels: markerState.labels,
            taskStatus: link?.done ? 'Done' : 'Pending',
            done: !!link?.done,
            pinned: !!(pin || link?.pinned),
            pin,
            priority: text(link?.priority, ''),
            icon: text(link?.icon || link?.favicon || link?.imageIcon, ''),
            status: text(entry.status || link?.status || link?.readingStatus || link?.mediaStatus, ''),
            notes: text(link?.personalNotes || link?.notes || entry.notes || entry.summary, '').slice(0, 900),
            progress: progress(Object.assign({}, entry, link)),
            ratings,
            timestamps: {
                updated: timestamp(link) || timestamp(entry),
                dateAdded: text(link?.dateAdded || entry.dateAdded, ''),
                lastEdited: text(link?.lastEdited || entry.lastEdited, ''),
                lastVisited: text(link?.lastVisited || link?.visitedAt, '')
            },
            tags: uniqueList(asArray(link?.tags).concat(asArray(entry.tags)), 30),
            genres: uniqueList(asArray(link?.genres).concat(asArray(entry.genres)), 30),
            covers: coverState(link),
            attachedSources: sources,
            sourceProviders: uniqueList(sources.map((source) => source.provider).filter(Boolean), 12),
            sort: { customOrderNumber: context.orderNumber || null, sourceIndex: context.sourceIndex || null },
            library: {
                linked: !!linkedEntry,
                title: text(entry.title, ''),
                aliases: asArray(entry.aliases || entry.alternativeTitles || entry.titleAltNames || entry.altTitles || entry.otherNames).slice(0, 12),
                entryId: text(entry.id, ''),
                status: text(entry.status, ''),
                media,
                author: text(entry.author, ''),
                authorAltNames: asArray(entry.authorAltNames).slice(0, 12),
                artist: text(entry.artist, ''),
                language: text(entry.language, ''),
                sourceUrl: text(entry.sourceUrl, ''),
                summary: text(entry.summary || entry.description, '').slice(0, 700),
                ratings
            }
        };
    }
    function countFolders(tree) {
        const nodes = Array.isArray(tree) ? tree : (tree?.nodes || tree?.folders || []);
        let count = 0;
        const stack = nodes.slice();
        while (stack.length) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            count += 1;
            stack.push(...(node.children || node.subFolders || []));
        }
        return count;
    }

    function folderNodes(tree) {
        const roots = Array.isArray(tree) ? tree : (tree?.nodes || tree?.folders || []);
        const nodes = [];
        function visit(node, parentId = '') {
            if (!node || typeof node !== 'object') return;
            const id = text(node.id, '');
            if (!id) return;
            const parent = text(node.parentId, parentId);
            nodes.push({ id, name: text(node.name || node.title, 'Folder'), parentId: parent, order: node.order, taskMode: text(node.taskMode, 'inherit'), clickBehaviorMode: text(node.clickBehaviorMode, 'inherit') });
            (node.children || node.subFolders || []).forEach((child) => visit(child, id));
        }
        roots.forEach((node) => visit(node, ''));
        return nodes;
    }

    function folderMaps(tree) {
        const byId = new Map();
        const children = new Map();
        folderNodes(tree).forEach((node) => { if (!byId.has(node.id)) byId.set(node.id, node); });
        byId.forEach((node) => {
            const parent = byId.has(node.parentId) && node.parentId !== node.id ? node.parentId : '';
            node.parentId = parent;
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(node);
        });
        children.forEach((list) => list.sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)) || a.name.localeCompare(b.name)));
        const paths = new Map();
        byId.forEach((node, id) => {
            const parts = [];
            let cursor = node;
            let guard = 0;
            while (cursor && guard < 64) {
                parts.unshift(cursor.name);
                cursor = byId.get(cursor.parentId);
                guard += 1;
            }
            paths.set(id, parts.join(' / '));
        });
        return { byId, children, paths };
    }

    function cardOrderSettings(config, workspace, category) {
        const key = scopedKey(workspace, category);
        const orderMap = config?.customOrder?.[key] && typeof config.customOrder[key] === 'object' ? config.customOrder[key] : {};
        const orderList = Array.isArray(config?.categoryOrderByWorkspace?.[workspace]) ? config.categoryOrderByWorkspace[workspace] : (Array.isArray(config?.categoryOrder) ? config.categoryOrder : []);
        return {
            scopedKey: key,
            customOrderMap: orderMap,
            customOrderEnabled: asArray(config?.customOrderEnabled).includes(key),
            customOrderSort: text(config?.customOrderSort?.[key], 'none'),
            cardOrderIndex: orderList.map((item) => text(item, 'Unsorted')).indexOf(category) + 1 || null,
            taskModeEnabled: !(asArray(config?.hideStatsScoped).includes(key) || asArray(config?.hideStats).includes(category))
        };
    }

    function orderNumber(orderMap, linkId, fallback) {
        const raw = orderMap?.[text(linkId, '')];
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function sortLinksForCard(links, settings) {
        const sorted = (Array.isArray(links) ? links : []).slice();
        if (!['asc', 'desc'].includes(settings.customOrderSort)) return sorted;
        const reverse = settings.customOrderSort === 'desc' ? -1 : 1;
        return sorted.sort((a, b) => reverse * (orderNumber(settings.customOrderMap, a?.id, 999999) - orderNumber(settings.customOrderMap, b?.id, 999999)) || text(a?.title, '').localeCompare(text(b?.title, '')));
    }

    function systemViewHints(links, linkToEntry, identifierDefs, limit) {
        const views = { withCovers: [], withAdditionalCovers: [], missingCovers: [], libraryLinked: [], done: [], pending: [], withRelatedUrls: [] };
        links.forEach((link) => {
            const compact = bookmarkContext(link, linkToEntry[text(link?.id, '')], { identifierDefs });
            const small = { id: compact.id, title: compact.title, url: compact.urls.primary, bookmarkIdentifiers: compact.bookmarkIdentifiers, card: compact.card, covers: compact.covers, status: compact.status, done: compact.done };
            (small.covers.hasCover ? views.withCovers : views.missingCovers).push(small);
            if (small.covers.hasAdditionalCovers) views.withAdditionalCovers.push(small);
            if (compact.library.linked) views.libraryLinked.push(small);
            (compact.done ? views.done : views.pending).push(small);
            if (compact.relatedUrls.length) views.withRelatedUrls.push(small);
        });
        return Object.fromEntries(Object.entries(views).map(([name, items]) => [name, { count: items.length, samples: items.slice(0, limit) }]));
    }

    function buildStructuredScope(state, limit, scope, detail = 'summary') {
        const links = getLinks(state);
        const config = getConfig(state);
        const folders = state?.bookmarks?.folders || {};
        const categories = state?.library?.categories || {};
        const connections = state?.library?.connections || [];
        const { linkToEntry } = buildLibraryIndexes(categories, connections);
        const identifierDefs = identifierDefinitions(state);
        const pins = pinLookup(state);
        const byCard = new Map();
        links.forEach((link) => {
            const key = scopedKey(link?.workspace, link?.category);
            if (!byCard.has(key)) byCard.set(key, []);
            byCard.get(key).push(link);
        });
        const budget = detailBudget(detail, limit);
        let remaining = budget;
        const cards = [];
        byCard.forEach((cardLinks, key) => {
            if (cards.length >= 80 || remaining <= 0) return;
            const parsed = splitScopedKey(key);
            const categoryData = categories[key] || {};
            const settings = cardOrderSettings(config, parsed.workspace, parsed.category);
            const ordered = sortLinksForCard(cardLinks, settings);
            const maps = folderMaps(folders[key] || {});
            const linksByFolder = new Map();
            ordered.forEach((link, index) => {
                if (remaining <= 0) return;
                const id = text(link?.id, '');
                const folderId = text(link?.folderId, '');
                const view = bookmarkContext(link, linkToEntry[id], { identifierDefs, pin: pins.bookmarkPins.get(id), orderNumber: orderNumber(settings.customOrderMap, id, index + 1), sourceIndex: index + 1, folderPath: maps.paths.get(folderId) || '', categoryData });
                if (!linksByFolder.has(folderId)) linksByFolder.set(folderId, []);
                linksByFolder.get(folderId).push(view);
                remaining -= 1;
            });
            function buildFolder(node) {
                const direct = linksByFolder.get(node.id) || [];
                return { id: node.id, name: node.name, path: maps.paths.get(node.id) || node.name, taskMode: node.taskMode, clickBehaviorMode: node.clickBehaviorMode, pinned: pins.folderPins.has(`${parsed.workspace}::${parsed.category}::${node.id}`), bookmarks: direct, folders: (maps.children.get(node.id) || []).map(buildFolder) };
            }
            cards.push({
                workspace: parsed.workspace,
                cardName: parsed.category,
                cardCategoryName: parsed.category,
                scopedKey: key,
                note: 'cardName/cardCategoryName is the EveOS card container; bookmarkIdentifiers on each bookmark are the user-facing category/marker pills.',
                settings,
                pinned: pins.cardPins.has(key),
                pin: pins.cardPins.get(key) || null,
                bookmarkCount: cardLinks.length,
                rootBookmarks: linksByFolder.get('') || [],
                detachedBookmarks: Array.from(linksByFolder.entries()).filter(([folderId]) => folderId && !maps.byId.has(folderId)).flatMap(([, items]) => items),
                folders: (maps.children.get('') || []).map(buildFolder)
            });
        });
        return { cards, systemViews: systemViewHints(links, linkToEntry, identifierDefs, Math.min(20, limit)), truncated: remaining <= 0, bookmarkBudget: budget };
    }

    function summarizeState(state, limit, scope, detail = 'summary') {
        const links = getLinks(state);
        const categories = state?.library?.categories || {};
        const connections = state?.library?.connections || [];
        const folders = state?.bookmarks?.folders || {};
        const { linkToEntry } = buildLibraryIndexes(categories, connections);
        const identifierDefs = identifierDefinitions(state);
        const byWorkspace = {};
        const byCard = {};
        links.forEach((link) => {
            const workspace = text(link?.workspace, 'main');
            const category = text(link?.category, 'Unsorted');
            byWorkspace[workspace] = (byWorkspace[workspace] || 0) + 1;
            byCard[scopedKey(workspace, category)] = (byCard[scopedKey(workspace, category)] || 0) + 1;
        });
        const folderOverview = {};
        let folderTotal = 0;
        Object.entries(folders).forEach(([key, tree]) => {
            const count = countFolders(tree);
            folderTotal += count;
            folderOverview[key] = { folderCount: count };
        });
        return {
            kind: 'eveos_modular_summary',
            generatedAt: new Date().toISOString(),
            scope,
            counts: {
                bookmarks: links.length,
                libraryEntries: Object.values(categories).reduce((sum, data) => sum + (data?.entries || []).length, 0),
                connections: connections.length,
                workspaces: Object.keys(byWorkspace).length,
                cards: Object.keys(byCard).length
            },
            breakdown: {
                bookmarksByWorkspace: byWorkspace,
                bookmarksByCard: byCard,
                folders: { totalFolders: folderTotal, byCard: folderOverview },
                nexusSignals: {
                    health: {
                        withNotes: links.filter((link) => text(link?.notes || link?.personalNotes, '')).length,
                        withRelatedUrls: links.filter((link) => relatedUrls(link).length).length,
                        libraryLinked: connections.length,
                        done: links.filter((link) => !!link?.done).length,
                        pending: links.filter((link) => !link?.done).length
                    }
                }
            },
            structuredScope: buildStructuredScope(state, limit, scope, detail),

            samples: {

                bookmarks: links.slice(0, detail === 'brief' ? Math.min(8, limit) : limit).map((link) => bookmarkContext(link, linkToEntry[text(link?.id, '')], { identifierDefs })),
                folders: Object.entries(folders).slice(0, limit).map(([key, tree]) => ({
                    scopedKey: key,
                    folderCount: countFolders(tree)
                }))
            },
            localFallback: true
        };
    }

    function buildLocalGeminiContext(mode = 'summary', limit = 25, options = {}) {
        const state = getStoreState();
        if (!state || !state.bookmarks) return { ok: false, error: 'No in-browser EveOS state is available.' };
        const safeMode = normalizeContextMode(mode);
        const safeLimit = Math.max(5, Math.min(200, Number(limit) || LOCAL_CONTEXT_MODE_PROFILES[safeMode].budget));
        const scope = normalizeScopeOptions(state, options?.scope || options);
        const scopedState = filterStateForScope(state, scope);
        const summary = summarizeState(scopedState, safeLimit, scope, safeMode);
        const payload = safeMode === 'full' ? {
            kind: 'eveos_scoped_context_snapshot',
            generatedAt: new Date().toISOString(),
            scope,
            note: 'Complete scoped snapshot is compact and structured. It intentionally excludes raw config/knowledge dumps to avoid Gemini Live context overflow.',
            counts: summary.counts,
            breakdown: summary.breakdown,
            structuredScope: buildStructuredScope(scopedState, safeLimit, scope, 'full'),
            nexusLog: summary.nexusLog || null,
            localFallback: true
        } : summary;
        const header = `[SYSTEM CONTEXT: ${LOCAL_CONTEXT_MODE_PROFILES[safeMode].header} follows as JSON. Use it as reference context. cardCategory is the card container; bookmarkIdentifiers are the user-facing marker/category pills.]`;
        return {
            ok: true,
            mode: safeMode,
            contextText: `${header}\n${JSON.stringify(payload, null, 2)}`,
            payload,
            localFallback: true
        };
    }

    Object.assign(ns, { buildLocalGeminiContext });
    ns.apiContextLocalReady = true;
})();
