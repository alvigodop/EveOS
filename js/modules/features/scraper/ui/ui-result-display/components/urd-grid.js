/**
 * UI Result Display - Grid Component
 * 
 * Handles grid layout rendering.
 * 
 * @version 1.0.0
 */

const URDGrid = {
    /**
     * Displays search results in a grid layout
     * @param {Array|Object} results - The search results to display
     * @param {string} groupBy - How results are grouped ('none' or attribute name)
     * @param {HTMLElement} resultsDiv - The container to display results in
     */
    displayGridResults: function (results, groupBy, resultsDiv) {
        let html = '';

        if (groupBy === 'none') {
            // Not grouped, display as a simple grid
            html = '<div class="results-grid">';

            results.forEach(result => {
                html += this.createResultCard(result);
            });

            html += '</div>';
        } else {
            // Grouped, display as grouped grid
            html = '<div class="grouped-results">';

            Object.keys(results).sort().forEach(group => {
                html += `
                    <div class="result-group">
                        <h3 class="group-title">${group}</h3>
                        <div class="results-grid">
                `;

                results[group].forEach(result => {
                    html += this.createResultCard(result);
                });

                html += `
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        }

        resultsDiv.innerHTML = html;
    },

    /**
     * Creates a card for a result in the grid view
     * @param {Object} result - The result to create a card for
     * @returns {string} - The HTML for the card
     */
    createResultCard: function (result) {
        const title = result.title || result.name || 'Untitled';
        const description = result.description || 'No description available';
        const url = result.url || '#';
        const thumbnail = result.thumbnail || 'https://via.placeholder.com/200x120';
        const fallbackThumb = 'https://via.placeholder.com/200x120';

        return `
            <div class="result-card">
                <div class="result-thumbnail">
                    <img src="${thumbnail}" alt="${title}" onerror="if(window.setupProxiedImage){window.setupProxiedImage(this,'${thumbnail.replace(/'/g, "\\'")}','${fallbackThumb}')}else{this.src='${fallbackThumb}'}">
                </div>
                <div class="result-content">
                    <h3 class="result-title">${title}</h3>
                    <p class="result-description">${description}</p>
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="result-link" onclick="if(window.PopupManager && window.PopupManager.openPopup) { event.preventDefault(); event.stopPropagation(); PopupManager.openPopup('${url.replace(/'/g, "\\'")}', '${title.replace(/'/g, "\\'")}'); return false; }">
                        Visit
                        <span class="external-link-icon">↗</span>
                    </a>
                </div>
            </div>
        `;
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('URDGrid', URDGrid);
}

window.URDGrid = URDGrid;
