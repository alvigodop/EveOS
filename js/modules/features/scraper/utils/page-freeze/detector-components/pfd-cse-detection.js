/**
 * PageFreezeCSE Detection Component
 * Handles detection logic for Google CSE related freezes
 */
window.PageFreezeCSE = window.PageFreezeCSE || {};

window.PageFreezeCSE.Detection = {
    /**
     * Check if the freeze appears to be Google CSE related
     * @private
     * @returns {boolean} Whether the freeze is likely Google CSE related
     */
    _isGoogleCSERelated: function () {
        // Check for Google CSE elements in the DOM
        const hasGoogleElements = document.querySelectorAll('[class*="gsc-"], [id*="gsc-"], [class*="gs-"]').length > 0;

        // Check if Google CSE module is initialized
        const cseInitialized = window.GoogleCSEEmbedded && GoogleCSEEmbedded._initialized;

        // Check recent errors for Google-related messages
        const recentErrors = this.Detection._getRecentErrors.call(this); // Call helper on same Detection object or mixin? 
        // Wait, _getRecentErrors is defined on Detection object too? Yes.
        // But if I use .call(this), `this` is PageFreezeCSE facade. 
        // Does facade have _getRecentErrors? No, it delegates.
        // So I should call this.Detection._getRecentErrors.call(this) or just define helper locally.

        const hasGoogleErrors = recentErrors.some(e =>
            e.includes('google') || e.includes('gapi') || e.includes('cse') || e.includes('googleapis')
        );

        // Mark as Google CSE related if we have both elements and errors or initialization
        if ((hasGoogleElements && hasGoogleErrors) || (cseInitialized && hasGoogleErrors)) {
            // Access state safely via the facade or expect it to be injected/bound
            if (this._state && this._state.knownFreezePatterns && this._state.knownFreezePatterns.googleCse) {
                this._state.knownFreezePatterns.googleCse.detected = true;
            }
            return true;
        }

        return false;
    },

    /**
     * Get recent JavaScript errors from error tracking
     * @private
     * @returns {Array<string>} Recent error messages
     */
    _getRecentErrors: function () {
        // If we have an error tracking module, use it
        if (window.ErrorSuppressor && ErrorSuppressor.getRecentErrors) {
            return ErrorSuppressor.getRecentErrors();
        }

        return []; // No error tracking available
    }
};
