/**
 * Wiki Cache Manager View Component
 * Handles viewing cached data for Fandom domains and Wiki entries.
 */
const WikiCacheManagerView = {};

/**
 * Initialize the module
 */
WikiCacheManagerView.init = function () {
    console.log('WikiCacheManagerView initialized');
};

/**
 * View cached data for a Fandom domain
 * @param {string} domain 
 */
WikiCacheManagerView.viewFandomCachedData = function (domain) {
    console.log(`WikiCacheManager: Viewing cached data for Fandom domain: ${domain}`);
    try {
        if (window.CacheManager && typeof CacheManager.viewFandomCachedData === 'function') {
            CacheManager.viewFandomCachedData(domain);
        } else {
            // Fallback
            const wikiDataStore = JSON.parse(localStorage.getItem('wikiDataStore')) || { searchResults: {} };
            const domainData = wikiDataStore.searchResults[domain];

            if (!domainData) {
                alert('No cached data available for this domain');
                return;
            }

            const popup = document.getElementById('dataPopup');
            const dataPopupContent = document.getElementById('dataPopupContent');
            const dataPopupTitle = document.getElementById('dataPopupTitle');

            if (!popup || !dataPopupContent) {
                alert('Cannot display cache data: popup elements not found');
                return;
            }

            if (dataPopupTitle) dataPopupTitle.textContent = `Cached Data: ${domain}`;

            dataPopupContent.innerHTML = `
                <h3>Cache Data for ${domain}</h3>
                <pre style="max-height: 500px; overflow: auto;">${JSON.stringify(domainData, null, 2)}</pre>
            `;

            popup.style.display = 'block';
        }
    } catch (error) {
        console.error(`Error viewing cached data for ${domain}:`, error);
        if (window.WikiManager) WikiManager._notify(`Error viewing cache: ${error.message}`, 'error');
    }
};

/**
 * View cached data for a Wikipedia entry
 * @param {string} title 
 */
WikiCacheManagerView.viewWikiCachedData = function (title) {
    console.log(`WikiCacheManager: Viewing cached data for Wikipedia entry: ${title}`);
    try {
        if (window.CacheManager && typeof CacheManager.viewWikiCachedData === 'function') {
            CacheManager.viewWikiCachedData(title);
        } else {
            // Fallback
            const wikiCacheStore = JSON.parse(localStorage.getItem('wikiCacheStore')) || {};
            const entryData = wikiCacheStore[title];

            if (!entryData) {
                alert('No cached data available for this Wikipedia entry');
                return;
            }

            const popup = document.getElementById('dataPopup');
            const dataPopupContent = document.getElementById('dataPopupContent');
            const dataPopupTitle = document.getElementById('dataPopupTitle');

            if (!popup || !dataPopupContent) {
                alert('Cannot display cache data: popup elements not found');
                return;
            }

            if (dataPopupTitle) dataPopupTitle.textContent = `Cached Data: ${title}`;

            dataPopupContent.innerHTML = `
                <h3>Cache Data for ${title}</h3>
                <pre style="max-height: 500px; overflow: auto;">${JSON.stringify(entryData, null, 2)}</pre>
            `;

            popup.style.display = 'block';
        }
    } catch (error) {
        console.error(`Error viewing cached data for ${title}:`, error);
        if (window.WikiManager) WikiManager._notify(`Error viewing cache: ${error.message}`, 'error');
    }
};

window.WikiCacheManagerView = WikiCacheManagerView;
