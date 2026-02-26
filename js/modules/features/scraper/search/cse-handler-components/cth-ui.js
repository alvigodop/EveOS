/**
 * Google CSE Toggle Handler - UI Component
 * 
 * Handles UI updates and container management for Google CSE.
 * 
 * @version 1.0.0
 */

const CTHUI = {
    /**
     * Move the CSE container to the currently active tab's discovery section
     * @param {string} tab - The active tab ('wikipedia' or 'fandom')
     * @param {boolean} enabled - Whether CSE is enabled
     */
    updateCSEContainer: function (tab, enabled) {
        const cseSection = document.getElementById('google-cse-section');
        const cseSearchBox = document.getElementById('google-searchbox-container');
        const cseResults = document.getElementById('google-results-container');

        // Identify the standard search container to hide/replace for the active tab
        let standardSearchContainer = null;
        let targetParent = null;

        if (tab === 'wikipedia') {
            // Wikipedia's standard search box container
            standardSearchContainer = document.querySelector('#wiki-discovery .discovery-search-container') ||
                document.querySelector('.wiki-discovery .discovery-search-container');
        } else if (tab === 'fandom') {
            // Fandom's standard search box container
            standardSearchContainer = document.getElementById('fandom-search-section');
        }

        if (!cseSection) return;

        if (enabled) {
            if (standardSearchContainer) {
                targetParent = standardSearchContainer.parentNode;

                // Show CSE elements
                cseSection.style.display = 'block';
                // Ensure independent display is block if they were hidden
                if (cseSearchBox) cseSearchBox.style.display = 'block';

                // Keep results hidden initially until content appears to avoid "empty white box"
                if (cseResults) {
                    cseResults.style.display = 'none';

                    // Simple observer to show results when Google populates them
                    if (!window._cseResultsObserver) {
                        window._cseResultsObserver = new MutationObserver((mutations) => {
                            if (cseResults.hasChildNodes() && cseResults.innerHTML.trim().length > 0) {
                                // Check if it contains actual results or just loading
                                if (cseResults.querySelector('.gsc-results')) {
                                    cseResults.style.display = 'block';
                                }
                            } else {
                                cseResults.style.display = 'none';
                            }
                        });
                        window._cseResultsObserver.observe(cseResults, { childList: true, subtree: true });
                    }
                }

                // SPLIT UI:
                // 1. Place Search Box at the top (replacing standard input)
                if (cseSearchBox && targetParent) {
                    if (standardSearchContainer.previousSibling) {
                        targetParent.insertBefore(cseSearchBox, standardSearchContainer);
                    } else {
                        targetParent.insertBefore(cseSearchBox, standardSearchContainer.nextSibling); // Fallback
                    }
                }

                // 2. Place Results at the bottom
                if (cseResults && targetParent) {
                    // Just append it to the end of the container (below selectors)
                    targetParent.appendChild(cseResults);
                }

                // Hide standard search inputs
                standardSearchContainer.style.display = 'none';
            }
        } else {
            // Disable mode
            // Move components back to main wrapper (optional but keeps DOM clean)
            if (cseSection && cseSearchBox && cseResults) {
                cseSection.appendChild(cseSearchBox);
                cseSection.appendChild(cseResults);
                cseSection.style.display = 'none';
            }

            // Restore standard inputs
            document.querySelectorAll('.discovery-search-container').forEach(el => {
                el.style.display = 'flex';
            });
            const fandomSection = document.getElementById('fandom-search-section');
            if (fandomSection) fandomSection.style.display = 'flex';
        }
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
    ModuleRegistry.register('CTHUI', CTHUI);
}

window.CTHUI = CTHUI;
