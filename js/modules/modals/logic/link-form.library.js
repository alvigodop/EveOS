window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    ns.readLibraryFormPatch = function () {
        const toInt = (id) => {
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
            image: document.getElementById('libImageUrl')?.value.trim() || '',
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
        document.getElementById('libImageUrl').value = entry?.image || entry?.imageUrl || '';
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

    ns.setupLibraryToggleHandlers = function () {
        const toggle = ns.getLibraryFormToggle();
        const collapseBtn = ns.getLibraryCollapseButton();
        const categoryInput = document.getElementById('newCategory');
        const bookmarkUrlInput = document.getElementById('newUrl');
        const libraryUrlInput = document.getElementById('libSourceUrl');
        const typeGraphic = document.getElementById('libTypeGraphic');
        const typeFilms = document.getElementById('libTypeFilms');
        const typeNovels = document.getElementById('libTypeNovels');

        if (toggle) {
            toggle.onchange = () => {
                const enabled = !!toggle.checked;
                if (enabled) {
                    ns.isLibraryFieldsCollapsed = false;
                }
                ns.setLibraryFieldsVisibility(enabled);
                if (enabled) ns.refreshDerivedRatingsPreview();
            };
        }
        if (collapseBtn) {
            collapseBtn.onclick = () => window.toggleLibraryFieldsCollapse();
        }

        const onTypesChanged = () => ns.updateLibraryProgressFieldVisibility(categoryInput?.value?.trim() || 'Unsorted');
        if (typeGraphic) typeGraphic.onchange = onTypesChanged;
        if (typeFilms) typeFilms.onchange = onTypesChanged;
        if (typeNovels) typeNovels.onchange = onTypesChanged;
        if (categoryInput) {
            categoryInput.oninput = () => {
                const categoryName = categoryInput.value.trim() || 'Unsorted';
                ns.refreshLibraryStatusOptions(categoryName);
                ns.updateLibraryProgressFieldVisibility(categoryName);
            };
        }

        let liveSyncTimer = null;
        const pushLivePatchToLinkedEntry = (patchFactory) => {
            const editId = document.getElementById('editId')?.value;
            if (!editId) return;
            const api = ns.getConnectionsApi();
            if (!api?.findConnectionByLinkId?.(editId)) return;
            clearTimeout(liveSyncTimer);
            liveSyncTimer = setTimeout(() => {
                const patch = patchFactory();
                api.updateLinkedEntry?.(editId, patch);
            }, 150);
        };

        if (bookmarkUrlInput && libraryUrlInput) {
            let syncing = false;
            bookmarkUrlInput.oninput = () => {
                if (syncing) return;
                syncing = true;
                libraryUrlInput.value = bookmarkUrlInput.value;
                syncing = false;
                pushLivePatchToLinkedEntry(() => ({ sourceUrl: (libraryUrlInput.value || '').trim() }));
            };
            libraryUrlInput.oninput = () => {
                if (syncing) return;
                syncing = true;
                bookmarkUrlInput.value = libraryUrlInput.value;
                syncing = false;
                pushLivePatchToLinkedEntry(() => ({ sourceUrl: (libraryUrlInput.value || '').trim() }));
            };
        }

        const ratingInputs = [
            'libRating',
            'libApiRatingAniList',
            'libApiRatingMAL',
            'libApiRatingMangaDex'
        ];
        ratingInputs.forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;
            const onValueChanged = () => {
                const derived = ns.refreshDerivedRatingsPreview();
                pushLivePatchToLinkedEntry(() => {
                    const ratingsPatch = ns.buildRatingsPatch();
                    return {
                        rating: document.getElementById('libRating')?.value || '',
                        apiRatings: ratingsPatch.apiRatings,
                        derivedRatings: derived || ratingsPatch.derivedRatings
                    };
                });
            };
            element.oninput = onValueChanged;
            element.onchange = onValueChanged;
        });
    };

    ns.loadLibraryStateForLink = function (linkId, categoryName) {
        const toggle = ns.getLibraryFormToggle();
        if (!toggle) return;
        const api = ns.getConnectionsApi();
        ns.refreshLibraryStatusOptions(categoryName);

        const linked = api?.getLinkedEntry?.(linkId);
        if (linked?.entry) {
            toggle.checked = true;
            ns.setLibraryFieldsCollapsed(false);
            ns.setLibraryFieldsVisibility(true);
            ns.fillLibraryForm(linked.entry);
            const linkedUrl = linked.entry.sourceUrl || '';
            const newUrlInput = document.getElementById('newUrl');
            if (linkedUrl && newUrlInput && !newUrlInput.matches(':focus')) {
                newUrlInput.value = linkedUrl;
            }
            if (linked.entry.status) {
                document.getElementById('libStatus').value = linked.entry.status;
            }
            return;
        }

        toggle.checked = false;
        ns.setLibraryFieldsCollapsed(false);
        ns.setLibraryFieldsVisibility(false);
        ns.resetLibraryForm();
    };

    ns.saveLibraryLinkState = function (linkId, categoryName, title, url) {
        const toggle = ns.getLibraryFormToggle();
        const shouldLink = !!toggle?.checked;
        const api = ns.getConnectionsApi();
        if (!api) return;

        const existing = api.findConnectionByLinkId?.(linkId);

        if (!shouldLink) {
            if (existing) {
                api.unlinkLink?.(linkId, true);
            }
            return;
        }

        if (!existing) {
            api.promoteLink?.(linkId);
        }

        api.moveLinkedEntryToCategory?.(linkId, categoryName);
        const patch = ns.readLibraryFormPatch();
        if (!patch.mediaTypes || patch.mediaTypes.length === 0) {
            patch.mediaTypes = ['graphicNovels'];
        }
        patch.chapter = patch.graphicChapter || patch.novelChapter || 0;
        patch.title = title;
        if (!patch.sourceUrl && url) patch.sourceUrl = normalizeUrl(url);
        api.updateLinkedEntry?.(linkId, patch);
    };
})(window.EveLinkForm);
