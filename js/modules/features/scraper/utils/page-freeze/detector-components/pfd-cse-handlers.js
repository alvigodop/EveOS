/**
 * PageFreezeCSE Handlers Component
 * Handles events and error callbacks for Google CSE
 */
window.PageFreezeCSE = window.PageFreezeCSE || {};

window.PageFreezeCSE.Handlers = {
    /**
     * Handle error events that might indicate freezes
     * @private
     * @param {Event} event - Error event
     */
    _onError: function (event) {
        // Check if error is related to Google or other freezes
        if (event && event.message) {
            if (event.message.includes('google') ||
                event.message.includes('gapi') ||
                event.message.includes('cse')) {

                console.warn('PageFreezeDetector: Google-related error detected:', event.message);

                // Track as Google CSE issue
                if (this._state && this._state.knownFreezePatterns && this._state.knownFreezePatterns.googleCse) {
                    this._state.knownFreezePatterns.googleCse.detected = true;

                    // Check if we should attempt recovery
                    const timeSinceLastRecovery = Date.now() - this._state.knownFreezePatterns.googleCse.lastRecoveryTime;
                    if (timeSinceLastRecovery > 10000) { // At least 10 seconds since last recovery
                        this._recoverFromGoogleCSEFreeze();
                    }
                }
            }
            else if (event.message.includes('script') ||
                event.message.includes('maximum') ||
                event.message.includes('stack size') ||
                event.message.includes('recursion')) {

                console.warn('PageFreezeDetector: Potential infinite loop detected:', event.message);

                // Track as infinite loop issue
                if (this._state && this._state.knownFreezePatterns && this._state.knownFreezePatterns.infiniteLoop) {
                    this._state.knownFreezePatterns.infiniteLoop.detected = true;

                    // Attempt recovery if not too recent
                    const timeSinceLastRecovery = Date.now() - this._state.knownFreezePatterns.infiniteLoop.lastRecoveryTime;
                    if (timeSinceLastRecovery > 10000) { // At least 10 seconds since last recovery
                        this._performGeneralRecovery();
                    }
                }
            }
        }
    },

    /**
     * Handle unhandled promise rejections
     * @private
     * @param {Event} event - Unhandled rejection event
     */
    _onUnhandledRejection: function (event) {
        if (event && event.reason) {
            const reason = typeof event.reason === 'string' ? event.reason :
                (event.reason.message || 'Unknown rejection');

            // Check if rejection is related to known issues
            if (reason.includes('google') || reason.includes('cse') || reason.includes('gapi')) {
                if (this._state && this._state.knownFreezePatterns && this._state.knownFreezePatterns.googleCse) {
                    this._state.knownFreezePatterns.googleCse.detected = true;
                }
            }
        }
    }
};
