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
            mediaTypes
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
        const summaryValue = entry?.summary || '';
        document.getElementById('libSummary').value = ns.isAutoSourceSummary(summaryValue) ? '' : summaryValue;
        const addedMeta = document.getElementById('libDateAddedMeta');
        const editedMeta = document.getElementById('libLastEditedMeta');
        if (addedMeta) addedMeta.textContent = `Added: ${ns.formatLibraryTimestamp(entry?.dateAdded)}`;
        if (editedMeta) editedMeta.textContent = `Last Edited: ${ns.formatLibraryTimestamp(entry?.lastEdited || entry?.dateAdded)}`;
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

    ns.ensureLibraryMetadataSectionEnabled = function () {
        const toggle = ns.getLibraryFormToggle();
        if (toggle && !toggle.checked) {
            toggle.checked = true;
        }
        ns.setLibraryFieldsCollapsed(false);
        ns.setLibraryFieldsVisibility(true);
    };

    ns.updateLinkedEntryFromMetadataPatch = function (patch) {
        if (!patch || typeof patch !== 'object') return;
        const editId = document.getElementById('editId')?.value;
        if (!editId) return;
        const api = ns.getConnectionsApi();
        if (!api?.findConnectionByLinkId?.(editId)) return;
        api.updateLinkedEntry?.(editId, patch);
    };

    ns.applySourceMetadataToLibraryFields = function (source) {
        if (!source) return false;

        ns.ensureLibraryMetadataSectionEnabled();

        const meta = ns.buildSourceMetadata(source);
        const updates = {};

        const authorInput = document.getElementById('libAuthor');
        const altAuthorsInput = document.getElementById('libAuthorAltNames');
        const existingAuthor = String(authorInput?.value || '').trim();
        let primaryAuthor = existingAuthor;
        if (!primaryAuthor && meta.authors.length > 0) {
            primaryAuthor = meta.authors[0];
        }

        const existingAltAuthors = ns.parseUniqueCsvList(altAuthorsInput?.value || '');
        let nextAltAuthors = ns.mergeUniqueValues(existingAltAuthors, meta.authors);
        const primaryKey = ns.toTrimmedLower(primaryAuthor);
        nextAltAuthors = nextAltAuthors.filter(name => ns.toTrimmedLower(name) !== primaryKey);

        if (authorInput) authorInput.value = primaryAuthor;
        if (altAuthorsInput) altAuthorsInput.value = nextAltAuthors.join(', ');
        updates.author = primaryAuthor;
        updates.authorAltNames = nextAltAuthors;

        const artistInput = document.getElementById('libArtist');
        const existingArtists = ns.parseUniqueCsvList(artistInput?.value || '');
        const mergedArtists = ns.mergeUniqueValues(existingArtists, meta.artists);
        if (artistInput) artistInput.value = mergedArtists.join(', ');
        updates.artist = mergedArtists.join(', ');

        const genreInput = document.getElementById('libGenre');
        const existingGenres = ns.parseUniqueCsvList(genreInput?.value || '');
        const mergedGenres = ns.mergeUniqueValues(existingGenres, meta.genres);
        if (genreInput) genreInput.value = mergedGenres.join(', ');
        updates.genre = mergedGenres.join(', ');

        const tagsInput = document.getElementById('libTags');
        const existingTags = ns.parseUniqueCsvList(tagsInput?.value || '');
        const mergedTags = ns.mergeUniqueValues(existingTags, meta.tags);
        if (tagsInput) tagsInput.value = mergedTags.join(', ');
        updates.tags = mergedTags;

        const languageInput = document.getElementById('libLanguage');
        if (languageInput && !ns.toTrimmedLower(languageInput.value) && meta.language) {
            languageInput.value = meta.language;
            updates.language = meta.language;
        }

        const sourceUrlInput = document.getElementById('libSourceUrl');
        const bookmarkUrlInput = document.getElementById('newUrl');
        const hasCurrentSourceUrl = ns.toTrimmedLower(sourceUrlInput?.value);
        if (!hasCurrentSourceUrl && meta.sourceUrl) {
            if (sourceUrlInput) sourceUrlInput.value = meta.sourceUrl;
            if (bookmarkUrlInput && !ns.toTrimmedLower(bookmarkUrlInput.value)) {
                bookmarkUrlInput.value = meta.sourceUrl;
            }
            updates.sourceUrl = meta.sourceUrl;
        }

        const statusSelect = document.getElementById('libStatus');
        if (statusSelect && !statusSelect.value && meta.status) {
            const statusMatch = Array.from(statusSelect.options || []).find(option =>
                ns.toTrimmedLower(option.value) === ns.toTrimmedLower(meta.status)
            );
            if (statusMatch) {
                statusSelect.value = statusMatch.value;
                updates.status = statusMatch.value;
            }
        }

        ns.updateLinkedEntryFromMetadataPatch(updates);

        const summaryBits = [];
        if (meta.tags.length) summaryBits.push(`${meta.tags.length} tags`);
        if (meta.genres.length) summaryBits.push(`${meta.genres.length} genres`);
        if (meta.authors.length) summaryBits.push(`${meta.authors.length} authors`);
        if (meta.artists.length) summaryBits.push(`${meta.artists.length} artists`);
        const summaryText = summaryBits.length ? summaryBits.join(', ') : 'no metadata fields available';
        showToast(`Source metadata applied (${summaryText})`, "success");
        return true;
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
        if (bookmarkUrlInput && libraryUrlInput) {
            let liveSyncTimer = null;
            const pushLiveSourceUrlToLinkedEntry = () => {
                const editId = document.getElementById('editId')?.value;
                if (!editId) return;
                const api = ns.getConnectionsApi();
                if (!api?.findConnectionByLinkId?.(editId)) return;
                const sourceUrl = (libraryUrlInput.value || '').trim();
                clearTimeout(liveSyncTimer);
                liveSyncTimer = setTimeout(() => {
                    api.updateLinkedEntry?.(editId, { sourceUrl });
                }, 150);
            };

            let syncing = false;
            bookmarkUrlInput.oninput = () => {
                if (syncing) return;
                syncing = true;
                libraryUrlInput.value = bookmarkUrlInput.value;
                syncing = false;
                pushLiveSourceUrlToLinkedEntry();
            };
            libraryUrlInput.oninput = () => {
                if (syncing) return;
                syncing = true;
                bookmarkUrlInput.value = libraryUrlInput.value;
                syncing = false;
                pushLiveSourceUrlToLinkedEntry();
            };
        }
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

    ns.applySourceMetadataFromAttachedSource = function (index) {
        const source = ns.getAttachedSourceByIndex(index);
        if (!source) {
            showToast("Source metadata not found", "warning");
            return;
        }
        ns.applySourceMetadataToLibraryFields(source);
    };
})(window.EveLinkForm);
