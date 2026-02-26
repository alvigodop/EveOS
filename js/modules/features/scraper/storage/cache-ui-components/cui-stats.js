/**
 * Cache UI Components - Stats Renderer
 * 
 * Handles rendering of statistics grids.
 */
(function () {
    'use strict';

    window.CUIStats = {
        /**
         * Render data as a stats grid
         * @param {Object} data - data to display
         * @param {string} title - title of the section
         * @returns {string} HTML string
         */
        renderStatsGrid: function (data, title) {
            let content = '<div class="cache-stats-container">';
            content += `<h4>${title} Details</h4>`;

            // Create a statistics grid
            content += '<div class="stats-grid">';
            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    let value = data[key];

                    // Format the value better if it's an object or array
                    if (typeof value === 'object' && value !== null) {
                        if (Object.keys(value).length > 5) {
                            value = `Object with ${Object.keys(value).length} properties`;
                        } else {
                            value = JSON.stringify(value);
                        }
                    }

                    content += `<div class="stat-item">
                        <span class="stat-label">${key}</span>
                        <span class="stat-value">${value}</span>
                    </div>`;
                }
            }
            content += '</div></div>';

            // Add JSON representation
            content += `<details>
                <summary>Raw Data (Click to expand)</summary>
                <pre class="json-data">${JSON.stringify(data, null, 2)}</pre>
            </details>`;

            return content;
        }
    };

    console.log('[CUIStats] Loaded');
})();
