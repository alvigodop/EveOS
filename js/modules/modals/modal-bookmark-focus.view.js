// --- BOOKMARK FOCUS MODAL VIEW HELPERS ---
window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;
    if (ns.viewReady) return;
    const MODAL_ID = 'bookmarkFocusModal';

    function toId(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function getLinks() {
        if (window.eveState?.links) return window.eveState.links;
        if (typeof links !== 'undefined' && Array.isArray(links)) return links;
        return [];
    }

    function findLinkById(linkId) {
        const target = toId(linkId);
        return getLinks().find(item => toId(item.id) === target) || null;
    }

    function getCurrentLinkId() {
        return document.getElementById('bookmarkFocusId')?.value || '';
    }

    function ensureModalAvailable() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;
        if (typeof initModals === 'function') {
            initModals();
            modal = document.getElementById(MODAL_ID);
        }
        return modal;
    }

    function openInNewTab(url) {
        const safeUrl = normalizeUrl(String(url || '').trim());
        if (!safeUrl) return;
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
    }

    function refreshHeader(link) {
        const titleElement = document.getElementById('bookmarkFocusTitle');
        const urlElement = document.getElementById('bookmarkFocusUrl');
        if (titleElement) titleElement.textContent = link?.title || 'Untitled';
        if (urlElement) {
            const safeUrl = normalizeUrl(String(link?.url || '').trim());
            urlElement.textContent = safeUrl || '';
            urlElement.href = safeUrl || '#';
        }
    }

    function refreshActionButtons(link) {
        const pinBtn = document.getElementById('bookmarkFocusPinBtn');
        const doneBtn = document.getElementById('bookmarkFocusDoneBtn');
        const isTaskEnabled = typeof window.EveBookmarkFolders?.isTaskEnabledForLink === 'function'
            ? !!window.EveBookmarkFolders.isTaskEnabledForLink(link)
            : true;
        if (pinBtn) {
            const isPinned = !!window.EveQuickPins?.isBookmarkPinned?.(link?.id);
            pinBtn.textContent = isPinned ? 'Unpin' : 'Pin';
        }
        if (doneBtn) {
            doneBtn.style.display = isTaskEnabled ? '' : 'none';
            doneBtn.textContent = link?.done ? 'Mark Pending' : 'Mark Done';
        }
    }

    function setLibraryControlsEnabled(isEnabled) {
        const saveBtn = document.getElementById('bookmarkFocusSaveLibraryBtn');
        const recalibrateBtn = document.getElementById('bookmarkFocusRecalibrateBtn');
        if (saveBtn) saveBtn.disabled = !isEnabled;
        if (recalibrateBtn) recalibrateBtn.disabled = !isEnabled;
    }

    function getStatusOptions(categoryName) {
        const state = window.EveLibrary?.State;
        const fallback = ['Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Read', 'Hiatus'];
        if (!state) return fallback;
        const dataTypeName = state.getCategoryDataType(categoryName || 'Unsorted');
        const dataType = state.getDataType(dataTypeName);
        const options = Array.isArray(dataType?.statuses) ? dataType.statuses : [];
        return options.length ? options : fallback;
    }

    function renderStatusOptions(categoryName, selectedStatus) {
        const select = document.getElementById('bookmarkFocusStatus');
        if (!select) return;
        const options = getStatusOptions(categoryName);
        const normalizedSelected = String(selectedStatus || '').trim().toLowerCase();
        const html = ['<option value="">Status</option>']
            .concat(options.map(status => `<option value="${status}">${status}</option>`))
            .join('');
        select.innerHTML = html;
        const selectedMatch = options.find(status => status.trim().toLowerCase() === normalizedSelected);
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

        renderStatusOptions(categoryName, entry.status || '');

        const rating = document.getElementById('bookmarkFocusRating');
        const graphic = document.getElementById('bookmarkFocusGraphicChapter');
        const novel = document.getElementById('bookmarkFocusNovelChapter');
        const season = document.getElementById('bookmarkFocusSeason');
        const episode = document.getElementById('bookmarkFocusEpisode');
        const summary = document.getElementById('bookmarkFocusSummary');

        if (rating) rating.value = entry.rating || '';
        if (graphic) graphic.value = entry.graphicChapter ?? entry.chapter ?? 0;
        if (novel) novel.value = entry.novelChapter ?? 0;
        if (season) season.value = entry.season ?? 0;
        if (episode) episode.value = entry.episode ?? 0;
        if (summary) summary.value = entry.summary || '';

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
        MODAL_ID,
        toId,
        getLinks,
        findLinkById,
        getCurrentLinkId,
        ensureModalAvailable,
        openInNewTab,
        refreshHeader,
        refreshActionButtons,
        loadLinkedRecord
    });
    ns.viewReady = true;
})();
