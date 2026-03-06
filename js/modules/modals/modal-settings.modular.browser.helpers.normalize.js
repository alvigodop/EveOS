// --- SETTINGS MODULAR BROWSER NORMALIZE HELPERS ---
window.EveSettingsModularBrowserHelpers = window.EveSettingsModularBrowserHelpers || {};

(function () {
    const helpers = window.EveSettingsModularBrowserHelpers;

    async function normalizeBookmarkFilesInDirectory(directoryHandle, stats, options = {}) {
        const liveBookmarkMap = options.liveBookmarkMap instanceof Map ? options.liveBookmarkMap : new Map();
        const blockedFileNames = new Set([
            'store.json',
            'config.json',
            'tab.json',
            'card.json',
            '_library-unlinked.json'
        ]);

        for await (const [entryName, entryHandle] of directoryHandle.entries()) {
            if (entryHandle.kind === 'directory') {
                await normalizeBookmarkFilesInDirectory(entryHandle, stats, options);
                continue;
            }

            const lowerName = String(entryName || '').toLowerCase();
            if (!lowerName.endsWith('.json')) continue;
            if (blockedFileNames.has(lowerName) || lowerName.startsWith('_')) continue;

            stats.scanned += 1;
            try {
                const { json } = await helpers.readJsonFromFileHandle(entryHandle);
                const bookmark = helpers.extractBookmarkPayload(json);
                const bookmarkId = String(bookmark?.id || '').trim();
                if (!bookmarkId) {
                    stats.skipped += 1;
                    continue;
                }

                const liveBookmark = liveBookmarkMap.get(bookmarkId) || null;
                const payloadUpdate = helpers.applyLiveBookmarkToPayload(json, bookmark, liveBookmark, bookmarkId);
                const effectiveBookmark = payloadUpdate.effectiveBookmark || bookmark;
                const categoryName = String(effectiveBookmark?.category || 'uncategorized').trim() || 'uncategorized';
                let targetName = helpers.buildBrowserBookmarkFilename(effectiveBookmark, categoryName);
                const contentChanged = !!payloadUpdate.contentChanged;
                const outputText = contentChanged
                    ? JSON.stringify(payloadUpdate.nextJson, null, 2)
                    : JSON.stringify(json, null, 2);

                targetName = await helpers.pickUniqueBookmarkName(directoryHandle, targetName, entryName, bookmarkId);
                if (targetName === entryName && !contentChanged) {
                    stats.unchanged += 1;
                    continue;
                }

                if (targetName === entryName && contentChanged) {
                    const writableCurrent = await entryHandle.createWritable();
                    await writableCurrent.write(outputText);
                    await writableCurrent.close();
                    stats.contentUpdated += 1;
                    continue;
                }

                const maybeTargetHandle = await helpers.fileHandleExists(directoryHandle, targetName)
                    ? await directoryHandle.getFileHandle(targetName)
                    : null;
                if (maybeTargetHandle) {
                    const targetBookmarkId = await helpers.readBookmarkIdFromHandle(maybeTargetHandle);
                    if (targetBookmarkId && targetBookmarkId === bookmarkId) {
                        await directoryHandle.removeEntry(entryName);
                        stats.removed += 1;
                        continue;
                    }
                }

                const newHandle = await directoryHandle.getFileHandle(targetName, { create: true });
                const writable = await newHandle.createWritable();
                await writable.write(outputText);
                await writable.close();
                await directoryHandle.removeEntry(entryName);
                stats.renamed += 1;
                if (contentChanged) stats.contentUpdated += 1;
            } catch (error) {
                stats.errors += 1;
                console.warn('[Settings] Browser bookmark filename normalize failed for', entryName, error);
            }
        }
    }

    helpers.normalizeBookmarkFilesInDirectory = normalizeBookmarkFilesInDirectory;
})();

window.__modalSettingsBrowserHelperNormalizeReady = true;
