// --- BOOKMARK FOCUS MODAL HELPERS ---
window.EveBookmarkFocus = window.EveBookmarkFocus || {};

(function () {
    const ns = window.EveBookmarkFocus;
    if (ns.helpersReady) return;
    const MODAL_ID = 'bookmarkFocusModal';
    const EMPTY_API_RATINGS = {
        anilist: null,
        myanimelist: null,
        mangadex: null
    };

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

    function parseIntOrZero(value) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function normalizeList(values) {
        const formApi = window.EveLinkForm || {};
        if (Array.isArray(values)) {
            return values
                .map(item => String(item || '').trim())
                .filter(Boolean);
        }
        if (typeof formApi.parseUniqueCsvList === 'function') {
            return formApi.parseUniqueCsvList(values || '');
        }
        return String(values || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }

    function mergeUnique(existing, incoming) {
        const formApi = window.EveLinkForm || {};
        if (typeof formApi.mergeUniqueValues === 'function') {
            return formApi.mergeUniqueValues(existing || [], incoming || []);
        }
        const seen = new Set();
        return [...(existing || []), ...(incoming || [])]
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
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
        if (pinBtn) {
            pinBtn.textContent = link?.pinned ? 'Unpin' : 'Pin';
        }
        if (doneBtn) {
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
        const fallback = ['Reading', 'Completed', 'Plan to Read'];
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

    function buildLibraryPatch(entry) {
        const status = document.getElementById('bookmarkFocusStatus')?.value || '';
        const rating = document.getElementById('bookmarkFocusRating')?.value || '';
        const graphicChapter = parseIntOrZero(document.getElementById('bookmarkFocusGraphicChapter')?.value);
        const novelChapter = parseIntOrZero(document.getElementById('bookmarkFocusNovelChapter')?.value);
        const season = parseIntOrZero(document.getElementById('bookmarkFocusSeason')?.value);
        const episode = parseIntOrZero(document.getElementById('bookmarkFocusEpisode')?.value);
        const summary = document.getElementById('bookmarkFocusSummary')?.value.trim() || '';

        const patch = {
            status,
            rating,
            graphicChapter,
            novelChapter,
            season,
            episode,
            chapter: graphicChapter > 0 ? graphicChapter : novelChapter,
            summary
        };

        if (Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length) {
            patch.mediaTypes = entry.mediaTypes.slice();
        }

        return patch;
    }

    function getSafeApiRatings(value) {
        const ratingsApi = window.EveLibrary?.Ratings;
        if (ratingsApi?.sanitizeApiRatings) {
            return ratingsApi.sanitizeApiRatings(value);
        }
        return {
            ...EMPTY_API_RATINGS,
            ...(value || {})
        };
    }

    function buildMetadataPatch(link, entry) {
        const formApi = window.EveLinkForm || {};
        const ratingsApi = window.EveLibrary?.Ratings;
        const sources = Array.isArray(link?.sources) ? link.sources : [];

        let authors = mergeUnique(normalizeList(entry?.author ? [entry.author] : []), normalizeList(entry?.authorAltNames));
        let artists = normalizeList(entry?.artist);
        let genres = normalizeList(entry?.genre);
        let tags = normalizeList(entry?.tags);
        let language = String(entry?.language || '').trim();
        let sourceUrl = String(entry?.sourceUrl || '').trim();
        let image = String(entry?.image || entry?.imageUrl || '').trim();
        let sourceStatus = '';
        let apiRatings = getSafeApiRatings(entry?.apiRatings);

        sources.forEach(source => {
            const metadata = typeof formApi.buildSourceMetadata === 'function'
                ? formApi.buildSourceMetadata(source)
                : null;
            if (!metadata) return;

            authors = mergeUnique(authors, normalizeList(metadata.authors));
            artists = mergeUnique(artists, normalizeList(metadata.artists));
            genres = mergeUnique(genres, normalizeList(metadata.genres));
            tags = mergeUnique(tags, normalizeList(metadata.tags));

            if (!language && metadata.language) language = String(metadata.language).trim();
            if (!sourceUrl && metadata.sourceUrl) sourceUrl = String(metadata.sourceUrl).trim();
            if (!image && metadata.imageUrl) image = String(metadata.imageUrl).trim();
            if (!sourceStatus && metadata.status) sourceStatus = String(metadata.status).trim();

            if (ratingsApi?.mergeApiRatings) {
                apiRatings = ratingsApi.mergeApiRatings(apiRatings, metadata.apiRatings || EMPTY_API_RATINGS);
            }
        });

        if (ratingsApi?.extractApiRatingsFromSources && ratingsApi?.mergeApiRatings) {
            const extracted = ratingsApi.extractApiRatingsFromSources(sources);
            apiRatings = ratingsApi.mergeApiRatings(apiRatings, extracted);
        }

        const currentAuthor = String(entry?.author || '').trim();
        const author = currentAuthor || authors[0] || '';
        const authorKey = author.toLowerCase();
        const authorAltNames = mergeUnique(
            normalizeList(entry?.authorAltNames),
            authors.filter(item => String(item || '').trim().toLowerCase() !== authorKey)
        );

        const patch = {
            author,
            authorAltNames,
            artist: artists.join(', '),
            genre: genres.join(', '),
            tags,
            language,
            sourceUrl: sourceUrl || normalizeUrl(String(link?.url || '').trim()),
            image,
            apiRatings
        };

        if (!String(entry?.status || '').trim() && sourceStatus) {
            patch.status = sourceStatus;
        }

        return patch;
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
        loadLinkedRecord,
        buildLibraryPatch,
        buildMetadataPatch
    });
    ns.helpersReady = true;
})();
