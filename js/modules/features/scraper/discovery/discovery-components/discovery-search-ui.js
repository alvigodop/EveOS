/**
 * DiscoverySearchUI Module
 * Handles UI interactions for the Discovery Search process
 */
const DiscoverySearchUI = {};

/**
 * Show loading indicator in the results container
 * @param {HTMLElement} container - The container element
 * @param {string} searchTerm - The search term being processed
 */
DiscoverySearchUI.showLoading = function (container, searchTerm) {
    if (!container) return;

    // Clear previous results
    container.innerHTML = '';

    // Show loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'discovery-loading';
    loadingIndicator.innerHTML = `
        <div class="discovery-spinner"></div>
        <p>Searching for Fandom wikis matching "${searchTerm}"...</p>
    `;
    container.appendChild(loadingIndicator);
};

/**
 * Clear the loading indicator
 * @param {HTMLElement} container - The container element
 */
DiscoverySearchUI.clearLoading = function (container) {
    if (!container) return;

    const loadingEl = container.querySelector('.discovery-loading');
    if (loadingEl) {
        loadingEl.remove();
    }
};

/**
 * Show no results message
 * @param {HTMLElement} container - The container element
 * @param {string} searchTerm - The search term used
 */
DiscoverySearchUI.showNoResults = function (container, searchTerm) {
    if (!container) return;

    // Only show no results message if no other content exists
    if (container.children.length === 0) {
        const noResultsEl = document.createElement('div');
        noResultsEl.className = 'discovery-no-results';
        noResultsEl.innerHTML = `
            <div class="discovery-error-icon">⚠️</div>
            <div class="discovery-error-content">
                <h3>No Fandom community wikis found</h3>
                <p>We couldn't find any Fandom wikis for "${searchTerm}".</p>
            </div>
        `;
        container.appendChild(noResultsEl);
    }
};

// Check for ModuleRegistry and register this module
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('DiscoverySearchUI', DiscoverySearchUI);
} else {
    window.DiscoverySearchUI = DiscoverySearchUI;
}
