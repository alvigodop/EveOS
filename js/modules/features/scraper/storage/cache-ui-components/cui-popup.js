/**
 * Cache UI Components - Popup Manager
 * 
 * Handles interaction with the data popup.
 */
(function () {
    'use strict';

    window.CUIPopup = {
        /**
         * Display cached data in a popup window
         * @param {Object} data - The data to display
         * @param {string} title - The title for the popup
         */
        displayCachedData: function (data, title) {
            console.log('Displaying cached data:', title);

            // Get the data popup elements
            const popup = document.getElementById('dataPopup');
            const dataPopupContent = document.getElementById('dataPopupContent');
            const dataPopupTitle = document.getElementById('dataPopupTitle');

            if (!popup || !dataPopupContent) {
                console.error('Data popup elements not found in DOM');
                if (window.CUIUtils) CUIUtils.showToast('Error displaying cache data: Popup elements not found', 'error');
                else alert('Error displaying cache data: Popup elements not found');
                return;
            }

            // Set the title
            if (dataPopupTitle) {
                dataPopupTitle.textContent = title || 'Cached Data';
            }

            // Create content
            let content = '';

            // Check if data is a string or object
            if (typeof data === 'string') {
                content = `<pre>${data}</pre>`;
            } else if (Array.isArray(data)) {
                // Handle array data
                content = '<div class="cache-array-data">';
                data.forEach((item, index) => {
                    content += `<div class="cache-array-item">
                        <h4>Item ${index + 1}</h4>
                        <pre>${JSON.stringify(item, null, 2)}</pre>
                    </div>`;
                });
                content += '</div>';
            } else if (typeof data === 'object' && data !== null) {
                // Check if this looks like a collection of wiki entries
                const entries = Object.values(data);
                const objectEntries = entries.filter(v => typeof v === 'object' && v !== null);

                const isWikiCollection = objectEntries.length > 0 &&
                    objectEntries.some(v => v.title && (v.content || v.snippet || v.categories || v.contentType));

                // Check if it's a SINGLE wiki entry
                const isSingleEntry = data.title && (data.content || data.snippet || data.categories || data.contentType);

                if (isWikiCollection && window.CUIList) {
                    content = CUIList.renderCacheList(data, title);
                } else if (isSingleEntry && window.CUIList) {
                    // Render as a single card
                    content = `<div class="cache-cards-container">
                        <div class="cache-header" style="margin-bottom:10px;"><h4>${title} Entry</h4></div>
                        ${CUIList.renderCacheCard(data)}
                    </div>`;
                } else if (window.CUIStats) {
                    // Handle standard object data - format as a table/grid
                    content = CUIStats.renderStatsGrid(data, title);
                } else {
                    // Fallback if modules missing
                    content = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
                }
            } else {
                // Handle other types
                content = `<p>Unknown data type: ${typeof data}</p>`;
            }

            // Set the content
            dataPopupContent.innerHTML = content;

            // Make content visible and hide iframe if any
            dataPopupContent.style.display = 'block';
            dataPopupContent.classList.add('visible');

            const iframe = document.getElementById('dataPopupFrame');
            if (iframe) {
                iframe.style.display = 'none';
                iframe.classList.remove('visible');
            }

            // Show the popup
            popup.style.display = 'block';
        }
    };

    console.log('[CUIPopup] Loaded');
})();
