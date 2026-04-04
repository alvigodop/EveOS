
(function () {
    'use strict';

    const CategoryScraperPanel = {
        version: '2.0.0', // Ported version
        _initialized: false,

        init: function () {
            console.log('CategoryScraperPanel: Initialized');
            this._initialized = true;
            return this;
        },

        renderInModal: function (categoryName, container) {
            console.log('CategoryScraperPanel: Rendering for category', categoryName);

            // Store context in StorageManager for data isolation
            if (window.StorageManager && typeof StorageManager.setCategoryContext === 'function') {
                StorageManager.setCategoryContext(categoryName);
            }

            // Sync WikiManager cache stores with the new context
            if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                WikiManager.refreshCacheStores();
            }

            container.innerHTML = window.ScraperPanelTemplate || '<div>Error: Template not loaded.</div>';

            // Re-trigger initialization or refresh components if needed
            // Since elements are newly injected, we MUST re-bind all UI managers

            console.log('CategoryScraperPanel: connecting UI modules to new DOM...');

            // 1. WikiManager: Re-bind DOM operations (lists, buttons)
            if (window.WikiManager) {
                if (typeof WikiManager.initDomOperations === 'function') {
                    WikiManager.initDomOperations();
                } else if (typeof WikiManager.init === 'function') {
                    WikiManager.init();
                }
            }

            // 2. SearchUIHandler: Re-bind search controls (input, buttons, filters)
            if (window.SearchUIHandler && typeof SearchUIHandler.init === 'function') {
                SearchUIHandler.init();
            }

            // 3. FandomCSUI: Re-bind community search UI
            if (window.FandomCSUI && typeof FandomCSUI.init === 'function') {
                FandomCSUI.init();
            }

            // 4. DiscoveryUI: Re-bind discovery controls
            if (window.DiscoveryUI && typeof DiscoveryUI.init === 'function') {
                DiscoveryUI.init();
            }

            if (window.CPMUtils && window.CORSProxyManager) {
                CPMUtils.updateStatusIndicators(CORSProxyManager.getProxies());
                CPMUtils.checkLocalDevMode(); // Re-check to update local indicator
            }

            const currentSource = window.TabManager?.getCurrentSource?.() || window.TabManagerState?.getCurrentSource?.() || 'wikipedia';
            const apiSourceCluster = container.querySelector('#apiSourceToggleCluster');
            if (apiSourceCluster && window.EveOS?.API?.Manager?.renderScraperSourceTabs) {
                window.EveOS.API.Manager.renderScraperSourceTabs(apiSourceCluster, currentSource);
            }
            container.querySelectorAll('.source-toggle-btn').forEach(function (button) {
                button.classList.toggle('active', button.dataset.source === currentSource);
            });

            const apiPanelContainer = container.querySelector('#api-scraper-panel-container');
            if (apiPanelContainer && window.EveOS?.API?.Manager?.renderScraperPanelUI) {
                window.EveOS.API.Manager.renderScraperPanelUI(apiPanelContainer, categoryName, {
                    providerKey: window.EveOS?.API?.Manager?.isProviderSource?.(currentSource) ? currentSource : null
                });
            }
            const unidexPanelContainer = container.querySelector('#unidex-scraper-panel-container');
            if (unidexPanelContainer && window.EveOS?.API?.Manager?.renderUnidexPanelUI) {
                window.EveOS.API.Manager.renderUnidexPanelUI(unidexPanelContainer, categoryName);
            }
            if (window.TabManagerUI?.updatePanels) {
                window.TabManagerUI.updatePanels(currentSource, true);
            }
        },

        /**
         * Explicitly set category context
         */
        setContext: function (categoryName) {
            if (window.StorageManager && typeof StorageManager.setCategoryContext === 'function') {
                StorageManager.setCategoryContext(categoryName);
            }
            if (window.WikiManager && typeof WikiManager.refreshCacheStores === 'function') {
                WikiManager.refreshCacheStores();
            }
        }
    };

    window.CategoryScraperPanel = CategoryScraperPanel;
})();
