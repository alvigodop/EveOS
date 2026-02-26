/**
 * HTML Script Loader - UI Component
 * 
 * Handles UI interactions like tab switching, popups, and toasts.
 */
(function () {
    'use strict';

    const LoadUI = {
        /**
         * Tab switching functionality
         * @param {string} tabName - The name of the tab to switch to
         */
        switchTab: function (tabName) {
            // Get all tab buttons and reset their active state
            const tabButtons = document.querySelectorAll('.tab-btn');
            tabButtons.forEach(btn => btn.classList.remove('active'));

            // Set the active button
            const activeBtn = document.getElementById(tabName + 'Tab');
            if (activeBtn) {
                activeBtn.classList.add('active');
            }

            // Hide all panels
            const panels = [
                'wikipediaManagement',
                'fandomManagement',
                'wikipediaOptions',
                'fandomOptions'
            ];

            panels.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            // Show the appropriate panel
            if (tabName === 'wikipedia') {
                const wm = document.getElementById('wikipediaManagement');
                if (wm) wm.style.display = 'block';
                const wo = document.getElementById('wikipediaOptions');
                if (wo) wo.style.display = 'flex';
            } else if (tabName === 'fandom') {
                const fm = document.getElementById('fandomManagement');
                if (fm) fm.style.display = 'block';
                const fo = document.getElementById('fandomOptions');
                if (fo) fo.style.display = 'flex';
            }
        },

        /**
         * Close the data popup
         */
        closeDataPopup: function () {
            try {
                console.log('Close data popup function called from HtmlScriptLoader/LoadUI');

                // First try to use the PopupManager if available
                if (window.PopupManager && typeof PopupManager.closeDataPopup === 'function') {
                    console.log('Using PopupManager.closeDataPopup');
                    PopupManager.closeDataPopup();
                    return;
                }

                // Fall back to our own implementation
                console.log('PopupManager.closeDataPopup not available, using fallback');

                const popup = document.getElementById('dataPopup');
                if (popup) {
                    popup.style.display = 'none';
                } else {
                    console.error('Data popup element not found in the DOM');
                }
            } catch (error) {
                console.error('Error closing data popup:', error);
            }
        },

        /**
         * Show a custom confirmation modal dialog
         * Delegates to ConfirmModal module
         * @param {string} title - Modal title
         * @param {string} message - Message to display
         * @param {function} onConfirm - Callback when confirmed
         * @param {function} onCancel - Callback when cancelled
         */
        _showConfirmModal: function (title, message, onConfirm, onCancel) {
            // Delegate to ConfirmModal module if available
            if (window.ConfirmModal && typeof ConfirmModal.show === 'function') {
                ConfirmModal.show(title, message, onConfirm, onCancel, {
                    confirmText: 'Clear All Data',
                    confirmStyle: 'danger'
                });
            } else {
                // Fallback to native confirm if module not loaded
                console.warn('ConfirmModal module not available, using native confirm');
                if (confirm(message)) {
                    if (onConfirm) onConfirm();
                } else {
                    if (onCancel) onCancel();
                }
            }
        },

        /**
         * Show a toast notification on the page
         * Delegates to ToastNotification module
         * @param {string} message - The message to display
         * @param {string} type - 'info', 'success', 'warning', or 'error'
         */
        _showToast: function (message, type = 'info') {
            // Delegate to ToastNotification module if available
            if (window.ToastNotification && typeof ToastNotification.show === 'function') {
                ToastNotification.show(message, type);
            } else {
                // Fallback to console log if module not loaded
                console.log(`[Toast ${type}]: ${message}`);
            }
        }
    };

    window.LoadUI = LoadUI;
})();
