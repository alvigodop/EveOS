/**
 * PageFreezeDetector Notifications Component
 * Handles user notifications and recovery options UI
 */
window.PageFreezeNotifications = {
    /**
     * Show recovery notification to the user
     * @private
     * @param {string} message - Message to display
     */
    _showRecoveryNotification: function (message) {
        // Use global ToastNotification if available
        if (window.ToastNotification && typeof ToastNotification.show === 'function') {
            ToastNotification.show(message, 'info');
        } else {
            // Fallback: use console
            console.log('PageFreezeDetector Recovery:', message);
        }
    },

    /**
     * Show manual recovery options when automatic recovery isn't sufficient
     * @private
     */
    _showManualRecoveryOptions: function () {
        const self = this;

        // Use global ConfirmModal or similar if available, or create a simple UI
        // This logic was originally delegated to an external PageFreezeNotifications module,
        // but now we implement it here or reuse existing UI components.

        const details = this._getTechnicalDetails ? this._getTechnicalDetails() : 'Unknown error';

        if (window.ConfirmModal && typeof ConfirmModal.show === 'function') {
            ConfirmModal.show(
                'Page Freeze Detected',
                `The page seems successfully unresponsive. Technical details: ${details}. \nDo you want to reload?`,
                () => window.location.reload(), // Confirm -> Reload
                () => { if (self._performDeepRecovery) self._performDeepRecovery(); }, // Cancel -> Try Deep Recovery (mapped to 'Reset' concept)
                'Reload Page',
                'Try Deep Recovery'
            );
        } else {
            console.warn('UI for manual recovery not available');
            console.log('Manual recovery options:', details);

            // Fallback simple alert driven by user interaction is bad for freezes, 
            // but we can log it.
        }
    },

    /**
     * Get technical details for debugging
     * @private
     * @returns {string} Technical details
     */
    _getTechnicalDetails: function () {
        // Safe access to state
        const resetCount = this._state ? this._state.resetCount : '?';
        const googleDetected = (this._state && this._state.knownFreezePatterns && this._state.knownFreezePatterns.googleCse)
            ? (this._state.knownFreezePatterns.googleCse.detected ? 'Yes' : 'No')
            : '?';
        const recentError = (this._getRecentErrors && this._getRecentErrors().length > 0)
            ? this._getRecentErrors()[0]
            : 'None';

        return `Reset attempts: ${resetCount}, ` +
            `Google CSE issues: ${googleDetected}, ` +
            `Last error: ${recentError}`;
    }
};
