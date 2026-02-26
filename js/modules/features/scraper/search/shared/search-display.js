/**
 * Search Display Module
 * 
 * Handles rendering of search results, errors, and loading states
 * for the Search Manager.
 */
const SearchDisplay = {};

/**
 * Initialize the module
 */
SearchDisplay.init = function () {
    console.log('SearchDisplay initialized');
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('SearchDisplay', SearchDisplay);
    }
};

/**
 * Display search results in the results container
 * @param {Array} results - The search results
 * @param {string} searchTerm - The search term
 * @param {string} searchMethod - The method used for search
 * @param {string} containerId - The ID of the results container (default: 'discovery-results-container')
 */
SearchDisplay.displaySearchResults = function (results, searchTerm, searchMethod, containerId = 'discovery-results-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear container
    container.innerHTML = '';

    // Create results header
    const header = document.createElement('div');
    header.className = 'results-header';
    header.innerHTML = `
        <h2>Search Results for "${searchTerm}"</h2>
        <p>Found ${results.length} ${results.length === 1 ? 'result' : 'results'} 
           ${searchMethod ? `using ${searchMethod} search` : ''}</p>
    `;
    container.appendChild(header);

    // Create results list
    const resultsList = document.createElement('ul');
    resultsList.className = 'results-list';

    // Add each result
    results.forEach(result => {
        const resultItem = document.createElement('li');
        resultItem.className = 'result-item';

        const resultLink = document.createElement('a');
        resultLink.href = result.url;
        resultLink.target = '_blank';
        resultLink.rel = 'noopener noreferrer';
        resultLink.className = 'result-link';

        resultLink.innerHTML = `
            <h3>${result.name || 'Unnamed Wiki'}</h3>
            <p class="result-domain">${result.domain || new URL(result.url).hostname}</p>
            <p class="result-description">${result.description || 'No description available'}</p>
        `;

        resultItem.appendChild(resultLink);
        resultsList.appendChild(resultItem);
    });

    container.appendChild(resultsList);
};

/**
 * Display no results message
 * @param {string} searchTerm - The search term
 * @param {string} error - Optional error message
 * @param {string} containerId - The ID of the results container
 */
SearchDisplay.displayNoResults = function (searchTerm, error, containerId = 'discovery-results-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="no-results">
            <h2>No Results Found</h2>
            <p>No Fandom communities found for "${searchTerm}"</p>
            ${error ? `<p class="error-message">Error: ${error}</p>` : ''}
            <div class="search-suggestions">
                <h3>Suggestions:</h3>
                <ul>
                    <li>Check your spelling</li>
                    <li>Try more general keywords</li>
                    <li>Try different search options</li>
                    <li>Check your internet connection</li>
                </ul>
            </div>
        </div>
    `;
};

/**
 * Display error message
 * @param {string} searchTerm - The search term
 * @param {Error} error - The error object
 * @param {string} containerId - The container ID
 * @param {Function} retryCallback - Callback function for retry button
 */
SearchDisplay.displayError = function (searchTerm, error, containerId = 'discovery-results-container', retryCallback = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="search-error">
            <h2>Search Error</h2>
            <p>An error occurred while searching for "${searchTerm}"</p>
            <p class="error-message">${error.message || 'Unknown error'}</p>
            <button id="retry-search" class="retry-button">Retry Search</button>
        </div>
    `;

    // Add event listener for retry button
    const retryButton = document.getElementById('retry-search');
    if (retryButton && retryCallback) {
        retryButton.addEventListener('click', retryCallback);
    }
};

/**
 * Display basic search results when no display module is available
 * @param {Array} results - The search results
 * @param {Element|string} container - The container element or ID
 * @param {string} query - The search query
 */
SearchDisplay.displayBasicResults = function (results, container, query) {
    if (typeof container === 'string') {
        container = document.getElementById(container);
    }
    if (!container) return;

    // Clear the container
    container.innerHTML = '';

    // Create a header
    const header = document.createElement('h3');
    header.textContent = `Search results for "${query}"`;
    container.appendChild(header);

    // Create a list for the results
    const resultsList = document.createElement('div');
    resultsList.className = 'search-results-list';

    // Add each result
    results.forEach(result => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';

        const title = document.createElement('h4');
        const link = document.createElement('a');
        link.href = result.url;
        link.target = '_blank';
        link.textContent = result.name || result.title || 'Untitled';
        title.appendChild(link);

        const description = document.createElement('p');
        description.textContent = result.description || '';

        const domain = document.createElement('span');
        domain.className = 'domain';
        domain.textContent = result.domain || '';

        resultItem.appendChild(title);
        resultItem.appendChild(description);
        resultItem.appendChild(domain);

        resultsList.appendChild(resultItem);
    });

    container.appendChild(resultsList);
};

// Expose globally
window.SearchDisplay = SearchDisplay;
