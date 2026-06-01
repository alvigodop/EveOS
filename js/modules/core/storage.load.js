function finishCoreDataLoad(ok) {
    window.__eveCoreDataLoaded = !!ok;
    window.__eveCoreDataLoading = false;
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('eve:core-data-loaded', {
            detail: {
                ok: !!ok,
                links: Array.isArray(links) ? links.length : 0
            }
        }));
    }
    return !!ok;
}

window.__eveWaitForCoreData = function waitForCoreData(timeoutMs = 15000) {
    if (window.__eveCoreDataLoaded) return Promise.resolve(true);
    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            window.removeEventListener?.('eve:core-data-loaded', onLoaded);
            resolve(!!value);
        };
        const onLoaded = (event) => finish(event?.detail?.ok || window.__eveCoreDataLoaded);
        timer = setTimeout(() => finish(false), Math.max(500, Number(timeoutMs) || 15000));
        window.addEventListener('eve:core-data-loaded', onLoaded, { once: true });
    });
};

async function loadData() {
    if (window.__eveCoreDataLoading) {
        return window.__eveWaitForCoreData(120000);
    }
    window.__eveCoreDataLoading = true;
    try {
    const storage = getCoreStorage();
    const loadedLinks = storage
        ? await storage.loadJson(EVE_LINKS_KEY, [], { legacyKeys: [EVE_LINKS_KEY], preferNonEmptyLegacy: true })
        : [];
    if (Array.isArray(loadedLinks)) {
        links = loadedLinks;
    }
    window.__eveLastCoreDataLoadSummary = {
        startedAt: Date.now(),
        linkCount: Array.isArray(links) ? links.length : 0,
        realLinkCount: Array.isArray(links)
            ? links.filter((link) => link && !(String(link?.title || '') === 'Welcome' && String(link?.url || '') === '#')).length
            : 0
    };

    const loadedBookmarkFolders = storage
        ? await storage.loadJson(EVE_BOOKMARK_FOLDERS_KEY, {}, { legacyKeys: [EVE_BOOKMARK_FOLDERS_KEY], preferNonEmptyLegacy: true })
        : {};
    bookmarkFolders = (loadedBookmarkFolders && typeof loadedBookmarkFolders === 'object') ? loadedBookmarkFolders : {};

    const loadedQuickPins = storage
        ? await storage.loadJson(EVE_QUICK_PINS_KEY, [], { legacyKeys: [EVE_QUICK_PINS_KEY], preferNonEmptyLegacy: true })
        : [];
    quickPins = Array.isArray(loadedQuickPins) ? loadedQuickPins : [];

    const loadedDetached = storage
        ? await storage.loadJson(EVE_CONSTELLATION_DETACHED_KEY, {}, { legacyKeys: [EVE_CONSTELLATION_DETACHED_KEY] })
        : {};
    window.constellationDetachedChains = (loadedDetached && typeof loadedDetached === 'object') ? loadedDetached : {};
    if (window.eveState) {
        window.eveState.constellationDetachedChains = window.constellationDetachedChains;
    }

    const loadedConfig = storage
        ? await storage.loadJson(EVE_CONFIG_KEY, {}, {
            legacyKeys: [EVE_CONFIG_KEY],
            mirrorLocalKey: EVE_THEME_BOOT_KEY,
            mirrorValue: storage.getThemeBootConfig(config),
            preferNonEmptyLegacy: true
        })
        : {};
    if (loadedConfig && typeof loadedConfig === 'object') {
        config = { ...config, ...loadedConfig };

        // --- Migration: ensure recursive subTabs on all workspaces ---
        const wsHelpers = window.EveWorkspaceHelpers;
        if (wsHelpers && Array.isArray(config.workspaces) && wsHelpers.needsMigration(config.workspaces)) {
            config.workspaces = wsHelpers.sanitize(config.workspaces);
            console.log('[Storage] Migrated workspaces to recursive sub-tab format.');
        }
    }
    if (storage) {
        storage.syncThemeBootConfig(config);
    }

    if (!['grid', 'list', 'unidex'].includes(config.viewMode)) config.viewMode = 'grid';
    // Apply startup view preference (overrides last-used viewMode on every load).
    const startupView = String(config.startupViewMode || '').toLowerCase();
    if (['grid', 'list', 'unidex'].includes(startupView)) {
        config.viewMode = startupView;
    }
    if (typeof config.reducedMotion === 'boolean' && config.reducedMotion && typeof document !== 'undefined' && document.body) {
        document.body.classList.add('reduced-motion');
    }
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    if (!config.workspaces || config.workspaces.length === 0) config.workspaces = [{ id: 'main', name: 'Main', icon: '\u{1F3E0}', subTabs: [] }];
    if (!config.activeWorkspace) config.activeWorkspace = 'main';
    if (!Array.isArray(config.collapsedTabs)) {
        config.collapsedTabs = Array.isArray(config.collapsed) ? config.collapsed.slice() : [];
    }
    if (!Array.isArray(config.sidebarGroups)) config.sidebarGroups = [];
    config.sidebarOrderMode = String(config.sidebarOrderMode || '').trim().toLowerCase() === 'manual'
        ? 'manual'
        : 'auto';
    if (Array.isArray(config.sidebarManualOrder)) {
        config.sidebarManualOrder = { root: config.sidebarManualOrder.slice(), parents: {} };
    } else if (!config.sidebarManualOrder || typeof config.sidebarManualOrder !== 'object') {
        config.sidebarManualOrder = { root: [], parents: {} };
    } else {
        if (!Array.isArray(config.sidebarManualOrder.root)) config.sidebarManualOrder.root = [];
        if (!config.sidebarManualOrder.parents || typeof config.sidebarManualOrder.parents !== 'object') {
            config.sidebarManualOrder.parents = {};
        }
    }
    config.sidebarFocusedGroupId = String(config.sidebarFocusedGroupId || '').trim();
    if (typeof config.showHiddenSidebarGroups !== 'boolean') config.showHiddenSidebarGroups = false;
    if (typeof config.showInactiveTabs !== 'boolean') config.showInactiveTabs = false;
    if (typeof config.sidebarExpanded !== 'boolean') config.sidebarExpanded = false;
    if (!['tabs', 'cards', 'entries'].includes(String(config.unidexStage || '').trim())) {
        config.unidexStage = 'tabs';
    }
    if (typeof config.unidexStagePersisted !== 'boolean') config.unidexStagePersisted = false;
    config.unidexSelectedWorkspaceId = String(config.unidexSelectedWorkspaceId || '').trim();
    config.unidexSelectedCategory = String(config.unidexSelectedCategory || '').trim();
    if (window.EveSmartViewRegistry?.ensureStore) {
        window.EveSmartViewRegistry.ensureStore(config);
    } else {
        if (!config.smartViews || typeof config.smartViews !== 'object') config.smartViews = { version: 1, cardViews: {} };
        if (!config.smartViews.cardViews || typeof config.smartViews.cardViews !== 'object') config.smartViews.cardViews = {};
    }

    // Custom bookmark ordering defaults
    if (!config.customOrder || typeof config.customOrder !== 'object') config.customOrder = {};
    if (!Array.isArray(config.customOrderEnabled)) config.customOrderEnabled = [];
    if (!config.customOrderSort || typeof config.customOrderSort !== 'object') config.customOrderSort = {};

    // True value approximation defaults
    if (!Array.isArray(config.trueValueEnabled)) config.trueValueEnabled = [];
    if (!config.trueValueSettings || typeof config.trueValueSettings !== 'object') config.trueValueSettings = {};

    // Apply settings
    if (typeof applySettings === 'function') applySettings();

    // Optional: nudge the user if a full backup is overdue.
    try {
        const reminderDays = Math.max(0, Math.min(365, Number(config.backupReminderDays) || 0));
        if (reminderDays > 0) {
            const lastIso = String(config.lastBackupAt || '').trim();
            const lastMs = lastIso ? Date.parse(lastIso) : 0;
            const cutoff = Date.now() - reminderDays * 24 * 60 * 60 * 1000;
            if (!Number.isFinite(lastMs) || !lastMs || lastMs < cutoff) {
                setTimeout(() => {
                    if (typeof showToast === 'function') {
                        const sinceLine = lastMs ? `Last backup: ${new Date(lastMs).toLocaleDateString()}` : 'No backup recorded yet';
                        showToast(`Backup overdue (>${reminderDays} day${reminderDays === 1 ? '' : 's'}). ${sinceLine}.`, 'warning');
                    }
                }, 3000);
            }
        }
    } catch (error) {
        console.warn('[Storage] Backup reminder check failed', error);
    }

    // Load notes
    const notes = storage
        ? await storage.loadText(EVE_NOTES_KEY, '', { localFallbackKey: EVE_NOTES_KEY })
        : '';
    const notesArea = document.getElementById('notes-area');
    if (notesArea) notesArea.value = notes || '';

    // Default links if empty
    if (links.length === 0) {
        links = [{ id: 1, title: 'Welcome', url: '#', category: 'Start', done: false, workspace: 'main', icon: '\u{1F44B}' }];
    }
    window.__eveLastCoreDataLoadSummary = {
        ...(window.__eveLastCoreDataLoadSummary || {}),
        completedAt: Date.now(),
        linkCount: Array.isArray(links) ? links.length : 0,
        realLinkCount: Array.isArray(links)
            ? links.filter((link) => link && !(String(link?.title || '') === 'Welcome' && String(link?.url || '') === '#')).length
            : 0
    };

    if (window.EveQuickPins?.migrateLegacyPins) {
        window.EveQuickPins.migrateLegacyPins();
    }
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('eve:quick-pins-updated', {
            detail: {
                source: 'storage-load',
                count: Array.isArray(quickPins) ? quickPins.length : 0
            }
        }));
    }

    markCoreStateClean();
    markConfigClean(config);

    // Render — defer heavy dashboard to let browser breathe after 800+ script evaluations
    // Use setTimeout(0) to push to back of macrotask queue (rAF still competes with paint)
    if (typeof renderSidebar === 'function') renderSidebar();

    const startupRenderDone = new Promise((resolve) => {
        setTimeout(function () {
            try {
                const grid = document.getElementById('dashboard-grid');
                if (window.__eveUserInteractedBeforeStartupRender && grid && grid.children.length > 0) {
                    window._eveStartupBookmarkPaintActive = false;
                    return;
                }
                window._eveStartupBookmarkPaintActive = true;
                window.__eveDashboardRenderHint = {
                    kind: 'startup',
                    source: 'storage-load',
                    linkCount: Array.isArray(links) ? links.length : 0,
                    startedAt: Date.now()
                };
                if (typeof renderDashboard === 'function') renderDashboard();
        // Defer suggestions even further — they're not visible initially
        setTimeout(function () {
            if (typeof updateSuggestions === 'function') updateSuggestions();
            // Warm up favicon cache in background after initial render
            if (window.EveFaviconCache && typeof window.EveFaviconCache.warmup === 'function') {
                window.EveFaviconCache.warmup({
                    reason: 'startup',
                    delayMs: 5200,
                    maxUncached: 120
                });
            }
        }, 100);
        setTimeout(function () {
            window._eveStartupBookmarkPaintActive = false;
        }, 9000);
            } catch (error) {
                console.warn('[Storage] Startup dashboard render failed', error);
            } finally {
                finishCoreDataLoad(true);
                resolve(true);
            }
        }, 0);
    });

    if (typeof updateTimeAndGreeting === 'function') {
        updateTimeAndGreeting();
        setInterval(updateTimeAndGreeting, 1000);
    }

    return startupRenderDone;
    } catch (error) {
        finishCoreDataLoad(false);
        throw error;
    }
}

async function clearAllData() {
    if (await showConfirm('WIPE ALL?')) {
        try {
            localStorage.clear();
        } catch (error) {
            console.warn('Core Storage: Failed to clear localStorage during wipe', error);
        }
        const storage = getCoreStorage();
        if (storage) {
            await storage.clearAll();
        } else if (window.IDBStore && typeof window.IDBStore.clear === 'function') {
            await window.IDBStore.clear();
        }
        location.reload();
    }
}
