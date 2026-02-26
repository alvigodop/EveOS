/**
 * Page Freeze Recovery Module (Facade)
 * 
 * Handles recovery logic for page freeze conditions.
 * Delegates to PFRCSE and PFROps.
 * 
 * @version 1.0.1 (Modularized)
 */

const PageFreezeRecovery = {
    version: '1.0.1',
    _initialized: false,

    /**
     * Initialize the module
     */
    init() {
        if (this._initialized) return this;

        // Ensure submodules are present (soft check)
        if (!window.PFRCSE) console.warn('PageFreezeRecovery: PFRCSE not found');
        if (!window.PFROps) console.warn('PageFreezeRecovery: PFROps not found');

        this._initialized = true;
        return this;
    },

    /**
     * Recover from a Google CSE related freeze
     * @param {Object} state - Reference to PageFreezeDetector state
     * @param {Function} showNotification - Function to show notifications
     */
    recoverFromGoogleCSEFreeze(state, showNotification) {
        if (window.PFRCSE) {
            try {
                PFRCSE.recoverFromGoogleCSEFreeze(state, showNotification);
            } catch (error) {
                // Return to general recovery if specialized recovery fails
                this.performGeneralRecovery(state, showNotification);
            }
        } else {
            console.error('PageFreezeRecovery: PFRCSE missing, falling back to general recovery');
            this.performGeneralRecovery(state, showNotification);
        }
    },

    /**
     * Perform general recovery from any freeze
     * @param {Object} state - Reference to PageFreezeDetector state
     * @param {Function} showNotification - Function to show notifications
     * @param {Function} showManualOptions - Function to show manual recovery options
     * @param {Object} config - Configuration object
     */
    performGeneralRecovery(state, showNotification, showManualOptions, config = {}) {
        console.log('PageFreezeRecovery: Performing general recovery');

        // Increment reset counter
        if (state) {
            state.resetCount = (state.resetCount || 0) + 1;
        }

        try {
            // Stop intensive JavaScript operations via delegate
            this.stopIntensiveOperations();

            // Clear any timeouts and intervals via delegate
            this.clearTimersOverThreshold(100);

            // Show recovery notification with options
            const maxResets = config.maxConsecutiveResets || 3;
            if (!state || state.resetCount <= maxResets) {
                if (showNotification) {
                    showNotification('Page responsiveness has been restored. You can continue using the page.');
                }
            } else {
                // Show manual recovery options if we've exceeded automatic reset limit
                if (showManualOptions) {
                    showManualOptions();
                }
            }
        } catch (error) {
            console.error('PageFreezeRecovery: Error during general recovery:', error);

            // Last resort: show manual recovery button
            if (showManualOptions) {
                showManualOptions();
            }
        }
    },

    /**
     * Perform a deep recovery when user requests it
     * @param {Function} showNotification - Function to show notifications
     */
    performDeepRecovery(showNotification) {
        console.log('PageFreezeRecovery: Performing deep recovery');

        try {
            // Reset all modules if ModuleRegistry is available
            if (window.ModuleRegistry && typeof ModuleRegistry.resetAll === 'function') {
                ModuleRegistry.resetAll();
            }

            // Clear localStorage items related to state
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('state') || key.includes('cache') || key.includes('google'))) {
                    localStorage.removeItem(key);
                }
            }

            // Remove all dynamic scripts
            document.querySelectorAll('script[src*="gstatic"], script[src*="googleapis"], script[src*="google"]').forEach(script => {
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
            });

            // Clean up all Google elements
            document.querySelectorAll('[class*="gsc-"], [id*="gsc-"], [class*="gs-"]').forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });

            // Reset containers
            const searchContainer = document.getElementById('google-searchbox-container');
            const resultsContainer = document.getElementById('google-results-container');

            if (searchContainer) searchContainer.innerHTML = '';
            if (resultsContainer) resultsContainer.innerHTML = '';

            // Reinitialize everything after a delay
            setTimeout(() => {
                // Try to reload all modules if possible
                if (window.ModuleLoader && typeof ModuleLoader.reloadModules === 'function') {
                    ModuleLoader.reloadModules();
                } else {
                    // Otherwise just reinitialize Google CSE
                    if (window.GoogleCSEEmbedded) {
                        GoogleCSEEmbedded._initialized = false;
                        GoogleCSEEmbedded.init();
                    }
                }

                if (showNotification) {
                    showNotification('Deep recovery complete. The page should now be responsive.');
                }
            }, 1000);

        } catch (error) {
            console.error('PageFreezeRecovery: Error during deep recovery:', error);
            if (showNotification) {
                showNotification('Recovery failed. Please try reloading the page.');
            }
        }
    },

    /**
     * Stop potentially intensive JavaScript operations
     */
    stopIntensiveOperations() {
        if (window.PFROps) {
            PFROps.stopIntensiveOperations();
        } else {
            // Fallback minimal implementation if module missing
            const animations = document.getAnimations ? document.getAnimations() : [];
            animations.forEach(animation => animation.pause());
        }
    },

    /**
     * Clear timers with IDs over a specified threshold
     * @param {number} threshold - Minimum timer ID to clear
     */
    clearTimersOverThreshold(threshold) {
        if (window.PFROps) {
            PFROps.clearTimersOverThreshold(threshold);
        }
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PageFreezeRecovery.init());
} else {
    PageFreezeRecovery.init();
}

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('PageFreezeRecovery', PageFreezeRecovery);
}

// Expose globally
window.PageFreezeRecovery = PageFreezeRecovery;
