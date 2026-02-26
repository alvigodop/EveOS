/**
 * Search Controls Module
 * 
 * Logic for Search UI Controls (Source, Layout, Filters)
 * Extracted from ScraperTest.html
 */

(function () {
    // Local state to track UI controls
    let uiControlState = {
        layout: 'grid',
        source: 'wikipedia' // Default
    };

    window.updateSource = function (source) {
        console.log('UI: Switching source to', source);
        uiControlState.source = source;

        // Visual update for Segmented Toggles
        document.querySelectorAll('.source-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.source === source);
        });

        // Logic update: Call TabManager
        if (window.TabManager && typeof TabManager.switchTab === 'function') {
            TabManager.switchTab(source);
        } else {
            // Fallback: Click the hidden original tabs if they exist
            const tabBtn = document.getElementById(source + 'Tab');
            if (tabBtn) tabBtn.click();
        }
    };

    // Save reference for early stub and replay any early calls
    window._realUpdateSource = window.updateSource;
    if (window._earlyUICalls && window._earlyUICalls.source) {
        console.log('UI: Replaying early source switch to', window._earlyUICalls.source);
        window.updateSource(window._earlyUICalls.source);
        window._earlyUICalls.source = null;
    }

    window.updateLayout = function (layout) {
        console.log('UI: Switching layout to', layout);
        uiControlState.layout = layout;

        // Update visual state
        const gridBtn = document.getElementById('layoutGridBtn');
        const listBtn = document.getElementById('layoutListBtn');

        if (gridBtn) gridBtn.classList.toggle('active', layout === 'grid');
        if (listBtn) listBtn.classList.toggle('active', layout === 'list');

        // Trigger update via SearchManager
        triggerSearchManagerUpdate();
    };

    window.applyFilters = function () {
        console.log('UI: Filters changed');
        triggerSearchManagerUpdate();
    };

    window.triggerSearchManagerUpdate = function () {
        // Check if SearchManager is active and has a previous query
        if (window.SearchManager && SearchManager._lastQueryOptions && SearchManager._lastQueryOptions.query) {
            const lastOpts = SearchManager._lastQueryOptions;

            // Helper to safely get checkbox state
            const isChecked = (id) => {
                const el = document.getElementById(id);
                return el ? el.checked : false;
            };

            // Helper to safely get value
            const getValue = (id) => {
                const el = document.getElementById(id);
                return el ? el.value : null;
            };

            // Construct updated options
            // We must match the property names expected by SearchManager._getSearchOptions relative to options object
            const newOptions = {
                ...lastOpts.options,
                layout: uiControlState.layout,
                groupBy: getValue('groupBySelect') || 'none',

                // Filters
                mangaFilter: isChecked('mangaFilter'),
                webNovelFilter: isChecked('webNovelFilter'),

                // Settings
                smartDedup: isChecked('smartDedupToggle'),
                hybridSearch: isChecked('hybridSearchToggle'),
                liveSearch: isChecked('liveSearchToggle'),

                // Hide Options
                hidePersons: isChecked('hidePersonsToggle'),
                hideTextMatches: isChecked('hideTextMatchesToggle'),
                hideSourceArticles: isChecked('hideSourceArticlesToggle')
            };

            console.log('UI: Triggering SearchManager redisplay with options:', newOptions);

            // Force redisplay (true argument) which re-runs filtering and display logic on cached results
            SearchManager.performContentSearch(lastOpts.query, lastOpts.source, newOptions, true);
        } else {
            console.log('UI: SearchManager not ready or no previous search to update.');
        }
    };
})();
