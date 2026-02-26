/**
 * Popup Viewer Loader Component
 * 
 * Handles loading of content into popups
 */
(function () {
    'use strict';

    const PVLoader = {
        loadWikiUrl: function (url) {
            const popupFrame = document.getElementById('wikiPopupFrame');
            if (popupFrame) {
                // Fix for Fandom X-Frame-Options: sameorigin
                // Use allorigins.win as it supports raw HTML embedding better than corsproxy.io
                let finalUrl = url;
                if (url.includes('fandom.com')) {
                    console.log('PVLoader: Detected Fandom URL, applying CORS proxy workaround (allorigins)...');
                    // using api.allorigins.win/raw for direct content embedding
                    finalUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
                }

                popupFrame.src = finalUrl;
            }
        },

        clearWikiUrl: function () {
            const popupFrame = document.getElementById('wikiPopupFrame');
            if (popupFrame) {
                popupFrame.src = '';
            }
        },

        clearDataUrl: function () {
            const iframe = document.getElementById('dataPopupFrame');
            if (iframe) {
                iframe.src = '';
            }
        },

        showCachedContent: function (domain) {
            // Reset UI state first
            if (window.PVUI) {
                PVUI.setDataFrameVisibility(false);
                PVUI.setDataContentVisibility(true);
            }

            // Delegating to WikiManager if available (preserving original logic which just logged)
            // Original logic:
            // if (window.WikiManager && typeof WikiManager.viewFandomCachedData === 'function') {
            //     console.log('PopupViewer: Delegating cache display to WikiManager');
            // }
            // Since original didn't actually CALL it, we replicate that behavior or lack thereof.
            // It seems the original code might have expected WikiManager to observe changes or it was partial implementation.
            // We will keep the log to match behavior.
            if (window.WikiManager && typeof WikiManager.viewFandomCachedData === 'function') {
                console.log('PopupViewer: Delegating cache display to WikiManager');
            }
        },

        showWikiCachedContent: function (title) {
            // Reset UI state
            if (window.PVUI) {
                PVUI.setDataFrameVisibility(false);
                PVUI.setDataContentVisibility(true);
            }

            if (window.WikiManager && typeof WikiManager.viewWikiCachedData === 'function') {
                console.log('PopupViewer: Delegating wiki cache display to WikiManager');
            }
        },

        // Category cache rendering logic extracted from original functionality
        renderCategoryCache: function (category, name) {
            if (!window.PVUI) return;

            PVUI.setDataFrameVisibility(false);
            this.clearDataUrl();
            PVUI.setDataContentVisibility(true);

            const cacheData = window.WikiManager?.wikiCacheStore?.categoryResults?.[category];

            if (cacheData) {
                const pageCount = Object.keys(cacheData).filter(k => k !== 'lastUpdate').length;
                const lastUpdate = cacheData.lastUpdate ? new Date(cacheData.lastUpdate).toLocaleString() : 'Unknown';

                let html = PVUI.generateCacheSummaryHtml(name || category, pageCount, lastUpdate);

                if (pageCount > 0) {
                    html += PVUI.generateCacheListHtml(cacheData);
                }

                PVUI.renderDataContent(html);
            } else {
                PVUI.renderDataContent(PVUI.generateNoCacheHtml(name || category));
            }
        }
    };

    window.PVLoader = PVLoader;
})();
