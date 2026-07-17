window.EveDataStore = window.EveDataStore || {};

(function () {
    const ns = window.EveDataStore._modularSync = window.EveDataStore._modularSync || {};
    const shared = ns.localContextShared;
    const scopeApi = ns.localContextScope;
    if (!shared || !scopeApi) throw new Error('[ModularStateSync] Local context bookmark dependencies missing.');
    const {
        text,
        asArray,
        compactText,
        middleTruncate,
        compactUrl,
        compactStoredNotes,
        pruneEmptyDeep,
        modeSettings
    } = shared;
    const { scopedKey, splitScopedKey, getConfig } = scopeApi;
    const DEFAULT_IDENTIFIERS = [
        { id: 'reading', label: 'Reading', description: 'Long-form text, books, manga, articles, or written research.' },
        { id: 'watching', label: 'Watching', description: 'Video-first content such as films, shows, clips, or streams.' },
        { id: 'listening', label: 'Listening', description: 'Audio-first content such as podcasts, music, or spoken material.' },
        { id: 'playing', label: 'Playing', description: 'Games, interactive media, or playable experiences.' },
        { id: 'research', label: 'Research', description: 'Material kept for investigation, study, or later synthesis.' },
        { id: 'reference', label: 'Reference', description: 'Stable reference material worth keeping distinct from active consumption.' }
    ];

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

    function urlValue(item, max = 180) {
        const value = item && typeof item === 'object'
            ? text(item.url || item.href || item.link || item.source || item.value, '')
            : text(item, '');
        return compactUrl(value, max);
    }

    function relatedUrls(link, limit = 12, urlLimit = 180) {
        const out = [];
        ['relatedUrls', 'additionalUrls', 'extraUrls', 'alternateUrls', 'urlAlternates', 'mirrors', 'sources', 'sourceUrls'].forEach((key) => {
            asArray(link?.[key]).forEach((item) => out.push(urlValue(item, urlLimit)));
        });
        ['mirrorUrl', 'sourceUrl', 'wikiUrl', 'alternateUrl', 'additionalUrl', 'mangaDexUrl', 'anilistUrl', 'malUrl', 'fandomUrl'].forEach((key) => out.push(compactUrl(link?.[key], urlLimit)));
        return uniqueList(out.filter(Boolean), limit);
    }

    function coverState(link, settings = modeSettings('summary')) {
        const additional = [];
        ['additionalCovers', 'coverImages', 'extraCovers', 'alternateCovers'].forEach((key) => {
            asArray(link?.[key]).forEach((item) => additional.push(urlValue(item, settings.urlLimit) || compactUrl(item?.src, settings.urlLimit)));
        });
        const primary = compactUrl(first(link, ['coverImage', 'cover', 'imageUrl', 'thumbnail', 'thumbnailUrl']), settings.urlLimit);
        return { primary, additional: uniqueList(additional, Math.min(8, settings.relatedUrlLimit)), hasCover: !!(primary || additional.length), hasAdditionalCovers: additional.length > 0 };
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
        // Flat {Label: score} map — the old {values:{key:{label,score}},presentProviders,count}
        // shape repeated every provider name twice and shipped derivable counts.
        const values = {};
        if (apiRatings && typeof apiRatings === 'object') {
            Object.entries(RATING_PROVIDER_LABELS).forEach(([key, label]) => {
                const value = scalar(apiRatings[key] ?? apiRatings[label] ?? apiRatings[label.toLowerCase()]);
                if (value !== null) values[label] = value;
            });
        }
        return values;
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

    function sourceContext(source, settings = modeSettings('summary')) {
        if (!source || typeof source !== 'object') return null;
        const provider = text(source.source || source.provider || source.site || source.name, '');
        const title = compactText(source.title || source.name || source.label, 120);
        const url = compactUrl(source.providerUrl || source.url || source.sourceUrl || source.link, settings.urlLimit);
        const score = scalar(source.score ?? source.rating ?? source.averageScore);
        return {
            provider,
            title,
            status: compactText(source.status || source.state, 80),
            score,
            url,
            type: compactText(source.type || source.mediaType || source.format, 80),
            author: compactText(source.author, 120),
            tags: uniqueList(asArray(source.tags), Math.min(16, settings.tagLimit)),
            genres: uniqueList(asArray(source.genres), Math.min(16, settings.genreLimit)),
            synonyms: uniqueList(asArray(source.synonyms).concat(asArray(source.altTitles || source.alternativeTitles)), settings.aliasLimit),
            progress: progress(source),
            coverUrl: compactUrl(source.coverUrl || source.image || source.imageUrl || '', settings.urlLimit)
        };
    }

    function attachedSources(link, entry, settings = modeSettings('summary')) {
        const raw = []
            .concat(Array.isArray(link?.sources) ? link.sources : [])
            .concat(Array.isArray(entry?.sources) ? entry.sources : []);
        const seen = new Set();
        return raw.map((source) => sourceContext(source, settings)).filter((source) => {
            if (!source) return false;
            const key = `${source.provider}|${source.title}|${source.url}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return source.provider || source.title || source.url || source.score !== null;
        }).slice(0, settings.sourceLimit);
    }

    function ratingContext(link, entry) {
        // No `summary` block: it repeated a subset of `derived` verbatim on every rated bookmark.
        const api = compactApiRatings(entry?.apiRatings || link?.apiRatings);
        const derived = compactDerivedRatings(entry?.derivedRatings || link?.derivedRatings);
        const personal = scalar(first(entry, ['rating', 'personalRating']) || first(link, ['rating', 'personalRating']));
        return { personal, api, derived };
    }

    function hasRatingSignal(ratings) {
        return ratings.personal !== null
            || Object.keys(ratings.api).length > 0
            || Object.keys(ratings.derived).length > 0;
    }

    function mediaContext(link, entry, categoryData) {
        // No `flags` block: it was derivable from the mediaTypes list itself.
        const mediaTypes = uniqueList(asArray(entry?.mediaTypes).concat(asArray(link?.mediaTypes)), 8);
        return {
            dataType: text(categoryData?.dataType || entry?.dataType || link?.dataType, ''),
            mediaTypes
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
        // `details` only adds value when a definition carries a description — otherwise it just
        // repeats ids+labels a third time.
        const informative = details
            .filter((definition) => definition.description)
            .map((definition) => ({ id: definition.id, label: definition.label, description: definition.description }));
        return {
            ids,
            labels: details.map((definition) => definition.label),
            details: informative.length ? informative : undefined
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

    // Slim bookmark shape: one locator string (`card` = "workspace::cardName") instead of the old
    // location/card/category/cardCategory quadruplication, no per-bookmark explainer sentences
    // (the SYSTEM CONTEXT header explains the schema once), no taskStatus (done covers it), no
    // bookmarkLabels (identifiers.labels covers it), ratings only when a rating exists, covers
    // only when a cover exists. Folder placement is encoded by nesting inside the folder tree.
    function bookmarkContext(link, linkedEntry, context = {}) {
        const settings = modeSettings(context.detail || 'summary');
        const entry = linkedEntry || {};
        const workspace = text(link?.workspace, 'main');
        const cardName = text(link?.category, 'Unsorted');
        const markerState = bookmarkIdentifiers(link, context.identifierDefs || new Map());
        const pin = context.pin || null;
        const sources = attachedSources(link, entry, settings);
        const media = mediaContext(link, entry, context.categoryData || {});
        const ratings = ratingContext(link, entry);
        const related = relatedUrls(link, settings.relatedUrlLimit, settings.urlLimit);
        const isBrief = settings.mode === 'brief';
        const isLinked = !!linkedEntry;
        const covers = coverState(link, settings);
        const libraryDetails = isLinked ? {
            linked: true,
            title: compactText(entry.title, 160),
            aliases: isBrief ? undefined : asArray(entry.aliases || entry.alternativeTitles || entry.titleAltNames || entry.altTitles || entry.otherNames).map((item) => compactText(item, 120)).slice(0, settings.aliasLimit),
            entryId: text(entry.id, ''),
            status: compactText(entry.status, 80),
            media: isBrief ? undefined : media,
            author: isBrief ? undefined : compactText(entry.author, 120),
            authorAltNames: isBrief ? undefined : asArray(entry.authorAltNames).map((item) => compactText(item, 120)).slice(0, settings.aliasLimit),
            artist: isBrief ? undefined : compactText(entry.artist, 120),
            language: isBrief ? undefined : compactText(entry.language, 80),
            sourceUrl: isBrief ? undefined : compactUrl(entry.sourceUrl, settings.urlLimit),
            summary: isBrief ? undefined : compactStoredNotes(entry.summary || entry.description, settings.summaryLimit, context.workspaceNames)
        } : { linked: false };
        return {
            id: link?.id,
            title: compactText(link?.title || 'Untitled', 160),
            urls: { primary: compactUrl(link?.url || link?.href, settings.urlLimit), related },
            card: scopedKey(workspace, cardName),
            bookmarkIdentifiers: isBrief ? { ids: markerState.ids, labels: markerState.labels } : markerState,
            done: !!link?.done,
            pinned: (pin || link?.pinned) ? true : undefined,
            pin: isBrief ? undefined : (pin || undefined),
            priority: compactText(link?.priority, 60),
            icon: isBrief ? undefined : compactUrl(link?.icon || link?.favicon || link?.imageIcon, settings.urlLimit),
            status: compactText(entry.status || link?.status || link?.readingStatus || link?.mediaStatus, 80),
            notes: compactStoredNotes(link?.personalNotes || link?.notes, settings.noteLimit, context.workspaceNames),
            progress: progress(Object.assign({}, entry, link)),
            ratings: hasRatingSignal(ratings) ? ratings : undefined,
            timestamps: {
                updated: timestamp(link) || timestamp(entry),
                dateAdded: isBrief ? undefined : text(link?.dateAdded || entry.dateAdded, ''),
                lastVisited: isBrief ? undefined : text(link?.lastVisited || link?.visitedAt, '')
            },
            tags: uniqueList(asArray(link?.tags).concat(asArray(entry.tags)), settings.tagLimit),
            genres: uniqueList(asArray(link?.genres).concat(asArray(entry.genres)), settings.genreLimit),
            covers: covers.hasCover ? covers : undefined,
            attachedSources: sources.length ? sources : undefined,
            sourceProviders: sources.length ? uniqueList(sources.map((source) => source.provider).filter(Boolean), 12) : undefined,
            sort: context.orderNumber != null ? { customOrderNumber: context.orderNumber } : undefined,
            library: libraryDetails
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

    function systemViewHints(links, linkToEntry, identifierDefs, limit, detail = 'summary', workspaceNames) {
        const settings = modeSettings(detail);
        const sampleLimit = Math.max(1, Math.min(settings.systemViewSampleLimit, Number(limit) || settings.systemViewSampleLimit));
        const views = { withCovers: [], withAdditionalCovers: [], missingCovers: [], libraryLinked: [], done: [], pending: [], withRelatedUrls: [] };
        links.forEach((link) => {
            const compact = bookmarkContext(link, linkToEntry[text(link?.id, '')], { identifierDefs, detail, workspaceNames });
            const hasCover = !!compact.covers;
            // View samples are pointers into the card trees — id/title/locator only; the full
            // record already ships once inside its card.
            const small = {
                id: compact.id,
                title: compact.title,
                url: compact.urls.primary,
                bookmarkIdentifiers: { ids: compact.bookmarkIdentifiers.ids, labels: compact.bookmarkIdentifiers.labels },
                card: compact.card,
                status: compact.status,
                done: compact.done
            };
            (hasCover ? views.withCovers : views.missingCovers).push(small);
            if (compact.covers?.hasAdditionalCovers) views.withAdditionalCovers.push(small);
            if (compact.library.linked) views.libraryLinked.push(small);
            (compact.done ? views.done : views.pending).push(small);
            if (compact.urls.related.length) views.withRelatedUrls.push(small);
        });
        return Object.fromEntries(Object.entries(views).map(([name, items]) => [name, { count: items.length, samples: items.slice(0, sampleLimit) }]));
    }

    ns.localContextBookmarks = {
        first,
        progress,
        timestamp,
        uniqueList,
        urlValue,
        relatedUrls,
        coverState,
        scalar,
        compactApiRatings,
        compactDerivedRatings,
        sourceContext,
        attachedSources,
        ratingContext,
        hasRatingSignal,
        mediaContext,
        identifierDefinitions,
        bookmarkIdentifiers,
        pinLookup,
        bookmarkContext,
        countFolders,
        folderNodes,
        folderMaps,
        cardOrderSettings,
        orderNumber,
        sortLinksForCard,
        systemViewHints,
    };
})();