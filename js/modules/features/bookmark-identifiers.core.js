window.EveBookmarkIdentifiers = window.EveBookmarkIdentifiers || {};

(function (ns) {
    if (ns.ready) return;

    const DEFAULT_IDENTIFIERS = Object.freeze([
        { id: 'reading', label: 'Reading', icon: '', color: '#4f8cff', description: 'Long-form text, books, manga, articles, or written research.' },
        { id: 'watching', label: 'Watching', icon: '', color: '#ff7a59', description: 'Video-first content such as films, shows, clips, or streams.' },
        { id: 'listening', label: 'Listening', icon: '', color: '#9b6bff', description: 'Audio-first content such as podcasts, music, or spoken material.' },
        { id: 'playing', label: 'Playing', icon: '', color: '#2db784', description: 'Games, interactive media, or playable experiences.' },
        { id: 'research', label: 'Research', icon: '', color: '#f2b94b', description: 'Material kept for investigation, study, or later synthesis.' },
        { id: 'reference', label: 'Reference', icon: '', color: '#7a8a99', description: 'Stable reference material worth keeping distinct from active consumption.' }
    ]);

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function slugifyIdentifierId(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function normalizeHexColor(value, fallback = '#5b8def') {
        const input = String(value || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(input)) return input.toLowerCase();
        if (/^#[0-9a-f]{3}$/i.test(input)) {
            const normalized = input.slice(1).split('').map((part) => part + part).join('');
            return `#${normalized}`.toLowerCase();
        }
        return fallback.toLowerCase();
    }

    function hexToRgb(hex) {
        const normalized = normalizeHexColor(hex);
        const raw = normalized.slice(1);
        return {
            r: parseInt(raw.slice(0, 2), 16),
            g: parseInt(raw.slice(2, 4), 16),
            b: parseInt(raw.slice(4, 6), 16)
        };
    }

    function toBadgeStyle(color) {
        const rgb = hexToRgb(color);
        return [
            `color:${color}`,
            `border-color:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.38)`,
            `background:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`
        ].join(';');
    }

    function getConfigObject() {
        if (window.eveState?.config && typeof window.eveState.config === 'object') return window.eveState.config;
        if (typeof config !== 'undefined' && config && typeof config === 'object') return config;
        return null;
    }

    function getLinksList() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function setLinksList(nextLinks) {
        if (typeof window.setLiveLinks === 'function') return window.setLiveLinks(nextLinks);
        if (window.eveState) window.eveState.links = nextLinks;
        window.links = nextLinks;
        if (typeof links !== 'undefined') links = nextLinks;
        return nextLinks;
    }

    function normalizeWorkspaceId(value) {
        return String(value || '').trim() || 'main';
    }

    function normalizeCategoryName(value) {
        return String(value || '').trim() || 'Unsorted';
    }

    function normalizeFolderId(value) {
        return String(value || '').trim();
    }

    function buildQuickLinkKey(workspaceId, categoryName) {
        return `${encodeURIComponent(normalizeWorkspaceId(workspaceId))}|${encodeURIComponent(normalizeCategoryName(categoryName))}`;
    }

    function buildQuickLinkDestinationKey(target) {
        return [
            encodeURIComponent(normalizeWorkspaceId(target?.workspaceId)),
            encodeURIComponent(normalizeCategoryName(target?.categoryName)),
            encodeURIComponent(normalizeFolderId(target?.folderId))
        ].join('|');
    }

    function parseQuickLinkKey(value) {
        const parts = String(value || '').split('|');
        if (parts.length < 2) return null;
        try {
            return {
                workspaceId: normalizeWorkspaceId(decodeURIComponent(parts[0])),
                categoryName: normalizeCategoryName(decodeURIComponent(parts.slice(1).join('|')))
            };
        } catch (error) {
            return null;
        }
    }

    function parseQuickLinkDestinationKey(value) {
        const parts = String(value || '').split('|');
        if (parts.length < 2) return null;
        try {
            return {
                workspaceId: normalizeWorkspaceId(decodeURIComponent(parts[0] || '')),
                categoryName: normalizeCategoryName(decodeURIComponent(parts[1] || '')),
                folderId: normalizeFolderId(decodeURIComponent(parts[2] || ''))
            };
        } catch (error) {
            return null;
        }
    }

    function normalizeQuickLinks(value) {
        const source = Array.isArray(value) ? value : [];
        const seen = new Set();
        const result = [];
        source.forEach((item) => {
            const workspaceId = normalizeWorkspaceId(item?.workspaceId || item?.workspace || item?.tabId);
            const categoryName = normalizeCategoryName(item?.categoryName || item?.category || item?.cardName);
            if (!workspaceId || !categoryName) return;
            const key = buildQuickLinkKey(workspaceId, categoryName);
            if (seen.has(key)) return;
            seen.add(key);
            result.push({ workspaceId, categoryName });
        });
        return result;
    }

    function normalizeRecentDestinations(value) {
        const source = Array.isArray(value) ? value : [];
        const seen = new Set();
        const result = [];
        source.forEach((item) => {
            const entry = {
                workspaceId: normalizeWorkspaceId(item?.workspaceId || item?.workspace),
                categoryName: normalizeCategoryName(item?.categoryName || item?.category),
                folderId: normalizeFolderId(item?.folderId),
                at: Number(item?.at) || 0
            };
            if (!entry.workspaceId || !entry.categoryName) return;
            const key = buildQuickLinkDestinationKey(entry);
            if (seen.has(key)) return;
            seen.add(key);
            result.push(entry);
        });
        return result.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10);
    }

    function getQuickLinkRecents() {
        const cfg = getConfigObject();
        return normalizeRecentDestinations(cfg?.bookmarkIdentifierQuickLinkRecents);
    }

    function persistQuickLinkRecents(recents) {
        const cfg = getConfigObject();
        if (!cfg) return;
        cfg.bookmarkIdentifierQuickLinkRecents = normalizeRecentDestinations(recents);
        if (typeof saveConfig === 'function') {
            saveConfig({
                immediate: true,
                source: 'bookmark-identifier-quick-link-recents'
            });
        }
    }

    function rememberQuickLinkDestination(target) {
        if (!target?.workspaceId || !target?.categoryName) return;
        const nextEntry = {
            workspaceId: normalizeWorkspaceId(target.workspaceId),
            categoryName: normalizeCategoryName(target.categoryName),
            folderId: normalizeFolderId(target.folderId),
            at: Date.now()
        };
        const nextKey = buildQuickLinkDestinationKey(nextEntry);
        const recents = getQuickLinkRecents().filter((entry) => buildQuickLinkDestinationKey(entry) !== nextKey);
        persistQuickLinkRecents([nextEntry].concat(recents).slice(0, 10));
    }

    function getConfigWorkspaces() {
        const cfg = getConfigObject();
        return Array.isArray(cfg?.workspaces) ? cfg.workspaces : [];
    }

    function getWorkspaceById(workspaceId) {
        const targetId = normalizeWorkspaceId(workspaceId);
        if (window.EveWorkspaceHelpers?.findById) {
            return window.EveWorkspaceHelpers.findById(getConfigWorkspaces(), targetId) || null;
        }
        let found = null;
        function visit(items) {
            if (!Array.isArray(items) || found) return;
            items.forEach((item) => {
                if (!item || found) return;
                if (String(item.id || '').trim() === targetId) {
                    found = item;
                    return;
                }
                visit(item.subTabs);
            });
        }
        visit(getConfigWorkspaces());
        return found;
    }

    function getWorkspaceLabel(workspaceId) {
        const targetId = normalizeWorkspaceId(workspaceId);
        const workspaces = getConfigWorkspaces();
        const helpers = window.EveWorkspaceHelpers;
        const parts = [];
        let cursor = helpers?.findById ? helpers.findById(workspaces, targetId) : getWorkspaceById(targetId);
        let guard = 0;
        while (cursor && guard < 64) {
            parts.unshift(String(cursor.name || cursor.id || 'Tab').trim() || 'Tab');
            const parent = helpers?.findParent ? helpers.findParent(workspaces, String(cursor.id || '')) : null;
            cursor = parent || null;
            guard += 1;
        }
        return parts.length ? parts.join(' > ') : targetId;
    }

    function collectWorkspaceIds() {
        const ids = [];
        function visit(items) {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                const id = String(item?.id || '').trim();
                if (id) ids.push(id);
                visit(item?.subTabs);
            });
        }
        visit(getConfigWorkspaces());
        getLinksList().forEach((link) => {
            const workspaceId = normalizeWorkspaceId(link?.workspace);
            if (!ids.includes(workspaceId)) ids.push(workspaceId);
        });
        if (!ids.length) ids.push('main');
        return ids;
    }

    function getCategoryNamesForWorkspace(workspaceId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const names = new Set();
        if (window.EveCategoryOrder?.getOrder) {
            window.EveCategoryOrder.getOrder(targetWorkspaceId).forEach((name) => names.add(normalizeCategoryName(name)));
        }
        getLinksList().forEach((link) => {
            if (normalizeWorkspaceId(link?.workspace) !== targetWorkspaceId) return;
            names.add(normalizeCategoryName(link?.category));
        });
        const folderStore = window.eveState?.bookmarkFolders || window.bookmarkFolders || {};
        Object.keys(folderStore || {}).forEach((key) => {
            const prefix = `${targetWorkspaceId}::`;
            if (!String(key).startsWith(prefix)) return;
            names.add(normalizeCategoryName(String(key).slice(prefix.length)));
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    function getAllCardTargets() {
        const targets = [];
        const seen = new Set();
        collectWorkspaceIds().forEach((workspaceId) => {
            getCategoryNamesForWorkspace(workspaceId).forEach((categoryName) => {
                const key = buildQuickLinkKey(workspaceId, categoryName);
                if (seen.has(key)) return;
                seen.add(key);
                targets.push({
                    workspaceId: normalizeWorkspaceId(workspaceId),
                    categoryName: normalizeCategoryName(categoryName),
                    workspaceLabel: getWorkspaceLabel(workspaceId),
                    label: `${getWorkspaceLabel(workspaceId)} / ${normalizeCategoryName(categoryName)}`
                });
            });
        });
        return targets;
    }

    function createUniqueId(baseId, takenIds) {
        const fallbackBase = baseId || 'identifier';
        if (!takenIds.has(fallbackBase)) return fallbackBase;
        let index = 2;
        while (takenIds.has(`${fallbackBase}-${index}`)) index += 1;
        return `${fallbackBase}-${index}`;
    }

    function normalizeDefinition(raw, takenIds, fallbackIndex) {
        if (!raw || typeof raw !== 'object') return null;
        const label = String(raw.label || '').trim();
        if (!label) return null;
        const requestedId = slugifyIdentifierId(raw.id || label || `identifier-${fallbackIndex}`);
        const id = createUniqueId(requestedId || `identifier-${fallbackIndex}`, takenIds);
        takenIds.add(id);
        return {
            id,
            label,
            icon: String(raw.icon || '').trim(),
            color: normalizeHexColor(raw.color, DEFAULT_IDENTIFIERS[fallbackIndex % DEFAULT_IDENTIFIERS.length]?.color || '#5b8def'),
            description: String(raw.description || '').trim(),
            quickLinks: normalizeQuickLinks(raw.quickLinks)
        };
    }

    function normalizeRegistry(registry) {
        const source = Array.isArray(registry) ? registry : [];
        const takenIds = new Set();
        return source
            .map((item, index) => normalizeDefinition(item, takenIds, index))
            .filter(Boolean);
    }

    function ensureConfigDefaults() {
        const cfg = getConfigObject();
        if (!cfg) return [];
        const existing = normalizeRegistry(cfg.bookmarkIdentifiers);
        if (existing.length) {
            cfg.bookmarkIdentifiers = existing;
            return existing;
        }
        const defaults = normalizeRegistry(DEFAULT_IDENTIFIERS);
        cfg.bookmarkIdentifiers = defaults;
        return defaults;
    }

    function getDefinitions() {
        return ensureConfigDefaults().map((definition) => ({
            ...definition,
            quickLinks: normalizeQuickLinks(definition.quickLinks)
        }));
    }

    // Cached definition map — avoids rebuilding a new Map per getBadgeHtmlForLink call
    let _cachedDefMap = null;
    let _cachedDefMapSignature = '';

    function getDefinitionMap() {
        const defs = getDefinitions();
        const sig = JSON.stringify(defs.map((definition) => ({
            id: definition.id,
            label: definition.label,
            icon: definition.icon,
            color: definition.color,
            description: definition.description,
            quickLinks: normalizeQuickLinks(definition.quickLinks)
        })));
        if (_cachedDefMap && _cachedDefMapSignature === sig) {
            return _cachedDefMap;
        }
        _cachedDefMap = new Map(defs.map((definition) => [definition.id, definition]));
        _cachedDefMapSignature = sig;
        return _cachedDefMap;
    }

    function normalizeIdentifierIds(value) {
        const validIds = new Set(getDefinitions().map((definition) => definition.id));
        const rawIds = Array.isArray(value) ? value : [];
        const result = [];
        rawIds.forEach((item) => {
            const normalized = String(item || '').trim();
            if (!normalized || !validIds.has(normalized) || result.includes(normalized)) return;
            result.push(normalized);
        });
        return result;
    }

    function getIdentifiersForLink(link) {
        return normalizeIdentifierIds(link?.identifiers);
    }

    function buildBadgeHtml(identifierIds, link) {
        const definitions = getDefinitionMap();
        const linkId = String(link?.id || '').trim();
        return normalizeIdentifierIds(identifierIds).map((id) => {
            const definition = definitions.get(id);
            if (!definition) return '';
            const title = definition.description ? ` title="${escapeHtml(definition.description)}"` : '';
            const linkAttrs = linkId
                ? ` data-bookmark-identifier-id="${escapeHtml(id)}" data-bookmark-id="${escapeHtml(linkId)}" tabindex="0" role="button" aria-label="${escapeHtml(definition.label)} quick label panel"`
                : '';
            const iconHtml = definition.icon
                ? `<span class="bookmark-identifier-badge__icon">${escapeHtml(definition.icon)}</span>`
                : '';
            return `<span class="bookmark-identifier-badge${linkId ? ' has-quick-panel' : ''}" style="${toBadgeStyle(definition.color)}"${title}${linkAttrs}>${iconHtml}<span class="bookmark-identifier-badge__label">${escapeHtml(definition.label)}</span></span>`;
        }).join('');
    }

    function getBadgeHtmlForLink(link) {
        return buildBadgeHtml(getIdentifiersForLink(link), link);
    }

    ns.ready = true;
    ns.ensureConfigDefaults = ensureConfigDefaults;
    ns.getDefinitions = getDefinitions;
    ns.getIdentifiersForLink = getIdentifiersForLink;
    ns.getBadgeHtmlForLink = getBadgeHtmlForLink;
    ns.buildBadgeHtml = buildBadgeHtml;
    ns.getAllCardTargets = getAllCardTargets;
    ns.getQuickLinkRecents = getQuickLinkRecents;
    ns._helpers = {
        DEFAULT_IDENTIFIERS,
        escapeHtml,
        normalizeHexColor,
        normalizeWorkspaceId,
        normalizeCategoryName,
        normalizeFolderId,
        buildQuickLinkKey,
        buildQuickLinkDestinationKey,
        parseQuickLinkKey,
        parseQuickLinkDestinationKey,
        normalizeQuickLinks,
        normalizeRecentDestinations,
        getQuickLinkRecents,
        persistQuickLinkRecents,
        rememberQuickLinkDestination,
        getConfigObject,
        getLinksList,
        setLinksList,
        getWorkspaceLabel,
        getAllCardTargets,
        normalizeDefinition,
        normalizeRegistry,
        normalizeIdentifierIds,
        getDefinitions,
        getIdentifiersForLink,
        buildBadgeHtml
    };

    ensureConfigDefaults();
})(window.EveBookmarkIdentifiers);
