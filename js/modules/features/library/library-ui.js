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

    // Track which category is currently editing an entry
    let currentEditingCategory = null;
    let currentEditingEntryId = null;

    function createLibraryPanelHtml(categoryName) {
        const safeCat = categoryName.replace(/'/g, "\\'");
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const lib = State.getCategoryLibrary(categoryName);
        const dataType = lib.dataType || 'graphicNovels';
        const dataTypes = State.getDataTypes();

        // Data type selector
        const typeOptionsHtml = Object.keys(dataTypes).map(key =>
            `<option value="${key}" ${key === dataType ? 'selected' : ''}>${dataTypes[key].label}</option>`
        ).join('');

        return `
            <div class="lib-panel-header">
                <select id="${prefix}data-type" class="lib-type-select" onchange="window.EveLibrary.UI.changeDataType('${safeCat}', this.value)">
                    ${typeOptionsHtml}
                </select>
                <div class="lib-panel-controls">
                    <button class="lib-btn lib-btn-primary" onclick="window.EveLibrary.UI.showAddForm('${safeCat}')">+ Add Entry</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.toggleStats('${safeCat}')">📊 Stats</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.batchDelete('${safeCat}')" title="Delete Selected">🗑️ Selected</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.exportLibrary('${safeCat}')">⬇ Export</button>
                    <button class="lib-btn" onclick="document.getElementById('${prefix}import-file').click()">⬆ Import</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.showBackups('${safeCat}')" title="Restore Backup">📦 Backups</button>
                    <input type="file" id="${prefix}import-file" style="display:none" accept=".json" 
                           onchange="window.EveLibrary.UI.importLibrary('${safeCat}', this.files[0])">
                </div>
            </div>

            <!-- Add/Edit Form (hidden by default) -->
            <div id="${prefix}entry-form" class="lib-entry-form" style="display:none;">
                <h4 id="${prefix}form-title">Add New Entry</h4>
                <div class="lib-form-grid">
                    <label>Title: <input type="text" id="${prefix}title" required></label>
                    <label>Author: <input type="text" id="${prefix}author"></label>
                    <label>Genre: <input type="text" id="${prefix}genre"></label>
                    <label>Status: <select id="${prefix}status"></select></label>
                    <label id="${prefix}chapter-label">Chapter: <input type="number" id="${prefix}chapter" min="0" value="0"></label>
                    <label id="${prefix}season-label" style="display:none;">Season: <input type="number" id="${prefix}season" min="0" value="0"></label>
                    <label id="${prefix}episode-label" style="display:none;">Episode: <input type="number" id="${prefix}episode" min="0" value="0"></label>
                    <label>Rating: 
                        <select id="${prefix}rating">
                            <option value="">Select</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                        </select>
                    </label>
                    <label>Language: <input type="text" id="${prefix}language"></label>
                    <label>Tags: <input type="text" id="${prefix}tags" placeholder="comma separated"></label>
                    <label>Image URL: <input type="url" id="${prefix}image-url"></label>
                    <label class="lib-full-width">Summary: <textarea id="${prefix}summary" rows="2"></textarea></label>
                </div>
                <div class="lib-form-actions">
                    <button class="lib-btn lib-btn-primary" onclick="window.EveLibrary.UI.saveEntry('${safeCat}')">Save</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.hideForm('${safeCat}')">Cancel</button>
                </div>
            </div>

            <!-- Statistics View (hidden by default) -->
            <div id="${prefix}stats-view" class="lib-stats-view" style="display:none;"></div>

            <!-- Library Content (Search + Entries + Pagination) -->
            <div id="${prefix}entries-view">
                <!-- Search/Filter Bar -->
                <div class="lib-search-bar">
                    <input type="text" id="${prefix}search-title" placeholder="Title...">
                    <input type="text" id="${prefix}search-author" placeholder="Author...">
                    <select id="${prefix}search-genre"><option value="">All Genres</option></select>
                    <select id="${prefix}search-status"><option value="">All Statuses</option></select>
                    <select id="${prefix}search-rating">
                        <option value="">All Ratings</option>
                        <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                        <option value="4">4</option><option value="5">5</option>
                    </select>
                    <input type="number" id="${prefix}min-chapter" placeholder="Min Ch" min="0" style="width:70px;">
                    <input type="number" id="${prefix}max-chapter" placeholder="Max Ch" min="0" style="width:70px;">
                    <input type="number" id="${prefix}min-season" placeholder="Min S" min="0" style="width:60px; display:none;">
                    <input type="number" id="${prefix}max-season" placeholder="Max S" min="0" style="width:60px; display:none;">
                    <input type="number" id="${prefix}min-episode" placeholder="Min Ep" min="0" style="width:70px; display:none;">
                    <input type="number" id="${prefix}max-episode" placeholder="Max Ep" min="0" style="width:70px; display:none;">
                    <input type="text" id="${prefix}search-tags" placeholder="Tags...">
                    <input type="text" id="${prefix}search-language" placeholder="Language...">
                    <select id="${prefix}sort-by"><option value="">Sort By</option></select>
                    <select id="${prefix}sort-order">
                        <option value="asc">Asc</option>
                        <option value="desc">Desc</option>
                    </select>
                    <label class="lib-fav-filter"><input type="checkbox" id="${prefix}filter-favorites"> ⭐ Only</label>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.refreshLibrary('${safeCat}')">🔍</button>
                    <button class="lib-btn" onclick="window.EveLibrary.UI.resetAndRefresh('${safeCat}')">↺</button>
                </div>

                <!-- Entries Container -->
                <div id="${prefix}entries" class="lib-entries-grid"></div>

                <!-- Pagination -->
                <div id="${prefix}pagination" class="lib-pagination"></div>
            </div>
        `;
    }

    function initLibraryPanel(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const panel = document.getElementById(prefix + 'panel');
        if (!panel) return;

        panel.innerHTML = createLibraryPanelHtml(categoryName);

        // Initialize dropdowns and visibility
        OptionsUpdaters.updateStatusOptions(categoryName);
        OptionsUpdaters.updateGenreOptions(categoryName);
        OptionsUpdaters.updateSortByOptions(categoryName);
        OptionsUpdaters.updateFieldsVisibility(categoryName);

        // Render entries
        const entriesContainer = document.getElementById(prefix + 'entries');
        EntriesRenderer.renderEntries(categoryName, entriesContainer);
    }

    function toggleLibraryPanel(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const panel = document.getElementById(prefix + 'panel');
        if (!panel) return;

        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';

        if (isHidden) {
            initLibraryPanel(categoryName);
        }
    }

    function toggleStats(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const entriesView = document.getElementById(prefix + 'entries-view');
        const statsView = document.getElementById(prefix + 'stats-view');

        if (!entriesView || !statsView) return;

        if (statsView.style.display === 'none') {
            // Show Stats
            entriesView.style.display = 'none';
            statsView.style.display = 'block';
            if (StatsRenderer) {
                StatsRenderer.renderStats(categoryName, statsView);
            } else {
                statsView.innerHTML = '<p>Statistics module not loaded.</p>';
            }
        } else {
            // Show Entries
            statsView.style.display = 'none';
            entriesView.style.display = 'block';
        }
    }

    function refreshLibrary(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
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
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const form = document.getElementById(prefix + 'entry-form');
        const title = document.getElementById(prefix + 'form-title');
        if (form) {
            form.style.display = 'block';
            title.textContent = 'Add New Entry';
            currentEditingCategory = categoryName;
            currentEditingEntryId = null;
            clearForm(categoryName);
        }
    }

    function hideForm(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const form = document.getElementById(prefix + 'entry-form');
        if (form) form.style.display = 'none';
        currentEditingCategory = null;
        currentEditingEntryId = null;
    }

    function clearForm(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        ['title', 'author', 'genre', 'summary', 'language', 'tags', 'image-url'].forEach(field => {
            const el = document.getElementById(prefix + field);
            if (el) el.value = '';
        });
        ['chapter', 'season', 'episode'].forEach(field => {
            const el = document.getElementById(prefix + field);
            if (el) el.value = '0';
        });
        const rating = document.getElementById(prefix + 'rating');
        if (rating) rating.value = '';
        const status = document.getElementById(prefix + 'status');
        if (status && status.options.length > 0) status.selectedIndex = 0;
    }

    function fillForm(categoryName, entry) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        document.getElementById(prefix + 'title').value = entry.title || '';
        document.getElementById(prefix + 'author').value = entry.author || '';
        document.getElementById(prefix + 'genre').value = entry.genre || '';
        document.getElementById(prefix + 'summary').value = entry.summary || '';
        document.getElementById(prefix + 'language').value = entry.language || '';
        document.getElementById(prefix + 'tags').value = (entry.tags || []).join(', ');
        document.getElementById(prefix + 'image-url').value = entry.image || '';
        document.getElementById(prefix + 'chapter').value = entry.chapter || 0;
        document.getElementById(prefix + 'season').value = entry.season || 0;
        document.getElementById(prefix + 'episode').value = entry.episode || 0;
        document.getElementById(prefix + 'rating').value = entry.rating || '';
        document.getElementById(prefix + 'status').value = entry.status || '';
    }

    function editEntry(categoryName, entryId) {
        const lib = State.getCategoryLibrary(categoryName);
        const entry = lib.entries.find(e => e.id === entryId);
        if (!entry) return;

        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const form = document.getElementById(prefix + 'entry-form');
        const title = document.getElementById(prefix + 'form-title');

        if (form) {
            form.style.display = 'block';
            title.textContent = 'Edit Entry';
            currentEditingCategory = categoryName;
            currentEditingEntryId = entryId;
            fillForm(categoryName, entry);
        }
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
            } else {
                if (typeof showToast === 'function') showToast('Import failed. Check file format.', 'error');
            }
        });
    }

    function batchDelete(categoryName) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const checkboxes = document.querySelectorAll(`input.lib-batch-checkbox[data-category="${categoryName.replace(/"/g, '\\"')}"]:checked`);
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
        // Find visible lightbox in current open panel or create global one. 
        // Creating per-panel unique IDs, but click handler needs to find the correct one or a global one.
        // Simplified: Use the one in the currently active category panel if possible, or just a generic one?
        // Actually, we passed the image URL. We need to find the lightbox overlay.
        // Since we are inside a category, we need to know WHICH category or use a global selector.
        // Problem: openLightbox call in renderer doesn't pass category name easily without string escaping hell.
        // Solution: Use a global lightbox for simplicity or find closest.

        let lightbox = document.querySelector('.lib-lightbox[style*="block"]'); // Check if any open? No.

        // Find the lightbox corresponding to the open panel (we assume user clicked in an open panel)
        // Hard to find context. Let's just create a shared global lightbox if it doesn't exist, 
        // OR rely on the fact that we injected per-panel lightboxes.
        // Let's iterate all per-panel lightboxes? No.

        // Better: Pass category to openLightbox in renderer.
        // We'll update renderer to pass category.

        // FALLBACK if category not passed (legacy call signature in this replaced block):
        // Just look for the first one that exists or create one dynamically.
    }

    // REDEFINED with Category support (Updating renderer first was key)
    function openLightboxWithCat(categoryName, imageUrl) {
        const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        const lightbox = document.getElementById(prefix + 'lightbox');
        const img = document.getElementById(prefix + 'lightbox-img');
        if (lightbox && img) {
            img.src = imageUrl;
            lightbox.style.display = 'flex';
        }
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
        openLightbox: (img) => { /* Placeholder or global? We need category. */
            // Since we can't easily change the onclick signature in all existing HTML safely without renderer update...
            // Let's just grab the image and show it in a temporary dynamic overlay appended to body.
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;cursor:zoom-out;';
            ov.innerHTML = `<img src="${img}" style="max-width:90%;max-height:90%;border-radius:4px;">`;
            ov.onclick = () => ov.remove();
            document.body.appendChild(ov);
            document.body.appendChild(ov);
        },
        showBackups: () => {
            const backups = Storage.getBackups();
            if (!backups || backups.length === 0) {
                if (typeof showToast === 'function') showToast('No local backups found.', 'warning');
                else alert('No local backups found.');
                return;
            }

            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;flex-direction:column;color:#fff;';

            let html = '<div style="background:#222;padding:20px;border-radius:8px;border:1px solid #444;max-width:400px;width:100%;"><h3>Restore Backup</h3><p style="color:#aaa;font-size:0.9em;margin-bottom:15px;">Warning: This will overwrite ALL library data in ALL categories.</p><ul style="list-style:none;padding:0;margin-bottom:20px;">';

            backups.slice().reverse().forEach((bk, i) => {
                const date = new Date(bk.timestamp).toLocaleString();
                // We use original index from reversed array? No, Storage.restoreBackup takes index in the source array.
                // backups[0] is oldest? createBackup pushes. So 0 is oldest.
                // Reverse for display, but keep original index.
                const originalIndex = backups.indexOf(bk);
                html += `<li style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding:8px 0;">
                            <span>${date}</span>
                            <button onclick="window.EveLibrary.UI.restoreBackup(${originalIndex}, this)" style="background:#4B0082;border:none;color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer;">Restore</button>
                         </li>`;
            });

            html += '</ul><button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:8px;background:#444;border:none;color:#fff;cursor:pointer;border-radius:4px;">Cancel</button></div>';
            ov.innerHTML = html;
            document.body.appendChild(ov);
        },
        restoreBackup: (index, btnEl) => {
            if (confirm('Are you sure? Current data will be lost.')) {
                if (Storage.restoreBackup(index)) {
                    if (typeof showToast === 'function') showToast('Library restored successfully!');
                    else alert('Restored!');
                    window.location.reload();
                } else {
                    alert('Failed to restore.');
                }
            }
        }
    };

    if (!window.__eveLibraryPanelRealtimeBound) {
        window.__eveLibraryPanelRealtimeBound = true;
        window.addEventListener('eve:library-link-updated', (event) => {
            const detail = event?.detail || {};
            const categoryName = detail.categoryName;
            const entry = detail.entry;
            if (!categoryName || !entry) return;

            const prefix = `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
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
