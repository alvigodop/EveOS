window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
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

    function syncLegacyBookmarkPinnedFlags() {
        const pinnedBookmarkIds = new Set(
            getStore()
                .filter((pin) => pin?.targetType === 'bookmark')
                .map((pin) => toId(pin.targetId))
                .filter(Boolean)
        );
        getLinks().forEach((link) => {
            const linkId = toId(link?.id);
            if (!linkId) return;
            link.pinned = pinnedBookmarkIds.has(linkId);
        });
    }

    function writeStore(nextPins, options = {}) {
        setRawStore(normalizePins(nextPins));
        syncLegacyBookmarkPinnedFlags();
        if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
        if (options.persist !== false && typeof saveData === 'function') {
            saveData();
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
        syncLegacyBookmarkPinnedFlags();
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
            scopeType: normalizeBookmarkScopeType(options.scopeType || 'tab')
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

    function getPinLabel(pin) {
        const context = getTargetContext(pin);
        if (!context) return '';
        if (pin.targetType === 'bookmark') {
            const link = getLinkById(pin.targetId);
            return String(link?.title || 'Bookmark').trim() || 'Bookmark';
        }
        if (pin.targetType === 'card') {
            return context.categoryName;
        }
        if (pin.targetType === 'folder') {
            const folder = getFolderApi()?.getFolderById?.(context.workspaceId, context.categoryName, context.folderId);
            return String(folder?.name || 'Folder').trim() || 'Folder';
        }
        return '';
    }

    function getPinMeta(pin) {
        const context = getTargetContext(pin);
        if (!context) return '';
        if (pin.targetType === 'bookmark') {
            const folderLabel = context.folderId
                ? (getFolderApi()?.buildFolderPathLabel?.(context.workspaceId, context.categoryName, context.folderId) || '')
                : 'Root';
            const scopeLabel = pin.scopeType === 'folder'
                ? `Folder scoped`
                : (pin.scopeType === 'card' ? 'Card scoped' : 'Tab scoped');
            return `${context.categoryName} | ${folderLabel} | ${scopeLabel}`;
        }
        if (pin.targetType === 'card') {
            const scopeLabel = normalizeTargetVisibilityScopeType(pin.scopeType) === 'card' ? 'Focused card only' : 'Tab scoped';
            return `${context.categoryName} card | ${scopeLabel}`;
        }
        if (pin.targetType === 'folder') {
            const scopeLabel = normalizeTargetVisibilityScopeType(pin.scopeType) === 'card' ? 'Focused card only' : 'Tab scoped';
            return `${context.categoryName} | Folder | ${scopeLabel}`;
        }
        return '';
    }

    function getPinIcon(pin) {
        if (pin.targetType === 'bookmark') {
            const link = getLinkById(pin.targetId);
            return String(link?.icon || '').trim() || '\u{1F517}';
        }
        if (pin.targetType === 'card') return '\u{1F5C2}';
        if (pin.targetType === 'folder') return '\u{1F4C1}';
        return '\u{1F4CC}';
    }

    function isPinVisibleInContext(pin, context = {}) {
        const resolved = getTargetContext(pin);
        if (!resolved) return false;
        const activeWorkspace = normalizeWorkspaceId(context.activeWorkspace || getConfig().activeWorkspace);
        const rawFocusCategory = toId(context.focusCategory);
        const activeCategory = rawFocusCategory ? normalizeCategoryName(rawFocusCategory) : '';
        if (resolved.workspaceId !== activeWorkspace) return false;
        if (pin.targetType === 'bookmark') {
            if (pin.scopeType === 'tab') return true;
            if (pin.scopeType === 'card') return !activeCategory || activeCategory === resolved.categoryName;
            if (pin.scopeType === 'folder') return !!resolved.folderId && (!activeCategory || activeCategory === resolved.categoryName);
            return true;
        }
        if (pin.targetType === 'card') {
            return normalizeTargetVisibilityScopeType(pin.scopeType) === 'card'
                ? activeCategory === resolved.categoryName
                : true;
        }
        if (pin.targetType === 'folder') {
            return normalizeTargetVisibilityScopeType(pin.scopeType) === 'card'
                ? activeCategory === resolved.categoryName
                : true;
        }
        return true;
    }

    function getActiveDockPins(context = {}) {
        return getPins()
            .filter((pin) => isPinVisibleInContext(pin, context))
            .map((pin) => ({
                ...pin,
                label: getPinLabel(pin),
                meta: getPinMeta(pin),
                icon: getPinIcon(pin)
            }))
            .filter((pin) => pin.label);
    }

    function activateBookmarkPin(pin) {
        const link = getLinkById(pin?.targetId);
        if (!link) return false;
        const clickBehaviorApi = window.EveBookmarkClickBehavior;
        const resolution = clickBehaviorApi?.resolveBehaviorForLink
            ? clickBehaviorApi.resolveBehaviorForLink(link)
            : {
                openLink: !!getConfig().bookmarkClickOpensLink,
                openFocus: true
            };
        if (resolution.openLink) {
            const safeUrl = typeof normalizeUrl === 'function' ? normalizeUrl(String(link.url || '').trim()) : String(link.url || '').trim();
            if (safeUrl) window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
        if (resolution.openFocus && typeof window.openBookmarkFocusModal === 'function') {
            window.openBookmarkFocusModal(link.id);
        }
        return true;
    }

    function activateCardTarget(workspaceId, categoryName, afterRender) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        if (String(getConfig().activeWorkspace || '') !== targetWorkspaceId && typeof switchWorkspace === 'function') {
            switchWorkspace(targetWorkspaceId);
        }
        if (typeof setFocus === 'function') {
            setFocus(targetCategoryName);
        } else if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
        window.setTimeout(function () {
            const cardNode = Array.from(document.querySelectorAll('.category-card[data-card-target-id]')).find((node) => node.getAttribute('data-card-target-id') === buildCardTargetId(targetWorkspaceId, targetCategoryName));
            if (cardNode?.scrollIntoView) {
                cardNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (typeof afterRender === 'function') afterRender();
        }, 80);
        return true;
    }

    function activateFolderPin(pin) {
        const target = parseFolderTargetId(pin?.targetId);
        if (!target.folderId) return false;
        return activateCardTarget(target.workspaceId, target.categoryName, function () {
            const targetId = buildFolderTargetId(target.workspaceId, target.categoryName, target.folderId);
            const folderNode = Array.from(document.querySelectorAll('[data-bookmark-folder-target-id]')).find((node) => node.getAttribute('data-bookmark-folder-target-id') === targetId);
            if (folderNode) {
                if (typeof folderNode.open === 'boolean') folderNode.open = true;
                folderNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    function activateCardPin(pin) {
        const target = parseCardTargetId(pin?.targetId);
        return activateCardTarget(target.workspaceId, target.categoryName);
    }

    function activatePin(pinId) {
        const targetPin = getPins().find((pin) => toId(pin.id) === toId(pinId));
        if (!targetPin) return false;
        if (targetPin.targetType === 'bookmark') return activateBookmarkPin(targetPin);
        if (targetPin.targetType === 'card') return activateCardPin(targetPin);
        if (targetPin.targetType === 'folder') return activateFolderPin(targetPin);
        return false;
    }

    function removePin(pinId, options = {}) {
        const normalizedId = toId(pinId);
        return removePins((pin) => toId(pin.id) === normalizedId, options);
    }

    function movePin(pinId, direction, options = {}) {
        const normalizedId = toId(pinId);
        const pins = getPins();
        if (!normalizedId || !pins.length) return false;

        const step = direction === 'left' || direction === -1 ? -1 : 1;
        const existingIds = new Set(pins.map((pin) => toId(pin.id)).filter(Boolean));
        const requestedSubset = Array.isArray(options.visiblePinIds)
            ? options.visiblePinIds.map(toId).filter((id) => existingIds.has(id))
            : pins.map((pin) => toId(pin.id));
        const subsetIds = Array.from(new Set(requestedSubset));
        const subsetIndex = subsetIds.indexOf(normalizedId);
        if (subsetIndex < 0) return false;

        const targetIndex = subsetIndex + step;
        if (targetIndex < 0 || targetIndex >= subsetIds.length) return false;

        const reorderedSubsetIds = subsetIds.slice();
        [reorderedSubsetIds[subsetIndex], reorderedSubsetIds[targetIndex]] = [reorderedSubsetIds[targetIndex], reorderedSubsetIds[subsetIndex]];

        const subsetIdSet = new Set(reorderedSubsetIds);
        const pinsById = new Map(pins.map((pin) => [toId(pin.id), pin]));
        let replacementIndex = 0;
        const nextPins = pins.map((pin) => {
            const currentId = toId(pin.id);
            if (!subsetIdSet.has(currentId)) return pin;
            const replacementId = reorderedSubsetIds[replacementIndex++];
            return pinsById.get(replacementId) || pin;
        }).map((pin, index) => ({ ...pin, order: index }));

        writeStore(nextPins, options);
        return true;
    }

    function filterPinsForWorkspace(workspaceId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        return getPins().filter((pin) => getTargetContext(pin)?.workspaceId === targetWorkspaceId);
    }

    function filterPinsForCard(workspaceId, categoryName) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        return getPins().filter((pin) => {
            const context = getTargetContext(pin);
            return context?.workspaceId === targetWorkspaceId && context?.categoryName === targetCategoryName;
        });
    }

    function filterPinsForBookmark(linkId) {
        const targetId = toId(linkId);
        return getPins().filter((pin) => pin.targetType === 'bookmark' && toId(pin.targetId) === targetId);
    }

    function filterPinsForFolder(workspaceId, categoryName, folderId) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const targetFolderId = toId(folderId);
        if (!targetFolderId) return [];
        const folderApi = getFolderApi();
        const view = folderApi?.buildFolderView?.(targetWorkspaceId, targetCategoryName, getLinks().filter((link) => (
            normalizeWorkspaceId(link?.workspace) === targetWorkspaceId
            && normalizeCategoryName(link?.category) === targetCategoryName
        )));
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
        return getPins().filter((pin) => {
            const context = getTargetContext(pin);
            if (!context || context.workspaceId !== targetWorkspaceId || context.categoryName !== targetCategoryName) return false;
            if (pin.targetType === 'folder') {
                return subtreeIds.has(context.folderId);
            }
            if (pin.targetType === 'bookmark') {
                return subtreeIds.has(toId(context.folderId));
            }
            return false;
        });
    }

    function replacePinsForWorkspace(workspaceId, incomingPins, options = {}) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const next = getPins().filter((pin) => getTargetContext(pin)?.workspaceId !== targetWorkspaceId).concat(normalizePins(incomingPins));
        writeStore(next, options);
    }

    function replacePinsForCard(workspaceId, categoryName, incomingPins, options = {}) {
        const targetWorkspaceId = normalizeWorkspaceId(workspaceId);
        const targetCategoryName = normalizeCategoryName(categoryName);
        const next = getPins().filter((pin) => {
            const context = getTargetContext(pin);
            return !(context?.workspaceId === targetWorkspaceId && context?.categoryName === targetCategoryName);
        }).concat(normalizePins(incomingPins));
        writeStore(next, options);
    }

    function replacePinsForBookmark(linkId, incomingPins, options = {}) {
        const targetId = toId(linkId);
        const next = getPins().filter((pin) => !(pin.targetType === 'bookmark' && toId(pin.targetId) === targetId)).concat(normalizePins(incomingPins));
        writeStore(next, options);
    }

    function replacePinsForFolder(workspaceId, categoryName, folderId, incomingPins, options = {}) {
        const filteredExisting = getPins().filter((pin) => !filterPinsForFolder(workspaceId, categoryName, folderId).some((existing) => existing.id === pin.id));
        writeStore(filteredExisting.concat(normalizePins(incomingPins)), options);
    }

    Object.assign(ns, {
        buildCardTargetId,
        buildFolderTargetId,
        parseCardTargetId,
        parseFolderTargetId,
        normalizePins,
        migrateLegacyPins,
        getPins,
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
        getActiveDockPins,
        activatePin,
        removePin,
        movePin,
        filterPinsForWorkspace,
        filterPinsForCard,
        filterPinsForFolder,
        filterPinsForBookmark,
        replacePinsForWorkspace,
        replacePinsForCard,
        replacePinsForFolder,
        replacePinsForBookmark,
        getTargetContext,
        getLinkById
    });

    ns.ready = true;
})();
