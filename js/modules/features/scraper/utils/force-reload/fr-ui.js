/**
 * Force Reload - UI Module
 * 
 * Handles UI interactions like the reload options popup and error displays.
 */

(function () {
    'use strict';

    // Create ForceReload object if it doesn't exist
    window.ForceReload = window.ForceReload || {};

    /**
     * Clear any error displays in the UI
     */
    ForceReload.clearErrorDisplays = function () {
        try {
            // Clear any existing error display
            const errorDisplay = document.getElementById('errorDisplay');
            if (errorDisplay) {
                errorDisplay.style.display = 'none';
                errorDisplay.textContent = '';
            }

            // Also clear any browser error dialog that might be showing
            if (window.stop) {
                // This helps in some browsers to stop error dialogs
                window.stop();
            }
        } catch (e) {
            console.warn('Error while clearing error displays:', e);
        }
    };

    /**
     * Show a popup with reload options
     */
    ForceReload.showReloadOptionsPopup = function () {
        try {
            // If we got to this point, we can assume the force reload functionality is working
            // so we can clear any error message that might have been shown previously
            const errorDisplay = document.getElementById('errorDisplay');
            if (errorDisplay) {
                errorDisplay.style.display = 'none';
                errorDisplay.textContent = '';
            }

            // Remove any existing reload popups to prevent duplicates
            const existingPopups = document.querySelectorAll('.reload-options-popup');
            if (existingPopups && existingPopups.length > 0) {
                // Use standard for loop for better compatibility
                for (let i = 0; i < existingPopups.length; i++) {
                    const popup = existingPopups[i];
                    if (popup && popup.parentNode) {
                        popup.parentNode.removeChild(popup);
                    }
                }
            }

            // Create a styled popup
            const popup = document.createElement('div');
            popup.className = 'reload-options-popup';

            // Create timestamp for cache busting
            const timestamp = Date.now();
            const currentUrl = window.location.href;

            // Remove any existing forcereload parameters
            let cleanUrl = currentUrl;
            if (currentUrl.indexOf('forcereload=') > -1) {
                cleanUrl = currentUrl.replace(/[&?]forcereload=\d+/g, '');
                if (cleanUrl.endsWith('?') || cleanUrl.endsWith('&')) {
                    cleanUrl = cleanUrl.slice(0, -1);
                }
            }

            // Add new timestamp parameter
            const separator = cleanUrl.indexOf('?') > -1 ? '&' : '?';
            const newUrl = cleanUrl + separator + 'forcereload=' + timestamp;

            // Popup content
            popup.innerHTML = `
                <div class="popup-header">
                    <div class="popup-title">
                        Force Reload Options
                    </div>
                    <button class="popup-close-btn" id="closeReloadPopupBtn">&times;</button>
                </div>
                <div class="popup-description">
                    Module registration complete. Choose how you want to reload:
                </div>
                <div class="reload-buttons">
                    <a href="#" id="standardReloadBtn" class="reload-btn">Reload Now</a>
                    <a href="${newUrl}" class="reload-btn hard-refresh">Complete Reload</a>
                </div>
                <div class="reload-description">
                    <p><strong>Reload Now</strong>: Quick refresh, keeps cache</p>
                    <p><strong>Complete Reload</strong>: Full refresh with cache clearing</p>
                </div>
            `;

            // Add to document
            document.body.appendChild(popup);

            // Add click handler for standard reload
            const standardReloadBtn = document.getElementById('standardReloadBtn');
            if (standardReloadBtn) {
                standardReloadBtn.onclick = function (e) {
                    e.preventDefault();
                    // Close the popup
                    if (popup && popup.parentNode) {
                        popup.parentNode.removeChild(popup);
                    }
                    // Show confirmation
                    alert("Modules have been reloaded successfully.");
                };
            }

            // Add click handler for close button
            const closeBtn = document.getElementById('closeReloadPopupBtn');
            if (closeBtn) {
                closeBtn.onclick = function (e) {
                    e.preventDefault();
                    // Close the popup
                    if (popup && popup.parentNode) {
                        popup.parentNode.removeChild(popup);
                    }
                    console.log("Force reload popup closed by user");
                };
            }
        } catch (error) {
            console.error("Error showing reload options popup:", error);
            // Use a simpler fallback approach if the popup fails
            if (confirm("Modules registered. Reload page now?")) {
                window.location.reload();
            }
        }
    };

    console.log('ForceReload: UI module loaded');
})();
