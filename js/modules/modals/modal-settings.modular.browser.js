// --- SETTINGS MODULAR BROWSER HELPERS ---

function _extractBookmarkPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.bookmark && typeof payload.bookmark === 'object') return payload.bookmark;
    return payload;
}

function _sanitizeBrowserFilenameSegment(value, fallback) {
    const cleaned = String(value || '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .trim();
    return cleaned || fallback;
}

function _cleanBrowserNameSegment(value, fallback, maxLength) {
    let text = String(value || '').replace(/\s+/g, ' ').trim();
    text = _sanitizeBrowserFilenameSegment(text, fallback);
    if (text.length > maxLength) {
        text = text.slice(0, maxLength).replace(/[ .\-_]+$/g, '');
    }
    return text || fallback;
}

function _buildBrowserBookmarkFilename(bookmark, categoryName = '') {
    const safeBookmark = bookmark || {};
    const linkPart = _cleanBrowserNameSegment(safeBookmark.id || 'bookmark', 'bookmark', 40);
    const cardPart = _cleanBrowserNameSegment(categoryName || 'uncategorized', 'uncategorized', 60);
    const titlePart = _cleanBrowserNameSegment(safeBookmark.title || 'untitled', 'untitled', 80);
    return _sanitizeBrowserFilenameSegment(`${linkPart}--${cardPart}--${titlePart}.json`, `${linkPart}.json`);
}

function _shortHashText(input) {
    const text = String(input || '');
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).slice(0, 8) || 'copy';
}

async function _readJsonFromFileHandle(fileHandle) {
    const file = await fileHandle.getFile();
    const text = await file.text();
    return { text, json: JSON.parse(text) };
}

async function _fileHandleExists(directoryHandle, fileName) {
    try {
        await directoryHandle.getFileHandle(fileName);
        return true;
    } catch {
        return false;
    }
}

async function _readBookmarkIdFromHandle(fileHandle) {
    try {
        const { json } = await _readJsonFromFileHandle(fileHandle);
        const bookmark = _extractBookmarkPayload(json);
        return String(bookmark?.id || '').trim();
    } catch {
        return '';
    }
}

function _buildLiveBookmarkMap() {
    const map = new Map();
    const liveLinks = Array.isArray(window.eveState?.links)
        ? window.eveState.links
        : (Array.isArray(window.links) ? window.links : []);
    liveLinks.forEach((link) => {
        const id = String(link?.id || '').trim();
        if (!id) return;
        map.set(id, { ...link });
    });
    return map;
}

function _applyLiveBookmarkToPayload(json, fallbackBookmark, liveBookmark, bookmarkId) {
    if (!liveBookmark || typeof liveBookmark !== 'object') {
        return {
            nextJson: json,
            effectiveBookmark: fallbackBookmark,
            contentChanged: false
        };
    }

    const mergedBookmark = {
        ...(fallbackBookmark || {}),
        ...liveBookmark,
        id: bookmarkId
    };

    if (json && typeof json === 'object' && json.bookmark && typeof json.bookmark === 'object') {
        const currentText = JSON.stringify(json.bookmark || {});
        const nextText = JSON.stringify(mergedBookmark);
        if (currentText === nextText) {
            return { nextJson: json, effectiveBookmark: mergedBookmark, contentChanged: false };
        }
        return {
            nextJson: { ...json, bookmark: mergedBookmark },
            effectiveBookmark: mergedBookmark,
            contentChanged: true
        };
    }

    const currentText = JSON.stringify(json || {});
    const nextText = JSON.stringify(mergedBookmark);
    return {
        nextJson: mergedBookmark,
        effectiveBookmark: mergedBookmark,
        contentChanged: currentText !== nextText
    };
}

async function _pickUniqueBookmarkName(directoryHandle, desiredName, currentName, bookmarkId) {
    if (desiredName === currentName) return desiredName;

    const exists = await _fileHandleExists(directoryHandle, desiredName);
    if (!exists) return desiredName;

    const existingHandle = await directoryHandle.getFileHandle(desiredName);
    const existingBookmarkId = await _readBookmarkIdFromHandle(existingHandle);
    if (existingBookmarkId && bookmarkId && existingBookmarkId === bookmarkId) {
        return desiredName;
    }

    const stem = desiredName.endsWith('.json') ? desiredName.slice(0, -5) : desiredName;
    const baseHash = _shortHashText(`${currentName}:${bookmarkId}:${Date.now()}`);
    let index = 0;
    while (index < 500) {
        const suffix = index === 0 ? baseHash : `${baseHash}-${index}`;
        const candidate = `${stem}--${suffix}.json`;
        if (!(await _fileHandleExists(directoryHandle, candidate))) {
            return candidate;
        }
        index += 1;
    }
    throw new Error(`Could not find unique filename for ${desiredName}`);
}

async function _normalizeBookmarkFilesInDirectory(directoryHandle, stats, options = {}) {
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
            await _normalizeBookmarkFilesInDirectory(entryHandle, stats, options);
            continue;
        }

        const lowerName = String(entryName || '').toLowerCase();
        if (!lowerName.endsWith('.json')) {
            continue;
        }
        if (blockedFileNames.has(lowerName) || lowerName.startsWith('_')) {
            continue;
        }

        stats.scanned += 1;
        try {
            const { json } = await _readJsonFromFileHandle(entryHandle);
            const bookmark = _extractBookmarkPayload(json);
            const bookmarkId = String(bookmark?.id || '').trim();
            if (!bookmarkId) {
                stats.skipped += 1;
                continue;
            }

            const liveBookmark = liveBookmarkMap.get(bookmarkId) || null;
            const payloadUpdate = _applyLiveBookmarkToPayload(json, bookmark, liveBookmark, bookmarkId);
            const effectiveBookmark = payloadUpdate.effectiveBookmark || bookmark;
            const categoryName = String(effectiveBookmark?.category || 'uncategorized').trim() || 'uncategorized';
            let targetName = _buildBrowserBookmarkFilename(effectiveBookmark, categoryName);
            const contentChanged = !!payloadUpdate.contentChanged;
            const outputText = contentChanged
                ? JSON.stringify(payloadUpdate.nextJson, null, 2)
                : JSON.stringify(json, null, 2);

            targetName = await _pickUniqueBookmarkName(directoryHandle, targetName, entryName, bookmarkId);
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

            const maybeTargetHandle = await _fileHandleExists(directoryHandle, targetName)
                ? await directoryHandle.getFileHandle(targetName)
                : null;
            if (maybeTargetHandle) {
                const targetBookmarkId = await _readBookmarkIdFromHandle(maybeTargetHandle);
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
            if (contentChanged) {
                stats.contentUpdated += 1;
            }
        } catch (error) {
            stats.errors += 1;
            console.warn('[Settings] Browser bookmark filename normalize failed for', entryName, error);
        }
    }
}

async function normalizeBookmarkTitlesBrowserOnly() {
    if (typeof window.showDirectoryPicker !== 'function') {
        return showToast('Browser folder normalization needs Chrome/Edge Directory Picker support', 'error');
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
        const liveBookmarkMap = _buildLiveBookmarkMap();

        await _normalizeBookmarkFilesInDirectory(directoryHandle, stats, { liveBookmarkMap });
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
