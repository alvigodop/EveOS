window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    ns.registerLibraryFormCore = function registerLibraryFormCore() {
        ns.normalizeLibraryImageUrl = function normalizeLibraryImageUrl(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^(?:https?:\/\/|file:\/\/|data:|blob:)/i.test(raw)) return raw;
            return ns.normalizeStoredUrl ? ns.normalizeStoredUrl(raw) : normalizeUrl(raw);
        };

        ns.readLibraryFormPatch = function () {
            window.EveLibraryNotesSections?.syncLibraryRawNotesFromHuman?.();
            const toInt = function (id) {
                const raw = document.getElementById(id)?.value;
                const parsed = parseInt(raw, 10);
                return Number.isFinite(parsed) ? parsed : 0;
            };
            const author = document.getElementById('libAuthor')?.value.trim() || '';
            const authorAltNames = ns.parseUniqueCsvList(document.getElementById('libAuthorAltNames')?.value || '')
                .filter(name => name.toLowerCase() !== author.toLowerCase());
            const bookmarkTitle = document.getElementById('newTitle')?.value.trim() || '';
            const titleAltNames = ns.parseUniqueCsvList(document.getElementById('libTitleAltNames')?.value || '')
                .filter(name => name.toLowerCase() !== bookmarkTitle.toLowerCase());

            const mediaTypes = [];
            if (document.getElementById('libTypeGraphic')?.checked) mediaTypes.push('graphicNovels');
            if (document.getElementById('libTypeFilms')?.checked) mediaTypes.push('films');
            if (document.getElementById('libTypeNovels')?.checked) mediaTypes.push('novels');

            const coverImageInput = document.getElementById('newCoverImage');
            const libraryImageInput = document.getElementById('libImageUrl');
            const resolvedImage = ns.normalizeLibraryImageUrl(coverImageInput?.value || libraryImageInput?.value || '');
            const ratingsPatch = ns.buildRatingsPatch();
            return {
                author,
                authorAltNames,
                titleAltNames,
                artist: ns.normalizeCommaSeparatedValue(document.getElementById('libArtist')?.value || ''),
                genre: ns.normalizeCommaSeparatedValue(document.getElementById('libGenre')?.value || ''),
                status: document.getElementById('libStatus')?.value || '',
                rating: document.getElementById('libRating')?.value || '',
                graphicChapter: toInt('libGraphicChapter'),
                novelChapter: toInt('libNovelChapter'),
                season: toInt('libSeason'),
                episode: toInt('libEpisode'),
                language: document.getElementById('libLanguage')?.value.trim() || '',
                sourceUrl: ns.normalizeStoredUrl
                    ? ns.normalizeStoredUrl(document.getElementById('libSourceUrl')?.value.trim() || '')
                    : normalizeUrl(document.getElementById('libSourceUrl')?.value.trim() || ''),
                image: resolvedImage,
                tags: ns.parseUniqueCsvList(document.getElementById('libTags')?.value || ''),
                summary: document.getElementById('libSummary')?.value.trim() || '',
                mediaTypes,
                apiRatings: ratingsPatch.apiRatings,
                derivedRatings: ratingsPatch.derivedRatings
            };
        };

        ns.getSelectedLibraryMediaTypes = function () {
            const mediaTypes = [];
            if (document.getElementById('libTypeGraphic')?.checked) mediaTypes.push('graphicNovels');
            if (document.getElementById('libTypeFilms')?.checked) mediaTypes.push('films');
            if (document.getElementById('libTypeNovels')?.checked) mediaTypes.push('novels');
            return mediaTypes;
        };

        function getCategoryFallbackDataType(categoryName) {
            const state = window.EveLibrary?.State;
            return state?.getCategoryDataType?.(categoryName || 'Unsorted') || 'graphicNovels';
        }

        function getStatusOptions(categoryName, mediaTypes) {
            const state = window.EveLibrary?.State;
            const fallbackType = getCategoryFallbackDataType(categoryName);
            if (state?.getStatusOptionsForMediaTypes) {
                return state.getStatusOptionsForMediaTypes(mediaTypes, fallbackType);
            }
            const type = state?.getDataType?.(fallbackType);
            return (type?.statuses && type.statuses.length > 0)
                ? type.statuses.slice()
                : ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Hiatus'];
        }

        function replaceStatusOptions(select, statuses, previous) {
            if (!select) return;
            const safeStatuses = Array.isArray(statuses) ? statuses.slice() : [];
            const previousValue = String(previous || '').trim();
            if (previousValue && !safeStatuses.includes(previousValue)) safeStatuses.unshift(previousValue);
            while (select.firstChild) select.removeChild(select.firstChild);
            const blank = document.createElement('option');
            blank.value = '';
            blank.textContent = 'Status';
            select.appendChild(blank);
            safeStatuses.forEach(function (status) {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                select.appendChild(option);
            });
            select.value = previousValue;
        }

        ns.fillLibraryForm = function (entry, categoryName) {
            const mediaTypes = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length > 0
                ? entry.mediaTypes
                : ['graphicNovels'];
            document.getElementById('libTypeGraphic').checked = mediaTypes.includes('graphicNovels');
            document.getElementById('libTypeFilms').checked = mediaTypes.includes('films');
            document.getElementById('libTypeNovels').checked = mediaTypes.includes('novels');
            ns.refreshLibraryStatusOptions(categoryName, {
                mediaTypes,
                preferredValue: entry?.status || ''
            });
            document.getElementById('libAuthor').value = entry?.author || '';
            document.getElementById('libAuthorAltNames').value = ns.normalizeEntryListValue(entry?.authorAltNames);
            const titleAltInput = document.getElementById('libTitleAltNames');
            if (titleAltInput) titleAltInput.value = ns.normalizeEntryListValue(entry?.titleAltNames || entry?.altTitles);
            document.getElementById('libArtist').value = ns.normalizeEntryListValue(entry?.artist);
            document.getElementById('libGenre').value = ns.normalizeEntryListValue(entry?.genre);
            document.getElementById('libStatus').value = entry?.status || '';
            document.getElementById('libRating').value = entry?.rating || '';
            document.getElementById('libGraphicChapter').value = entry?.graphicChapter ?? entry?.chapter ?? 0;
            document.getElementById('libNovelChapter').value = entry?.novelChapter ?? entry?.chapter ?? 0;
            document.getElementById('libSeason').value = entry?.season ?? 0;
            document.getElementById('libEpisode').value = entry?.episode ?? 0;
            document.getElementById('libLanguage').value = entry?.language || '';
            document.getElementById('libSourceUrl').value = entry?.sourceUrl || document.getElementById('newUrl')?.value || '';
            const existingBookmarkCover = document.getElementById('newCoverImage')?.value || '';
            const resolvedImage = ns.normalizeLibraryImageUrl(existingBookmarkCover || entry?.image || entry?.imageUrl || '');
            document.getElementById('libImageUrl').value = resolvedImage;
            if (entry) {
                const bookmarkCoverInput = document.getElementById('newCoverImage');
                if (bookmarkCoverInput) bookmarkCoverInput.value = resolvedImage;
                ns.refreshCoverImagesSummary?.();
            }
            document.getElementById('libTags').value = ns.normalizeEntryListValue(entry?.tags);
            ns.writeApiRatingsToInputs(entry?.apiRatings || null);
            const summaryValue = entry?.summary || '';
            document.getElementById('libSummary').value = ns.isAutoSourceSummary(summaryValue) ? '' : summaryValue;
            window.EveLibraryNotesSections?.syncLibraryNotesUiFromRaw?.();
            const addedMeta = document.getElementById('libDateAddedMeta');
            const editedMeta = document.getElementById('libLastEditedMeta');
            if (addedMeta) addedMeta.textContent = `Added: ${ns.formatLibraryTimestamp(entry?.dateAdded)}`;
            if (editedMeta) editedMeta.textContent = `Last Edited: ${ns.formatLibraryTimestamp(entry?.lastEdited || entry?.dateAdded)}`;
            ns.refreshDerivedRatingsPreview(entry);
            ns.updateLibraryProgressFieldVisibility(categoryName);
        };

        ns.resetLibraryForm = function () {
            document.getElementById('libTypeGraphic').checked = true;
            document.getElementById('libTypeFilms').checked = false;
            document.getElementById('libTypeNovels').checked = false;
            ns.fillLibraryForm(null);
        };

        ns.refreshLibraryStatusOptions = function (categoryName, options) {
            const select = document.getElementById('libStatus');
            if (!select) return;
            const config = options && typeof options === 'object' ? options : {};
            const mediaTypes = Array.isArray(config.mediaTypes)
                ? config.mediaTypes
                : ns.getSelectedLibraryMediaTypes();
            const previous = String(config.preferredValue || select.value || '').trim();
            replaceStatusOptions(select, getStatusOptions(categoryName, mediaTypes), previous);
            ns.updateLibraryProgressFieldVisibility(categoryName);
        };

        ns.updateLibraryProgressFieldVisibility = function (categoryName) {
            const state = window.EveLibrary?.State;
            let dataType = 'graphicNovels';
            if (state) {
                dataType = state.getCategoryDataType(categoryName || 'Unsorted') || 'graphicNovels';
            }
            const graphicChapterWrap = document.getElementById('libGraphicChapterWrap');
            const novelChapterWrap = document.getElementById('libNovelChapterWrap');
            const seasonWrap = document.getElementById('libSeasonWrap');
            const episodeWrap = document.getElementById('libEpisodeWrap');
            const hasFilms = !!document.getElementById('libTypeFilms')?.checked;
            const hasGraphic = !!document.getElementById('libTypeGraphic')?.checked;
            const hasNovels = !!document.getElementById('libTypeNovels')?.checked;
            const hasReading = hasGraphic || hasNovels;
            const fallbackReading = !hasFilms && !hasReading && dataType !== 'films';

            if (graphicChapterWrap) graphicChapterWrap.style.display = (hasGraphic || fallbackReading) ? 'flex' : 'none';
            if (novelChapterWrap) novelChapterWrap.style.display = hasNovels ? 'flex' : 'none';
            if (seasonWrap) seasonWrap.style.display = hasFilms ? 'flex' : 'none';
            if (episodeWrap) episodeWrap.style.display = hasFilms ? 'flex' : 'none';
        };
    };
})(window.EveLinkForm);
