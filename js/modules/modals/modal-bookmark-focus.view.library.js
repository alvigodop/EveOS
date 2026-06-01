window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;
    const shared = ns._viewShared || {};
    const { getEntryTitleAliases } = shared;

    function setLibraryControlsEnabled(isEnabled) {
        const saveBtn = document.getElementById('bookmarkFocusSaveLibraryBtn');
        const recalibrateBtn = document.getElementById('bookmarkFocusRecalibrateBtn');
        if (saveBtn) saveBtn.disabled = !isEnabled;
        if (recalibrateBtn) recalibrateBtn.disabled = !isEnabled;
    }

    function getStatusOptions(categoryName, entry) {
        const state = window.EveLibrary?.State;
        const fallback = ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Hiatus'];
        if (!state) return fallback;
        const fallbackType = state.getCategoryDataType(categoryName || 'Unsorted');
        const mediaTypes = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length
            ? entry.mediaTypes
            : [fallbackType];
        if (typeof state.getStatusOptionsForMediaTypes === 'function') {
            const options = state.getStatusOptionsForMediaTypes(mediaTypes, fallbackType);
            return options.length ? options : fallback;
        }
        const dataTypeName = state.getCategoryDataType(categoryName || 'Unsorted');
        const dataType = state.getDataType(dataTypeName);
        const options = Array.isArray(dataType?.statuses) ? dataType.statuses : [];
        return options.length ? options : fallback;
    }

    function renderStatusOptions(categoryName, selectedStatus, entry) {
        const select = document.getElementById('bookmarkFocusStatus');
        if (!select) return;
        const options = getStatusOptions(categoryName, entry);
        const normalizedSelected = String(selectedStatus || '').trim().toLowerCase();
        const safeOptions = options.slice();
        if (normalizedSelected && !safeOptions.some(status => status.trim().toLowerCase() === normalizedSelected)) {
            safeOptions.unshift(String(selectedStatus || '').trim());
        }
        const html = ['<option value="">Status</option>']
            .concat(safeOptions.map(status => `<option value="${status}">${status}</option>`))
            .join('');
        select.innerHTML = html;
        const selectedMatch = safeOptions.find(status => status.trim().toLowerCase() === normalizedSelected);
        if (selectedMatch) select.value = selectedMatch;
    }

    function updateProgressVisibility(entry, categoryName) {
        const state = window.EveLibrary?.State;
        const fallbackType = state?.getCategoryDataType(categoryName || 'Unsorted') || 'graphicNovels';
        const mediaTypes = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length
            ? entry.mediaTypes
            : [fallbackType];

        const hasGraphic = mediaTypes.includes('graphicNovels');
        const hasNovels = mediaTypes.includes('novels');
        const hasFilms = mediaTypes.includes('films');

        const graphicWrap = document.getElementById('bookmarkFocusGraphicWrap');
        const novelWrap = document.getElementById('bookmarkFocusNovelWrap');
        const seasonWrap = document.getElementById('bookmarkFocusSeasonWrap');
        const episodeWrap = document.getElementById('bookmarkFocusEpisodeWrap');

        if (graphicWrap) graphicWrap.style.display = hasGraphic ? 'flex' : 'none';
        if (novelWrap) novelWrap.style.display = hasNovels ? 'flex' : 'none';
        if (seasonWrap) seasonWrap.style.display = hasFilms ? 'flex' : 'none';
        if (episodeWrap) episodeWrap.style.display = hasFilms ? 'flex' : 'none';
    }

    function findLiveLink(linkId) {
        const links = typeof getLiveLinks === 'function'
            ? getLiveLinks()
            : (Array.isArray(window.eveState?.links) ? window.eveState.links : []);
        return (Array.isArray(links) ? links : []).find((link) => String(link?.id) === String(linkId));
    }

    function mergeBookmarkNotesIntoFocusSummary(linkId) {
        const summary = document.getElementById('bookmarkFocusSummary');
        const linkNotes = String(findLiveLink(linkId)?.notes || '').trim();
        if (!summary || !linkNotes || !linkNotes.includes('=== Bookmark Merge ===')) return;
        if (!summary.value.includes(linkNotes)) {
            summary.value = [summary.value.trim(), linkNotes].filter(Boolean).join('\n\n');
        }
        window.EveLibraryNotesSections?.syncFocusFromRaw?.();
    }

    function fillLibraryFields(linkedRecord) {
        const sectionWrap = document.getElementById('bookmarkFocusLibrarySection');
        const fieldsWrap = document.getElementById('bookmarkFocusLibraryFields');
        const missingText = document.getElementById('bookmarkFocusLibraryMissing');
        const categoryLabel = document.getElementById('bookmarkFocusLibraryCategory');

        if (!linkedRecord?.entry) {
            if (sectionWrap) sectionWrap.style.display = 'none';
            if (fieldsWrap) fieldsWrap.style.display = 'none';
            if (missingText) missingText.style.display = 'block';
            if (categoryLabel) categoryLabel.textContent = '';
            setLibraryControlsEnabled(false);
            return null;
        }

        const entry = linkedRecord.entry;
        const categoryName = linkedRecord.connection?.categoryName || 'Unsorted';

        if (sectionWrap) sectionWrap.style.display = 'flex';
        if (fieldsWrap) fieldsWrap.style.display = 'flex';
        if (missingText) missingText.style.display = 'none';
        if (categoryLabel) categoryLabel.textContent = `Category: ${categoryName}`;
        setLibraryControlsEnabled(true);

        renderStatusOptions(categoryName, entry.status || '', entry);

        const rating = document.getElementById('bookmarkFocusRating');
        const graphic = document.getElementById('bookmarkFocusGraphicChapter');
        const novel = document.getElementById('bookmarkFocusNovelChapter');
        const season = document.getElementById('bookmarkFocusSeason');
        const episode = document.getElementById('bookmarkFocusEpisode');
        const summary = document.getElementById('bookmarkFocusSummary');
        const primaryTitle = document.getElementById('bookmarkFocusPrimaryTitle');
        const titleAltNames = document.getElementById('bookmarkFocusTitleAltNames');
        const aliasHint = document.getElementById('bookmarkFocusAliasHint');
        const aliasSection = document.getElementById('bookmarkFocusAliasSection');
        const aliasSummary = document.getElementById('bookmarkFocusAliasSummary');

        if (rating) rating.value = entry.rating || '';
        if (graphic) graphic.value = entry.graphicChapter ?? entry.chapter ?? 0;
        if (novel) novel.value = entry.novelChapter ?? 0;
        if (season) season.value = entry.season ?? 0;
        if (episode) episode.value = entry.episode ?? 0;
        if (summary) summary.value = entry.summary || '';
        window.EveLibraryNotesSections?.syncFocusFromRaw?.();
        mergeBookmarkNotesIntoFocusSummary(linkedRecord?.connection?.linkId || linkedRecord?.linkId);
        if (primaryTitle) primaryTitle.value = entry.title || '';
        if (titleAltNames) {
            const aliases = getEntryTitleAliases(entry);
            titleAltNames.value = aliases.join(', ');
            if (aliasSection) aliasSection.open = false;
            if (aliasSummary) {
                const primary = String(entry.title || '').trim() || 'Untitled';
                aliasSummary.textContent = aliases.length
                    ? `${primary} | ${aliases.length} alias${aliases.length === 1 ? '' : 'es'}`
                    : primary;
            }
            if (aliasHint) {
                aliasHint.textContent = aliases.length
                    ? `${aliases.length} alternate name${aliases.length === 1 ? '' : 's'} attached to this library entry.`
                    : 'No alternate names yet. Add translated, romanized, or source-specific titles here.';
            }
        }

        updateProgressVisibility(entry, categoryName);
        return linkedRecord;
    }

    function loadLinkedRecord(linkId) {
        const api = window.EveLibrary?.ConnectionsAPI;
        if (!api?.getLinkedEntry) {
            fillLibraryFields(null);
            return null;
        }
        const linked = api.getLinkedEntry(linkId);
        return fillLibraryFields(linked);
    }

    Object.assign(ns, {
        loadLinkedRecord
    });
})();
