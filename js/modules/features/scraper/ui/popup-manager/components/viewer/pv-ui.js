/**
 * Popup Viewer UI Component
 * 
 * Handles DOM manipulation and visibility for popups
 */
(function () {
    'use strict';

    const PVUI = {
        /**
         * toggle wiki popup visibility
         * @param {boolean} show 
         */
        toggleWikiPopup: function (show) {
            const popup = document.getElementById('wikiPopup');
            if (popup) {
                if (show) {
                    popup.classList.add('active');
                    popup.style.display = '';
                    popup.style.zIndex = '20000'; // Ensure it's above settings modal
                } else {
                    popup.classList.remove('active');
                    // We don't necessarily hide display none immediately in original code for close,
                    // but line 32 of original says: style.display = '' on open.
                    // Line 50 says: classList.remove('active').
                }
            }
        },

        /**
         * toggle data popup visibility
         * @param {boolean} show 
         */
        toggleDataPopup: function (show) {
            const popup = document.getElementById('dataPopup');
            if (popup) {
                if (show) {
                    popup.classList.add('active');
                    popup.style.display = 'flex';
                    popup.style.zIndex = '20000'; // Ensure it's above settings modal
                } else {
                    popup.classList.remove('active');
                    popup.style.display = 'none';
                }
            }
        },

        updateWikiTitle: function (title) {
            const popupTitle = document.getElementById('wikiPopupTitle');
            if (popupTitle) {
                popupTitle.textContent = title || 'Wiki Article';
            }
        },

        updateDataTitle: function (title) {
            const popupTitle = document.getElementById('dataPopupTitle');
            if (popupTitle) {
                popupTitle.textContent = title;
            }
        },

        // Data Popup Internal Elements Visibility
        setDataFrameVisibility: function (visible) {
            const iframe = document.getElementById('dataPopupFrame');
            if (iframe) {
                if (visible) iframe.classList.add('visible');
                else iframe.classList.remove('visible');
            }
        },

        setDataContentVisibility: function (visible) {
            const content = document.getElementById('dataPopupContent');
            if (content) {
                if (visible) content.classList.add('visible');
                else content.classList.remove('visible');
            }
        },

        renderDataContent: function (html) {
            const dataContent = document.getElementById('dataContent');
            if (dataContent) {
                dataContent.innerHTML = html;
            }
        },

        generateCacheSummaryHtml: function (name, pageCount, lastUpdate) {
            return `
                <div class="cache-summary" style="padding: 15px; background: #f8f9fa; border-radius: 8px; margin-bottom: 15px;">
                    <h4 style="margin: 0 0 10px 0;">Category: ${name}</h4>
                    <p><strong>Pages Cached:</strong> ${pageCount}</p>
                    <p><strong>Last Updated:</strong> ${lastUpdate}</p>
                </div>
            `;
        },

        generateCacheListHtml: function (cacheData) {
            let html = '<h5>Cached Pages:</h5><ul style="max-height: 300px; overflow-y: auto;">';
            Object.keys(cacheData).filter(k => k !== 'lastUpdate').forEach(pageKey => {
                html += `<li>${pageKey}</li>`;
            });
            html += '</ul>';
            return html;
        },

        generateNoCacheHtml: function (name) {
            return `
                <div style="padding: 20px; text-align: center; color: #666;">
                    <p>No cache data found for "${name}"</p>
                    <p style="font-size: 0.9em;">Cache will be populated when you search for articles in this category.</p>
                </div>
            `;
        }
    };

    window.PVUI = PVUI;
})();
