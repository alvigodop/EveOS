window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};
window.EveOS.SearchAdvanced.Modules = window.EveOS.SearchAdvanced.Modules || {};

(function () {
    window.EveOS.SearchAdvanced.Modules.createUiFormHelpers = function createUiFormHelpers(deps) {
        const onRunSearch = typeof deps?.onRunSearch === 'function' ? deps.onRunSearch : function () {};
        const onClearFilters = typeof deps?.onClearFilters === 'function' ? deps.onClearFilters : function () {};
        const modules = window.EveOS.SearchAdvanced.Modules || {};
        const fields = typeof modules.createUiFormFields === 'function'
            ? modules.createUiFormFields()
            : {};
        const modalTemplate = typeof modules.createUiFormTemplate === 'function'
            ? modules.createUiFormTemplate()
            : '';

        function bindEvents() {
            const runBtn = fields.byId?.('esRunBtn');
            const clearBtn = fields.byId?.('esClearBtn');
            const queryInput = fields.byId?.('esQuery');
            if (runBtn) runBtn.onclick = onRunSearch;
            if (clearBtn) clearBtn.onclick = onClearFilters;
            if (queryInput) {
                queryInput.addEventListener('keypress', function (event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        onRunSearch();
                    }
                });
            }

            // Wire debug diagnostics panel — render on first expand
            const debugSection = fields.byId?.('nxDebugSection');
            if (debugSection) {
                debugSection.addEventListener('toggle', function () {
                    if (!debugSection.open) return;
                    const container = fields.byId?.('nxDebugContainer');
                    if (!container) return;
                    const DebugView = window.EveOS?.SearchAdvanced?.DebugView;
                    if (DebugView?.renderDebugPanel) {
                        DebugView.renderDebugPanel(container);
                    } else {
                        container.innerHTML = '<div style="padding:12px; color:rgba(255,120,120,0.8); font-size:0.78rem;">Debug module not loaded.</div>';
                    }
                });
            }
        }

        function createModalIfNeeded() {
            if (fields.byId?.('expandedSearchModal')) return;
            document.body.insertAdjacentHTML('beforeend', modalTemplate);
            bindEvents();
            // Initialize Nexus Search vector toggles and stats
            if (typeof fields.initVectorToggles === 'function') fields.initVectorToggles();
            if (typeof fields.updateFooterStats === 'function') fields.updateFooterStats();
        }

        return Object.assign({}, fields, {
            createModalIfNeeded
        });
    };
})();
