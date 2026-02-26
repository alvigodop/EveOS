/**
 * Startup Loader Module (Facade)
 * 
 * Displays loading status during application initialization
 * Manages the transition from loading to app UI
 * Delegates to specialized components
 * 
 * @version 1.1.0-facade
 */

// Create namespace if it doesn't exist
window.StartupLoader = window.StartupLoader || {};
const StartupLoader = window.StartupLoader;

// Add version and installation status flag
StartupLoader.version = '1.1.0-facade';
StartupLoader.installed = true;

/**
 * Initialize the module
 */
StartupLoader.init = function () {
    // Quiet startup - use enableDebugLogs() to see verbose logs

    // Initialize Init component listeners
    if (window.StartupInit) {
        StartupInit.init();
    } else {
        console.warn('StartupLoader: StartupInit module not loaded');
    }

    // Create loading overlay if it doesn't exist
    this.createLoadingOverlay();

    // Register module load listeners
    this.registerModuleListeners();

    // Listen for app ready event
    document.addEventListener('app:ready', () => {
        this.hideLoadingOverlay();
    });

    // Show initial loading message
    this.showLoadingMessage('Starting application...');

    // Track initialization progress
    this.loadingProgress = 0;
    this.updateProgressBar(0);

    // Start progress animation
    this.startProgressAnimation();

    // Safety timeout: initialization should not take more than 8 seconds
    // This prevents the application from being stuck on the loading screen
    setTimeout(() => {
        const overlay = document.getElementById('startupOverlay');
        if (overlay && overlay.parentNode) {
            console.warn('StartupLoader: Initialization timed out, forcing UI to show');
            this.hideLoadingOverlay();
            this.addModuleStatus('Forcing start...');

            // Ensure AppInitializer completes if it exists
            if (window.AppInitializer && typeof AppInitializer.completeInitialization === 'function') {
                AppInitializer.completeInitialization();
            }

            // Also force wiki lists to render just in case
            if (window.StartupInit) {
                StartupInit.renderWikiLists();
            } else if (window.StartupHelper && typeof StartupHelper.forceRenderWikiLists === 'function') {
                StartupHelper.forceRenderWikiLists();
            }
        }
    }, 8000);

    this._initialized = true;
    return this;
};

// -- Delegation to StartupUI --

StartupLoader.createLoadingOverlay = function () {
    if (window.StartupUI) return StartupUI.createLoadingOverlay();
};

StartupLoader.addOverlayStyles = function () {
    if (window.StartupUI) return StartupUI.addOverlayStyles();
};

StartupLoader.showLoadingMessage = function (message) {
    if (window.StartupUI) return StartupUI.showLoadingMessage(message);
};

StartupLoader.updateProgressBar = function (percentage) {
    if (window.StartupUI) return StartupUI.updateProgressBar(percentage);
};

StartupLoader.hideLoadingOverlay = function () {
    if (window.StartupUI) return StartupUI.hideLoadingOverlay();
};

StartupLoader.incrementProgress = function (amount) {
    if (window.StartupUI) {
        // Update local state and UI
        this.loadingProgress = StartupUI.incrementProgress(this.loadingProgress, amount);
    }
};

StartupLoader.startProgressAnimation = function () {
    if (window.StartupUI) {
        // Pass context (this) so it can update loadingProgress
        StartupUI.startProgressAnimation(this);
    }
};

// -- Delegation to StartupStatus --

StartupLoader.registerModuleListeners = function () {
    if (window.StartupStatus) {
        // Pass context (this) so listener updates can access loadingProgress/UI
        StartupStatus.registerModuleListeners(this);
    }
};

StartupLoader.checkModuleChanges = function () {
    if (window.StartupStatus) {
        return StartupStatus.checkModuleChanges(this);
    }
};

StartupLoader.addModuleStatus = function (status) {
    if (window.StartupStatus) {
        return StartupStatus.addModuleStatus(status);
    }
};


// Register with ModuleRegistry if available
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('StartupLoader', StartupLoader);
}

// Initialize immediately when loaded
StartupLoader.init();

// Make globally available
window.StartupLoader = StartupLoader;

// StartupLoader module loaded silently (Facade)