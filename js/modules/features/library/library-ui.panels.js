window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanels) return;

    window.EveLibrary.UIModules.createPanels = function createPanels(deps) {
        const state = deps.state;
        const State = deps.State;
        const Storage = deps.Storage;
        const EntryManager = deps.EntryManager;
        const EntriesRenderer = deps.EntriesRenderer;
        const OptionsUpdaters = deps.OptionsUpdaters;
        const StatsRenderer = deps.StatsRenderer;
        const Search = deps.Search;
        const Shared = deps.Shared;
        const forms = deps.forms;

        function createLibraryPanelHtml(categoryName) {
            if (typeof Shared.createLibraryPanelHtml === 'function') {
                return Shared.createLibraryPanelHtml(categoryName);
            }
            return '<div class="lib-panel-error">Library panel template unavailable.</div>';
        }

        function initLibraryPanel(categoryName) {
            const prefix = forms.getPrefix(categoryName);
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
            const prefix = forms.getPrefix(categoryName);
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
            const prefix = forms.getPrefix(categoryName);
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
            const prefix = forms.getPrefix(categoryName);
            const entriesContainer = document.getElementById(prefix + 'entries');
            const statsView = document.getElementById(prefix + 'stats-view');
            OptionsUpdaters.updateGenreOptions(categoryName);
            EntriesRenderer.renderEntries(categoryName, entriesContainer);

            if (statsView && statsView.style.display !== 'none' && StatsRenderer) {
                StatsRenderer.renderStats(categoryName, statsView);
            }
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

        function bindRealtimeUpdates() {
            if (window.__eveLibraryPanelRealtimeBound) return;
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

                const prefix = forms.getPrefix(categoryName);
                const panel = document.getElementById(prefix + 'panel');
                if (panel && panel.style.display !== 'none') {
                    refreshLibrary(categoryName);
                }

                if (state.currentEditingCategory === categoryName && String(state.currentEditingEntryId) === String(entry.id)) {
                    forms.fillForm(categoryName, entry);
                }
            });
        }

        return {
            createLibraryPanelHtml,
            initLibraryPanel,
            toggleLibraryPanel,
            toggleStats,
            refreshLibrary,
            resetAndRefresh,
            changeDataType,
            confirmDeleteEntry,
            toggleFavorite,
            goToPage,
            exportLibrary,
            importLibrary,
            batchDelete,
            openLightbox,
            showBackups,
            restoreBackup,
            openEntryLink,
            bindRealtimeUpdates
        };
    };
})();
