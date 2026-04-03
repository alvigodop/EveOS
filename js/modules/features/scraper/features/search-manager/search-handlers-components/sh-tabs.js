/**
 * Search Handlers - Tabs
 * 
 * Handles main search tab source detection and routing.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    const SHTabs = {
        version: '1.0.0',

        init: function () {
            console.log('SHTabs initialized');
            return this;
        },

        handleMainSearch: function () {
            const queryInput = document.getElementById('searchInput');
            if (!queryInput) {
                console.error('SHTabs: Main search input not found.');
                return;
            }
            const query = queryInput.value.trim();
            if (!query) {
                alert('Please enter a search term.');
                return;
            }

            // Determine active source - Robust Check
            let activeTabId = null;

            const fandomTab = document.getElementById('fandomTab');
            const wikipediaTab = document.getElementById('wikipediaTab');
            const activeSourceBtn = document.querySelector('.source-toggle-btn.active');

            if (activeSourceBtn && activeSourceBtn.dataset.source) {
                if (activeSourceBtn.dataset.source === 'fandom') activeTabId = 'fandomTab';
                if (activeSourceBtn.dataset.source === 'wikipedia') activeTabId = 'wikipediaTab';
                if (activeSourceBtn.dataset.source === 'api') activeTabId = 'apiTab';
            } else if (fandomTab && fandomTab.classList.contains('active')) {
                activeTabId = 'fandomTab';
            } else if (wikipediaTab && wikipediaTab.classList.contains('active')) {
                activeTabId = 'wikipediaTab';
            } else {
                if (window.TabManager && typeof TabManager.getActiveTabId === 'function') {
                    activeTabId = TabManager.getActiveTabId();
                }
            }

            const isFandom = (activeTabId === 'fandomTab' || activeTabId === 'fandom' || activeTabId === 'tab-fandom');
            const isWikipedia = (activeTabId === 'wikipediaTab' || activeTabId === 'wikipedia' || activeTabId === 'tab-wikipedia');
            const isApi = (activeTabId === 'apiTab' || activeTabId === 'api' || activeTabId === 'tab-api');

            let source = 'all';
            if (isFandom) source = 'fandom';
            if (isWikipedia) source = 'wikipedia';
            if (isApi) source = 'api';

            console.log(`SHTabs: Handling main search for query "${query}". Detected Active Tab: ${activeTabId}, Source: ${source}`);

            if (window.SearchCoordinator && typeof SearchCoordinator.performContentSearch === 'function') {
                SearchCoordinator.performContentSearch(query, source);
            } else {
                console.error('SHTabs: SearchCoordinator not found.');
            }
        }
    };

    // Expose globally
    window.SHTabs = SHTabs;

    // Register with ModuleRegistry if available
    if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
        window.ModuleRegistry.register('SHTabs', SHTabs);
    }
})();
