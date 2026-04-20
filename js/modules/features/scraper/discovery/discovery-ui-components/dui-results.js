/**
 * Discovery UI Results Module
 * Handles rendering of search results
 */
const DUIResults = {};

/**
 * Renders Google-style search results
 * @param {Array} results - The results to display
 * @param {HTMLElement} container - The container to render in
 * @param {string} searchTerm - The search term
 */
DUIResults.renderGoogleSearchResults = function (results, container, searchTerm) {
    if (!results || !container) return;

    // Find the correct container for Fandom results
    const fandomContainer = container.classList.contains('fandom-results') ?
        container :
        document.querySelector('.google-search-results-container.fandom-results');

    // Use fandom container if available, otherwise use provided container
    const targetContainer = fandomContainer || container;

    // Update search stats
    const statsEl = targetContainer.querySelector('.google-search-stats');
    if (statsEl) {
        const randomMs = Math.floor(Math.random() * 900) + 100;
        statsEl.textContent = `About ${results.length} results (0.${randomMs} seconds)`;
    }

    // For each result, create a Google-like search result
    results.forEach(result => {
        const resultElement = document.createElement('div');
        resultElement.className = 'google-result';

        // Format URL
        let displayUrl = result.domain || '';
        if (!displayUrl.startsWith('https://')) {
            displayUrl = 'https://' + displayUrl;
        }

        // Create trimmed URL display format
        let urlObj;
        let hostname = '';
        let pathDisplay = '';

        try {
            urlObj = new URL(displayUrl);
            hostname = urlObj.hostname;
            pathDisplay = urlObj.pathname === '/' ? '' : urlObj.pathname;
        } catch (e) {
            hostname = displayUrl;
        }

        // Create URL line with breadcrumb format
        const urlLine = document.createElement('div');
        urlLine.className = 'google-result-url';
        urlLine.innerHTML = `
            <img src="${window.EveFaviconUtils && typeof window.EveFaviconUtils.getBestEffortSrc === 'function' ? window.EveFaviconUtils.getBestEffortSrc(hostname, 32) : ''}" class="google-result-favicon" onerror="this.style.display='none'">
            <span class="google-site-url">${hostname}</span>
            <span class="google-url-path">${pathDisplay}</span>
        `;

        // Create title with highlighting
        const resultTitle = document.createElement('a');
        resultTitle.className = 'google-result-title';
        resultTitle.href = displayUrl;
        resultTitle.target = '_blank';
        // Use DUIUtils for highlighting
        const highlightFn = (window.DUIUtils && DUIUtils.highlightSearchTerms) ? DUIUtils.highlightSearchTerms : (t) => t;
        resultTitle.innerHTML = highlightFn(result.name || result.domain, searchTerm);

        // Create description with highlighting
        const resultDesc = document.createElement('div');
        resultDesc.className = 'google-result-description';
        resultDesc.innerHTML = highlightFn(result.description || 'Fandom community wiki page', searchTerm);

        // Create sidebar with site links if available
        const sidelinks = document.createElement('div');
        sidelinks.className = 'google-result-sitelinks';

        // Common pages for wikis
        const commonPages = [
            'Characters', 'Episodes', 'Locations', 'Weapons', 'Gallery'
        ];

        // Add two random common pages
        const randomPages = commonPages.sort(() => 0.5 - Math.random()).slice(0, 2);
        randomPages.forEach(page => {
            const link = document.createElement('a');
            link.href = `${displayUrl}/wiki/${page}`;
            link.target = '_blank';
            link.textContent = page;
            sidelinks.appendChild(link);
        });

        // Assemble the result
        resultElement.appendChild(urlLine);
        resultElement.appendChild(resultTitle);
        resultElement.appendChild(resultDesc);

        if (Math.random() > 0.5) { // Only show sitelinks sometimes
            resultElement.appendChild(sidelinks);
        }

        // Add option to add to collection
        const addButton = document.createElement('button');
        addButton.className = 'google-result-add-btn';
        addButton.innerHTML = '+ Add to collection';
        addButton.dataset.domain = result.domain;
        addButton.dataset.name = result.name || '';
        addButton.dataset.url = displayUrl;
        addButton.dataset.description = result.description || '';

        // Add event listener
        addButton.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const data = this.dataset;

            // Call the WikiManager add function if available
            if (window.WikiManager && typeof WikiManager.addFandomWiki === 'function') {
                WikiManager.addFandomWiki({
                    domain: data.domain,
                    name: data.name,
                    url: data.url,
                    description: data.description
                });

                // Provide visual feedback
                this.textContent = 'Added!';
                this.disabled = true;
                this.classList.add('added');

                setTimeout(() => {
                    this.textContent = '+ Add to collection';
                    this.disabled = false;
                    this.classList.remove('added');
                }, 2000);
            } else {
                // Fallback if WikiManager not available
                alert(`Added ${data.name} to collection (Simulated)`);
            }
        });

        resultElement.appendChild(addButton);

        // Add the result to the container
        targetContainer.appendChild(resultElement);
    });
};

// Ensure global availability
window.DUIResults = DUIResults;
console.log('[DUIResults] Loaded');
