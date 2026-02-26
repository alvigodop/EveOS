/**
 * PageFreezeCSE Monitoring Component
 * Handles proactive monitoring and issue checks for Google CSE
 */
window.PageFreezeCSE = window.PageFreezeCSE || {};

window.PageFreezeCSE.Monitoring = {
    /**
     * Set up specific monitoring for Google CSE
     * @private
     */
    _setupGoogleCSEMonitoring: function () {
        // Check if Google CSE is present
        if (window.GoogleCSEEmbedded) {
            console.log('PageFreezeDetector: Detected GoogleCSEEmbedded module, setting up monitoring');

            // Monitor form submissions
            document.addEventListener('submit', (event) => {
                if (event.target.classList.contains('gsc-search-box') ||
                    event.target.closest('#google-searchbox-container')) {

                    // Start watching for potential freezes after search
                    setTimeout(() => {
                        // Call via facade delegation or direct if context allows, but we are inside arrow function so 'this' is preserved
                        // But 'this' is the context of _setupGoogleCSEMonitoring call, which should be the facade.
                        if (this._checkForGoogleCSEIssues) {
                            this._checkForGoogleCSEIssues();
                        } else if (this.Monitoring && this.Monitoring._checkForGoogleCSEIssues) {
                            this.Monitoring._checkForGoogleCSEIssues.call(this);
                        }
                    }, 3000);
                }
            }, true);

            // Monitor search box input
            const searchBoxContainer = document.getElementById('google-searchbox-container');
            if (searchBoxContainer) {
                searchBoxContainer.addEventListener('input', (event) => {
                    // Reset Google CSE issue detection
                    if (this._state && this._state.knownFreezePatterns && this._state.knownFreezePatterns.googleCse) {
                        this._state.knownFreezePatterns.googleCse.detected = false;
                    }
                }, true);
            }
        }
    },

    /**
     * Monitor for navigation blocking issues
     * @private
     */
    _monitorNavigationBlocking: function () {
        // Track click events on links
        document.addEventListener('click', (event) => {
            // Find if click was on or within an anchor
            let target = event.target;
            let isAnchor = false;
            let anchorHref = null;

            while (target && !isAnchor && target !== document.body) {
                if (target.tagName === 'A' && target.href) {
                    isAnchor = true;
                    anchorHref = target.href;
                }
                target = target.parentNode;
            }

            // If click was on an anchor, monitor for navigation
            if (isAnchor && anchorHref) {
                // Wait to see if navigation occurs
                const currentLocation = window.location.href;

                setTimeout(() => {
                    // Check if we're still on the same page
                    if (window.location.href === currentLocation) {
                        // Navigation may have been blocked - check if it was Google CSE related
                        if (target.closest('#google-results-container') ||
                            target.classList.contains('gs-title') ||
                            target.parentNode && target.parentNode.classList && target.parentNode.classList.contains('gs-title')) {

                            console.warn('PageFreezeDetector: Possible blocked navigation from Google CSE result');

                            // Try to navigate directly
                            if (anchorHref) {
                                window.location.href = anchorHref;
                            }
                        }
                    }
                }, 1000); // Wait 1 second to check
            }
        }, true);
    },

    /**
     * Check for specific Google CSE issues
     * @private
     */
    _checkForGoogleCSEIssues: function () {
        // Skip if Google CSE is not being used
        if (!window.GoogleCSEEmbedded || !GoogleCSEEmbedded._initialized) {
            return;
        }

        try {
            // Check for missing but needed elements
            const resultsContainer = document.getElementById('google-results-container');
            if (resultsContainer) {
                // Check if results container is empty but should have content
                if (resultsContainer.innerHTML.trim() === '' &&
                    GoogleCSEEmbedded._defaultQuery &&
                    GoogleCSEEmbedded._defaultQuery.trim() !== '') {

                    console.warn('PageFreezeDetector: Google CSE results container is empty but a query exists');

                    // Only recover if not too recent
                    if (this._state && this._state.knownFreezePatterns && this._state.knownFreezePatterns.googleCse) {
                        const timeSinceLastRecovery = Date.now() - this._state.knownFreezePatterns.googleCse.lastRecoveryTime;
                        if (timeSinceLastRecovery > 10000) { // At least 10 seconds since last recovery
                            this._recoverFromGoogleCSEFreeze();
                        }
                    }
                }

                // Check if container has a search error message but not showing it
                const hasErrorText = resultsContainer.textContent.includes('error') ||
                    resultsContainer.textContent.includes('unavailable') ||
                    resultsContainer.textContent.includes('failed');

                const hasVisibleError = resultsContainer.querySelector('.google-cse-error') !== null ||
                    resultsContainer.querySelector('.gsc-error-message') !== null;

                if (hasErrorText && !hasVisibleError) {
                    console.warn('PageFreezeDetector: Google CSE may have hidden errors');

                    // Add visible error message
                    if (!document.getElementById('cse-recovery-button')) {
                        const recoveryButton = document.createElement('div');
                        recoveryButton.id = 'cse-recovery-button';
                        recoveryButton.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f44336;color:white;padding:10px 15px;border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,0.3);cursor:pointer;z-index:999999;';
                        recoveryButton.innerHTML = 'Recover Search';

                        recoveryButton.onclick = () => this._recoverFromGoogleCSEFreeze();

                        document.body.appendChild(recoveryButton);
                    }
                }
            }
        } catch (error) {
            console.error('PageFreezeDetector: Error checking Google CSE issues:', error);
        }
    }
};
