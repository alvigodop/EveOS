window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const State = window.EveOS.SearchAdvanced.State;
    const Api = window.EveOS.SearchAdvanced.Api;
    const Modules = window.EveOS.SearchAdvanced.Modules || {};

    let uiHelpers = null;

    function getUiHelpers() {
        if (!uiHelpers) {
            uiHelpers = Modules.createUiHelpers({
                onRunSearch: runSearch,
                onClearFilters: clearFilters
            });
        }
        return uiHelpers;
    }

    function byId(id) {
        return getUiHelpers().byId(id);
    }

    async function runSearch() {
        const ui = getUiHelpers();
        const query = (byId('esQuery')?.value || '').trim();
        const settings = ui.collectSettings();
        State.updateSettings(settings);

        try {
            ui.setLoading(true);
            const data = await Api.runSearch(query, settings);
            ui.renderResults(data);
        } catch (error) {
            const message = error?.message || 'Search failed.';
            ui.setMeta(message, true);
            const results = byId('esResults');
            if (results) results.innerHTML = `<p class="es-empty es-error">${ui.escapeHtml(message)}</p>`;
        } finally {
            ui.setLoading(false);
        }
    }

    function clearFilters() {
        const ui = getUiHelpers();
        ui.resetFilters();

        const results = byId('esResults');
        if (results) results.innerHTML = '';
        ui.setMeta('Filters cleared.', false);

        State.updateSettings(ui.collectSettings());
    }

    function openExpandedSearchModal(options) {
        const ui = getUiHelpers();
        ui.createModalIfNeeded();

        const settings = State.getSettings();
        const queryFromOptions = typeof options?.query === 'string'
            ? options.query
            : (byId('search')?.value || '');
        ui.applySettingsToForm(settings, queryFromOptions);

        const modal = byId('expandedSearchModal');
        if (modal) modal.style.display = 'flex';

        if (options?.autoSearch) {
            runSearch();
        } else {
            const queryInput = byId('esQuery');
            if (queryInput) queryInput.focus();
        }
    }

    window.openExpandedSearchModal = openExpandedSearchModal;
    window.EveOS.SearchAdvanced.UI = {
        openExpandedSearchModal,
        runSearch
    };
})();
