async function runApiScraperScenario(page) {
    return page.evaluate(async () => {
        const modal = document.getElementById('categorySettingsModal');
        if (!modal) {
            throw new Error('Category settings modal missing during scraper phase');
        }
            const providerSourceButtons = Array.from(modal.querySelectorAll('#apiSourceToggleCluster .source-toggle-btn'));
            const sourceMangaDexBtn = modal.querySelector('.source-toggle-btn[data-source="mangadex"]');
            const unidexBtn = modal.querySelector('.source-toggle-btn[data-source="unidex"]');
            if (!sourceMangaDexBtn || !unidexBtn || providerSourceButtons.length < 13) {
                throw new Error('Scraper tab missing provider source toggles or Unidex');
            }
            sourceMangaDexBtn.click();

            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const panel = document.getElementById('apiManagement');
                    if (panel && window.getComputedStyle(panel).display !== 'none') {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 6000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for API scraper management panel'));        
                    }
                }, 80);
            });
            await new Promise((resolve) => setTimeout(resolve, 450));

            const scraperHybridToggle = modal.querySelector('[data-api-hybrid-toggle="scraper"]');      
            const scraperLiveToggle = modal.querySelector('[data-api-live-toggle="scraper"]');
            const scraperTtlSelect = modal.querySelector('[data-api-ttl-select="scraper"]');
            const scraperNewTabRadio = modal.querySelector('[data-api-open-mode="scraper"][value="newtab"]');
            const scraperCacheEntries = modal.querySelectorAll('#api-scraper-panel-container .api-cache-entry').length;
            const apiManagementDisplay = window.getComputedStyle(document.getElementById('apiManagement')).display;
            const scraperProviderTitle = modal.querySelector('#apiManagement .api-scraper-provider-title')?.textContent?.trim() || '';

            const scraperSearchInput = modal.querySelector('#searchInput');
            if (!scraperSearchInput) {
                throw new Error('Scraper search input missing');
            }
            scraperSearchInput.value = 'kingdom';

            const providerCallsBeforeScraperSearch = window.__apiSmokeProviderCalls;
            await window.SearchCoordinatorFlow.performContentSearch('kingdom', 'mangadex', {
                layout: 'grid',
                liveSearch: false,
                hybridSearch: false
            }, false);
            await new Promise((resolve) => setTimeout(resolve, 300));
            const providerCallsAfterScraperSearch = window.__apiSmokeProviderCalls;
            const alphaPrefsFinal = await window.EveOS.API.Cache.loadPrefs('Alpha');
            const providerFilteredResultCount = document.getElementById('resultCount')?.textContent || '';

            unidexBtn.click();
            await new Promise((resolve, reject) => {
                const started = Date.now();
                const timer = window.setInterval(() => {
                    const panel = document.getElementById('unidexManagement');
                    if (panel && window.getComputedStyle(panel).display !== 'none') {
                        window.clearInterval(timer);
                        resolve();
                        return;
                    }
                    if (Date.now() - started > 6000) {
                        window.clearInterval(timer);
                        reject(new Error('Timed out waiting for Unidex management panel'));
                    }
                }, 80);
            });
            await new Promise((resolve) => setTimeout(resolve, 400));

            const unidexPanel = document.getElementById('unidexManagement');
            const unidexNarutoCard = Array.from(unidexPanel.querySelectorAll('.unidex-source-card')).find((entry) => {
                return (entry.textContent || '').includes('Naruto');
            });
            const unidexProviderRows = unidexNarutoCard ? unidexNarutoCard.querySelectorAll('.unidex-api-provider-row').length : 0;
            const unidexLaneTitles = unidexNarutoCard
                ? Array.from(unidexNarutoCard.querySelectorAll('.unidex-lane-title')).map((node) => node.textContent.trim())
                : [];
            const unidexFandomStatusText = String(unidexNarutoCard?.querySelector('.unidex-lane:nth-of-type(2) .unidex-lane-status')?.textContent || '').trim();
            const unidexApiDetails = unidexNarutoCard?.querySelector('.unidex-api-details');
            const unidexApiSummaryText = String(unidexApiDetails?.querySelector('summary')?.textContent || '').trim();
            const unidexHasProviderOpen = !!unidexNarutoCard?.querySelector('.api-cache-open-provider-btn[data-provider-key="mangadex"][data-query="naruto"]');

        return {
            alphaPrefsFinal,
            providerCallsAfterScraperSearch,
            providerCallsBeforeScraperSearch,
            providerFilteredResultCount,
            providerSourceButtons: providerSourceButtons.length,
            scraperApiPanelVisible: apiManagementDisplay,
            scraperCacheEntries,
            scraperHybridChecked: !!scraperHybridToggle?.checked,
            scraperLiveChecked: !!scraperLiveToggle?.checked,
            scraperOpenMode: scraperNewTabRadio?.checked ? 'newtab' : 'popup',
            scraperProviderTitle,
            scraperTtlValue: scraperTtlSelect?.value || '',
            unidexApiDetailsOpen: !!unidexApiDetails?.open,
            unidexApiSummaryText,
            unidexFandomStatusText,
            unidexHasProviderOpen,
            unidexLaneTitles,
            unidexProviderRows,
            unidexVisible: window.getComputedStyle(unidexPanel).display !== 'none'
        };
    });
}

module.exports = {
    runApiScraperScenario
};
