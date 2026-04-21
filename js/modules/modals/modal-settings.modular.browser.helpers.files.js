// --- SETTINGS MODULAR BROWSER FILE HELPERS ---
window.EveSettingsModularBrowserHelpers = window.EveSettingsModularBrowserHelpers || {};

(function () {
    const helpers = window.EveSettingsModularBrowserHelpers;

    function extractBookmarkPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.bookmark && typeof payload.bookmark === 'object') return payload.bookmark;
        return payload;
    }

    function sanitizeBrowserFilenameSegment(value, fallback) {
        const cleaned = String(value || '')
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .trim();
        return cleaned || fallback;
    }

    function cleanBrowserNameSegment(value, fallback, maxLength) {
        let text = String(value || '').replace(/\s+/g, ' ').trim();
        text = sanitizeBrowserFilenameSegment(text, fallback);
        if (text.length > maxLength) {
            text = text.slice(0, maxLength).replace(/[ .\-_]+$/g, '');
        }
        return text || fallback;
    }

    function buildBrowserBookmarkFilename(bookmark, categoryName = '') {
        const safeBookmark = bookmark || {};
        const linkPart = cleanBrowserNameSegment(safeBookmark.id || 'bookmark', 'bookmark', 40);
        const cardPart = cleanBrowserNameSegment(categoryName || 'uncategorized', 'uncategorized', 60);
        const titlePart = cleanBrowserNameSegment(safeBookmark.title || 'untitled', 'untitled', 80);
        return sanitizeBrowserFilenameSegment(`${linkPart}--${cardPart}--${titlePart}.json`, `${linkPart}.json`);
    }

    function shortHashText(input) {
        const text = String(input || '');
        let hash = 5381;
        for (let i = 0; i < text.length; i += 1) {
            hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
        }
        return (hash >>> 0).toString(16).slice(0, 8) || 'copy';
    }

    async function readJsonFromFileHandle(fileHandle) {
        const file = await fileHandle.getFile();
        const text = await file.text();
        return { text, json: JSON.parse(text) };
    }

    async function fileHandleExists(directoryHandle, fileName) {
        try {
            await directoryHandle.getFileHandle(fileName);
            return true;
        } catch {
            return false;
        }
    }

    async function readBookmarkIdFromHandle(fileHandle) {
        try {
            const { json } = await readJsonFromFileHandle(fileHandle);
            const bookmark = extractBookmarkPayload(json);
            return String(bookmark?.id || '').trim();
        } catch {
            return '';
        }
    }

    function getSettingsBrowserLiveLinks() {
        if (typeof window.getLiveLinks === 'function') return window.getLiveLinks();
        if (Array.isArray(window.eveState?.links)) return window.eveState.links;
        if (Array.isArray(window.links)) return window.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function buildLiveBookmarkMap() {
        const map = new Map();
        const liveLinks = getSettingsBrowserLiveLinks();
        liveLinks.forEach((link) => {
            const id = String(link?.id || '').trim();
            if (!id) return;
            map.set(id, { ...link });
        });
        return map;
    }

    function applyLiveBookmarkToPayload(json, fallbackBookmark, liveBookmark, bookmarkId) {
        if (!liveBookmark || typeof liveBookmark !== 'object') {
            return { nextJson: json, effectiveBookmark: fallbackBookmark, contentChanged: false };
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

    async function pickUniqueBookmarkName(directoryHandle, desiredName, currentName, bookmarkId) {
        if (desiredName === currentName) return desiredName;
        if (!(await fileHandleExists(directoryHandle, desiredName))) return desiredName;

        const existingHandle = await directoryHandle.getFileHandle(desiredName);
        const existingBookmarkId = await readBookmarkIdFromHandle(existingHandle);
        if (existingBookmarkId && bookmarkId && existingBookmarkId === bookmarkId) {
            return desiredName;
        }

        const stem = desiredName.endsWith('.json') ? desiredName.slice(0, -5) : desiredName;
        const baseHash = shortHashText(`${currentName}:${bookmarkId}:${Date.now()}`);
        let index = 0;
        while (index < 500) {
            const suffix = index === 0 ? baseHash : `${baseHash}-${index}`;
            const candidate = `${stem}--${suffix}.json`;
            if (!(await fileHandleExists(directoryHandle, candidate))) {
                return candidate;
            }
            index += 1;
        }
        throw new Error(`Could not find unique filename for ${desiredName}`);
    }

    Object.assign(helpers, {
        extractBookmarkPayload,
        sanitizeBrowserFilenameSegment,
        cleanBrowserNameSegment,
        buildBrowserBookmarkFilename,
        shortHashText,
        readJsonFromFileHandle,
        fileHandleExists,
        readBookmarkIdFromHandle,
        getSettingsBrowserLiveLinks,
        buildLiveBookmarkMap,
        applyLiveBookmarkToPayload,
        pickUniqueBookmarkName
    });
})();

window.__modalSettingsBrowserHelperFilesReady = true;
