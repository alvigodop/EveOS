/**
 * Wiki Navigation Module
 * 
 * Handles wiki link navigation behaviors (Popup vs New Tab).
 * Extracted from WikiManager.js.
 */
window.WikiNavigation = window.WikiNavigation || {};
const WikiNavigation = window.WikiNavigation;

// Navigation State
WikiNavigation.wikiOpenMode = 'popup'; // Default: 'popup' or 'newtab'

/**
 * Set the wiki open mode
 * @param {string} mode - 'popup' or 'newtab'
 */
WikiNavigation.setWikiOpenMode = function (mode) {
    this.wikiOpenMode = mode;
    console.log(`WikiNavigation: Link open mode set to ${mode}`);
};

/**
 * Handle click on wiki result
 * @param {Event} event - The click event
 * @param {string} url - The URL to open
 */
WikiNavigation.handleWikiResultClick = function (event, url) {
    if (event && event.preventDefault) {
        event.preventDefault();
    }

    if (this.wikiOpenMode === 'newtab') {
        window.open(url, '_blank');
    } else {
        // Use PopupManager for in-site popup
        if (window.PopupManager && typeof PopupManager.openPopup === 'function') {
            // Extract title from event target or URL
            let title = 'Wiki Article';
            if (event && event.target && event.target.textContent) {
                title = event.target.textContent;
            }
            PopupManager.openPopup(url, title);
        } else {
            // Fallback to browser popup window
            const popupFeatures = 'width=900,height=700,scrollbars=yes,resizable=yes';
            const popup = window.open(url, 'wikiPopup', popupFeatures);
            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                alert('Popup blocked. Please allow popups for this site.');
            }
        }
    }
};

console.log('WikiNavigation module loaded');
