/**
 * View List Actions Component
 * 
 * Handles rendering of the actions column (Visit button)
 */
(function () {
    'use strict';

    const VLActions = {
        /**
         * Create the actions column
         * @param {object} result - The search result object
         * @param {object} context - Context containing helper methods
         * @returns {HTMLElement} The populated result-actions element
         */
        create: function (result, context) {
            const actions = document.createElement('div');
            actions.className = 'result-actions';

            const visitLink = document.createElement('a');
            visitLink.href = result.url;
            visitLink.target = '_blank';
            visitLink.className = 'result-action';
            visitLink.textContent = 'Visit ↗';

            visitLink.addEventListener('click', (e) => {
                if (window.PopupManager && typeof PopupManager.openPopup === 'function') {
                    e.preventDefault();
                    const title = result.title || result.name || 'Wiki Page';
                    PopupManager.openPopup(result.url, title);
                }
            });

            actions.appendChild(visitLink);

            return actions;
        }
    };

    // Expose globally
    window.VLActions = VLActions;

})();
