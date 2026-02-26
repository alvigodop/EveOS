/**
 * Discovery Renderer Module
 * Handles rendering of discovery results for Fandom and Wikipedia.
 * Extracted from ui-core.js
 */

const DiscoveryRenderer = {
    version: '1.0.0',

    init: function () {
        console.log('DiscoveryRenderer initialized');
        return this;
    },

    /**
     * Displays Fandom discovery results
     * @param {Array} results - The search results
     * @param {string} searchTerm - The search term used
     * @param {HTMLElement} container - The container to display results in
     */
    displayFandomResults: function (results, searchTerm, container) {
        if (!container) {
            console.error('No container provided for displaying discovery results');
            return;
        }

        if (!results || results.length === 0) {
            container.innerHTML = '<div class="no-results">No Fandom community wikis found matching your search term.</div>';
            return;
        }

        let html = '';

        results.forEach(wiki => {
            const isAdded = (window.WikiManager && WikiManager.fandomDomains)
                ? WikiManager.fandomDomains.some(existing => existing.domain === wiki.domain)
                : false;

            // Use the already highlighted name/description but ensure no nested highlighting
            const title = wiki.highlightedName
                ? wiki.highlightedName
                : wiki.name || 'Unknown Wiki';

            const description = wiki.highlightedDescription
                ? wiki.highlightedDescription
                : wiki.description || 'No description available';

            const domain = wiki.domain || '';
            const url = wiki.url || `https://${domain}`;

            // Format HTML for the verified community badge if needed
            const verifiedBadge = wiki.verified ? '<span class="verified-community">Verified Community</span>' : '';

            html += `
                <div class="wiki-item">
                    <div class="wiki-info">
                        <div class="wiki-title">${title} ${verifiedBadge}</div>
                        <div class="wiki-url">
                            <a href="${url}" target="_blank" class="wiki-link">
                                ${domain}
                                <span class="external-link-icon">↗</span>
                            </a>
                        </div>
                        <div class="wiki-description">${description}</div>
                    </div>
                    <button 
                        onclick="WikiManager.addFandomDomainFromDiscovery('${url}', '${title.replace(/'/g, "\\'").replace(/<[^>]*>/g, '')}')" 
                        class="action-btn add-btn add-wiki-btn"
                        ${isAdded ? 'disabled' : ''}
                    >
                        ${isAdded ? 'Added' : 'Add'}
                    </button>
                </div>
            `;
        });

        container.innerHTML = html;

        // Force style recalculation to ensure highlighting is applied correctly
        container.style.display = 'none';
        setTimeout(() => { container.style.display = ''; }, 0);
    },

    /**
     * Displays Wikipedia discovery results
     * @param {Array} results - The search results
     * @param {string} searchTerm - The search term used
     * @param {HTMLElement} container - The container to display results in
     * @param {Array} existingEntries - List of existing entries to check against
     */
    displayWikiResults: function (results, searchTerm, container, existingEntries = []) {
        if (!container) {
            console.error('No container provided for displaying Wikipedia discovery results');
            return;
        }

        if (!results || results.length === 0) {
            container.innerHTML = '<div class="no-results">No Wikipedia articles found matching your search term.</div>';
            return;
        }

        let html = '';

        results.forEach(article => {
            const isAdded = existingEntries.some(existing => existing.title === article.title);

            const title = article.highlightedTitle || article.title || 'Unknown Article';
            const snippet = article.highlightedSnippet || article.snippet || 'No description available';
            const url = article.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`;

            html += `
                <div class="wiki-item">
                    <div class="wiki-info">
                        <div class="wiki-title">${title}</div>
                        <div class="wiki-url">
                            <a href="${url}" target="_blank" class="wiki-link">
                                ${article.title}
                                <span class="external-link-icon">↗</span>
                            </a>
                        </div>
                        <div class="wiki-description">${snippet}</div>
                        ${article.categories ? `
                            <div class="wiki-categories">
                                Categories: ${article.categories.slice(0, 3).join(', ')}
                                ${article.categories.length > 3 ? '...' : ''}
                            </div>
                        ` : ''}
                        ${article.relevance ? `<div class="wiki-relevance">Relevance: ${article.relevance}</div>` : ''}
                    </div>
                    <button 
                        onclick="WikiManager.addWikiEntryFromDiscovery('${article.title.replace(/'/g, "\\'")}')" 
                        class="action-btn add-btn add-wiki-btn"
                        ${isAdded ? 'disabled' : ''}
                    >
                        ${isAdded ? 'Added' : 'Add'}
                    </button>
                </div>
            `;
        });

        container.innerHTML = html;
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('DiscoveryRenderer', DiscoveryRenderer);
}

// Make globally available
window.DiscoveryRenderer = DiscoveryRenderer;

console.log('DiscoveryRenderer module loaded');
