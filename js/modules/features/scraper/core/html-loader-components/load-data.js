/**
 * HTML Script Loader - Data Component
 * 
 * Handles data management operations (view cache, clear data).
 */
(function () {
    'use strict';

    const LoadData = {
        /**
         * Show cache information
         */
        showCache: function () {
            try {
                console.log('Show cache function called');

                // First try to use the CacheManager if available
                if (window.CacheManager && typeof CacheManager.viewCache === 'function') {
                    console.log('Using CacheManager.viewCache');
                    CacheManager.viewCache();
                    return;
                }

                // Fall back to our own implementation
                console.log('CacheManager.viewCache not available, using fallback');

                // Show a popup with cache information
                const cacheContent = document.getElementById('dataPopupContent');
                const popup = document.getElementById('dataPopup');
                const dataPopupTitle = document.getElementById('dataPopupTitle');

                if (cacheContent && popup) {
                    if (dataPopupTitle) {
                        dataPopupTitle.textContent = 'Cache Information';
                    }

                    cacheContent.innerHTML = '<h3>Loading Cache Information...</h3><p>Please wait...</p>';

                    // Make cacheContent visible and hide the iframe if it exists
                    cacheContent.style.display = 'block';
                    cacheContent.classList.add('visible');

                    const iframe = document.getElementById('dataPopupFrame');
                    if (iframe) {
                        iframe.style.display = 'none';
                        iframe.classList.remove('visible');
                    }

                    // Get basic cache information
                    let cacheInfo = "<h3>Cache Information</h3>";
                    let hasData = false;

                    // Try to get information from localStorage
                    try {
                        const wikiDataStore = JSON.parse(localStorage.getItem('wikiDataStore')) || { searchResults: {} };
                        const wikiCacheStore = JSON.parse(localStorage.getItem('wikiCacheStore')) || {};

                        const fandomCacheCount = Object.keys(wikiDataStore.searchResults || {}).length;
                        const wikiCacheCount = Object.keys(wikiCacheStore || {}).length;

                        const fandomCacheSize = JSON.stringify(wikiDataStore).length;
                        const wikiCacheSize = JSON.stringify(wikiCacheStore).length;
                        const totalSize = (fandomCacheSize + wikiCacheSize) / 1024; // Size in KB

                        cacheInfo += `
                        <div class="cache-stats-container">
                            <h4>Cache Statistics</h4>
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <span class="stat-label">Fandom Wikis</span>
                                    <span class="stat-value">${fandomCacheCount} domains cached</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Wikipedia Articles</span>
                                    <span class="stat-value">${wikiCacheCount} articles cached</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Total Cache Size</span>
                                    <span class="stat-value">${totalSize.toFixed(2)} KB</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Last Update</span>
                                    <span class="stat-value">${wikiDataStore.lastUpdate ? new Date(wikiDataStore.lastUpdate).toLocaleString() : 'Never'}</span>
                                </div>
                            </div>
                        </div>`;

                        hasData = true;
                    } catch (storageError) {
                        console.error('Error reading cache from localStorage:', storageError);
                        cacheInfo += "<p>Error reading cache data from localStorage</p>";
                    }

                    if (!hasData) {
                        cacheInfo += "<p>No cache data available</p>";
                    }

                    cacheContent.innerHTML = cacheInfo;
                    popup.style.display = 'block';
                } else {
                    console.error('Cache popup elements not found in the DOM');
                    alert('Could not display cache information: UI elements not found');
                }
            } catch (error) {
                console.error('Error showing cache:', error);
                alert('Error showing cache: ' + error.message);
            }
        },

        /**
         * Clear all application data
         */
        clearData: function () {
            console.log('Clear Data button clicked');

            // Show visual feedback immediately
            if (window.LoadUI && window.LoadUI._showToast) {
                LoadUI._showToast('Clear Data clicked', 'info');
            }

            const performClear = function () {
                // User confirmed - clear all data
                if (window.LoadUI) LoadUI._showToast('Clearing all data...', 'warning');

                // Clear localStorage
                localStorage.clear();

                // Clear cache if CacheManager is available
                if (window.CacheManager) {
                    if (CacheManager.wikiDataStore) CacheManager.wikiDataStore = { searchResults: {} };
                    if (CacheManager.wikiCacheStore) CacheManager.wikiCacheStore = {};
                }

                // Show success message
                if (window.LoadUI) LoadUI._showToast('All data cleared! Reloading...', 'success');

                setTimeout(() => {
                    window.location.reload();
                }, 800);
            };

            const cancelClear = function () {
                if (window.LoadUI) LoadUI._showToast('Clear Data cancelled', 'info');
            };

            // Show custom confirmation modal instead of native confirm()
            if (window.LoadUI && window.LoadUI._showConfirmModal) {
                LoadUI._showConfirmModal(
                    'Clear All Data',
                    'Are you sure you want to clear all application data? This cannot be undone.',
                    performClear,
                    cancelClear
                );
            } else {
                // Fallback immediate exec if UI module missing (unlikely)
                if (confirm('Are you sure you want to clear all application data? This cannot be undone.')) {
                    performClear();
                }
            }
        }
    };

    window.LoadData = LoadData;
})();
