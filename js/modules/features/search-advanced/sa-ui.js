window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const State = window.EveOS.SearchAdvanced.State;
    const Api = window.EveOS.SearchAdvanced.Api;
    const Modules = window.EveOS.SearchAdvanced.Modules || {};

    let uiHelpers = null;
    // Tracks the search scope — set by openExpandedSearchModal
    let activeScope = null;

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

    function resolveCurrentScope() {
        // If an explicit scope was set (e.g. from Unidex), use it
        if (activeScope) return activeScope;

        // Default: scope to current active tab
        const grid = document.getElementById('dashboard-grid');
        const isUnidexMode = grid && grid.classList.contains('unidex-mode');

        // If in Unidex mode at tab level, search everything
        if (isUnidexMode) return {};

        // Otherwise, scope to active workspace
        const activeWorkspace = String(
            window.eveState?.config?.activeWorkspace
            || (typeof config !== 'undefined' ? config?.activeWorkspace : '')
            || 'main'
        ).trim() || 'main';

        return { workspaceId: activeWorkspace };
    }

    async function runSearch() {
        const ui = getUiHelpers();
        const query = (byId('esQuery')?.value || '').trim();
        const settings = ui.collectSettings();
        State.updateSettings(settings);

        if (!query) {
            ui.setMeta('Enter a search query.', true);
            return;
        }

        const scope = resolveCurrentScope();

        try {
            ui.setLoading(true);

            // Update scope indicator in the UI
            const Agg = window.EveOS.SearchAdvanced.CacheAggregator;
            const scopeLabel = Agg?.describeScopeLabel ? Agg.describeScopeLabel(scope) : 'Scoped';
            const scopeIndicator = byId('esScopeIndicator');
            if (scopeIndicator) {
                scopeIndicator.textContent = 'Scope: ' + scopeLabel;
                scopeIndicator.style.display = '';
            }

            const SearchVectors = window.EveOS.SearchAdvanced.SearchVectors;
            if (SearchVectors && typeof SearchVectors.runMultiVectorSearch === 'function') {
                // Multi-vector search path — pass scope
                const result = await SearchVectors.runMultiVectorSearch(query, settings, scope);
                const renderFn = Modules.renderVectorResults;
                if (typeof renderFn === 'function') {
                    renderFn(result, byId('esResults'));
                } else {
                    // Fallback: render as simple list
                    const results = byId('esResults');
                    if (results) {
                        results.innerHTML = (result.results || []).map(function (r) {
                            return '<div class="nx-result-item"><a href="' + (r.url || '#') + '" target="_blank">' + (r.title || 'Untitled') + '</a></div>';
                        }).join('') || '<div class="nx-empty">No results</div>';
                    }
                }

                const stats = result.stats || {};
                const total = (result.results || []).length;
                ui.setMeta(total + ' results across ' + Object.keys(stats).filter(function (k) { return stats[k] > 0; }).length + ' vectors (' + scopeLabel + ')', false);
            } else {
                // Legacy: Google CSE only
                const data = await Api.runSearch(query, settings);
                ui.renderResults(data);
            }

            // Update footer stats
            if (typeof ui.updateFooterStats === 'function') ui.updateFooterStats();
        } catch (error) {
            const message = error?.message || 'Search failed.';
            ui.setMeta(message, true);
            const results = byId('esResults');
            if (results) results.innerHTML = '<div class="nx-empty" style="color:#ff7b7b">' + (ui.escapeHtml ? ui.escapeHtml(message) : message) + '</div>';
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

        // Set the active scope from options or auto-detect
        activeScope = options?.scope || null;

        const settings = State.getSettings();
        const queryFromOptions = typeof options?.query === 'string'
            ? options.query
            : (byId('search')?.value || '');
        ui.applySettingsToForm(settings, queryFromOptions);

        const modal = byId('expandedSearchModal');
        if (modal) modal.style.display = 'flex';

        // Show scope indicator
        const scope = resolveCurrentScope();
        const Agg = window.EveOS.SearchAdvanced.CacheAggregator;
        const scopeLabel = Agg?.describeScopeLabel ? Agg.describeScopeLabel(scope) : '';
        const scopeIndicator = byId('esScopeIndicator');
        if (scopeIndicator) {
            scopeIndicator.textContent = 'Scope: ' + scopeLabel;
            scopeIndicator.style.display = '';
        }

        // Update stats on open
        if (typeof ui.updateFooterStats === 'function') ui.updateFooterStats();

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
