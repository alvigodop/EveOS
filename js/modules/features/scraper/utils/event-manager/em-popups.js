/**
 * Event Manager - Popups Sub-module
 * Handles popup event overrides and navigation
 */

window.EventManagerPopups = window.EventManagerPopups || {};

(function (module) {

    /**
     * Set up popup handlers
     */
    module.setupPopupHandlers = function () {
        // Popup handlers setup (silent)

        // Always define global popup handlers 
        window.closePopup = function () {
            if (window.PopupManager && typeof PopupManager.closePopup === 'function') {
                PopupManager.closePopup();
            } else {
                const popupElement = document.getElementById('wikiPopup');
                if (popupElement) {
                    popupElement.style.display = 'none';
                }
            }
        };

        window.closeDataPopup = function () {
            if (window.PopupManager && typeof PopupManager.closeDataPopup === 'function') {
                PopupManager.closeDataPopup();
            } else {
                const popupElement = document.getElementById('dataPopup');
                if (popupElement) {
                    popupElement.style.display = 'none';
                }
            }
        };

        // Handle popup navigation
        window.navigatePopupBack = function () {
            console.log('Navigate popup back');
            if (window.PopupManager && typeof PopupManager.navigatePopupBack === 'function') {
                PopupManager.navigatePopupBack();
            } else {
                const backBtn = document.getElementById('popupBackBtn');
                if (backBtn) {
                    backBtn.disabled = true; // Disable back button after use
                }

                const forwardBtn = document.getElementById('popupForwardBtn');
                if (forwardBtn) {
                    forwardBtn.disabled = false; // Enable forward button
                }
            }
        };

        window.navigatePopupForward = function () {
            console.log('Navigate popup forward');
            if (window.PopupManager && typeof PopupManager.navigatePopupForward === 'function') {
                PopupManager.navigatePopupForward();
            } else {
                const forwardBtn = document.getElementById('popupForwardBtn');
                if (forwardBtn) {
                    forwardBtn.disabled = true; // Disable forward button after use
                }

                const backBtn = document.getElementById('popupBackBtn');
                if (backBtn) {
                    backBtn.disabled = false; // Enable back button
                }
            }
        };
    };

})(window.EventManagerPopups);
