/**
 * Page Freeze Recovery - CSE Component
 * 
 * Handles Google CSE specific recovery logic.
 * 
 * @version 1.0.0
 */

const PFRCSE = {
    /**
     * Recover from a Google CSE related freeze
     * @param {Object} state - Reference to PageFreezeDetector state
     * @param {Function} showNotification - Function to show notifications
     */
    recoverFromGoogleCSEFreeze(state, showNotification) {
        console.log('PFRCSE: Attempting Google CSE specific recovery');

        // Update recovery attempts counter if state provided
        // Note: state mutation happens here which is expected
        if (state && state.knownFreezePatterns && state.knownFreezePatterns.googleCse) {
            state.knownFreezePatterns.googleCse.recoveryAttempts++;
            state.knownFreezePatterns.googleCse.lastRecoveryTime = Date.now();
        }

        try {
            // Clean up any Google artifacts
            const googleElements = document.querySelectorAll('[class*="gsc-"], [id*="gsc-"], [class*="gs-"]');
            let removedCount = 0;

            googleElements.forEach(el => {
                if (el.id !== 'google-searchbox-container' && el.id !== 'google-results-container') {
                    if (el.parentNode) {
                        el.parentNode.removeChild(el);
                        removedCount++;
                    }
                }
            });

            console.log(`PFRCSE: Removed ${removedCount} Google CSE elements`);

            // Clean containers
            const searchContainer = document.getElementById('google-searchbox-container');
            const resultsContainer = document.getElementById('google-results-container');

            if (searchContainer) searchContainer.innerHTML = '';
            if (resultsContainer) {
                resultsContainer.innerHTML = `
                    <div class="google-cse-error">
                        <h3>Search Engine Recovery</h3>
                        <p>The search engine was reset due to a detected freeze. Please try your search again.</p>
                    </div>
                `;
            }

            // Reset Google CSE module if available
            if (window.GoogleCSEEmbedded) {
                console.log('PFRCSE: Reinitializing GoogleCSEEmbedded');
                GoogleCSEEmbedded._initialized = false;
                GoogleCSEEmbedded._linkInterceptorActive = false;
                GoogleCSEEmbedded._formInterceptorActive = false;

                // Wait a moment before reinitializing
                setTimeout(() => {
                    try {
                        GoogleCSEEmbedded.init();
                    } catch (e) {
                        console.error('PFRCSE: Error reinitializing GoogleCSEEmbedded', e);
                    }
                }, 1000);
            }

            // Show recovery notification
            if (showNotification) {
                showNotification('Search engine has been reset due to a freeze. You can continue using the page.');
            }

        } catch (error) {
            console.error('PFRCSE: Error during Google CSE recovery:', error);
            throw error; // Re-throw to allow fallback in main module
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('PFRCSE', PFRCSE);
}

window.PFRCSE = PFRCSE;
