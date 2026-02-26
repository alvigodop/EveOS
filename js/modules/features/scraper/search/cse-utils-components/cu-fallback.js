/**
 * Google CSE Utilities - Fallback Component
 * 
 * Handles creation of fallback UI when Google CSE fails to load.
 * 
 * @version 1.0.0
 */

const CUFallback = {
    /**
     * Create fallback search UI
     * @param {Object} config - CSE Configuration
     * @param {string} reason - Error reason
     * @param {Function} retryCallback - Function to call on retry
     * @param {Object} domUtils - Reference to CUDOM or similar (dependency injection)
     */
    createFallbackSearch: function (config, reason, retryCallback, domUtils) {
        try {
            console.log(`CUFallback: Creating fallback search UI (Reason: ${reason})`);

            // Use injected DOM utils or fallback
            if (domUtils && typeof domUtils.ensureContainersExist === 'function') {
                domUtils.ensureContainersExist(config.containerIds);
            } else if (window.CUDOM) {
                window.CUDOM.ensureContainersExist(config.containerIds);
            }

            const searchBox = document.getElementById(config.containerIds.searchBoxId);
            const resultsContainer = document.getElementById(config.containerIds.resultsContainerId);

            if (!searchBox || !resultsContainer) return;

            // Clear
            searchBox.innerHTML = '';
            resultsContainer.innerHTML = '';

            // Create UI
            const form = document.createElement('form');
            form.className = 'fallback-search-form';
            form.style.cssText = 'display: flex; width: 100%; max-width: 600px; margin: 0 auto; gap: 8px;';

            form.innerHTML = `
                <input type="text" placeholder="Search Google..." class="fallback-search-input" style="flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
                <button type="submit" class="fallback-search-button" style="padding: 10px 20px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">Search</button>
            `;

            searchBox.appendChild(form);

            // Error Message
            const messageEl = document.createElement('div');
            messageEl.className = 'fallback-search-message';
            messageEl.style.cssText = 'margin: 20px auto; padding: 16px; background: #fff0f0; border: 1px solid #ffcdd2; border-radius: 8px; max-width: 600px; color: #d32f2f;';

            messageEl.innerHTML = `
                <h3 style="margin-top: 0;">Search Engine Unavailable</h3>
                <p>We couldn't load the custom search engine.</p>
                <p><small>Details: ${reason}</small></p>
                <div style="margin-top: 15px;">
                    <button id="retry-cse-btn" style="padding: 8px 12px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry Loading</button>
                    <a href="https://cse.google.com/cse?cx=${config.cseId}" target="_blank" style="margin-left: 10px; color: #d32f2f;">Search Directly</a>
                </div>
            `;

            resultsContainer.appendChild(messageEl);

            // Events
            const retryBtn = document.getElementById('retry-cse-btn');
            if (retryBtn && typeof retryCallback === 'function') {
                retryBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    retryCallback();
                });
            }

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = form.querySelector('input');
                const query = input.value.trim();
                if (query) {
                    window.open(`https://cse.google.com/cse?cx=${config.cseId}&q=${encodeURIComponent(query)}`, '_blank');
                }
            });

        } catch (error) {
            console.error('CUFallback: Error creating fallback:', error);
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('CUFallback', CUFallback);
}

window.CUFallback = CUFallback;
