/**
 * View List Media Component
 * 
 * Handles rendering of the thumbnail/icon section for list items
 */
(function () {
    'use strict';

    const VLMedia = {
        /**
         * Create the media element (thumbnail or icon)
         * @param {object} result - The search result object
         * @param {object} options - Display options
         * @param {object} context - Context containing helper methods
         * @returns {HTMLElement} The populated result-thumbnail or result-icon element or wrapper
         */
        create: function (result, options, context) {
            // Add thumbnail if available
            if (options.showImages && (result.thumbnail || result.thumbnailUrl)) {
                const thumbnail = document.createElement('div');
                thumbnail.className = 'result-thumbnail';

                const img = document.createElement('img');
                img.src = result.thumbnail || result.thumbnailUrl || context.getDefaultThumbnail(result);
                img.alt = result.title || result.name || '';

                // Handle load errors
                img.onerror = () => {
                    img.src = context.getDefaultThumbnail(result);
                };

                thumbnail.appendChild(img);
                return thumbnail;
            } else {
                // Create icon placeholder if no thumbnail
                const iconPlaceholder = document.createElement('div');
                iconPlaceholder.className = 'result-icon';
                iconPlaceholder.innerHTML = context.getIconForResult(result);
                return iconPlaceholder;
            }
        }
    };

    // Expose globally
    window.VLMedia = VLMedia;

})();
