/**
 * Search UI Renderer Fandom Component
 * Handles rendering of Fandom search results.
 */
const SearchUIRendererFandom = {};

/**
 * Initialize the module
 */
SearchUIRendererFandom.init = function () {
    console.log('SearchUIRendererFandom initialized');
};

/**
 * Render Fandom search results (Moved from FandomSearch)
 * @param {Array} results - The results to render
 * @param {Element|string} container - Container element or selector
 * @param {string} query - The search query
 * @param {Object} handlers - Event handlers
 */
SearchUIRendererFandom.renderFandomResults = function (results, container, query, handlers = {}) {
    console.log(`SearchUIRendererFandom: Rendering ${results.length} Fandom results matching "${query}"`);

    // Handle container as string (selector) or element
    let resultsContainer = container;
    if (typeof container === 'string') {
        resultsContainer = document.querySelector(container) || document.getElementById(container);
    }

    if (!resultsContainer) {
        console.error('SearchUIRendererFandom: Results container not found');
        return;
    }

    // Clear previous results
    resultsContainer.innerHTML = '';

    // Check if we have results
    if (!results || !Array.isArray(results) || results.length === 0) {
        resultsContainer.innerHTML = `<div class="no-results">No Fandom community wikis found. Try a different search term.</div>`;
        return;
    }

    // Create results container
    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'fandom-search-results';

    // Add each result
    results.forEach(result => {
        const resultElement = document.createElement('div');
        resultElement.className = 'search-result-item';

        // Create favicon if available
        let faviconHtml = '';
        if (result.favicon) {
            faviconHtml = `<img src="${result.favicon}" alt="Wiki favicon" class="wiki-favicon">`;
        }

        // Get title and url
        const title = result.name || result.title || '';
        const url = result.url || `https://${result.domain}` || '#';
        const description = result.description || '';
        const domain = result.domain || new URL(url).hostname;

        // Escape for attributes
        const escapedTitle = title.replace(/'/g, "\\'");
        const escapedUrl = url.replace(/'/g, "\\'");

        // Check if added
        // Use handler's isAdded check if provided, otherwise trust previous complex logic or default false
        const isAdded = handlers.isAdded ? handlers.isAdded(url, domain) : false;

        // Build result HTML
        resultElement.innerHTML = `
            <div class="wiki-content">
                <a href="${url}" target="_blank" class="wiki-link">
                    ${faviconHtml}
                    <div class="wiki-info">
                        <h3 class="wiki-title">${title}</h3>
                        <p class="wiki-description">${description}</p>
                        <span class="wiki-url">${url}</span>
                    </div>
                </a>
                <div class="wiki-actions">
                    <button 
                        class="action-btn add-btn add-wiki-btn" 
                        data-url="${escapedUrl}" 
                        data-title="${escapedTitle}"
                        ${isAdded ? 'disabled' : ''}
                    >
                        ${isAdded ? 'Added' : 'Add'}
                    </button>
                </div>
            </div>
        `;

        resultsGrid.appendChild(resultElement);
    });

    resultsContainer.appendChild(resultsGrid);

    // Attach event listeners
    const buttons = resultsGrid.querySelectorAll('.add-wiki-btn');
    buttons.forEach(btn => {
        btn.onclick = function (e) {
            e.preventDefault(); // Prevent accidental navigation or submission
            if (handlers.onAdd) {
                // Pass url and title
                handlers.onAdd(btn.dataset.url, btn.dataset.title, btn);
            }
        };
    });
};

window.SearchUIRendererFandom = SearchUIRendererFandom;
