/**
 * PageFreezeDetector Google CSE Component (Facade)
 * Handles detection and logic specific to Google Custom Search Engine
 * Delegates to:
 * - PageFreezeCSE Detection
 * - PageFreezeCSE Monitoring
 * - PageFreezeCSE Handlers
 */
window.PageFreezeCSE = window.PageFreezeCSE || {};

// The core facade methods that PageFreezeDetector expects
Object.assign(window.PageFreezeCSE, {
    // State injection (called by PFD Core)
    _state: null,

    setState: function (state) {
        this._state = state;
    },

    /**
     * Check if the freeze appears to be Google CSE related
     * Delegates to Detection component
     */
    _isGoogleCSERelated: function () {
        if (this.Detection && this.Detection._isGoogleCSERelated) {
            // Bind state if needed for the mixed-in method
            return this.Detection._isGoogleCSERelated.call(this);
        }
        return false;
    },

    /**
     * Set up specific monitoring for Google CSE
     * Delegates to Monitoring component
     */
    _setupGoogleCSEMonitoring: function () {
        if (this.Monitoring && this.Monitoring._setupGoogleCSEMonitoring) {
            this.Monitoring._setupGoogleCSEMonitoring.call(this);
        }
    },

    /**
     * Handle error events
     * Delegates to Handlers component
     */
    _onError: function (event) {
        if (this.Handlers && this.Handlers._onError) {
            this.Handlers._onError.call(this, event);
        }
    },

    /**
     * Handle unhandled promise rejections
     * Delegates to Handlers component
     */
    _onUnhandledRejection: function (event) {
        if (this.Handlers && this.Handlers._onUnhandledRejection) {
            this.Handlers._onUnhandledRejection.call(this, event);
        }
    },

    // Monitoring Navigation Blocking delegation
    _monitorNavigationBlocking: function () {
        if (this.Monitoring && this.Monitoring._monitorNavigationBlocking) {
            this.Monitoring._monitorNavigationBlocking.call(this);
        }
    },

    // Check Issues delegation
    _checkForGoogleCSEIssues: function () {
        if (this.Monitoring && this.Monitoring._checkForGoogleCSEIssues) {
            this.Monitoring._checkForGoogleCSEIssues.call(this);
        }
    }
});
