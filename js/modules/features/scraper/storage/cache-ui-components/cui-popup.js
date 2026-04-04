/**
 * Cache UI Components - Popup Manager
 * 
 * Handles interaction with the data popup.
 */
(function () {
    'use strict';

    function ensureDataPopupElements() {
        let popup = document.getElementById('dataPopup');
        let dataPopupContent = document.getElementById('dataPopupContent');
        let dataPopupTitle = document.getElementById('dataPopupTitle');
        let dataPopupFrame = document.getElementById('dataPopupFrame');

        if (popup && popup.parentElement !== document.body) {
            document.body.appendChild(popup);
        }

        if (popup && !popup.dataset.cuiPopupBound) {
            popup.dataset.cuiPopupBound = '1';
            const closeButton = popup.querySelector('.popup-close');
            if (closeButton) {
                closeButton.removeAttribute('onclick');
                closeButton.addEventListener('click', function () {
                    popup.classList.remove('active');
                    popup.style.display = 'none';
                });
            }
        }

        if (popup && dataPopupContent && dataPopupTitle) {
            return { popup, dataPopupContent, dataPopupTitle, dataPopupFrame };
        }

        const host = document.createElement('div');
        host.innerHTML = `
            <div id="dataPopup" class="popup" style="display: none;">
                <div class="popup-content data-popup-content">
                    <div class="popup-header">
                        <h3 id="dataPopupTitle">Cached Data</h3>
                        <div class="popup-nav">
                            <button class="popup-close" type="button" aria-label="Close Cache Popup">&times;</button>
                        </div>
                    </div>
                    <div class="popup-body">
                        <div id="dataPopupContent" class="data-content"></div>
                        <iframe id="dataPopupFrame" class="popup-iframe" src="about:blank" style="display: none;"></iframe>
                    </div>
                </div>
            </div>
        `.trim();

        popup = host.firstElementChild;
        if (!popup) {
            return { popup: null, dataPopupContent: null, dataPopupTitle: null, dataPopupFrame: null };
        }

        document.body.appendChild(popup);
        popup.dataset.cuiPopupBound = '1';
        popup.querySelector('.popup-close')?.addEventListener('click', function () {
            popup.classList.remove('active');
            popup.style.display = 'none';
        });

        dataPopupContent = popup.querySelector('#dataPopupContent');
        dataPopupTitle = popup.querySelector('#dataPopupTitle');
        dataPopupFrame = popup.querySelector('#dataPopupFrame');

        return { popup, dataPopupContent, dataPopupTitle, dataPopupFrame };
    }

    window.CUIPopup = {
        /**
         * Display cached data in a popup window
         * @param {Object} data - The data to display
         * @param {string} title - The title for the popup
         */
        displayCachedData: function (data, title) {
            console.log('Displaying cached data:', title);

            // Ensure the popup shell exists even when the Scraper tab has not rendered yet.
            const {
                popup,
                dataPopupContent,
                dataPopupTitle,
                dataPopupFrame
            } = ensureDataPopupElements();

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

            if (dataPopupFrame) {
                dataPopupFrame.style.display = 'none';
                dataPopupFrame.classList.remove('visible');
            }

            // Show the popup
            popup.classList.add('active');
            popup.style.display = 'flex';
            popup.style.zIndex = '20000';
        }
    };

    console.log('[CUIPopup] Loaded');
})();
