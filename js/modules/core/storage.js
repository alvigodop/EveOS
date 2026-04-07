// --- STORAGE & INIT ---
const EVE_LINKS_KEY = 'eveV22Data';
const EVE_CONFIG_KEY = 'eveV22Config';
const EVE_BOOKMARK_FOLDERS_KEY = 'eveV22BookmarkFolders';
const EVE_QUICK_PINS_KEY = 'eveV22QuickPins';
const EVE_CONSTELLATION_DETACHED_KEY = 'eveV22ConstellationDetached';

// --- [NEW] SMART COMPRESSION HELPERS ---
const LZ_PREFIX = '_LZ_';

function smartCompress(data) {
    if (typeof LZString === 'undefined' || !data) return typeof data === 'string' ? data : JSON.stringify(data);
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    
    // Only compress if significant size (>1KB) to avoid overhead
    if (json.length < 1024) return json;
    
    try {
        const compressed = LZString.compressToUTF16(json);
        const packed = LZ_PREFIX + compressed;
        
        // Safety check: only use if it actually saved space
        if (packed.length < json.length) {
            const savings = Math.round((1 - packed.length / json.length) * 100);
            console.log(`Storage (Core): Compressed [${savings}% saved] from ${(json.length / 1024).toFixed(1)}KB to ${(packed.length / 1024).toFixed(1)}KB.`);
            return packed;
        }
    } catch (e) {
        console.warn('Storage: Compression failed:', e);
        return json;
    }
    return json;
}

function smartDecompress(str, fallback = null) {
    if (typeof str !== 'string' || !str) return str;
    if (!str.startsWith(LZ_PREFIX)) return str;

    // Hard safety: if compressed but no library, return fallback to prevent JSON.parse crash
    if (typeof LZString === 'undefined') {
        console.warn("Storage: LZString library missing during decompression attempt.");
        return fallback;
    }

    try {
        const raw = str.slice(LZ_PREFIX.length);
        const decompressed = LZString.decompressFromUTF16(raw);
        return decompressed || fallback;
    } catch (e) {
        console.error("Storage: Decompression failed:", e);
        return fallback;
    }
}

function saveData(options = {}) {
    const skipRender = !!options.skipRender;
    const skipSuggestions = !!options.skipSuggestions;
    const sanitizedLinks = Array.isArray(links)
        ? links.map((link) => {
            if (!link || typeof link !== 'object') return link;
            const nextLink = { ...link };
            delete nextLink.pinned;
            return nextLink;
        })
        : [];
    
    const doSave = () => {
        localStorage.setItem(EVE_LINKS_KEY, smartCompress(sanitizedLinks));
        localStorage.setItem(EVE_BOOKMARK_FOLDERS_KEY, smartCompress(
            (typeof bookmarkFolders !== 'undefined' && bookmarkFolders && typeof bookmarkFolders === 'object')
                ? bookmarkFolders
                : {}
        ));
        localStorage.setItem(EVE_QUICK_PINS_KEY, smartCompress(
            (typeof quickPins !== 'undefined' && Array.isArray(quickPins))
                ? quickPins
                : []
        ));
        localStorage.setItem(EVE_CONSTELLATION_DETACHED_KEY, smartCompress(
            (window.constellationDetachedChains && typeof window.constellationDetachedChains === 'object')
                ? window.constellationDetachedChains
                : {}
        ));
    };

    try {
        doSave();
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
            console.warn("Core Storage: Quota exceeded during saveData. Attempting emergency prune...");
            if (window.CCMaintenance && typeof CCMaintenance.emergencyPrune === 'function') {
                CCMaintenance.emergencyPrune(0.5);
                try {
                    doSave();
                    console.log("Core Storage: Save successful after prune.");
                } catch (retryError) {
                    console.error("Core Storage: Final save failure after prune:", retryError);
                }
            }
        } else {
            console.error("Core Storage: Unexpected error during saveData:", e);
        }
    }

    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'saveData' } }));
    if (!skipRender && typeof renderDashboard === 'function') renderDashboard();
    if (!skipSuggestions && typeof updateSuggestions === 'function') updateSuggestions();
}

function saveConfig() {
    try {
        localStorage.setItem(EVE_CONFIG_KEY, smartCompress(config));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
            if (window.CCMaintenance && typeof CCMaintenance.emergencyPrune === 'function') {
                CCMaintenance.emergencyPrune(0.3);
                try {
                    localStorage.setItem(EVE_CONFIG_KEY, JSON.stringify(config));
                } catch (retryError) { }
            }
        }
    }
    window.dispatchEvent(new CustomEvent('eve:state-mutated', { detail: { source: 'saveConfig' } }));
}

// Add save functions to global state object
if (window.eveState) {
    window.eveState.saveData = saveData;
    window.eveState.saveConfig = saveConfig;
}

function loadData() {
    const rawLinks = localStorage.getItem(EVE_LINKS_KEY);
    const storedLinks = smartDecompress(rawLinks, '[]');
    if (storedLinks) { 
        try { 
            links = JSON.parse(storedLinks); 
            if (!Array.isArray(links)) links = [];
        } catch (e) { 
            links = []; 
        } 
    }

    const rawBookmarkFolders = localStorage.getItem(EVE_BOOKMARK_FOLDERS_KEY);
    const storedBookmarkFolders = smartDecompress(rawBookmarkFolders, '{}');
    if (storedBookmarkFolders) {
        try {
            const parsed = JSON.parse(storedBookmarkFolders);
            bookmarkFolders = (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            bookmarkFolders = {};
        }
    } else {
        bookmarkFolders = {};
    }

    const rawQuickPins = localStorage.getItem(EVE_QUICK_PINS_KEY);
    const storedQuickPins = smartDecompress(rawQuickPins, '[]');
    if (storedQuickPins) {
        try {
            const parsedQuickPins = JSON.parse(storedQuickPins);
            quickPins = Array.isArray(parsedQuickPins) ? parsedQuickPins : [];
        } catch (e) {
            quickPins = [];
        }
    } else {
        quickPins = [];
    }

    const rawDetached = localStorage.getItem(EVE_CONSTELLATION_DETACHED_KEY);
    const storedDetached = smartDecompress(rawDetached, '{}');
    if (storedDetached) {
        try {
            const parsedDetached = JSON.parse(storedDetached);
            window.constellationDetachedChains = (parsedDetached && typeof parsedDetached === 'object') ? parsedDetached : {};
        } catch (e) {
            window.constellationDetachedChains = {};
        }
    } else {
        window.constellationDetachedChains = {};
    }
    if (window.eveState) {
        window.eveState.constellationDetachedChains = window.constellationDetachedChains;
    }

    const rawConfig = localStorage.getItem(EVE_CONFIG_KEY);
    const storedConfig = smartDecompress(rawConfig, '{}');
    if (storedConfig) { 
        try { 
            const parsedConfig = JSON.parse(storedConfig);
            config = { ...config, ...(parsedConfig && typeof parsedConfig === 'object' ? parsedConfig : {}) }; 
        } catch (e) { } 
    }
    
    if (!['grid', 'list', 'unidex'].includes(config.viewMode)) config.viewMode = 'grid';
    if (window.EveLibrary?.Ratings?.ensureConfigDefaults) {
        window.EveLibrary.Ratings.ensureConfigDefaults(config);
    }
    if (!config.workspaces || config.workspaces.length === 0) config.workspaces = [{ id: 'main', name: 'Main', icon: '🏠' }];
    if (!config.activeWorkspace) config.activeWorkspace = 'main';

    // Apply settings
    if (typeof applySettings === 'function') applySettings();

    // Load notes
    const rawNotes = localStorage.getItem('eveV22Notes');
    const notes = smartDecompress(rawNotes);
    const notesArea = document.getElementById('notes-area');
    if (notesArea) notesArea.value = notes || "";

    // Default links if empty
    if (links.length === 0) links = [{ id: 1, title: "Welcome", url: "#", category: "Start", done: false, workspace: 'main', icon: '👋' }];

    if (window.EveQuickPins?.migrateLegacyPins) {
        window.EveQuickPins.migrateLegacyPins();
    }

    // Render
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof updateSuggestions === 'function') updateSuggestions();
    if (typeof updateTimeAndGreeting === 'function') {
        updateTimeAndGreeting();
        setInterval(updateTimeAndGreeting, 1000);
    }
}



async function clearAllData() {
    if (await showConfirm("WIPE ALL?")) {
        localStorage.clear();
        location.reload();
    }
}
