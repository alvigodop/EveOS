/**
 * Search Discovery Broker UI
 * 
 * Handles DOM manipulation and rendering for discovery results.
 */
(function () {
    const SDBUI = {
        name: 'SDBUI'
    };

    /**
     * Display Wikipedia discovery results
     * @param {Array} results - The results to display
     * @param {HTMLElement} container - The container element
     * @param {HTMLElement} loadingIndicator - The loading indicator element
     */
    SDBUI.renderWikipediaResults = function (results, container, loadingIndicator) {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        container.innerHTML = ''; // Clear previous results

        if (!results || results.length === 0) {
            container.innerHTML = '<p class="info">No Wikipedia articles found.</p>';
            return;
        }

        // Check availability of WikiManager for "Add" functionality
        const wikiManagerAvailable = window.WikiManager && WikiManager.wikiEntries;

        results.forEach(result => {
            if (!result || !result.title || !result.url) return;

            const itemDiv = this.createWikiItem(result, wikiManagerAvailable);
            container.appendChild(itemDiv);
        });
    };

    /**
     * Create a single result item
     * @param {Object} result - result data
     * @param {boolean} wikiManagerAvailable - status of WikiManager
     */
    SDBUI.createWikiItem = function (result, wikiManagerAvailable) {
        const entryExists = wikiManagerAvailable ?
            WikiManager.wikiEntries.some(entry => entry.title.toLowerCase() === result.title.toLowerCase()) :
            false;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'wiki-item';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'wiki-info';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'wiki-title';
        titleDiv.textContent = result.title;

        const urlLink = document.createElement('a');
        urlLink.className = 'wiki-url';
        urlLink.href = result.url;
        urlLink.target = '_blank';
        urlLink.textContent = result.url;
        urlLink.innerHTML += ' <span class="external-link-icon">↗</span>';

        const descDiv = document.createElement('div');
        descDiv.className = 'wiki-description';
        descDiv.textContent = result.description || 'No description available.';

        infoDiv.appendChild(titleDiv);
        infoDiv.appendChild(urlLink);
        infoDiv.appendChild(descDiv);

        const addButton = document.createElement('button');
        addButton.className = 'add-wiki-btn';
        addButton.textContent = entryExists ? 'Added' : 'Add Entry';
        addButton.disabled = entryExists;

        const cleanTitle = result.title;
        addButton.onclick = () => {
            if (window.WikiManager && typeof WikiManager.addWikiEntryFromDiscovery === 'function') {
                const imageUrl = result.thumbnail || result.image || null;
                WikiManager.addWikiEntryFromDiscovery(cleanTitle, imageUrl);
                addButton.textContent = 'Added';
                addButton.disabled = true;
            } else {
                console.error('SDBUI: WikiManager unavailable');
                alert('Error: Cannot add entry. WikiManager is unavailable.');
            }
        };

        if (wikiManagerAvailable) {
            itemDiv.appendChild(infoDiv);
            itemDiv.appendChild(addButton);
        } else {
            itemDiv.appendChild(infoDiv);
        }

        return itemDiv;
    };

    /**
     * Show/Hide loading state
     */
    SDBUI.toggleLoading = function (show, indicator, container, text = 'Searching...') {
        if (indicator) {
            indicator.style.display = show ? 'block' : 'none';
            if (show) {
                const statusText = indicator.querySelector('.status-text') || indicator;
                if (statusText.textContent) statusText.textContent = text;
            }
        } else if (container && show) {
            container.innerHTML = `<div class="loading-indicator"><div class="spinner"></div> ${text}</div>`;
        }
    };

    /**
     * Display error in container
     */
    SDBUI.displayError = function (container, message) {
        if (container) {
            container.innerHTML = `<p class="error">${message}</p>`;
        }
    };

    window.SDBUI = SDBUI;
})();
