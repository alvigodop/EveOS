window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanelWorkflowPanelHelpers) return;

    window.EveLibrary.UIModules.createPanelWorkflowPanelHelpers = function createPanelWorkflowPanelHelpers(deps) {
        const State = deps.State;
        const Storage = deps.Storage;
        const EntriesRenderer = deps.EntriesRenderer;
        const OptionsUpdaters = deps.OptionsUpdaters;
        const StatsRenderer = deps.StatsRenderer;
        const Search = deps.Search;
        const Shared = deps.Shared;
        const forms = deps.forms;
        const getDocument = typeof deps?.getDocument === 'function'
            ? deps.getDocument
            : function () { return document; };
        const getRatingsApi = typeof deps?.getRatingsApi === 'function'
            ? deps.getRatingsApi
            : function () { return window.EveLibrary?.Ratings; };

        function createLibraryPanelHtml(categoryName) {
            if (typeof Shared.createLibraryPanelHtml === 'function') {
                return Shared.createLibraryPanelHtml(categoryName);
            }
            return '<div class="lib-panel-error">Library panel template unavailable.</div>';
        }

        function initLibraryPanel(categoryName) {
            const prefix = forms.getPrefix(categoryName);
            const doc = getDocument();
            const panel = doc?.getElementById(prefix + 'panel');
            if (!panel) return;
            panel.innerHTML = createLibraryPanelHtml(categoryName);
            OptionsUpdaters.updateStatusOptions(categoryName);
            OptionsUpdaters.updateGenreOptions(categoryName);
            OptionsUpdaters.updateSortByOptions(categoryName);
            OptionsUpdaters.updateFieldsVisibility(categoryName);
            const ratingScaleSelect = doc?.getElementById(prefix + 'search-rating-scale');
            const ratingsApi = getRatingsApi();
            const currentConfig = State?.getConfig ? State.getConfig() : null;
            if (ratingScaleSelect && ratingsApi?.getActiveScale) {
                ratingScaleSelect.value = ratingsApi.getActiveScale(currentConfig);
            }
            const entriesContainer = doc?.getElementById(prefix + 'entries');
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
            const doc = getDocument();
            const entriesView = doc?.getElementById(prefix + 'entries-view');
            const statsView = doc?.getElementById(prefix + 'stats-view');
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
            const doc = getDocument();
            const entriesContainer = doc?.getElementById(prefix + 'entries');
            const statsView = doc?.getElementById(prefix + 'stats-view');
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

        return {
            createLibraryPanelHtml,
            initLibraryPanel,
            toggleLibraryPanel,
            toggleStats,
            refreshLibrary,
            resetAndRefresh,
            changeDataType
        };
    };
})();
