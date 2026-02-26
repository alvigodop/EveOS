/**
 * Startup Initialization Component
 * Handles post-load initialization and rendering triggers
 */
const StartupInit = {};

/**
 * Function to ensure UI is visible
 */
StartupInit.ensureUIVisible = function () {
    // UI visibility check (silent)

    // Hide loading indicator
    const loadingElement = document.getElementById('initialLoading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }

    // Show main content
    const mainElement = document.querySelector('main');
    if (mainElement) {
        mainElement.style.display = 'block';
    }
};

/**
 * Function to render wiki lists
 */
StartupInit.renderWikiLists = function () {
    // Rendering wiki lists (silent)

    // First try using WikiManager
    if (window.WikiManager) {
        try {
            if (typeof WikiManager.renderWikiEntryList === 'function') {
                WikiManager.renderWikiEntryList(true);
            }
            if (typeof WikiManager.renderFandomDomainList === 'function') {
                WikiManager.renderFandomDomainList(true);
            }
        } catch (e) {
            console.warn('Startup loader: Error using WikiManager to render lists:', e);
        }
    }

    // Try using StartupHelper if available
    if (window.StartupHelper) {
        try {
            if (typeof StartupHelper.forceRenderWikiLists === 'function') {
                StartupHelper.forceRenderWikiLists();
            } else if (typeof StartupHelper.ensureWikiManagementVisible === 'function') {
                StartupHelper.ensureWikiManagementVisible();
            }
        } catch (e) {
            console.warn('Startup loader: Error using StartupHelper:', e);
        }
    }

    // Use DebugHelper as a fallback (limited)
    if (window.DebugHelper) {
        try {
            if (typeof DebugHelper.ensureWikiListsRendered === 'function') {
                DebugHelper.ensureWikiListsRendered();
            }
        } catch (e) {
            console.warn('Startup loader: Error using DebugHelper:', e);
        }
    }
};

/**
 * Set up multiple scheduled checks to ensure the wiki lists are rendered
 */
StartupInit.scheduleRenderChecks = function () {
    const delays = [10, 50, 100, 200, 500, 1000, 2000, 3000];

    delays.forEach(delay => {
        setTimeout(() => {
            // Scheduled check at delay (silent)
            this.ensureUIVisible();
            this.renderWikiLists();
        }, delay);
    });
};

/**
 * Initialize startup listeners
 */
StartupInit.init = function () {
    // Execute immediately if document is already loaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // Document loaded, executing startup loader
        this.ensureUIVisible();
        this.renderWikiLists();
        this.scheduleRenderChecks();
    } else {
        // Wait for DOM to be loaded
        document.addEventListener('DOMContentLoaded', () => {
            // DOMContentLoaded startup
            this.ensureUIVisible();
            this.renderWikiLists();
            this.scheduleRenderChecks();
        });

        // Also listen for window load event
        window.addEventListener('load', () => {
            // Window load startup
            this.ensureUIVisible();
            this.renderWikiLists();
        });
    }

    // Force UI visibility and rendering on startup button click
    const forceReloadBtn = document.getElementById('forceReloadBtn');
    if (forceReloadBtn) {
        // Add an alternate click handler as a backup
        // const originalClickHandler = forceReloadBtn.onclick; // Preserved by addEventListener nature
        forceReloadBtn.addEventListener('click', (event) => {
            // Don't prevent the original handler from running
            // But make sure our rendering happens too
            // Force reload triggered
            setTimeout(() => {
                this.ensureUIVisible();
                this.renderWikiLists();
            }, 50);
        });
    }
};

// Ensure global availability
window.StartupInit = StartupInit;
console.log('[StartupInit] Loaded');
