/**
 * Force Reload Utility (Facade)
 * 
 * Central coordination for force reload functionality.
 * Delegates specific responsibilities to sub-modules.
 * 
 * @version 1.0.4
 */

(function () {
    'use strict';

    // Create ForceReload object if it doesn't exist
    window.ForceReload = window.ForceReload || {};

    // Add version info
    ForceReload.version = '1.0.4';
    ForceReload._initialized = false;

    /**
     * Initialize the ForceReload module
     */
    ForceReload.init = function () {
        if (this._initialized) return this;
        this._initialized = true;

        console.log('Initializing ForceReload module');

        // Setup error interception before anything else
        if (typeof this.setupErrorInterception === 'function') {
            this.setupErrorInterception();
        } else {
            console.warn('ForceReload: setupErrorInterception not available');
        }

        // Ensure browser compatibility
        if (typeof this.ensureBrowserCompatibility === 'function') {
            this.ensureBrowserCompatibility();
        }

        // Set the public reload method
        window.forceReload = this.reload.bind(this);

        return this;
    };

    /**
     * Main entry point for forcing a reload of all modules
     */
    ForceReload.reload = function () {
        // Clear any error displays immediately
        if (typeof this.clearErrorDisplays === 'function') {
            this.clearErrorDisplays();
        }

        try {
            console.log("Force reloading application modules...");

            let registrationComplete = false;

            // First, do module registration and initialization
            try {
                if (typeof this.registerAndInitializeModules === 'function') {
                    this.registerAndInitializeModules();
                    registrationComplete = true;
                } else {
                    console.error("ForceReload: registerAndInitializeModules not available");
                }
            } catch (registrationError) {
                // Log the error but don't show it to user if we can still continue
                console.warn("Module registration error:", registrationError);
                console.log("Continuing with reload options despite registration error");
            }

            // Now, show the reload options popup
            // Use a slight delay to ensure any error dialogs are cleared
            setTimeout(() => {
                // Clear again just to be safe
                if (typeof this.clearErrorDisplays === 'function') {
                    this.clearErrorDisplays();
                }
                this.showReloadOptions();
            }, 50);

            return true; // Indicate success
        } catch (error) {
            console.error("Error during force reload:", error);

            // Only show the error to the user if it's a critical failure
            // If we got this far, the module is at least partially working
            if (error.message && (
                error.message.includes("modules.forEach") ||
                error.message.includes("is not a function") ||
                error.message.includes("undefined") ||
                error.message.includes("iterable"))) {
                // This is a known issue with older browsers, just log it and continue
                console.warn("Browser compatibility issue detected:", error.message);

                // Try to show the reload options anyway
                setTimeout(() => {
                    if (typeof this.clearErrorDisplays === 'function') {
                        this.clearErrorDisplays();
                    }
                    this.showReloadOptions();
                }, 100);

                return true; // Indicate success despite the error
            } else {
                // Show actual error for other cases
                console.error("Critical error during reload:", error);
                // We'll return false to indicate failure, but we won't alert the user
                // since we've improved the handling in the button's click handler
                return false;
            }
        }
    };

    /**
     * Alternative name for showing reload options popup
     */
    ForceReload.showReloadOptions = function () {
        if (typeof this.showReloadOptionsPopup === 'function') {
            this.showReloadOptionsPopup();
        } else {
            console.error("ForceReload: showReloadOptionsPopup not available");
            // Fallback
            if (confirm("Reload options not available. Reload page now?")) {
                window.location.reload();
            }
        }
    };

    // Initialize the module
    // Verify all required methods are present
    const requiredMethods = [
        'setupErrorInterception',
        'ensureBrowserCompatibility',
        'registerAndInitializeModules',
        'showReloadOptionsPopup'
    ];

    const missingMethods = requiredMethods.filter(m => typeof ForceReload[m] !== 'function');

    if (missingMethods.length > 0) {
        console.warn('ForceReload: Missing sub-module methods:', missingMethods.join(', '),
            '- Waiting for sub-modules to load...');

        // Retry initialization after a short delay to allow sub-modules to load
        setTimeout(() => {
            ForceReload.init();
        }, 100);

        // Also try on window load as a backup
        window.addEventListener('load', () => ForceReload.init());

    } else {
        ForceReload.init();
    }

    // Register this module with ModuleRegistry if it exists
    try {
        if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
            window.ModuleRegistry.register('ForceReload', ForceReload);
        }
    } catch (error) {
        console.error("Error registering ForceReload with ModuleRegistry:", error);
    }

    console.log("ForceReload facade loaded and ready");
})();