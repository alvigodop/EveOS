/**
 * Startup Status Component
 * Tracks module loading status
 */
const StartupStatus = {};

/**
 * Register module load listeners
 * @param {Object} context - The StartupLoader context (for accessing loadingProgress)
 */
StartupStatus.registerModuleListeners = function (context) {
    // Listen for module initialization events if ModuleRegistry exists
    if (window.ModuleRegistry) {
        // Create a MutationObserver to watch for new modules
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    this.checkModuleChanges(context);
                }
            });
        });

        // Start observing body for script loads
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }
    }

    // Create module status listeners
    document.addEventListener('module:loaded', event => {
        if (event.detail && event.detail.name) {
            this.addModuleStatus(`Loaded: ${event.detail.name}`);
            if (context && window.StartupUI) {
                context.loadingProgress = StartupUI.incrementProgress(context.loadingProgress, 5);
            }
        }
    });

    document.addEventListener('module:initialized', event => {
        if (event.detail && event.detail.name) {
            this.addModuleStatus(`Initialized: ${event.detail.name}`);
            if (context && window.StartupUI) {
                context.loadingProgress = StartupUI.incrementProgress(context.loadingProgress, 10);
            }
        }
    });
};

/**
 * Check for module changes
 */
StartupStatus.checkModuleChanges = function (context) {
    // If ModuleRegistry exists, get all modules
    if (window.ModuleRegistry && typeof ModuleRegistry.listModules === 'function') {
        const modules = ModuleRegistry.listModules();

        // Update module status for each module
        modules.forEach(module => {
            if (module.initialized && !this.initializedModules?.includes(module.name)) {
                this.addModuleStatus(`Initialized: ${module.name}`);
                if (!this.initializedModules) this.initializedModules = [];
                this.initializedModules.push(module.name);
            }
        });
    }
};

/**
 * Add module status message
 * @param {string} status - The status message to add
 */
StartupStatus.addModuleStatus = function (status) {
    const statusElement = document.getElementById('moduleStatus');
    if (statusElement) {
        const statusLine = document.createElement('div');
        statusLine.textContent = status;
        statusElement.appendChild(statusLine);

        // Auto-scroll to bottom
        statusElement.scrollTop = statusElement.scrollHeight;
    }
};

// Ensure global availability
window.StartupStatus = StartupStatus;
console.log('[StartupStatus] Loaded');
