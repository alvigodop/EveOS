window.EveQuickPins = window.EveQuickPins || {};

(function () {
    const ns = window.EveQuickPins;
    const core = ns._core = ns._core || {};
    const {
        TARGET_TYPES,
        normalizeBookmarkScopeType,
        normalizeTargetVisibilityScopeType,
        buildCardTargetId,
        buildFolderTargetId,
        parseCardTargetId,
        parseFolderTargetId,
        toId,
        getLinks,
        getStore,
        setRawStore
    } = core;
    const PERSIST_IDLE_TIMEOUT_MS = 1200;
    const PERSIST_FALLBACK_DELAY_MS = 180;
    let persistFlushHandle = null;
    let persistFlushScheduled = false;

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

            saveData({
                skipRender: true,
                skipSuggestions: true,
                source: 'quick-pins-flush',
                meta: { nonIndexing: true, quickPins: true }
            });

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



    

    Object.assign(core, {
        buildPinRecord,
        normalizePins,
        clearLegacyBookmarkPinnedFlags,
        flushPinPersistence,
        writeStore,
        migrateLegacyPins,
        getPins
    });
})();
