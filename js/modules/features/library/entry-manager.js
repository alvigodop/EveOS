/**
 * Entry Manager Module for Eve OS
 * Handles CRUD operations for library entries
 * Adapted from MegaBase entry-manager.js
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Storage = window.EveLibrary.Storage;

    function generateUniqueId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    function parseUniqueCsvList(value) {
        const seen = new Set();
        return String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function normalizeCommaSeparatedValue(value) {
        return parseUniqueCsvList(value).join(', ');
    }

    function getFormData(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const rawSourceUrl = document.getElementById(prefix + 'source-url')?.value.trim() || '';
        const author = document.getElementById(prefix + 'author')?.value.trim() || '';
        const authorAltNames = parseUniqueCsvList(document.getElementById(prefix + 'author-alt-names')?.value || '')
            .filter(name => name.toLowerCase() !== author.toLowerCase());
        return {
            title: document.getElementById(prefix + 'title')?.value.trim() || '',
            author,
            authorAltNames,
            artist: normalizeCommaSeparatedValue(document.getElementById(prefix + 'artist')?.value || ''),
            genre: normalizeCommaSeparatedValue(document.getElementById(prefix + 'genre')?.value || ''),
            status: document.getElementById(prefix + 'status')?.value || '',
            chapter: parseInt(document.getElementById(prefix + 'chapter')?.value) || 0,
            season: parseInt(document.getElementById(prefix + 'season')?.value) || 0,
            episode: parseInt(document.getElementById(prefix + 'episode')?.value) || 0,
            summary: document.getElementById(prefix + 'summary')?.value.trim() || '',
            rating: document.getElementById(prefix + 'rating')?.value || '',
            language: document.getElementById(prefix + 'language')?.value.trim() || '',
            sourceUrl: rawSourceUrl ? normalizeUrl(rawSourceUrl) : '',
            tags: parseUniqueCsvList(document.getElementById(prefix + 'tags')?.value || ''),
            imageUrl: document.getElementById(prefix + 'image-url')?.value.trim() || ''
        };
    }

    function addEntry(categoryName, renderCallback) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const data = getFormData(categoryName);
        const nowIso = new Date().toISOString();

        const newEntry = {
            id: generateUniqueId(),
            title: data.title,
            mediaTypes: [dataType],
            author: data.author,
            authorAltNames: data.authorAltNames,
            artist: data.artist,
            genre: data.genre,
            status: data.status,
            chapter: (dataType === 'films') ? undefined : data.chapter,
            graphicChapter: (dataType === 'graphicNovels') ? data.chapter : undefined,
            novelChapter: (dataType === 'novels') ? data.chapter : undefined,
            season: (dataType === 'films') ? data.season : undefined,
            episode: (dataType === 'films') ? data.episode : undefined,
            summary: data.summary,
            rating: data.rating,
            language: data.language,
            sourceUrl: data.sourceUrl,
            tags: data.tags,
            dateAdded: nowIso,
            lastEdited: nowIso,
            favorite: false,
            image: data.imageUrl
        };

        lib.entries.push(newEntry);
        Storage.saveLibrary();
        if (renderCallback) renderCallback();
        return newEntry;
    }

    function editEntry(categoryName, entryId, renderCallback) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const entry = lib.entries.find(e => e.id === entryId);

        if (!entry) return null;

        const data = getFormData(categoryName);
        const nowIso = new Date().toISOString();

        entry.title = data.title;
        entry.author = data.author;
        entry.authorAltNames = data.authorAltNames;
        entry.artist = data.artist;
        entry.genre = data.genre;
        entry.status = data.status;
        if (!Array.isArray(entry.mediaTypes) || entry.mediaTypes.length === 0) {
            entry.mediaTypes = [dataType];
        }
        const mediaTypes = Array.isArray(entry.mediaTypes) ? entry.mediaTypes : [dataType];
        if (dataType === 'films') {
            entry.season = data.season;
            entry.episode = data.episode;
            entry.chapter = undefined;
            entry.graphicChapter = undefined;
            entry.novelChapter = undefined;
        } else {
            entry.chapter = data.chapter;
            entry.season = undefined;
            entry.episode = undefined;
            entry.graphicChapter = mediaTypes.includes('graphicNovels') ? data.chapter : undefined;
            entry.novelChapter = mediaTypes.includes('novels') ? data.chapter : undefined;
        }
        entry.summary = data.summary;
        entry.rating = data.rating;
        entry.language = data.language;
        entry.sourceUrl = data.sourceUrl;
        entry.tags = data.tags;
        if (data.imageUrl) entry.image = data.imageUrl;
        entry.lastEdited = nowIso;

        Storage.saveLibrary();
        if (window.EveLibrary?.ConnectionsAPI?.syncFromLibraryEntry) {
            window.EveLibrary.ConnectionsAPI.syncFromLibraryEntry(categoryName, entry);
        }
        if (renderCallback) renderCallback();
        return entry;
    }

    function deleteEntry(categoryName, entryId, renderCallback) {
        const lib = State.getCategoryLibrary(categoryName);
        const index = lib.entries.findIndex(e => e.id === entryId);
        if (index !== -1) {
            const removed = lib.entries[index];
            lib.entries.splice(index, 1);
            if (window.EveLibrary?.ConnectionsAPI?.removeByLibraryEntry) {
                window.EveLibrary.ConnectionsAPI.removeByLibraryEntry(categoryName, removed.id);
            }
            Storage.saveLibrary();
            if (renderCallback) renderCallback();
            return true;
        }
        return false;
    }

    function toggleFavorite(categoryName, entryId, renderCallback) {
        const lib = State.getCategoryLibrary(categoryName);
        const entry = lib.entries.find(e => e.id === entryId);
        if (entry) {
            entry.favorite = !entry.favorite;
            Storage.saveLibrary();
            if (renderCallback) renderCallback();
            return entry.favorite;
        }
        return false;
    }

    function batchDelete(categoryName, entryIds, renderCallback) {
        const lib = State.getCategoryLibrary(categoryName);
        lib.entries = lib.entries.filter(e => !entryIds.includes(e.id));
        Storage.saveLibrary();
        if (renderCallback) renderCallback();
    }

    window.EveLibrary.EntryManager = {
        addEntry,
        editEntry,
        deleteEntry,
        toggleFavorite,
        batchDelete,
        getFormData
    };
})();
