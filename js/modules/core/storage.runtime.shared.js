// --- STORAGE RUNTIME SHARED ---
(function () {
    const runtime = window.EveStorageRuntime = window.EveStorageRuntime || {};
    if (runtime.sharedReady) return;

    const constants = {
        EVE_LINKS_KEY: 'eveV22Data',
        EVE_CONFIG_KEY: 'eveV22Config',
        EVE_BOOKMARK_FOLDERS_KEY: 'eveV22BookmarkFolders',
        EVE_QUICK_PINS_KEY: 'eveV22QuickPins',
        EVE_CONSTELLATION_DETACHED_KEY: 'eveV22ConstellationDetached',
        EVE_NOTES_KEY: 'eveV22Notes',
        EVE_THEME_BOOT_KEY: 'eveV22ThemeBoot',
        EVE_CORE_IDB_PREFIX: 'core_',
        LZ_PREFIX: '_LZ_'
    };

    function smartCompress(data) {
        if (typeof LZString === 'undefined' || !data) return typeof data === 'string' ? data : JSON.stringify(data);
        const json = typeof data === 'string' ? data : JSON.stringify(data);

        if (json.length < 1024) return json;

        try {
            const compressed = LZString.compressToUTF16(json);
            const packed = constants.LZ_PREFIX + compressed;

            if (packed.length < json.length) {
                const savings = Math.round((1 - packed.length / json.length) * 100);
                console.log(`Storage (Core): Compressed [${savings}% saved] from ${(json.length / 1024).toFixed(1)}KB to ${(packed.length / 1024).toFixed(1)}KB.`);
                return packed;
            }
        } catch (error) {
            console.warn('Storage: Compression failed:', error);
            return json;
        }
        return json;
    }

    function smartDecompress(str, fallback = null) {
        if (typeof str !== 'string' || !str) return str;
        if (!str.startsWith(constants.LZ_PREFIX)) return str;

        if (typeof LZString === 'undefined') {
            console.warn('Storage: LZString library missing during decompression attempt.');
            return fallback;
        }

        try {
            const raw = str.slice(constants.LZ_PREFIX.length);
            const decompressed = LZString.decompressFromUTF16(raw);
            return decompressed || fallback;
        } catch (error) {
            console.error('Storage: Decompression failed:', error);
            return fallback;
        }
    }

    function cloneStoredValue(value) {
        if (value == null) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    Object.assign(runtime, constants, {
        smartCompress,
        smartDecompress,
        cloneStoredValue,
        sharedReady: true
    });
})();
