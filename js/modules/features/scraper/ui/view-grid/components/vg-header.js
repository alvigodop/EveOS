/**
 * View Grid Header Module
 * 
 * Handles rendering of the header section of a grid result card,
 * including badges, thumbnails, and status indicators.
 * 
 * @version 1.0.0
 */

(function () {
    'use strict';

    if (!window.VGHeader) {
        window.VGHeader = {
            /**
             * Create the header element for a grid result
             * @param {object} result - The search result
             * @param {object} options - Display options
             * @param {object} context - The ResultDisplay instance (for helpers)
             * @returns {Element} - The created header element
             */
            create: function (result, options, context) {
                const header = document.createElement('div');
                header.className = 'result-header';

                // Add content type badge
                if (result.contentType) {
                    const badge = document.createElement('span');
                    badge.className = `content-type-badge ${result.contentType.toLowerCase()}`;
                    badge.textContent = result.contentType;
                    header.appendChild(badge);
                }

                // Add Main Article Badge
                if (result.isMainArticle) {
                    const mainBadge = document.createElement('div');
                    mainBadge.className = 'main-article-badge';
                    mainBadge.title = 'Main Article';
                    header.appendChild(mainBadge);
                }

                // Add Web Enhanced Badge
                if (result.isWebEnhanced) {
                    const webBadge = document.createElement('div');
                    webBadge.className = 'web-enhanced-badge';
                    webBadge.title = 'Enhanced with Web Results';
                    header.appendChild(webBadge);
                }

                // Add cache/live badge
                const statusBadge = document.createElement('span');

                if (result.fromCache) {
                    statusBadge.className = 'status-badge cache-source';
                    statusBadge.textContent = '⚡ Cached';
                    statusBadge.title = 'This search result was retrieved from cache';
                } else {
                    statusBadge.className = 'status-badge live-source';
                    statusBadge.textContent = '🔴 Live';
                    // Add tooltip explaining cache status for Wikipedia entries with cached data
                    if (result.entryDataFromCache) {
                        statusBadge.title = 'Fresh search - article data was loaded from cache';
                    } else {
                        statusBadge.title = 'Fresh search - data fetched live';
                    }
                }
                header.appendChild(statusBadge);

                if (options.showImages && (result.thumbnail || result.thumbnailUrl)) {
                    const thumbnail = document.createElement('div');
                    thumbnail.className = 'result-thumbnail';

                    const img = document.createElement('img');
                    img.src = result.thumbnail || result.thumbnailUrl || context.getDefaultThumbnail(result);
                    img.alt = result.title || result.name || '';
                    img.onerror = () => {
                        img.src = context.getDefaultThumbnail(result);
                    };

                    thumbnail.appendChild(img);
                    header.appendChild(thumbnail);
                } else {
                    // Create icon placeholder if no thumbnail
                    const iconPlaceholder = document.createElement('div');
                    iconPlaceholder.className = 'result-icon';
                    iconPlaceholder.innerHTML = context.getIconForResult(result);
                    header.appendChild(iconPlaceholder);
                }

                return header;
            }
        };

        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            window.ModuleRegistry.register('VGHeader', window.VGHeader);
        }
    }
})();
