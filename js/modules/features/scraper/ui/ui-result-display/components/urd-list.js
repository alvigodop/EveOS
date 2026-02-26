/**
 * UI Result Display - List Component
 * 
 * Handles list layout rendering.
 * 
 * @version 1.0.0
 */

const URDList = {
    /**
     * Displays search results in a list layout
     * @param {Array|Object} results - The search results to display
     * @param {string} groupBy - How results are grouped ('none' or attribute name)
     * @param {HTMLElement} resultsDiv - The container to display results in
     */
    displayListResults: function (results, groupBy, resultsDiv) {
        let html = '';

        if (groupBy === 'none') {
            // Not grouped, display as a simple list
            html = '<div class="results-list">';

            results.forEach(result => {
                html += this.createResultListItem(result);
            });

            html += '</div>';
        } else {
            // Grouped, display as grouped list
            html = '<div class="grouped-results">';

            Object.keys(results).sort().forEach(group => {
                html += `
                    <div class="result-group">
                        <h3 class="group-title">${group}</h3>
                        <div class="results-list">
                `;

                results[group].forEach(result => {
                    html += this.createResultListItem(result);
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
     * Creates a list item for a result in the list view
     * @param {Object} result - The result to create a list item for
     * @returns {string} - The HTML for the list item
     */
    createResultListItem: function (result) {
        const title = result.title || result.name || 'Untitled';
        const description = result.description || 'No description available';
        const url = result.url || '#';

        return `
            <div class="result-list-item">
                <div class="result-content">
                    <h3 class="result-title">${title}</h3>
                    <p class="result-description">${description}</p>
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="result-link" onclick="if(window.PopupManager && window.PopupManager.openPopup) { event.preventDefault(); event.stopPropagation(); PopupManager.openPopup('${url.replace(/'/g, "\\'")}', '${title.replace(/'/g, "\\'")}'); return false; }">
                        ${url}
                        <span class="external-link-icon">↗</span>
                    </a>
                </div>
            </div>
        `;
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('URDList', URDList);
}

window.URDList = URDList;
