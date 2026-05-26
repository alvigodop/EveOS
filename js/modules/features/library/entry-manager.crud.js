window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.EntryManagerModules = window.EveLibrary.EntryManagerModules || {};

(function () {
    if (window.EveLibrary.EntryManagerModules.createCrudHelpers) return;

    window.EveLibrary.EntryManagerModules.createCrudHelpers = function createCrudHelpers(deps, base) {
        const State = deps.State;
        const Storage = deps.Storage;
        const Ratings = deps.Ratings;
        const getFormData = base.getFormData;
        const generateUniqueId = base.generateUniqueId;
        const getWorkspaceId = base.getWorkspaceId;

        function addEntry(categoryName, renderCallback) {
            const lib = State.getCategoryLibrary(categoryName);
            const dataType = lib.dataType || 'graphicNovels';
            const data = getFormData(categoryName);
            const nowIso = new Date().toISOString();

            const newEntry = {
                id: generateUniqueId(),
                title: data.title,
                titleAltNames: data.titleAltNames,
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
                apiRatings: data.apiRatings,
                sourceStatus: '',
                sourceSignals: Ratings?.createEmptySourceSignals
                    ? Ratings.createEmptySourceSignals()
                    : null,
                language: data.language,
                sourceUrl: data.sourceUrl,
                tags: data.tags,
                dateAdded: nowIso,
                lastEdited: nowIso,
                favorite: false,
                image: data.imageUrl,
                derivedRatings: null
            };
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(newEntry);
            }

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
            entry.titleAltNames = data.titleAltNames;
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
            if (data.apiRatingsProvided) {
                entry.apiRatings = data.apiRatings;
            } else if (!entry.apiRatings) {
                entry.apiRatings = data.apiRatings;
            }
            entry.language = data.language;
            entry.sourceUrl = data.sourceUrl;
            entry.tags = data.tags;
            if (data.imageUrl) entry.image = data.imageUrl;
            if (Ratings?.applyDerivedRatings) {
                Ratings.applyDerivedRatings(entry);
            }
            entry.lastEdited = nowIso;

            Storage.saveLibrary();
            if (window.EveLibrary?.ConnectionsAPI?.syncFromLibraryEntry) {
                window.EveLibrary.ConnectionsAPI.syncFromLibraryEntry(categoryName, entry, getWorkspaceId());
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
                    window.EveLibrary.ConnectionsAPI.removeByLibraryEntry(categoryName, removed.id, getWorkspaceId());
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

        return {
            addEntry,
            editEntry,
            deleteEntry,
            toggleFavorite,
            batchDelete
        };
    };
})();
