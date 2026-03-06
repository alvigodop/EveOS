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
        const confirmAsync = typeof deps?.confirmAsync === 'function'
            ? deps.confirmAsync
            : async function (message) {
                if (typeof showConfirm === 'function') return showConfirm(message);
                return typeof confirm === 'function' ? confirm(message) : false;
            };
        const confirmSync = typeof deps?.confirmSync === 'function'
            ? deps.confirmSync
            : function (message) {
                return typeof confirm === 'function' ? confirm(message) : false;
            };
        const notify = typeof deps?.notify === 'function'
            ? deps.notify
            : function (message, type) {
                if (typeof showToast === 'function') showToast(message, type);
            };
        const queryAll = typeof deps?.queryAll === 'function'
            ? deps.queryAll
            : function (selector) {
                return document.querySelectorAll(selector);
            };
        const openUrl = typeof deps?.openUrl === 'function'
            ? deps.openUrl
            : function (url) {
                window.open(url, '_blank', 'noopener');
            };
        const addWindowListener = typeof deps?.addWindowListener === 'function'
            ? deps.addWindowListener
            : function (eventName, handler) {
                window.addEventListener(eventName, handler);
            };
        const getConfigWorkspaceId = typeof deps?.getConfigWorkspaceId === 'function'
            ? deps.getConfigWorkspaceId
            : function () {
                return typeof config !== 'undefined' && config?.activeWorkspace
                    ? String(config.activeWorkspace)
                    : '';
            };
        const getActiveWorkspaceId = typeof deps?.getActiveWorkspaceId === 'function'
            ? deps.getActiveWorkspaceId
            : function () {
                if (typeof State?.getCurrentWorkspaceId === 'function') {
                    return String(State.getCurrentWorkspaceId());
                }
                return String(window.eveState?.config?.activeWorkspace || getConfigWorkspaceId() || '');
            };
        const getDocument = typeof deps?.getDocument === 'function'
            ? deps.getDocument
            : function () { return document; };

        async function confirmDeleteEntry(categoryName, entryId) {
            const confirmed = await confirmAsync('Delete this entry?');
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
                    notify('Library imported successfully!', 'success');
                } else {
                    notify('Import failed. Check file format.', 'error');
                }
            });
        }

        function batchDelete(categoryName) {
            const escapedCategory = categoryName.replace(/"/g, '\"');
            const checkboxes = queryAll(`input.lib-batch-checkbox[data-category="${escapedCategory}"]:checked`);
            const ids = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
            if (ids.length === 0) {
                notify('No entries selected', 'warning');
                return;
            }
            if (confirmSync(`Delete ${ids.length} entries?`)) {
                EntryManager.batchDelete(categoryName, ids, () => refreshLibrary(categoryName));
            }
        }

        function openEntryLink(url) {
            if (!url) return;
            openUrl(url);
        }

        function bindRealtimeUpdates() {
            if (window.__eveLibraryPanelRealtimeBound) return;
            window.__eveLibraryPanelRealtimeBound = true;
            addWindowListener('eve:library-link-updated', (event) => {
                const detail = event?.detail || {};
                const categoryName = detail.categoryName;
                const workspaceId = String(detail.workspaceId || '');
                const currentWorkspace = getActiveWorkspaceId();
                const entry = detail.entry;
                if (!categoryName || !entry) return;
                if (workspaceId && currentWorkspace && workspaceId !== currentWorkspace) return;
                const prefix = forms.getPrefix(categoryName);
                const panel = getDocument()?.getElementById(prefix + 'panel');
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
