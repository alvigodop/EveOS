window.tempSources = []; // Store sources temporarily while editing

function getConnectionsApi() {
    return window.EveLibrary?.ConnectionsAPI || null;
}

function getLibraryFormToggle() {
    return document.getElementById('linkLibraryToggle');
}

function getLibraryFieldsContainer() {
    return document.getElementById('linkLibraryFields');
}

function setLibraryFieldsVisibility(isVisible) {
    const container = getLibraryFieldsContainer();
    if (container) {
        container.style.display = isVisible ? 'block' : 'none';
    }
}

function readLibraryFormPatch() {
    const toInt = (id) => {
        const raw = document.getElementById(id)?.value;
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const mediaTypes = [];
    if (document.getElementById('libTypeGraphic')?.checked) mediaTypes.push('graphicNovels');
    if (document.getElementById('libTypeFilms')?.checked) mediaTypes.push('films');
    if (document.getElementById('libTypeNovels')?.checked) mediaTypes.push('novels');

    return {
        author: document.getElementById('libAuthor')?.value.trim() || '',
        genre: document.getElementById('libGenre')?.value.trim() || '',
        status: document.getElementById('libStatus')?.value || '',
        rating: document.getElementById('libRating')?.value || '',
        graphicChapter: toInt('libGraphicChapter'),
        novelChapter: toInt('libNovelChapter'),
        season: toInt('libSeason'),
        episode: toInt('libEpisode'),
        language: document.getElementById('libLanguage')?.value.trim() || '',
        sourceUrl: normalizeUrl(document.getElementById('libSourceUrl')?.value.trim() || ''),
        image: document.getElementById('libImageUrl')?.value.trim() || '',
        tags: (document.getElementById('libTags')?.value || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
        summary: document.getElementById('libSummary')?.value.trim() || '',
        mediaTypes
    };
}

function isAutoSourceSummary(summaryValue) {
    if (!summaryValue) return false;
    return /^Source:\s*https?:\/\//i.test(String(summaryValue).trim());
}

function fillLibraryForm(entry) {
    const mediaTypes = Array.isArray(entry?.mediaTypes) && entry.mediaTypes.length > 0
        ? entry.mediaTypes
        : ['graphicNovels'];
    document.getElementById('libTypeGraphic').checked = mediaTypes.includes('graphicNovels');
    document.getElementById('libTypeFilms').checked = mediaTypes.includes('films');
    document.getElementById('libTypeNovels').checked = mediaTypes.includes('novels');
    document.getElementById('libAuthor').value = entry?.author || '';
    document.getElementById('libGenre').value = entry?.genre || '';
    document.getElementById('libStatus').value = entry?.status || '';
    document.getElementById('libRating').value = entry?.rating || '';
    document.getElementById('libGraphicChapter').value = entry?.graphicChapter ?? entry?.chapter ?? 0;
    document.getElementById('libNovelChapter').value = entry?.novelChapter ?? entry?.chapter ?? 0;
    document.getElementById('libSeason').value = entry?.season ?? 0;
    document.getElementById('libEpisode').value = entry?.episode ?? 0;
    document.getElementById('libLanguage').value = entry?.language || '';
    document.getElementById('libSourceUrl').value = entry?.sourceUrl || document.getElementById('newUrl')?.value || '';
    document.getElementById('libImageUrl').value = entry?.image || entry?.imageUrl || '';
    document.getElementById('libTags').value = Array.isArray(entry?.tags) ? entry.tags.join(', ') : '';
    const summaryValue = entry?.summary || '';
    document.getElementById('libSummary').value = isAutoSourceSummary(summaryValue) ? '' : summaryValue;
    const addedMeta = document.getElementById('libDateAddedMeta');
    const editedMeta = document.getElementById('libLastEditedMeta');
    if (addedMeta) addedMeta.textContent = `Added: ${formatLibraryTimestamp(entry?.dateAdded)}`;
    if (editedMeta) editedMeta.textContent = `Last Edited: ${formatLibraryTimestamp(entry?.lastEdited || entry?.dateAdded)}`;
    updateLibraryProgressFieldVisibility();
}

function resetLibraryForm() {
    document.getElementById('libTypeGraphic').checked = true;
    document.getElementById('libTypeFilms').checked = false;
    document.getElementById('libTypeNovels').checked = false;
    fillLibraryForm(null);
}

function formatLibraryTimestamp(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function refreshLibraryStatusOptions(categoryName) {
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
    updateLibraryProgressFieldVisibility(categoryName);
}

function updateLibraryProgressFieldVisibility(categoryName) {
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
}

function setupLibraryToggleHandlers() {
    const toggle = getLibraryFormToggle();
    const categoryInput = document.getElementById('newCategory');
    const bookmarkUrlInput = document.getElementById('newUrl');
    const libraryUrlInput = document.getElementById('libSourceUrl');
    const typeGraphic = document.getElementById('libTypeGraphic');
    const typeFilms = document.getElementById('libTypeFilms');
    const typeNovels = document.getElementById('libTypeNovels');
    if (toggle) {
        toggle.onchange = () => setLibraryFieldsVisibility(!!toggle.checked);
    }
    const onTypesChanged = () => updateLibraryProgressFieldVisibility(categoryInput?.value?.trim() || 'Unsorted');
    if (typeGraphic) typeGraphic.onchange = onTypesChanged;
    if (typeFilms) typeFilms.onchange = onTypesChanged;
    if (typeNovels) typeNovels.onchange = onTypesChanged;
    if (categoryInput) {
        categoryInput.oninput = () => {
            const categoryName = categoryInput.value.trim() || 'Unsorted';
            refreshLibraryStatusOptions(categoryName);
            updateLibraryProgressFieldVisibility(categoryName);
        };
    }
    if (bookmarkUrlInput && libraryUrlInput) {
        let liveSyncTimer = null;
        const pushLiveSourceUrlToLinkedEntry = () => {
            const editId = document.getElementById('editId')?.value;
            if (!editId) return;
            const api = getConnectionsApi();
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
}

function loadLibraryStateForLink(linkId, categoryName) {
    const toggle = getLibraryFormToggle();
    if (!toggle) return;
    const api = getConnectionsApi();
    refreshLibraryStatusOptions(categoryName);

    const linked = api?.getLinkedEntry?.(linkId);
    if (linked?.entry) {
        toggle.checked = true;
        setLibraryFieldsVisibility(true);
        fillLibraryForm(linked.entry);
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
    setLibraryFieldsVisibility(false);
    resetLibraryForm();
}

function saveLibraryLinkState(linkId, categoryName, title, url) {
    const toggle = getLibraryFormToggle();
    const shouldLink = !!toggle?.checked;
    const api = getConnectionsApi();
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
    const patch = readLibraryFormPatch();
    if (!patch.mediaTypes || patch.mediaTypes.length === 0) {
        patch.mediaTypes = ['graphicNovels'];
    }
    // Backward compatibility for existing library views that still read `chapter`.
    patch.chapter = patch.graphicChapter || patch.novelChapter || 0;
    patch.title = title;
    if (!patch.sourceUrl && url) patch.sourceUrl = normalizeUrl(url);
    api.updateLinkedEntry?.(linkId, patch);
}

window.openAddModal = function () {
    refreshCategoryDatalist();
    document.getElementById('modalTitle').innerText = "Add Link";
    document.getElementById('editId').value = "";
    document.getElementById('newTitle').value = "";
    document.getElementById('newUrl').value = "";
    document.getElementById('newCategory').value = "";
    document.getElementById('newPriority').value = "";
    document.getElementById('newIcon').value = "";

    // Reset Sources
    window.tempSources = [];
    renderSourcesList();
    document.getElementById('edit-link-search-results').style.display = 'none';

    // Reset library link controls for add flow
    setupLibraryToggleHandlers();
    refreshLibraryStatusOptions('Unsorted');
    const toggle = getLibraryFormToggle();
    if (toggle) toggle.checked = false;
    setLibraryFieldsVisibility(false);
    resetLibraryForm();

    document.getElementById('addModal').style.display = 'flex';
    document.getElementById('newTitle').focus();
};

window.openEdit = function (id) {
    const l = links.find(x => x.id === id);
    if (!l) return;
    refreshCategoryDatalist();
    document.getElementById('modalTitle').innerText = "Edit Link";
    document.getElementById('editId').value = l.id;
    document.getElementById('newTitle').value = l.title;
    document.getElementById('newUrl').value = l.url;
    document.getElementById('newCategory').value = l.category;
    document.getElementById('newPriority').value = l.priority || "";
    document.getElementById('newIcon').value = l.icon || "";

    // Load Sources
    window.tempSources = l.sources ? [...l.sources] : [];
    renderSourcesList();
    document.getElementById('edit-link-search-results').style.display = 'none';

    setupLibraryToggleHandlers();
    loadLibraryStateForLink(l.id, l.category || 'Unsorted');

    document.getElementById('addModal').style.display = 'flex';
};

window.saveLink = function () {
    const title = document.getElementById('newTitle').value.trim();
    const url = normalizeUrl(document.getElementById('newUrl').value);
    const cat = document.getElementById('newCategory').value.trim() || "Unsorted";
    const prio = document.getElementById('newPriority').value;
    const icon = document.getElementById('newIcon').value.trim();

    if (!title || !url) return showToast("Missing Info", "warning");

    let targetId = null;
    const editId = document.getElementById('editId').value;
    if (editId) {
        // Edit existing
        const idx = links.findIndex(l => l.id == editId);
        if (idx > -1) {
            links[idx].title = title;
            links[idx].url = url;
            links[idx].category = cat;
            links[idx].priority = prio;
            if (icon) links[idx].icon = icon;
            links[idx].sources = [...window.tempSources]; // Save sources
            targetId = links[idx].id;
        }
    } else {
        // Add new
        const newId = Date.now();
        links.push({
            id: newId,
            title,
            url,
            category: cat,
            icon: icon || '🔗',
            done: false,
            pinned: false,
            priority: prio,
            workspace: config.activeWorkspace,
            sources: [...window.tempSources] // Save sources
        });
        targetId = newId;
    }

    saveData();

    if (targetId) {
        saveLibraryLinkState(targetId, cat, title, url);
        if (editId && window.EveLibrary?.ConnectionsAPI?.syncFromLink) {
            window.EveLibrary.ConnectionsAPI.syncFromLink(editId);
        }
    }

    closeModals();
    showToast("Link Saved", "success");
};

window.handleEnter = function (e) { if (e.key === 'Enter') saveLink(); };

// --- Sources Logic ---

if (!window.__eveLibraryBookmarkModalRealtimeBound) {
    window.__eveLibraryBookmarkModalRealtimeBound = true;
    window.addEventListener('eve:library-link-updated', (event) => {
        const detail = event?.detail || {};
        const editId = document.getElementById('editId')?.value;
        const modalOpen = document.getElementById('addModal')?.style?.display === 'flex';
        if (!modalOpen || !editId) return;
        if (String(detail.linkId) !== String(editId)) return;

        const entry = detail.entry || null;
        if (!entry) return;

        const toggle = getLibraryFormToggle();
        if (toggle) toggle.checked = true;
        setLibraryFieldsVisibility(true);
        fillLibraryForm(entry);
        const titleField = document.getElementById('newTitle');
        if (titleField && !titleField.matches(':focus')) {
            titleField.value = entry.title || titleField.value;
        }
        const urlField = document.getElementById('newUrl');
        if (urlField && !urlField.matches(':focus') && entry.sourceUrl) {
            urlField.value = entry.sourceUrl;
        }
    });
}
