window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanelWorkflowActionHelpers) return;

    window.EveLibrary.UIModules.createPanelWorkflowActionHelpers = function createPanelWorkflowActionHelpers(deps) {
        const state = deps.state;
        const State = deps.State;
        const Storage = deps.Storage;
        const EntryManager = deps.EntryManager;
        const forms = deps.forms;
        const refreshLibrary = deps.refreshLibrary || function () {};
        const initLibraryPanel = deps.initLibraryPanel || function () {};

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
                    if (typeof showToast === 'function') showToast('Library imported successfully!', 'success');
                } else if (typeof showToast === 'function') {
                    showToast('Import failed. Check file format.', 'error');
                }
            });
        }

        function batchDelete(categoryName) {
            const escapedCategory = categoryName.replace(/"/g, '\"');
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
                const configWorkspace = typeof config !== 'undefined' && config?.activeWorkspace ? String(config.activeWorkspace) : '';
                const currentWorkspace = typeof State?.getCurrentWorkspaceId === 'function'
                    ? String(State.getCurrentWorkspaceId())
                    : String(window.eveState?.config?.activeWorkspace || configWorkspace || '');
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
            confirmDeleteEntry,
            toggleFavorite,
            goToPage,
            exportLibrary,
            importLibrary,
            batchDelete,
            openEntryLink,
            bindRealtimeUpdates
        };
    };
})();
