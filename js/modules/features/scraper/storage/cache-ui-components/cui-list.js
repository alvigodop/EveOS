/**
 * Cache UI Components - List Renderer
 * 
 * Handles rendering of lists and cards for cache entries.
 */
(function () {
    'use strict';

    window.CUIList = {
        /**
         * Render data as a list of cards (for wiki entries)
         * @param {Object} data - collection of entries
         * @param {string} title - title of the section
         * @returns {string} HTML string
         */
        renderCacheList: function (data, title) {
            let html = `<div class="cache-header"><h4>${title} Entries</h4></div>`;

            // Render metadata (primitives) separated from entries
            let metadataHtml = '';
            const entries = {};

            for (const key in data) {
                if (data.hasOwnProperty(key)) {
                    const val = data[key];
                    if (typeof val !== 'object' || val === null) {
                        // Formatting for readable metadata
                        let displayVal = val;
                        if (key.includes('Update') || key.includes('Time') || key.includes('Date')) {
                            try { displayVal = new Date(val).toLocaleString(); } catch (e) { }
                        }
                        metadataHtml += `<div class="stat-item" style="margin-bottom: 5px;">
                            <span class="stat-label" style="font-weight:bold; color:#555;">${key}:</span>
                            <span class="stat-value" style="margin-left:5px;">${displayVal}</span>
                        </div>`;
                    } else {
                        entries[key] = val;
                    }
                }
            }

            if (metadataHtml) {
                html += `<div class="cache-metadata-container" style="padding: 10px; background: #f9f9f9; border: 1px solid #eee; border-radius: 5px; margin-bottom: 15px;">
                    <h5 style="margin-top:0; margin-bottom:10px; color:#666;">Collection Metadata</h5>
                    ${metadataHtml}
                </div>`;
            }

            html += '<div class="cache-cards-container">';
            const entryKeys = Object.keys(entries);

            if (entryKeys.length === 0) {
                html += '<p>No content entries found.</p>';
            } else {
                html += `<div class="entries-count" style="margin-bottom:10px; color:#666; font-size:0.9em;">Showing ${entryKeys.length} entries</div>`;
                for (const key in entries) {
                    html += this.renderCacheCard(entries[key]);
                }
            }

            html += '</div>';
            return html;
        },

        /**
         * Render a single cache entry card
         * @param {Object} entry - entry data
         * @returns {string} HTML string
         */
        renderCacheCard: function (entry) {
            const title = entry.title || 'Unknown Title';
            const contentType = entry.contentType || 'unknown';
            const categories = Array.isArray(entry.categories) ? entry.categories : [];
            const date = entry.lastUpdate ? new Date(entry.lastUpdate).toLocaleString() : 'N/A';

            // Format content for preview
            let contentPreview = '';
            if (entry.content) {
                contentPreview = entry.content.substring(0, 150) + (entry.content.length > 150 ? '...' : '');
            } else if (entry.snippet) {
                contentPreview = entry.snippet; // Snippets are usually short
            } else {
                contentPreview = 'No content preview available';
            }

            return `
            <div class="cache-item-card">
                <div class="cache-item-header">
                    <span class="cache-item-title">${title}</span>
                    <div class="cache-item-meta">
                        <span class="cache-item-badge">${contentType}</span>
                        <span class="cache-item-date">${date}</span>
                    </div>
                </div>
                <div class="cache-item-body">
                    ${categories.length > 0 ? `
                    <div class="cache-item-row">
                        <span class="cache-item-label">Categories:</span>
                        <div class="cache-item-categories">
                            ${categories.map(cat => `<span class="cache-category-tag">${cat}</span>`).join('')}
                        </div>
                    </div>` : ''}
                    
                    <div class="cache-item-row">
                        <span class="cache-item-label">Content:</span>
                        <span class="cache-item-value cache-item-content">${contentPreview}</span>
                    </div>
                    
                    ${entry.aliases && entry.aliases.length > 0 ? `
                    <div class="cache-item-row">
                        <span class="cache-item-label">Aliases:</span>
                        <span class="cache-item-value">${entry.aliases.join(', ')}</span>
                    </div>` : ''}
                </div>
                <details style="margin-top: 10px;">
                    <summary style="cursor: pointer; color: #777; font-size: 0.8em;">View Raw JSON</summary>
                    <pre style="font-size: 0.7em; background: #f5f5f5; padding: 10px; overflow: auto; max-height: 200px;">${JSON.stringify(entry, null, 2)}</pre>
                </details>
            </div>
            `;
        }
    };

    console.log('[CUIList] Loaded');
})();
