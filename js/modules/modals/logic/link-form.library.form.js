window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    ns.registerLibraryFormCore = function registerLibraryFormCore() {
        ns.normalizeLibraryImageUrl = function normalizeLibraryImageUrl(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (/^(?:https?:\/\/|file:\/\/|data:|blob:)/i.test(raw)) return raw;
            return normalizeUrl(raw);
        };

        ns.readLibraryFormPatch = function () {
            const toInt = function (id) {
                const raw = document.getElementById(id)?.value;
                const parsed = parseInt(raw, 10);
                return Number.isFinite(parsed) ? parsed : 0;
            };
            const author = document.getElementById('libAuthor')?.value.trim() || '';
            const authorAltNames = ns.parseUniqueCsvList(document.getElementById('libAuthorAltNames')?.value || '')
                .filter(name => name.toLowerCase() !== author.toLowerCase());

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
                artist: ns.normalizeCommaSeparatedValue(document.getElementById('libArtist')?.value || ''),
                genre: ns.normalizeCommaSeparatedValue(document.getElementById('libGenre')?.value || ''),
                status: document.getElementById('libStatus')?.value || '',
                rating: document.getElementById('libRating')?.value || '',
                graphicChapter: toInt('libGraphicChapter'),
                novelChapter: toInt('libNovelChapter'),
                season: toInt('libSeason'),
                episode: toInt('libEpisode'),
                language: document.getElementById('libLanguage')?.value.trim() || '',
                sourceUrl: normalizeUrl(document.getElementById('libSourceUrl')?.value.trim() || ''),
                image: resolvedImage,
                tags: ns.parseUniqueCsvList(document.getElementById('libTags')?.value || ''),
                summary: document.getElementById('libSummary')?.value.trim() || '',
                mediaTypes,
                apiRatings: ratingsPatch.apiRatings,
                derivedRatings: ratingsPatch.derivedRatings
            };
        };

        ns.fillLibraryForm = function (entry) {
            const mediaTypes = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length > 0
                ? entry.mediaTypes
                : ['graphicNovels'];
            document.getElementById('libTypeGraphic').checked = mediaTypes.includes('graphicNovels');
            document.getElementById('libTypeFilms').checked = mediaTypes.includes('films');
            document.getElementById('libTypeNovels').checked = mediaTypes.includes('novels');
            document.getElementById('libAuthor').value = entry?.author || '';
            document.getElementById('libAuthorAltNames').value = ns.normalizeEntryListValue(entry?.authorAltNames);
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
            const addedMeta = document.getElementById('libDateAddedMeta');
            const editedMeta = document.getElementById('libLastEditedMeta');
            if (addedMeta) addedMeta.textContent = `Added: ${ns.formatLibraryTimestamp(entry?.dateAdded)}`;
            if (editedMeta) editedMeta.textContent = `Last Edited: ${ns.formatLibraryTimestamp(entry?.lastEdited || entry?.dateAdded)}`;
            ns.refreshDerivedRatingsPreview(entry);
            ns.updateLibraryProgressFieldVisibility();
        };

        ns.resetLibraryForm = function () {
            document.getElementById('libTypeGraphic').checked = true;
            document.getElementById('libTypeFilms').checked = false;
            document.getElementById('libTypeNovels').checked = false;
            ns.fillLibraryForm(null);
        };

        ns.refreshLibraryStatusOptions = function (categoryName) {
            const select = document.getElementById('libStatus');
            if (!select) return;
            const state = window.EveLibrary?.State;
            const fallback = ['Reading', 'Completed', 'Plan to Read'];
            let statuses = fallback;
            if (state) {
                const dataType = state.getCategoryDataType(categoryName || 'Unsorted');
                const type = state.getDataType(dataType);
                statuses = (type?.statuses && type.statuses.length > 0) ? type.statuses : fallback;
            }
            const previous = select.value;
            select.innerHTML = '<option value="">Status</option>' + statuses.map(s => `<option value="${s}">${s}</option>`).join('');
            if (statuses.includes(previous)) {
                select.value = previous;
            }
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
