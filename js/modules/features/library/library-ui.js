/**
 * Library UI Module for Eve OS
 * Main UI controller for category library panels
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const State = window.EveLibrary.State;
    const Storage = window.EveLibrary.Storage;
    const EntryManager = window.EveLibrary.EntryManager;
    const EntriesRenderer = window.EveLibrary.EntriesRenderer;
    const OptionsUpdaters = window.EveLibrary.OptionsUpdaters;
    const StatsRenderer = window.EveLibrary.StatsRenderer;
    const Search = window.EveLibrary.Search;
    const Shared = window.EveLibrary.UIShared || {};

    let currentEditingCategory = null;
    let currentEditingEntryId = null;

    const normalizeListForInput = Shared.normalizeListForInput || function (value) {
        if (!Array.isArray(value)) return String(value || '');
        return value.map(item => String(item || '').trim()).filter(Boolean).join(', ');
    };

    const formatTimestamp = Shared.formatTimestamp || function (value) {
        if (!value) return '-';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
    };

    const formatOptionalScore = Shared.formatOptionalScore || function (value) {
        const n = Number(value);
        return Number.isFinite(n) ? String(n) : '';
    };

    function getPrefix(categoryName) {
        return `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
    }

    function createLibraryPanelHtml(categoryName) {
        if (typeof Shared.createLibraryPanelHtml === 'function') {
            return Shared.createLibraryPanelHtml(categoryName);
        }
        return '<div class="lib-panel-error">Library panel template unavailable.</div>';
    }

    function initLibraryPanel(categoryName) {
        const prefix = getPrefix(categoryName);
        const panel = document.getElementById(prefix + 'panel');
        if (!panel) return;

        panel.innerHTML = createLibraryPanelHtml(categoryName);

        OptionsUpdaters.updateStatusOptions(categoryName);
        OptionsUpdaters.updateGenreOptions(categoryName);
        OptionsUpdaters.updateSortByOptions(categoryName);
        OptionsUpdaters.updateFieldsVisibility(categoryName);

        const ratingScaleSelect = document.getElementById(prefix + 'search-rating-scale');
        const ratingsApi = window.EveLibrary?.Ratings;
        const config = State?.getConfig ? State.getConfig() : null;
        if (ratingScaleSelect && ratingsApi?.getActiveScale) {
            ratingScaleSelect.value = ratingsApi.getActiveScale(config);
        }

        const entriesContainer = document.getElementById(prefix + 'entries');
        EntriesRenderer.renderEntries(categoryName, entriesContainer);
    }

    function toggleLibraryPanel(categoryName) {
        const prefix = getPrefix(categoryName);
        const panel = document.getElementById(prefix + 'panel');
        if (!panel) return;
        const parentCard = panel.closest('.category-card');
        const isFocusedCard = !!parentCard?.classList.contains('is-focus-mode');

        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isFocusedCard) {
            parentCard.classList.toggle('focus-library-only', isHidden);
        }

        if (isHidden) {
            initLibraryPanel(categoryName);
        }
    }

    function toggleStats(categoryName) {
        const prefix = getPrefix(categoryName);
        const entriesView = document.getElementById(prefix + 'entries-view');
        const statsView = document.getElementById(prefix + 'stats-view');

        if (!entriesView || !statsView) return;

        if (statsView.style.display === 'none') {
            entriesView.style.display = 'none';
            statsView.style.display = 'block';
            if (StatsRenderer) {
                StatsRenderer.renderStats(categoryName, statsView);
            } else {
                statsView.innerHTML = '<p>Statistics module not loaded.</p>';
            }
            return;
        }

        statsView.style.display = 'none';
        entriesView.style.display = 'block';
    }

    function refreshLibrary(categoryName) {
        const prefix = getPrefix(categoryName);
        const entriesContainer = document.getElementById(prefix + 'entries');
        OptionsUpdaters.updateGenreOptions(categoryName);
        EntriesRenderer.renderEntries(categoryName, entriesContainer);
    }

    function resetAndRefresh(categoryName) {
        Search.resetFilters(categoryName);
        refreshLibrary(categoryName);
    }

    function changeDataType(categoryName, newType) {
        State.setCategoryDataType(categoryName, newType);
        Storage.saveLibrary();
        initLibraryPanel(categoryName);
    }

    function showAddForm(categoryName) {
        const prefix = getPrefix(categoryName);
        const form = document.getElementById(prefix + 'entry-form');
        const title = document.getElementById(prefix + 'form-title');
        if (!form) return;

        form.style.display = 'block';
        if (title) title.textContent = 'Add New Entry';
        currentEditingCategory = categoryName;
        currentEditingEntryId = null;
        clearForm(categoryName);
    }

    function hideForm(categoryName) {
        const prefix = getPrefix(categoryName);
        const form = document.getElementById(prefix + 'entry-form');
        if (form) form.style.display = 'none';
        currentEditingCategory = null;
        currentEditingEntryId = null;
    }

    function clearForm(categoryName) {
        const prefix = getPrefix(categoryName);

        [
            'title',
            'author',
            'author-alt-names',
            'artist',
            'genre',
            'summary',
            'language',
            'tags',
            'source-url',
            'image-url',
            'api-rating-anilist',
            'api-rating-myanimelist',
            'api-rating-mangadex'
        ].forEach(field => {
            const element = document.getElementById(prefix + field);
            if (element) element.value = '';
        });

        ['chapter', 'season', 'episode'].forEach(field => {
            const element = document.getElementById(prefix + field);
            if (element) element.value = '0';
        });

        const rating = document.getElementById(prefix + 'rating');
        if (rating) rating.value = '';

        const status = document.getElementById(prefix + 'status');
        if (status && status.options.length > 0) status.selectedIndex = 0;

        const dateAddedMeta = document.getElementById(prefix + 'date-added-meta');
        const lastEditedMeta = document.getElementById(prefix + 'last-edited-meta');
        if (dateAddedMeta) dateAddedMeta.textContent = 'Added: -';
        if (lastEditedMeta) lastEditedMeta.textContent = 'Last Edited: -';
    }

    function fillForm(categoryName, entry) {
        const prefix = getPrefix(categoryName);
        const summaryValue = entry?.summary || '';
        const safeSummary = /^Source:\s*https?:\/\//i.test(summaryValue.trim()) ? '' : summaryValue;
        const authorAltNames = Array.isArray(entry?.authorAltNames)
            ? entry.authorAltNames
            : (entry?.authorAltNames ? String(entry.authorAltNames).split(',') : []);

        const setValue = (field, value) => {
            const element = document.getElementById(prefix + field);
            if (element) element.value = value;
        };

        setValue('title', entry?.title || '');
        setValue('author', entry?.author || '');
        setValue('author-alt-names', normalizeListForInput(authorAltNames));
        setValue('artist', normalizeListForInput(entry?.artist));
        setValue('genre', normalizeListForInput(entry?.genre));
        setValue('summary', safeSummary);
        setValue('language', entry?.language || '');
        setValue('tags', normalizeListForInput(entry?.tags));
        setValue('source-url', entry?.sourceUrl || '');
        setValue('image-url', entry?.image || '');
        setValue('chapter', entry?.chapter || 0);
        setValue('season', entry?.season || 0);
        setValue('episode', entry?.episode || 0);
        setValue('rating', entry?.rating || '');
        setValue('api-rating-anilist', formatOptionalScore(entry?.apiRatings?.anilist));
        setValue('api-rating-myanimelist', formatOptionalScore(entry?.apiRatings?.myanimelist));
        setValue('api-rating-mangadex', formatOptionalScore(entry?.apiRatings?.mangadex));
        setValue('status', entry?.status || '');

        const dateAddedMeta = document.getElementById(prefix + 'date-added-meta');
        const lastEditedMeta = document.getElementById(prefix + 'last-edited-meta');
        if (dateAddedMeta) dateAddedMeta.textContent = `Added: ${formatTimestamp(entry?.dateAdded)}`;
        if (lastEditedMeta) {
            lastEditedMeta.textContent = `Last Edited: ${formatTimestamp(entry?.lastEdited || entry?.dateAdded)}`;
        }
    }

    function editEntry(categoryName, entryId) {
        const lib = State.getCategoryLibrary(categoryName);
        const entry = lib.entries.find(item => item.id === entryId);
        if (!entry) return;

        const prefix = getPrefix(categoryName);
        const form = document.getElementById(prefix + 'entry-form');
        const title = document.getElementById(prefix + 'form-title');

        if (!form) return;
        form.style.display = 'block';
        if (title) title.textContent = 'Edit Entry';
        currentEditingCategory = categoryName;
        currentEditingEntryId = entryId;
        fillForm(categoryName, entry);
    }

    function saveEntry(categoryName) {
        if (currentEditingEntryId) {
            EntryManager.editEntry(categoryName, currentEditingEntryId, () => refreshLibrary(categoryName));
        } else {
            EntryManager.addEntry(categoryName, () => refreshLibrary(categoryName));
        }
        hideForm(categoryName);
    }

    async function confirmDeleteEntry(categoryName, entryId) {
        const confirmed = typeof showConfirm === 'function'
            ? await showConfirm('Delete this entry?')
            : confirm('Delete this entry?');

        if (confirmed) {
            EntryManager.deleteEntry(categoryName, entryId, () => refreshLibrary(categoryName));
        }
    }

    function toggleFavorite(categoryName, entryId) {
        EntryManager.toggleFavorite(categoryName, entryId, () => refreshLibrary(categoryName));
    }

    function goToPage(categoryName, page) {
        State.setPage(categoryName, page);
        refreshLibrary(categoryName);
    }

    function exportLibrary(categoryName) {
        Storage.exportCategoryLibrary(categoryName);
    }

    function importLibrary(categoryName, file) {
        Storage.importCategoryLibrary(categoryName, file, (success) => {
            if (success) {
                initLibraryPanel(categoryName);
                if (typeof showToast === 'function') showToast('Library imported successfully!');
            } else if (typeof showToast === 'function') {
                showToast('Import failed. Check file format.', 'error');
            }
        });
    }

    function batchDelete(categoryName) {
        const escapedCategory = categoryName.replace(/"/g, '\\"');
        const checkboxes = document.querySelectorAll(`input.lib-batch-checkbox[data-category="${escapedCategory}"]:checked`);
        const ids = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));

        if (ids.length === 0) {
            if (typeof showToast === 'function') showToast('No entries selected', 'warning');
            return;
        }

        if (confirm(`Delete ${ids.length} entries?`)) {
            EntryManager.batchDelete(categoryName, ids, () => refreshLibrary(categoryName));
        }
    }

    function openLightbox(imageUrl) {
        if (!imageUrl) return;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;cursor:zoom-out;';
        overlay.innerHTML = `<img src="${imageUrl}" style="max-width:90%;max-height:90%;border-radius:4px;">`;
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
    }

    function showBackups() {
        const backups = Storage.getBackups();
        if (!backups || backups.length === 0) {
            if (typeof showToast === 'function') showToast('No local backups found.', 'warning');
            else alert('No local backups found.');
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;flex-direction:column;color:#fff;';

        let html = '<div style="background:#222;padding:20px;border-radius:8px;border:1px solid #444;max-width:400px;width:100%;"><h3>Restore Backup</h3><p style="color:#aaa;font-size:0.9em;margin-bottom:15px;">Warning: This will overwrite ALL library data in ALL categories.</p><ul style="list-style:none;padding:0;margin-bottom:20px;">';

        backups.slice().reverse().forEach((backup) => {
            const date = new Date(backup.timestamp).toLocaleString();
            const originalIndex = backups.indexOf(backup);
            html += `<li style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding:8px 0;">
                        <span>${date}</span>
                        <button onclick="window.EveLibrary.UI.restoreBackup(${originalIndex})" style="background:#4B0082;border:none;color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer;">Restore</button>
                     </li>`;
        });

        html += '</ul><button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:8px;background:#444;border:none;color:#fff;cursor:pointer;border-radius:4px;">Cancel</button></div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
    }

    function restoreBackup(index) {
        if (!confirm('Are you sure? Current data will be lost.')) return;
        if (Storage.restoreBackup(index)) {
            if (typeof showToast === 'function') showToast('Library restored successfully!');
            else alert('Restored!');
            window.location.reload();
            return;
        }
        alert('Failed to restore.');
    }

    function openEntryLink(url) {
        if (!url) return;
        window.open(url, '_blank', 'noopener');
    }

    window.EveLibrary.UI = {
        createLibraryPanelHtml,
        initLibraryPanel,
        toggleLibraryPanel,
        toggleStats,
        refreshLibrary,
        resetAndRefresh,
        changeDataType,
        showAddForm,
        hideForm,
        editEntry,
        saveEntry,
        confirmDeleteEntry,
        toggleFavorite,
        goToPage,
        exportLibrary,
        importLibrary,
        batchDelete,
        openLightbox,
        showBackups,
        restoreBackup,
        openEntryLink
    };

    if (!window.__eveLibraryPanelRealtimeBound) {
        window.__eveLibraryPanelRealtimeBound = true;
        window.addEventListener('eve:library-link-updated', (event) => {
            const detail = event?.detail || {};
            const categoryName = detail.categoryName;
            const workspaceId = String(detail.workspaceId || '');
            const currentWorkspace = typeof State?.getCurrentWorkspaceId === 'function'
                ? String(State.getCurrentWorkspaceId())
                : String((window.eveState?.config?.activeWorkspace || config?.activeWorkspace || ''));
            const entry = detail.entry;
            if (!categoryName || !entry) return;
            if (workspaceId && currentWorkspace && workspaceId !== currentWorkspace) return;

            const prefix = getPrefix(categoryName);
            const panel = document.getElementById(prefix + 'panel');
            if (panel && panel.style.display !== 'none') {
                refreshLibrary(categoryName);
            }

            if (currentEditingCategory === categoryName && String(currentEditingEntryId) === String(entry.id)) {
                fillForm(categoryName, entry);
            }
        });
    }
})();
