// --- SETTINGS MODULAR BROWSER ACTIONS ---

async function normalizeBookmarkTitlesBrowserOnly() {
    const helpers = window.EveSettingsModularBrowserHelpers || {};
    const buildLiveBookmarkMap = helpers.buildLiveBookmarkMap;
    const normalizeBookmarkFilesInDirectory = helpers.normalizeBookmarkFilesInDirectory;

    if (typeof window.showDirectoryPicker !== 'function') {
        return showToast('Browser folder normalization needs Chrome/Edge Directory Picker support', 'error');
    }
    if (typeof buildLiveBookmarkMap !== 'function' || typeof normalizeBookmarkFilesInDirectory !== 'function') {
        return showToast('Browser normalization helpers are unavailable right now', 'error');
    }
    try {
        const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        if (!directoryHandle || typeof directoryHandle.removeEntry !== 'function') {
            return showToast('Selected folder is not writable in this browser', 'error');
        }

        const stats = {
            scanned: 0,
            renamed: 0,
            removed: 0,
            contentUpdated: 0,
            unchanged: 0,
            skipped: 0,
            errors: 0
        };
        const liveBookmarkMap = buildLiveBookmarkMap();

        await normalizeBookmarkFilesInDirectory(directoryHandle, stats, { liveBookmarkMap });
        if (stats.scanned === 0) {
            return showToast('No bookmark JSON files found in selected folder', 'info');
        }

        const summary = `Normalized bookmarks: ${stats.renamed} renamed, ${stats.contentUpdated} content synced, ${stats.removed} duplicates removed, ${stats.unchanged} unchanged`;
        if (stats.errors > 0) {
            showToast(`${summary} (${stats.errors} errors)`, 'warning');
        } else {
            showToast(summary, 'success');
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            return showToast('Folder normalization canceled', 'info');
        }
        showToast(`Folder normalization failed: ${error.message || error}`, 'error');
    }
}
