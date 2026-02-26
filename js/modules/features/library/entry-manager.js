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

    function getFormData(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        return {
            title: document.getElementById(prefix + 'title')?.value.trim() || '',
            author: document.getElementById(prefix + 'author')?.value.trim() || '',
            genre: document.getElementById(prefix + 'genre')?.value.trim() || '',
            status: document.getElementById(prefix + 'status')?.value || '',
            chapter: parseInt(document.getElementById(prefix + 'chapter')?.value) || 0,
            season: parseInt(document.getElementById(prefix + 'season')?.value) || 0,
            episode: parseInt(document.getElementById(prefix + 'episode')?.value) || 0,
            summary: document.getElementById(prefix + 'summary')?.value.trim() || '',
            rating: document.getElementById(prefix + 'rating')?.value || '',
            language: document.getElementById(prefix + 'language')?.value.trim() || '',
            tags: (document.getElementById(prefix + 'tags')?.value || '').split(',').map(t => t.trim()).filter(t => t),
            imageUrl: document.getElementById(prefix + 'image-url')?.value.trim() || ''
        };
    }

    function addEntry(categoryName, renderCallback) {
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const data = getFormData(categoryName);

        const newEntry = {
            id: generateUniqueId(),
            title: data.title,
            mediaTypes: [dataType],
            author: data.author,
            genre: data.genre,
            status: data.status,
            chapter: (dataType === 'films') ? undefined : data.chapter,
            season: (dataType === 'films') ? data.season : undefined,
            episode: (dataType === 'films') ? data.episode : undefined,
            summary: data.summary,
            rating: data.rating,
            language: data.language,
            tags: data.tags,
            dateAdded: new Date().toISOString(),
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

        entry.title = data.title;
        entry.author = data.author;
        entry.genre = data.genre;
        entry.status = data.status;
        if (!Array.isArray(entry.mediaTypes) || entry.mediaTypes.length === 0) {
            entry.mediaTypes = [dataType];
        }
        entry.chapter = (dataType === 'films') ? entry.chapter : data.chapter;
        entry.season = (dataType === 'films') ? data.season : undefined;
        entry.episode = (dataType === 'films') ? data.episode : undefined;
        entry.summary = data.summary;
        entry.rating = data.rating;
        entry.language = data.language;
        entry.tags = data.tags;
        if (data.imageUrl) entry.image = data.imageUrl;

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
