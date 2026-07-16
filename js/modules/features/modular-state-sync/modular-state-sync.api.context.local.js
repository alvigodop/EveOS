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

    const URL_TRACKING_PARAMS = new Set([
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'utm_id', 'utm_name', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'igshid'
    ]);

    const LOCAL_CONTEXT_MODE_PROFILES = {
        brief: { budget: 10, sampleMultiplier: 1, header: 'EveOS lean scoped state brief' },
        summary: { budget: 30, sampleMultiplier: 2, header: 'EveOS scoped state summary' },
        deep: { budget: 60, sampleMultiplier: 3, header: 'EveOS deep scoped state snapshot' },
        full: { budget: 90, sampleMultiplier: 4, header: 'EveOS complete scoped state snapshot' }
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

    function modeSettings(detail) {
        const mode = normalizeContextMode(detail);
        const settings = {
            brief: {
                mode,
                noteLimit: 120,
                summaryLimit: 120,
                urlLimit: 132,
                tagLimit: 8,
                genreLimit: 8,
                aliasLimit: 4,
                sourceLimit: 2,
                relatedUrlLimit: 3,
                folderLimit: 18,
                cardLimit: 16,
                systemViewSampleLimit: 3,
                nexusLogLimit: 1
            },
            summary: {
                mode,
                noteLimit: 240,
                summaryLimit: 220,
                urlLimit: 160,
                tagLimit: 14,
                genreLimit: 14,
                aliasLimit: 8,
                sourceLimit: 3,
                relatedUrlLimit: 5,
                folderLimit: 36,
                cardLimit: 40,
                systemViewSampleLimit: 6,
                nexusLogLimit: 3
            },
            deep: {
                mode,
                noteLimit: 420,
                summaryLimit: 360,
                urlLimit: 180,
                tagLimit: 18,
                genreLimit: 18,
                aliasLimit: 12,
                sourceLimit: 5,
                relatedUrlLimit: 8,
                folderLimit: 72,
                cardLimit: 80,
                systemViewSampleLimit: 10,
                nexusLogLimit: 5
            },
            full: {
                mode,
                noteLimit: 520,
                summaryLimit: 460,
                urlLimit: 190,
                tagLimit: 22,
                genreLimit: 22,
                aliasLimit: 12,
                sourceLimit: 5,
                relatedUrlLimit: 8,
                folderLimit: 120,
                cardLimit: 120,
                systemViewSampleLimit: 12,
                nexusLogLimit: 5
            }
        };
        return settings[mode] || settings.summary;
    }

    function compactText(value, max = 240) {
        const normalized = text(value, '').replace(/\s+/g, ' ');
        const limit = Math.max(0, Number(max) || 0);
        if (!limit) return '';
        if (normalized.length <= limit) return normalized;
        return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
    }

    function middleTruncate(value, max = 180) {
        const raw = text(value, '').replace(/\s+/g, '');
        const limit = Math.max(24, Number(max) || 180);
        if (raw.length <= limit) return raw;
        const head = Math.ceil((limit - 3) * 0.58);
        const tail = Math.max(8, limit - 3 - head);
        return `${raw.slice(0, head)}...${raw.slice(-tail)}`;
    }

    function compactUrl(value, max = 180) {
        const raw = text(value, '');
        if (!raw) return '';
        // Inline data: URIs are kilobytes of base64 that truncate into unusable noise — never
        // ship them as context.
        if (/^data:/i.test(raw)) return '';
        try {
            const parsed = new URL(raw);
            URL_TRACKING_PARAMS.forEach((key) => parsed.searchParams.delete(key));
            return middleTruncate(parsed.toString(), max);
        } catch {
            return middleTruncate(raw, max);
        }
    }

    // Values that carry no information for the model: empty strings, nulls, empty arrays/objects.
    // Numbers (incl. 0) and booleans (incl. false) are real signals and stay.
    function isEmptyContextValue(value) {
        if (value == null) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }

    function pruneEmptyDeep(value) {
        if (Array.isArray(value)) {
            return value.map(pruneEmptyDeep).filter((item) => !isEmptyContextValue(item));
        }
        if (value && typeof value === 'object') {
            const out = {};
            Object.entries(value).forEach(([key, item]) => {
                const pruned = pruneEmptyDeep(item);
                if (!isEmptyContextValue(pruned)) out[key] = pruned;
            });
            return out;
        }
        return value;
    }

    // Stored notes can contain machine-written "=== Section ===" blocks (bookmark merge history,
    // alternate links, discarded titles). Shipping those raw burned hundreds of tokens per
    // bookmark on ids/timestamps the model can't use — compress each block to a one-line marker
    // and keep only the user's freeform text.
    const NOTE_SECTION_RE = /^===\s*(.+?)\s*===\s*$/;

    function compactStoredNotes(value, limit, workspaceNames) {
        const raw = String(value == null ? '' : value);
        if (!raw.trim()) return '';
        const freeform = [];
        const markers = [];
        let section = null;
        const sectionValue = (body, label) => {
            const row = body.find((line) => line.trim().toLowerCase().startsWith(label));
            return row ? row.slice(row.indexOf(':') + 1).trim() : '';
        };
        const flush = () => {
            if (!section) return;
            const name = section.name.toLowerCase();
            const body = section.lines;
            if (name === 'bookmark merge') {
                const mergedAt = sectionValue(body, 'merged at').slice(0, 10);
                const incomingTitle = sectionValue(body, 'incoming title');
                const scopeRaw = sectionValue(body, 'incoming scope');
                let from = '';
                if (scopeRaw) {
                    const segments = scopeRaw.split('/').map((part) => part.trim()).filter(Boolean).slice(0, 2);
                    if (segments.length) {
                        const wsName = workspaceNames?.get?.(segments[0]) || segments[0];
                        from = ` from ${[wsName, segments[1]].filter(Boolean).join('/')}`;
                    }
                }
                markers.push(`[Merged${incomingTitle ? ` "${compactText(incomingTitle, 60)}"` : ''}${from}${mergedAt ? ` on ${mergedAt}` : ''}]`);
            } else if (name === 'alternate links') {
                const count = body.filter((line) => line.trim()).length;
                if (count) markers.push(`[+${count} alternate link${count === 1 ? '' : 's'} in stored notes]`);
            } else if (name === 'other titles') {
                const titles = body.map((line) => line.trim()).filter(Boolean);
                if (titles.length) {
                    const head = titles.slice(0, 3).map((title) => compactText(title, 50)).join('; ');
                    markers.push(`[Also titled: ${head}${titles.length > 3 ? ` (+${titles.length - 3} more)` : ''}]`);
                }
            } else if (name === 'previous seasons/episodes') {
                const count = body.filter((line) => line.trim()).length;
                if (count) markers.push(`[${count} previous season/episode marker${count === 1 ? '' : 's'} in stored notes]`);
            } else {
                const bodyText = body.join(' ').trim();
                if (bodyText) markers.push(`[${section.name}: ${compactText(bodyText, 120)}]`);
            }
            section = null;
        };
        raw.split(/\r?\n/).forEach((line) => {
            const match = line.match(NOTE_SECTION_RE);
            if (match) {
                flush();
                section = { name: match[1], lines: [] };
                return;
            }
            if (section) section.lines.push(line);
            else freeform.push(line);
        });
        flush();
        const combined = [freeform.join(' ').trim()].concat(markers).filter(Boolean).join(' ');
        return compactText(combined, limit);
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

    function collectAllWorkspaceIds(nodes) {
        const ids = new Set();
        function visit(node) {
            const id = text(node?.id, '');
            if (id) ids.add(id);
            (Array.isArray(node?.subTabs) ? node.subTabs : []).forEach(visit);
        }
        (Array.isArray(nodes) ? nodes : []).forEach(visit);
        return ids;
    }

    function workspacePath(workspaceId, nodes, trail = []) {
        const target = text(workspaceId, '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            const id = text(node?.id, '');
            const name = text(node?.name || node?.title, id || 'Tab');
            const nextTrail = trail.concat([{ id, name }]);
            if (id.toLowerCase() === target) return nextTrail;
            const nested = workspacePath(workspaceId, node?.subTabs, nextTrail);
            // A miss returns [] (falsy-looking but TRUTHY as an array). Guard on length, or the
            // first node's empty subtree short-circuits the search and every path comes back blank.
            if (nested && nested.length) return nested;
        }
        return [];
    }

    function collectWorkspaceMeta(config, scope) {
        const nodes = Array.isArray(config?.workspaces) ? config.workspaces : [];
        const selectedIds = new Set((scope.workspaceIds?.length ? scope.workspaceIds : [scope.workspaceId]).map((id) => text(id, '')).filter(Boolean));
        const root = findWorkspace(scope.workspaceId, nodes);
        const branchIds = root ? collectBranchIds(root) : new Set([scope.workspaceId]);
        const ids = scope.scope === 'all'
            ? (scope.workspaceIds?.length ? scope.workspaceIds : Array.from(collectAllWorkspaceIds(nodes)))
            : Array.from(new Set([scope.workspaceId].concat(Array.from(selectedIds))));
        const listedOnlyIds = scope.source === 'manual-tab-current'
            ? Array.from(branchIds).filter((id) => id && id !== scope.workspaceId)
            : [];
        return {
            activeWorkspaceId: scope.workspaceId,
            selectedWorkspaceIds: Array.from(selectedIds),
            tabs: ids.map((id) => {
                const node = findWorkspace(id, nodes) || {};
                const path = workspacePath(id, nodes);
                // No parentPath: it is `path` minus its last segment.
                return {
                    id,
                    name: text(node.name || node.title, id || 'Main'),
                    path: path.map((part) => part.name).join(' / '),
                    contentsIncluded: scope.scope === 'all' || selectedIds.has(id)
                };
            }),
            subTabsListedOnly: listedOnlyIds.map((id) => {
                const node = findWorkspace(id, nodes) || {};
                return {
                    id,
                    name: text(node.name || node.title, id),
                    path: workspacePath(id, nodes).map((part) => part.name).join(' / ')
                };
            })
        };
    }

    function getWorkspaceGroupId(workspaceId, nodes) {
        const target = text(workspaceId, '').toLowerCase();
        for (const node of Array.isArray(nodes) ? nodes : []) {
            if (text(node?.id, '').toLowerCase() === target) return text(node?.groupId, '');
            const nested = getWorkspaceGroupId(workspaceId, node?.subTabs);
            if (nested) return nested;
        }
        return '';
    }

    function normalizeScope(scope) {
        const value = text(scope, 'workspace').toLowerCase();
        if (value === 'group') return 'group';
        if (['all', 'store', 'datapack'].includes(value)) return 'all';
        if (['card', 'category'].includes(value)) return 'card';
        return 'workspace';
    }

    function normalizeScopeOptions(state, options = {}) {
        const cfg = getConfig(state);
        const raw = options?.scope && typeof options.scope === 'object' ? options.scope : (options || {});
        const scope = normalizeScope(raw.scope);
        const workspaceId = text(raw.workspaceId, cfg.activeWorkspace || 'main');
        const source = text(raw.source, 'browser-local-fallback');
        const label = text(raw.label, scope === 'all' ? 'Whole datapack' : (scope === 'group' ? 'Current group' : (scope === 'card' ? 'Specific card' : 'Current tab branch')));
        const currentTabOnly = source === 'manual-tab-current'
            || label.toLowerCase().includes('current tab only')
            || raw.includeBranch === false;
        let workspaceIds = asArray(raw.workspaceIds).map((id) => text(id, '')).filter(Boolean);
        if (scope === 'group' && !workspaceIds.length) {
            const groupId = text(cfg?.groupOverviewId, '') || getWorkspaceGroupId(workspaceId, cfg.workspaces);
            if (groupId) {
                const groupsApi = window.EveSidebarGroups || window.EveSidebarGroupsRuntime;
                if (typeof groupsApi?.getGroupRoots === 'function') {
                    const ids = new Set();
                    (groupsApi.getGroupRoots(groupId, cfg) || []).forEach((root) => {
                        if (!root?.id) return;
                        const rootNode = findWorkspace(root.id, cfg.workspaces);
                        if (rootNode) {
                            collectBranchIds(rootNode).forEach((id) => ids.add(id));
                        } else {
                            ids.add(root.id);
                        }
                    });
                    workspaceIds = Array.from(ids);
                }
            }
        }
        if (scope !== 'all' && scope !== 'group' && (scope === 'card' || currentTabOnly)) {
            workspaceIds = [workspaceId];
        } else if (!workspaceIds.length && scope !== 'all' && scope !== 'group') {
            const root = findWorkspace(workspaceId, cfg.workspaces);
            workspaceIds = Array.from(root ? collectBranchIds(root) : new Set([workspaceId]));
        }
        return {
            scope,
            workspaceId,
            workspaceIds,
            categoryName: text(raw.categoryName, ''),
            label,
            source
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

    function compactNexusTrace(trace) {
        if (!trace || typeof trace !== 'object') return null;
        const rawScope = trace.scope || {};
        const scope = rawScope && typeof rawScope === 'object'
            ? {
                scope: text(rawScope.scope || rawScope.mode || rawScope.type, ''),
                label: compactText(rawScope.label || rawScope.name, 90),
                workspaceId: text(rawScope.workspaceId || rawScope.workspace, ''),
                categoryName: compactText(rawScope.categoryName || rawScope.category, 90)
            }
            : compactText(rawScope, 90);
        return {
            id: text(trace.id, ''),
            query: compactText(trace.query || trace.command || trace.input, 160),
            summary: compactText(trace.summary, 240),
            scope,
            totalMs: Number(trace.totalMs || 0),
            resultCount: Number(trace.resultCount || trace.resultsFound || trace.totalResults || 0),
            endedAt: Number(trace.endedAt || trace.finishedAt || trace.startedAt || 0)
        };
    }

    function recentNexusLog(limit = 5) {
        const sessions = Array.isArray(window.SearchMonitorBoot?._nexusSessions)
            ? window.SearchMonitorBoot._nexusSessions
            : [];
        return sessions.slice(0, Math.max(1, Math.min(5, Number(limit) || 5)))
            .map(compactNexusTrace)
            .filter(Boolean);
    }

    function buildStructuredScope(state, limit, scope, detail = 'summary') {
        const settingsForDetail = modeSettings(detail);
        const links = getLinks(state);
        const config = getConfig(state);
        const folders = state?.bookmarks?.folders || {};
        const categories = state?.library?.categories || {};
        const connections = state?.library?.connections || [];
        const { linkToEntry } = buildLibraryIndexes(categories, connections);
        const identifierDefs = identifierDefinitions(state);
        const pins = pinLookup(state);
        // id -> display name, so merge-note markers can say "from test/Reading" instead of ws ids.
        const workspaceNames = new Map();
        (function collectNames(nodes) {
            (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                const id = text(node?.id, '');
                if (id) workspaceNames.set(id, text(node?.name || node?.title, id));
                collectNames(node?.subTabs);
            });
        })(config?.workspaces);
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
            if (cards.length >= settingsForDetail.cardLimit || remaining <= 0) return;
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
                // customOrderNumber only when the user explicitly ordered this bookmark — the
                // fallback (array index) is already encoded by list position.
                const explicitOrder = Object.prototype.hasOwnProperty.call(settings.customOrderMap, id)
                    ? orderNumber(settings.customOrderMap, id, index + 1)
                    : undefined;
                const view = bookmarkContext(link, linkToEntry[id], { identifierDefs, pin: pins.bookmarkPins.get(id), orderNumber: explicitOrder, categoryData, detail, workspaceNames });
                if (!linksByFolder.has(folderId)) linksByFolder.set(folderId, []);
                linksByFolder.get(folderId).push(view);
                remaining -= 1;
            });
            // Folder shape: nesting already encodes the path, `inherit` is the default for both
            // mode fields, and pinned:false is the default — ship only real signals.
            function buildFolder(node, depth = 0) {
                const direct = linksByFolder.get(node.id) || [];
                const childFolders = depth >= settingsForDetail.folderLimit
                    ? []
                    : (maps.children.get(node.id) || []).map((child) => buildFolder(child, depth + 1));
                return {
                    id: node.id,
                    name: node.name,
                    taskMode: node.taskMode !== 'inherit' ? node.taskMode : undefined,
                    clickBehaviorMode: node.clickBehaviorMode !== 'inherit' ? node.clickBehaviorMode : undefined,
                    pinned: pins.folderPins.has(`${parsed.workspace}::${parsed.category}::${node.id}`) ? true : undefined,
                    bookmarks: direct,
                    folders: childFolders
                };
            }
            cards.push({
                scopedKey: key,
                cardName: parsed.category,
                // Explicit owning-tab attribution: the scopedKey's workspace half is a raw id
                // the model cannot trace, which made it attribute sub-tab cards to parent tabs.
                tabId: parsed.workspace,
                tabName: workspaceNames.get(parsed.workspace) || parsed.workspace,
                settings: {
                    taskModeEnabled: settings.taskModeEnabled,
                    customOrderEnabled: settings.customOrderEnabled ? true : undefined,
                    customOrderSort: settings.customOrderSort !== 'none' ? settings.customOrderSort : undefined,
                    cardOrderIndex: settings.cardOrderIndex || undefined
                },
                pinned: pins.cardPins.has(key) ? true : undefined,
                pin: pins.cardPins.get(key) || undefined,
                bookmarkCount: cardLinks.length,
                rootBookmarks: linksByFolder.get('') || [],
                detachedBookmarks: Array.from(linksByFolder.entries()).filter(([folderId]) => folderId && !maps.byId.has(folderId)).flatMap(([, items]) => items),
                folders: (maps.children.get('') || []).slice(0, settingsForDetail.folderLimit).map((node) => buildFolder(node, 0))
            });
        });
        return {
            workspaceScope: collectWorkspaceMeta(config, scope),
            cards,
            systemViews: systemViewHints(links, linkToEntry, identifierDefs, Math.min(settingsForDetail.systemViewSampleLimit, limit), detail, workspaceNames),
            truncated: remaining <= 0,
            bookmarkBudget: budget
        };
    }

    function summarizeState(state, limit, scope, detail = 'summary') {
        const safeDetail = normalizeContextMode(detail);
        const settings = modeSettings(safeDetail);
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
                        withRelatedUrls: links.filter((link) => relatedUrls(link, 1, settings.urlLimit).length).length,
                        libraryLinked: connections.length,
                        done: links.filter((link) => !!link?.done).length,
                        pending: links.filter((link) => !link?.done).length
                    }
                }
            },
            structuredScope: buildStructuredScope(state, safeDetail === 'brief' ? Math.min(8, limit) : limit, scope, safeDetail),
            nexusLog: recentNexusLog(settings.nexusLogLimit),
            samples: safeDetail === 'brief' ? {
                folders: Object.entries(folders).slice(0, Math.min(6, limit)).map(([key, tree]) => ({
                    scopedKey: key,
                    folderCount: countFolders(tree)
                }))
            } : undefined,
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
        const rawPayload = safeMode === 'full' ? {
            kind: 'eveos_scoped_context_snapshot',
            generatedAt: new Date().toISOString(),
            scope,
            counts: summary.counts,
            breakdown: summary.breakdown,
            structuredScope: summary.structuredScope,
            nexusLog: summary.nexusLog || null,
            localFallback: true
        } : summary;
        // Empty strings/arrays/objects carry zero information — strip them everywhere so the
        // model only reads real values. Numbers and booleans (incl. 0/false) always ship.
        const payload = pruneEmptyDeep(rawPayload);
        const header = `[SYSTEM CONTEXT: ${LOCAL_CONTEXT_MODE_PROFILES[safeMode].header} follows as JSON. Each bookmark's \`card\` is its "workspaceId::cardName" container; bookmarkIdentifiers are the user-facing marker/category pills. Absent fields mean empty/none.]`;
        // ALL tiers ship compact JSON — pretty-print indentation is pure whitespace tokens that
        // cost Gemini context for zero info, even on the deep/full snapshots.
        const json = JSON.stringify(payload);
        return {
            ok: true,
            mode: safeMode,
            contextText: `${header}\n${json}`,
            payload,
            localFallback: true
        };
    }

    Object.assign(ns, { buildLocalGeminiContext });
    ns.apiContextLocalReady = true;
})();
