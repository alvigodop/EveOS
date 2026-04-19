function assertApiCardSettingsResult(result, pageErrors, consoleErrors) {
        if (result.providerCallsAfterHybridMiss !== 13) {
            throw new Error(`Expected 13 provider calls on hybrid cache miss, saw ${result.providerCallsAfterHybridMiss}`);
        }
        if (result.providerCallsAfterCacheOnlyHit !== result.providerCallsAfterHybridMiss) {
            throw new Error(`Cache-only search should not fetch live providers again: ${JSON.stringify(result)}`);
        }
        if (result.providerCallsAfterCacheFallbackHit !== result.providerCallsAfterHybridMiss) {        
            throw new Error(`Search Unidex cache fallback should not fetch live API providers again: ${JSON.stringify(result)}`);
        }
        if (result.providerCallsAfterScraperSearch !== result.providerCallsBeforeScraperSearch) {       
            throw new Error(`Scraper API cache-only path should not fetch live providers: ${JSON.stringify(result)}`);
        }
        if (Number(result.knowledgeLiveCallsAfterCacheFallbackHit?.wikipediaEntry || 0) !== 0
            || Number(result.knowledgeLiveCallsAfterCacheFallbackHit?.fandomDomainSearch || 0) !== 0    
            || Number(result.knowledgeLiveCallsAfterCacheFallbackHit?.fandomPageDetails || 0) !== 0) {  
            throw new Error(`Search Unidex cache-backed knowledge search should not fetch live wiki/fandom data: ${JSON.stringify(result.knowledgeLiveCallsAfterCacheFallbackHit)}`);
        }
        if (!result.alphaCacheSummary || result.alphaCacheSummary.totalResults !== 2) {
            throw new Error(`Expected Alpha cache summary to store two provider results: ${JSON.stringify(result.alphaCacheSummary)}`);
        }
        if (result.betaCacheVisible) {
            throw new Error('Beta card should not see Alpha cache entries');
        }
        if (result.alphaPrefsAfterSearch.liveResults !== false || result.alphaPrefsAfterSearch.hybridResults !== true || result.alphaPrefsAfterSearch.ttlMs !== 60 * 60 * 1000) {
            throw new Error(`Alpha prefs not persisted as expected: ${JSON.stringify(result.alphaPrefsAfterSearch)}`);
        }
        if (result.alphaPrefsFinal.liveResults !== false || result.alphaPrefsFinal.hybridResults !== false || result.alphaPrefsFinal.ttlMs !== 60 * 60 * 1000) {
            throw new Error(`Final Alpha prefs should reflect cache-only retest: ${JSON.stringify(result.alphaPrefsFinal)}`);
        }
        if (result.alphaPrefsAfterSearch.openMode !== 'popup' || result.alphaPrefsFinal.openMode !== 'newtab') {
            throw new Error(`Expected API open-mode preference to persist and update: ${JSON.stringify({ after: result.alphaPrefsAfterSearch, final: result.alphaPrefsFinal })}`);
        }
        if (!Array.isArray(result.unifiedSectionTitles) || !result.unifiedSectionTitles.includes('Wikipedia Saved Sources') || !result.unifiedSectionTitles.includes('Fandom Saved Sources') || !result.unifiedSectionTitles.includes('API Providers')) {
            throw new Error(`Expected Search Unidex to render Wikipedia, Fandom, and API result sections: ${JSON.stringify(result.unifiedSectionTitles)}`);
        }
        if (!/Naruto/i.test(result.unifiedWikiText) || !/Naruto/i.test(result.unifiedFandomText) || !/Naruto/i.test(result.unifiedApiText)) {
            throw new Error(`Expected Search Unidex to render cached Naruto results across all source lanes: ${JSON.stringify({ wiki: result.unifiedWikiText, fandom: result.unifiedFandomText, api: result.unifiedApiText })}`);
        }
        if (!Array.isArray(result.unifiedWikiTitles) || new Set(result.unifiedWikiTitles).size < 2) {
            throw new Error(`Expected cached Wikipedia result titles to stay distinct instead of repeating the same article title: ${JSON.stringify({ titles: result.unifiedWikiTitles })}`);
        }
        if (!result.fandomTitleRepaired) {
            throw new Error(`Expected Search Unidex to repair generic cached Fandom titles from the page URL: ${JSON.stringify({ fandom: result.unifiedFandomText })}`);
        }
        if (!/Cached/i.test(result.fandomSidebarStatusText) || /Not Cached/i.test(result.fandomSidebarStatusText)) {
            throw new Error(`Expected scraper Fandom sidebar to show cached state after aggregate cache hydration: ${JSON.stringify({ status: result.fandomSidebarStatusText })}`);
        }
        if (!result.fandomSidebarHasViewButton) {
            throw new Error(`Expected scraper Fandom sidebar to keep the View Cache action available: ${JSON.stringify({ status: result.fandomSidebarStatusText, hasViewButton: result.fandomSidebarHasViewButton })}`);
        }
        if (!/Naruto|Ninja/i.test(result.ninjaWikiText) || !/Ninja/i.test(result.ninjaFandomText) || !/Naruto Archive/i.test(result.ninjaApiText)) {
            throw new Error(`Expected Search Unidex to draw cache-backed ninja matches from Wikipedia, Fandom, and API source data: ${JSON.stringify({ wiki: result.ninjaWikiText, fandom: result.ninjaFandomText, api: result.ninjaApiText })}`);
        }
        if (result.searchTabLabel !== 'Search Unidex') {
            throw new Error(`Expected category settings tab to be renamed to Search Unidex: ${JSON.stringify(result)}`);
        }
        if (result.searchResultsVisible === 'none') {
            throw new Error('Expected API search results container to be visible');
        }
        if (!result.wikiCacheVisible || !result.fandomCacheVisible || !result.apiCacheVisible) {        
            throw new Error(`Expected unified cache pool to include grouped Wikipedia, Fandom, and API entries: ${JSON.stringify(result)}`);
        }
        if (!result.knowledgeActionButtons?.openGroup || !result.knowledgeActionButtons?.viewGroup) {   
            throw new Error(`Expected unified group cache actions to render in the Search tab: ${JSON.stringify(result)}`);
        }
        if (!result.dataPopupVisible || !/Naruto/i.test(result.dataPopupText)) {
            throw new Error(`Expected Search Unidex View to open cached data popup content from the Search tab: ${JSON.stringify({ visible: result.dataPopupVisible, text: result.dataPopupText })}`);
        }
        if (result.dataPopupParentTag !== 'BODY') {
            throw new Error(`Expected Search Unidex View popup to be hoisted to document.body: ${JSON.stringify({ parent: result.dataPopupParentTag })}`);
        }
        if (!result.narutoApiCacheSummary || result.narutoApiCacheSummary.totalResults !== 2) {
            throw new Error(`Expected seeded Naruto API cache summary to remain available for Unidex: ${JSON.stringify(result.narutoApiCacheSummary)}`);
        }
        if (result.scraperApiPanelVisible === 'none') {
            throw new Error('Expected scraper API management panel to be visible');
        }
        if (result.scraperHybridChecked || result.scraperLiveChecked) {
            throw new Error(`Expected scraper API toggles to reflect cached Alpha prefs: ${JSON.stringify(result)}`);
        }
        if (result.scraperTtlValue !== String(60 * 60 * 1000) || result.searchTtlValue !== String(60 * 60 * 1000)) {
            throw new Error(`Expected TTL select sync between search and scraper panels: ${JSON.stringify(result)}`);
        }
        if (result.scraperOpenMode !== 'newtab') {
            throw new Error(`Expected scraper API link mode control to stay in sync with Search Unidex: ${JSON.stringify(result)}`);
        }
        if (result.scraperCacheEntries < 1) {
            throw new Error(`Expected scraper API panel to show cached entries: ${JSON.stringify(result)}`);
        }
        if (result.providerSourceButtons < 13) {
            throw new Error(`Expected all provider source tabs to render: ${JSON.stringify(result)}`);  
        }
        if (result.scraperProviderTitle !== 'MangaDex') {
            throw new Error(`Expected scraper provider title to reflect selected source: ${JSON.stringify(result)}`);
        }
        if (String(result.providerFilteredResultCount).trim() !== '1') {
            throw new Error(`Expected provider-filtered result count of 1 for MangaDex cache-only search: ${JSON.stringify(result)}`);
        }
        if (!result.unidexVisible) {
            throw new Error(`Expected Unidex panel to render in scraper tab: ${JSON.stringify(result)}`);
        }
        if (result.unidexProviderRows < 2) {
            throw new Error(`Expected Unidex Naruto card to list per-provider API rows: ${JSON.stringify(result)}`);
        }
        if (!result.unidexLaneTitles.includes('Wikipedia') || !result.unidexLaneTitles.includes('Fandom') || !result.unidexLaneTitles.includes('API Cache')) {
            throw new Error(`Expected Unidex Naruto card to include Wikipedia, Fandom, and API lanes: ${JSON.stringify(result)}`);
        }
        if (!/Updated|Cached/i.test(result.unidexFandomStatusText) || /Not cached yet/i.test(result.unidexFandomStatusText)) {
            throw new Error(`Expected Unidex Fandom lane to reflect hydrated cache state: ${JSON.stringify({ fandomStatus: result.unidexFandomStatusText })}`);
        }
        if (!/Providers/i.test(result.unidexApiSummaryText) || result.unidexApiDetailsOpen) {
            throw new Error(`Expected Unidex API provider block to default to a collapsed summary: ${JSON.stringify({ summary: result.unidexApiSummaryText, open: result.unidexApiDetailsOpen })}`);
        }
        if (!result.unidexHasProviderOpen) {
            throw new Error(`Expected Unidex provider row to include provider open action: ${JSON.stringify(result)}`);
        }

        const criticalConsoleErrors = consoleErrors.filter((entry) => {
            if (/Tracking Prevention blocked access to storage/i.test(entry)) return false;
            if (/Failed to load resource/i.test(entry)) return false;
            if (/Access to fetch at/i.test(entry)) return false;
            if (/QuotaExceededError/i.test(entry)) return false;
            if (/Critical module CacheManager is missing/i.test(entry)) return false;
            return true;
        });
        if (pageErrors.length) {
            throw new Error(`Page errors detected:\n${pageErrors.join('\n\n')}`);
        }
        if (criticalConsoleErrors.length) {
            throw new Error(`Console errors detected:\n${criticalConsoleErrors.join('\n')}`);
        }

        console.log(`API_CARD_SETTINGS_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
}

module.exports = {
    assertApiCardSettingsResult
};
