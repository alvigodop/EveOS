window.EveQuickPins = window.EveQuickPins || {};



(function () {

    const ns = window.EveQuickPins;

    const core = ns._core = ns._core || {};

    if (core.loaded) return;



    if (ns.ready) return;



    const TARGET_TYPES = new Set(['bookmark', 'card', 'folder']);

    const BOOKMARK_SCOPE_TYPES = new Set(['tab', 'card', 'folder']);

    const TARGET_VISIBILITY_SCOPE_TYPES = new Set(['tab', 'card']);

    const BOOKMARK_SCOPE_OPTIONS = [

        { value: 'tab', label: 'Tab' },

        { value: 'card', label: 'Card' },

        { value: 'folder', label: 'Folder' }

    ];

    const TARGET_VISIBILITY_SCOPE_OPTIONS = [

        { value: 'tab', label: 'This Tab' },

        { value: 'card', label: 'Focused Card Only' }

    ];
    const PERSIST_IDLE_TIMEOUT_MS = 1200;
    const PERSIST_FALLBACK_DELAY_MS = 180;
    let persistFlushHandle = null;
    let persistFlushScheduled = false;



    function getLinks() {

        if (window.eveState?.links) return window.eveState.links;

        if (typeof links !== 'undefined' && Array.isArray(links)) return links;

        return [];

    }



    function getConfig() {

        if (window.eveState?.config) return window.eveState.config;

        if (typeof config !== 'undefined') return config;

        return window.config || {};

    }



    function getFolderApi() {

        return window.EveBookmarkFolders || null;

    }



    function getStore() {

        if (window.eveState?.quickPins && Array.isArray(window.eveState.quickPins)) {

            return window.eveState.quickPins;

        }

        if (typeof quickPins !== 'undefined' && Array.isArray(quickPins)) {

            return quickPins;

        }

        if (Array.isArray(window.quickPins)) return window.quickPins;

        return [];

    }



    function setRawStore(nextPins) {

        const sanitized = Array.isArray(nextPins) ? nextPins : [];

        if (window.eveState) window.eveState.quickPins = sanitized;

        if (typeof quickPins !== 'undefined') {

            quickPins = sanitized;

        } else {

            window.quickPins = sanitized;

        }

    }



    function toId(value) {

        return String(value ?? '').trim();

    }



    function normalizeCategoryName(value) {

        return toId(value) || 'Unsorted';

    }



    function normalizeWorkspaceId(value) {

        return toId(value) || 'main';

    }



    function normalizeBookmarkScopeType(value) {

        const normalized = toId(value).toLowerCase();

        return BOOKMARK_SCOPE_TYPES.has(normalized) ? normalized : 'tab';

    }



    function normalizeTargetVisibilityScopeType(value) {

        const normalized = toId(value).toLowerCase();

        return TARGET_VISIBILITY_SCOPE_TYPES.has(normalized) ? normalized : 'tab';

    }



    function buildCardTargetId(workspaceId, categoryName) {

        return `${normalizeWorkspaceId(workspaceId)}::${normalizeCategoryName(categoryName)}`;

    }



    function buildFolderTargetId(workspaceId, categoryName, folderId) {

        const normalizedFolderId = toId(folderId);

        return normalizedFolderId

            ? `${buildCardTargetId(workspaceId, categoryName)}::${normalizedFolderId}`

            : '';

    }



    function parseCardTargetId(value) {

        const raw = toId(value);

        if (!raw.includes('::')) {

            return {

                workspaceId: 'main',

                categoryName: normalizeCategoryName(raw)

            };

        }

        const [workspaceId, categoryName] = raw.split('::', 2);

        return {

            workspaceId: normalizeWorkspaceId(workspaceId),

            categoryName: normalizeCategoryName(categoryName)

        };

    }



    function parseFolderTargetId(value) {

        const raw = toId(value);

        const parts = raw.split('::');

        if (parts.length < 3) {

            return {

                workspaceId: 'main',

                categoryName: 'Unsorted',

                folderId: ''

            };

        }

        return {

            workspaceId: normalizeWorkspaceId(parts[0]),

            categoryName: normalizeCategoryName(parts[1]),

            folderId: toId(parts.slice(2).join('::'))

        };

    }



    function getLinkById(linkId) {

        const targetId = toId(linkId);

        return getLinks().find((link) => toId(link?.id) === targetId) || null;

    }



    function buildPinRecord(record, fallbackOrder = 0) {

        const source = record && typeof record === 'object' ? record : {};

        const targetType = TARGET_TYPES.has(toId(source.targetType).toLowerCase())

            ? toId(source.targetType).toLowerCase()

            : (source.folderId ? 'folder' : (source.categoryName && !source.linkId ? 'card' : 'bookmark'));

        let targetId = '';

        let scopeType = 'tab';



        if (targetType === 'bookmark') {

            targetId = toId(source.targetId || source.linkId || source.id);

            if (!targetId) return null;

            scopeType = normalizeBookmarkScopeType(source.scopeType || source.scope || 'tab');

        } else if (targetType === 'card') {

            const parsed = parseCardTargetId(source.targetId || buildCardTargetId(source.workspaceId, source.categoryName));

            targetId = buildCardTargetId(parsed.workspaceId, parsed.categoryName);

            if (!targetId) return null;

            scopeType = normalizeTargetVisibilityScopeType(source.scopeType || source.scope || 'tab');

        } else if (targetType === 'folder') {

            const parsed = parseFolderTargetId(source.targetId || buildFolderTargetId(source.workspaceId, source.categoryName, source.folderId));

            targetId = buildFolderTargetId(parsed.workspaceId, parsed.categoryName, parsed.folderId);

            if (!targetId) return null;

            scopeType = normalizeTargetVisibilityScopeType(source.scopeType || source.scope || 'tab');

        }



        const parsedOrder = Number(source.order);

        return {

            id: toId(source.id) || `pin-${targetType}-${Date.now()}-${fallbackOrder}`,

            targetType,

            targetId,

            scopeType,

            order: Number.isFinite(parsedOrder) ? parsedOrder : fallbackOrder

        };

    }



    function normalizePins(pins) {

        const normalized = [];

        const seenTargets = new Set();

        (Array.isArray(pins) ? pins : []).forEach((rawPin, index) => {

            const pin = buildPinRecord(rawPin, index);

            if (!pin) return;

            const dedupeKey = `${pin.targetType}::${pin.targetId}`;

            if (seenTargets.has(dedupeKey)) return;

            seenTargets.add(dedupeKey);

            normalized.push(pin);

        });

        normalized.sort((a, b) => {

            if (a.order !== b.order) return a.order - b.order;

            return String(a.id).localeCompare(String(b.id));

        });

        return normalized.map((pin, index) => ({ ...pin, order: index }));

    }



    function clearLegacyBookmarkPinnedFlags() {

        getLinks().forEach((link) => {

            if (!link || typeof link !== 'object' || !Object.prototype.hasOwnProperty.call(link, 'pinned')) return;

            delete link.pinned;

        });

    }



    function clearPersistFlushHandle() {

        if (persistFlushHandle === null) return;

        if (typeof persistFlushHandle === 'number') {

            window.clearTimeout(persistFlushHandle);

        } else if (typeof window.cancelIdleCallback === 'function') {

            window.cancelIdleCallback(persistFlushHandle);

        }

        persistFlushHandle = null;

    }



    function flushPinPersistence() {

        clearPersistFlushHandle();

        if (!persistFlushScheduled) return;

        persistFlushScheduled = false;



        if (typeof saveData === 'function') {

            saveData({ skipRender: true, skipSuggestions: true });

        }

    }



    function schedulePinPersistence() {

        persistFlushScheduled = true;

        clearPersistFlushHandle();



        if (typeof window.requestIdleCallback === 'function') {

            persistFlushHandle = window.requestIdleCallback(() => {

                flushPinPersistence();

            }, { timeout: PERSIST_IDLE_TIMEOUT_MS });

            return;

        }



        persistFlushHandle = window.setTimeout(() => {

            flushPinPersistence();

        }, PERSIST_FALLBACK_DELAY_MS);

    }



    function writeStore(nextPins, options = {}) {

        setRawStore(normalizePins(nextPins));

        clearLegacyBookmarkPinnedFlags();

        if (typeof renderDashboard === 'function') {

            renderDashboard();

        }

        if (options.persist !== false && typeof saveData === 'function') {

            schedulePinPersistence();

        }

        return getStore();

    }



    function migrateLegacyPins() {

        const currentPins = normalizePins(getStore());

        const legacyPins = getLinks()

            .filter((link) => !!link?.pinned)

            .map((link) => buildPinRecord({

                targetType: 'bookmark',

                targetId: toId(link?.id),

                scopeType: 'tab'

            }))

            .filter(Boolean);

        if (!currentPins.length && legacyPins.length) {

            writeStore(legacyPins, { persist: false });

            return true;

        }

        if (JSON.stringify(currentPins) !== JSON.stringify(getStore())) {

            setRawStore(currentPins);

        }

        clearLegacyBookmarkPinnedFlags();

        return false;

    }



    function getPins() {

        const pins = normalizePins(getStore());

        if (JSON.stringify(pins) !== JSON.stringify(getStore())) {

            setRawStore(pins);

        }

        return pins;

    }



    function getBookmarkContextFromLink(link) {

        if (!link) return null;

        return {

            workspaceId: normalizeWorkspaceId(link.workspace),

            categoryName: normalizeCategoryName(link.category),

            folderId: toId(link.folderId)

        };

    }



    function getTargetContext(pin) {

        if (!pin || typeof pin !== 'object') return null;

        if (pin.targetType === 'bookmark') {

            const link = getLinkById(pin.targetId);

            return link ? getBookmarkContextFromLink(link) : null;

        }

        if (pin.targetType === 'card') {

            return parseCardTargetId(pin.targetId);

        }

        if (pin.targetType === 'folder') {

            return parseFolderTargetId(pin.targetId);

        }

        return null;

    }



    function isBookmarkPinned(linkId) {

        const targetId = toId(linkId);

        return getPins().some((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === targetId);

    }



    function getBookmarkScopeType(linkId) {

        const targetId = toId(linkId);

        const currentPin = getPins().find((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === targetId);

        return currentPin ? normalizeBookmarkScopeType(currentPin.scopeType) : 'tab';

    }



    function getBookmarkScopeOptions(linkOrLinkId) {

        const link = typeof linkOrLinkId === 'object' && linkOrLinkId

            ? linkOrLinkId

            : getLinkById(linkOrLinkId);

        const folderId = toId(link?.folderId);

        return BOOKMARK_SCOPE_OPTIONS.filter((option) => option.value !== 'folder' || !!folderId);

    }



    function resolveDefaultBookmarkScopeType(linkOrLinkId) {

        const link = typeof linkOrLinkId === 'object' && linkOrLinkId

            ? linkOrLinkId

            : getLinkById(linkOrLinkId);

        if (!link) return 'tab';

        return toId(link.folderId) ? 'folder' : 'card';

    }



    function isCardPinned(workspaceId, categoryName) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        return getPins().some((pin) => pin.targetType === 'card' && pin.targetId === targetId);

    }



    function getCardScopeType(workspaceId, categoryName) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        const currentPin = getPins().find((pin) => pin.targetType === 'card' && pin.targetId === targetId);

        return currentPin ? normalizeTargetVisibilityScopeType(currentPin.scopeType) : 'tab';

    }



    function isFolderPinned(workspaceId, categoryName, folderId) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        return !!targetId && getPins().some((pin) => pin.targetType === 'folder' && pin.targetId === targetId);

    }



    function getFolderScopeType(workspaceId, categoryName, folderId) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        const currentPin = getPins().find((pin) => pin.targetType === 'folder' && pin.targetId === targetId);

        return currentPin ? normalizeTargetVisibilityScopeType(currentPin.scopeType) : 'tab';

    }



    function getTargetVisibilityScopeOptions() {

        return TARGET_VISIBILITY_SCOPE_OPTIONS.slice();

    }



    function describeTargetVisibilityScope(scopeType) {

        return normalizeTargetVisibilityScopeType(scopeType) === 'card'

            ? 'Show this pin only while the card is focused.'

            : 'Show this pin anywhere on the current tab.';

    }



    function removePins(predicate, options = {}) {

        const nextPins = getPins().filter((pin) => !predicate(pin));

        return writeStore(nextPins, options);

    }



    function upsertPin(nextPin, options = {}) {

        const normalizedPin = buildPinRecord(nextPin, getPins().length);

        if (!normalizedPin) return getPins();

        const filtered = getPins().filter((pin) => !(pin.targetType === normalizedPin.targetType && pin.targetId === normalizedPin.targetId));

        filtered.push({ ...normalizedPin, order: filtered.length });

        return writeStore(filtered, options);

    }



    function toggleBookmarkPin(linkId, options = {}) {

        const normalizedLinkId = toId(linkId);

        if (!normalizedLinkId || !getLinkById(normalizedLinkId)) return false;

        if (isBookmarkPinned(normalizedLinkId)) {

            removePins((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === normalizedLinkId, options);

            return false;

        }

        upsertPin({

            targetType: 'bookmark',

            targetId: normalizedLinkId,

            scopeType: normalizeBookmarkScopeType(options.scopeType || resolveDefaultBookmarkScopeType(normalizedLinkId))

        }, options);

        return true;

    }



    function setBookmarkScopeType(linkId, scopeType, options = {}) {

        const normalizedLinkId = toId(linkId);

        const link = getLinkById(normalizedLinkId);

        if (!normalizedLinkId || !link || !isBookmarkPinned(normalizedLinkId)) return false;

        const allowedScopeTypes = new Set(getBookmarkScopeOptions(link).map((option) => option.value));

        const normalizedScopeType = allowedScopeTypes.has(normalizeBookmarkScopeType(scopeType))

            ? normalizeBookmarkScopeType(scopeType)

            : 'tab';

        upsertPin({

            targetType: 'bookmark',

            targetId: normalizedLinkId,

            scopeType: normalizedScopeType

        }, options);

        return true;

    }



    function getCardLinks(workspaceId, categoryName) {

        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);

        const targetCategoryName = normalizeCategoryName(categoryName);

        return getLinks().filter((link) => (

            normalizeWorkspaceId(link?.workspace) === targetWorkspaceId

            && normalizeCategoryName(link?.category) === targetCategoryName

        ));

    }



    function getFolderSubtreeIds(workspaceId, categoryName, folderId) {

        const targetFolderId = toId(folderId);

        if (!targetFolderId) return [];

        const folderApi = getFolderApi();

        const view = folderApi?.buildFolderView?.(normalizeWorkspaceId(workspaceId), normalizeCategoryName(categoryName), getCardLinks(workspaceId, categoryName));

        const childrenMap = view?.childrenMap;

        const subtreeIds = new Set([targetFolderId]);

        if (childrenMap && typeof childrenMap.get === 'function') {

            const pending = [targetFolderId];

            while (pending.length) {

                const currentId = pending.pop();

                (childrenMap.get(currentId) || []).forEach((child) => {

                    const childId = toId(child?.id);

                    if (childId && !subtreeIds.has(childId)) {

                        subtreeIds.add(childId);

                        pending.push(childId);

                    }

                });

            }

        }

        return Array.from(subtreeIds);

    }



    function getDirectFolderLinks(workspaceId, categoryName, folderId) {

        const targetFolderId = toId(folderId);

        if (!targetFolderId) return [];

        return getCardLinks(workspaceId, categoryName).filter((link) => toId(link?.folderId) === targetFolderId);

    }



    function getFolderSubtreeLinks(workspaceId, categoryName, folderId) {

        const subtreeIds = new Set(getFolderSubtreeIds(workspaceId, categoryName, folderId));

        if (!subtreeIds.size) return [];

        return getCardLinks(workspaceId, categoryName).filter((link) => subtreeIds.has(toId(link?.folderId)));

    }



    function getCardRootLinks(workspaceId, categoryName) {

        return getCardLinks(workspaceId, categoryName).filter((link) => !toId(link?.folderId));

    }



    function upsertBookmarkPins(linkIds, scopeType, options = {}) {

        const validIds = Array.from(new Set((Array.isArray(linkIds) ? linkIds : []).map(toId).filter((linkId) => !!getLinkById(linkId))));

        if (!validIds.length) return getPins();

        const requestedScopeType = normalizeBookmarkScopeType(scopeType);

        const existingPins = getPins();

        const nonTargetPins = existingPins.filter((pin) => !(pin.targetType === 'bookmark' && validIds.includes(toId(pin.targetId))));

        const nextPins = nonTargetPins.concat(validIds.map((linkId, index) => {

            const link = getLinkById(linkId);

            const allowedScopeTypes = new Set(getBookmarkScopeOptions(link).map((option) => option.value));

            const normalizedScopeType = allowedScopeTypes.has(requestedScopeType) ? requestedScopeType : 'tab';

            return {

                id: `pin-bookmark-${linkId}`,

                targetType: 'bookmark',

                targetId: linkId,

                scopeType: normalizedScopeType,

                order: nonTargetPins.length + index

            };

        }));

        return writeStore(nextPins, options);

    }



    function removeBookmarkPinsByLinkIds(linkIds, options = {}) {

        const validIds = new Set((Array.isArray(linkIds) ? linkIds : []).map(toId).filter(Boolean));

        return removePins((pin) => pin.targetType === 'bookmark' && validIds.has(toId(pin.targetId)), options);

    }



    function bulkPinBookmarks(linkIds, options = {}) {

        const validIds = Array.from(new Set((Array.isArray(linkIds) ? linkIds : []).map(toId).filter((linkId) => !!getLinkById(linkId))));

        if (!validIds.length) return getPins();



        const preserveExisting = options.preserveExisting !== false;

        const requestedScopeType = toId(options.scopeType) ? normalizeBookmarkScopeType(options.scopeType) : '';

        const nextPins = getPins().slice();



        validIds.forEach((linkId) => {

            const link = getLinkById(linkId);

            if (!link) return;



            const existingIndex = nextPins.findIndex((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === linkId);

            if (existingIndex >= 0 && preserveExisting && !requestedScopeType) {

                return;

            }



            const allowedScopeTypes = new Set(getBookmarkScopeOptions(link).map((option) => option.value));

            const fallbackScopeType = resolveDefaultBookmarkScopeType(link);

            const resolvedScopeType = allowedScopeTypes.has(requestedScopeType)

                ? requestedScopeType

                : (allowedScopeTypes.has(fallbackScopeType) ? fallbackScopeType : 'tab');



            const nextPin = {

                id: existingIndex >= 0 ? nextPins[existingIndex].id : `pin-bookmark-${linkId}`,

                targetType: 'bookmark',

                targetId: linkId,

                scopeType: resolvedScopeType,

                order: existingIndex >= 0 ? nextPins[existingIndex].order : nextPins.length

            };



            if (existingIndex >= 0) nextPins[existingIndex] = nextPin;

            else nextPins.push(nextPin);

        });



        return writeStore(nextPins, options);

    }



    function bulkUnpinBookmarks(linkIds, options = {}) {

        return removeBookmarkPinsByLinkIds(linkIds, options);

    }



    function pinCardRootBookmarks(workspaceId, categoryName, options = {}) {

        const rootLinkIds = getCardRootLinks(workspaceId, categoryName).map((link) => link?.id);

        return upsertBookmarkPins(rootLinkIds, options.scopeType || 'card', options);

    }



    function unpinCardBookmarks(workspaceId, categoryName, options = {}) {

        const cardLinkIds = getCardLinks(workspaceId, categoryName).map((link) => link?.id);

        return removeBookmarkPinsByLinkIds(cardLinkIds, options);

    }



    function pinFolderBookmarks(workspaceId, categoryName, folderId, options = {}) {

        const folderLinkIds = getFolderSubtreeLinks(workspaceId, categoryName, folderId).map((link) => link?.id);

        return upsertBookmarkPins(folderLinkIds, options.scopeType || 'folder', options);

    }



    function unpinFolderBookmarks(workspaceId, categoryName, folderId, options = {}) {

        const folderLinkIds = getFolderSubtreeLinks(workspaceId, categoryName, folderId).map((link) => link?.id);

        return removeBookmarkPinsByLinkIds(folderLinkIds, options);

    }



    function toggleCardPin(workspaceId, categoryName, options = {}) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        if (!targetId) return false;

        if (isCardPinned(workspaceId, categoryName)) {

            removePins((pin) => pin.targetType === 'card' && pin.targetId === targetId, options);

            return false;

        }

        upsertPin({ targetType: 'card', targetId, scopeType: normalizeTargetVisibilityScopeType(options.scopeType || 'tab') }, options);

        return true;

    }



    function toggleFolderPin(workspaceId, categoryName, folderId, options = {}) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        if (!targetId) return false;

        if (isFolderPinned(workspaceId, categoryName, folderId)) {

            removePins((pin) => pin.targetType === 'folder' && pin.targetId === targetId, options);

            return false;

        }

        upsertPin({ targetType: 'folder', targetId, scopeType: normalizeTargetVisibilityScopeType(options.scopeType || 'tab') }, options);

        return true;

    }



    function setCardScopeType(workspaceId, categoryName, scopeType, options = {}) {

        const targetId = buildCardTargetId(workspaceId, categoryName);

        const currentPin = getPins().find((pin) => pin.targetType === 'card' && pin.targetId === targetId);

        if (!currentPin) return false;

        upsertPin({

            ...currentPin,

            scopeType: normalizeTargetVisibilityScopeType(scopeType)

        }, options);

        return true;

    }



    function setFolderScopeType(workspaceId, categoryName, folderId, scopeType, options = {}) {

        const targetId = buildFolderTargetId(workspaceId, categoryName, folderId);

        const currentPin = getPins().find((pin) => pin.targetType === 'folder' && pin.targetId === targetId);

        if (!currentPin) return false;

        upsertPin({

            ...currentPin,

            scopeType: normalizeTargetVisibilityScopeType(scopeType)

        }, options);

        return true;

    }
    Object.assign(core, {

        TARGET_TYPES,

        BOOKMARK_SCOPE_TYPES,

        TARGET_VISIBILITY_SCOPE_TYPES,

        BOOKMARK_SCOPE_OPTIONS,

        TARGET_VISIBILITY_SCOPE_OPTIONS,

        getLinks,

        getConfig,

        getFolderApi,

        getStore,

        setRawStore,

        toId,

        normalizeCategoryName,

        normalizeWorkspaceId,

        normalizeBookmarkScopeType,

        normalizeTargetVisibilityScopeType,

        buildCardTargetId,

        buildFolderTargetId,

        parseCardTargetId,

        parseFolderTargetId,

        getLinkById,

        buildPinRecord,

        normalizePins,

        clearLegacyBookmarkPinnedFlags,

        flushPinPersistence,

        writeStore,

        migrateLegacyPins,

        getPins,

        getBookmarkContextFromLink,

        getTargetContext,

        isBookmarkPinned,

        getBookmarkScopeType,

        getBookmarkScopeOptions,

        resolveDefaultBookmarkScopeType,

        isCardPinned,

        getCardScopeType,

        isFolderPinned,

        getFolderScopeType,

        getTargetVisibilityScopeOptions,

        describeTargetVisibilityScope,

        removePins,

        upsertPin,

        toggleBookmarkPin,

        setBookmarkScopeType,

        getCardLinks,

        getFolderSubtreeIds,

        getDirectFolderLinks,

        getFolderSubtreeLinks,

        getCardRootLinks,

        upsertBookmarkPins,

        removeBookmarkPinsByLinkIds,

        bulkPinBookmarks,

        bulkUnpinBookmarks,

        pinCardRootBookmarks,

        unpinCardBookmarks,

        pinFolderBookmarks,

        unpinFolderBookmarks,

        toggleCardPin,

        toggleFolderPin,

        setCardScopeType,

        setFolderScopeType

    });



    Object.assign(ns, {

        buildCardTargetId,

        buildFolderTargetId,

        parseCardTargetId,

        parseFolderTargetId,

        normalizePins,

        migrateLegacyPins,

        getPins,

        flushPinPersistence,

        writeStore,

        isBookmarkPinned,

        getBookmarkScopeType,

        getBookmarkScopeOptions,

        resolveDefaultBookmarkScopeType,

        isCardPinned,

        getCardScopeType,

        isFolderPinned,

        getFolderScopeType,

        getTargetVisibilityScopeOptions,

        describeTargetVisibilityScope,

        toggleBookmarkPin,

        setBookmarkScopeType,

        bulkPinBookmarks,

        bulkUnpinBookmarks,

        pinCardRootBookmarks,

        unpinCardBookmarks,

        pinFolderBookmarks,

        unpinFolderBookmarks,

        toggleCardPin,

        toggleFolderPin,

        setCardScopeType,

        setFolderScopeType,

        getTargetContext,

        getLinkById

    });



    core.loaded = true;

    window.addEventListener('pagehide', flushPinPersistence);

    window.addEventListener('beforeunload', flushPinPersistence);

})();


