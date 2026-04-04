/**
 * Popup Viewer Loader Component
 * 
 * Handles loading of content into popups
 */
(function () {
    'use strict';

    function getPopupFrame() {
        return document.getElementById('wikiPopupFrame');
    }

    function buildPopupSrcDoc(targetUrl, rawHtml) {
        const html = String(rawHtml || '').trim();
        if (!html) return '';

        const baseTag = `<base href="${String(targetUrl || '').replace(/"/g, '&quot;')}">`;
        const openerScript = `
            <script>
                window.addEventListener('click', function (event) {
                    const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
                    if (!link) return;
                    if (link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey) return;
                    link.setAttribute('target', '_self');
                }, true);
            <\/script>
        `.trim();

        if (/<head[\s>]/i.test(html)) {
            return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${openerScript}`);
        }

        return `<!doctype html><html><head>${baseTag}${openerScript}</head><body>${html}</body></html>`;
    }

    async function resolvePopupUrl(targetUrl) {
        if (window.EveOS?.API?.Core?.getPopupViewerUrl) {
            try {
                const resolved = await window.EveOS.API.Core.getPopupViewerUrl(targetUrl);
                if (resolved) return resolved;
            } catch (error) {
                console.warn('PVLoader: Failed to resolve popup viewer URL', error);
            }
        }
        return String(targetUrl || '').trim();
    }

    const PVLoader = {
        loadWikiUrl: async function (url) {
            const targetUrl = String(url || '').trim();
            const popupFrame = getPopupFrame();
            if (!popupFrame || !targetUrl) return;

            popupFrame.removeAttribute('srcdoc');

            const resolvedUrl = await resolvePopupUrl(targetUrl);
            const isResolvedLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(resolvedUrl);

            if (isResolvedLocal) {
                popupFrame.src = resolvedUrl;
                return;
            }

            if (window.EveOS?.API?.Core?.fetchTextWithFallback) {
                try {
                    const popupHtml = await window.EveOS.API.Core.fetchTextWithFallback(targetUrl, {}, 'Popup HTML fetch failed');
                    const srcDoc = buildPopupSrcDoc(targetUrl, popupHtml);
                    if (srcDoc) {
                        popupFrame.src = 'about:blank';
                        popupFrame.srcdoc = srcDoc;
                        return;
                    }
                } catch (error) {
                    console.warn('PVLoader: Popup HTML fallback failed', error);
                }
            }

            popupFrame.src = resolvedUrl || targetUrl;
        },

        clearWikiUrl: function () {
            const popupFrame = getPopupFrame();
            if (popupFrame) {
                popupFrame.removeAttribute('srcdoc');
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
