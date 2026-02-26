/**
 * UI Module Status - Facade/Controller
 * Displays the status of all loaded modules using StatusData and StatusUI
 * 
 * @version 1.2.0 (Refactored)
 */

// Create UIModuleStatus namespace
const UIModuleStatus = {
    version: '1.2.0',
    _initialized: false,
    _isDisplaying: false,
};

// Ensure UI namespace exists
if (!window.UI) {
    console.error('UI namespace not found! ui-core.js should be loaded before ui-module-status.js');
    window.UI = {};
}

/**
 * Initialize the UIModuleStatus module
 */
UIModuleStatus.init = function () {
    if (this._initialized) {
        console.log('UIModuleStatus already initialized');
        return this;
    }

    console.log('Initializing UIModuleStatus module');

    // Initialize sub-modules
    if (window.StatusData) StatusData.init();
    if (window.StatusUI) StatusUI.init();

    // Set initial state
    this._initialized = true;
    this._isDisplaying = false;

    // Set up global function for easy access
    window.showModuleStatus = this.showStatus.bind(this);

    // Setup button event handlers immediately
    this.setupEventHandlers();

    console.log('UIModuleStatus initialization complete');

    return this;
};

/**
 * Setup event handlers for module status buttons and menu items
 */
UIModuleStatus.setupEventHandlers = function () {
    try {
        console.log('Setting up UIModuleStatus event handlers');

        // Track handlers to avoid duplicates
        this._eventHandlersAttached = this._eventHandlersAttached || false;

        if (this._eventHandlersAttached) {
            console.log('UIModuleStatus event handlers already attached, skipping');
            return;
        }

        // Find the module status button and menu item
        const moduleStatusMenuItem = document.querySelector('.module-menu-item[data-action="moduleStatus"], #moduleStatusMenuItem');

        // Handle moduleStatusMenuItem
        if (moduleStatusMenuItem) {
            this._menuItemClickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showStatus({ fromMenuItem: true, view: 'full' });

                // Close the dropdown menu if it's open
                const menu = moduleStatusMenuItem.closest('.dropdown-menu, .module-menu');
                if (menu) {
                    menu.style.display = 'none';
                }
            };

            if (this._oldMenuItemClickHandler) {
                moduleStatusMenuItem.removeEventListener('click', this._oldMenuItemClickHandler);
            }
            moduleStatusMenuItem.addEventListener('click', this._menuItemClickHandler);
            this._oldMenuItemClickHandler = this._menuItemClickHandler;
        }

        // Add event handlers to any elements with data-module-action="showStatus"
        document.querySelectorAll('[data-module-action="showStatus"]').forEach(el => {
            this._actionClickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showStatus({ fromAction: true, view: 'full' });
            };

            // Remove potentially old listener if we tracked it (simplified here)
            el.addEventListener('click', this._actionClickHandler);
        });

        this._eventHandlersAttached = true;
        console.log('UIModuleStatus event handlers setup complete');
    } catch (error) {
        console.error('Error setting up module status event handlers:', error);
    }
};

/**
 * Show module status information
 * @param {Object} options - Display options
 */
UIModuleStatus.showStatus = function (options = {}) {
    console.log('Showing module status information');

    if (options.fromHoverButton) return;

    options = Object.assign({
        hideCorsErrors: window.HIDE_CORS_ERRORS || false,
        view: 'full'
    }, options);

    // Close any existing display first
    if (this._isDisplaying) {
        this.closeStatus();
        // If triggered again (toggle behavior), stop here unless it's a different source
        if (!options.forceShow && (options.fromHeaderButton || options.fromMenuItem)) return;

        // Small delay if we are re-opening
        setTimeout(() => this._showStatusImplementation(options), 100);
    } else {
        this._showStatusImplementation(options);
    }
};

/**
 * Internal implementation
 */
UIModuleStatus._showStatusImplementation = function (options) {
    if (!window.StatusData || !window.StatusUI) {
        console.error('StatusData or StatusUI not loaded');
        return;
    }

    if (StatusData.ensureErrorsFormatted) {
        StatusData.ensureErrorsFormatted();
    }

    const statusInfo = StatusData.getModuleStatusInfo(options);

    // Define callbacks for the UI
    const callbacks = {
        onClose: () => this.closeStatus(),
        onCopy: (info) => StatusUI.copyModuleStatus(info),
        onCorsToggle: (checked) => {
            StatusData.setHideCorsErrors(checked);
            this.showStatus(options); // Refresh
        }
    };

    // Render
    StatusUI.renderStatus(statusInfo, { ...options, ...callbacks });
    this._isDisplaying = true;
};

/**
 * Close status display
 */
UIModuleStatus.closeStatus = function () {
    console.log('Closing module status popup');

    if (window.StatusUI) {
        StatusUI.closeStatus();
    } else {
        // Fallback if StatusUI missing
        const popups = document.querySelectorAll('.module-status-popup, #moduleStatusPopup');
        popups.forEach(p => p.remove());
    }

    this._isDisplaying = false;
    return this;
};

// Aliases and Compatibility
UIModuleStatus.showModuleStatus = function () { return this.showStatus(); };
UIModuleStatus.closeModuleStatusPopup = function () { return this.closeStatus(); };

UIModuleStatus.getModuleStatusInfo = function (options) {
    return window.StatusData ? StatusData.getModuleStatusInfo(options) : {};
};
UIModuleStatus.getStatusInfo = UIModuleStatus.getModuleStatusInfo;
UIModuleStatus.getModuleStatusManually = function (info) {
    if (window.StatusData) StatusData.getModuleStatusManually(info);
};

// Functions that were on UIModuleStatus
UIModuleStatus.ensureErrorsFormatted = function () {
    if (window.StatusData) StatusData.ensureErrorsFormatted();
};
UIModuleStatus.setHideCorsErrors = function (hide) {
    if (window.StatusData) StatusData.setHideCorsErrors(hide);
};
UIModuleStatus.hideCorsErrorsPermanently = function () {
    if (window.StatusData) StatusData.hideCorsErrorsPermanently();
};
UIModuleStatus.createStatusPopup = function (info, view) {
    return window.StatusUI ? StatusUI.createStatusPopup(info, view) : document.createElement('div');
};
UIModuleStatus.updateModuleStatusContent = function (container, info) {
    if (window.StatusUI) StatusUI.updateModuleStatusContent(container, info);
};
UIModuleStatus.copyModuleStatus = function (info) {
    if (window.StatusUI) StatusUI.copyModuleStatus(info);
};

// Global Exposure
UI.showModuleStatus = UIModuleStatus.showModuleStatus;
UI.showStatus = UIModuleStatus.showStatus;
window.UIModuleStatus = UIModuleStatus;
window.ModuleStatus = UIModuleStatus;

// Register
if (window.ModuleRegistry) {
    window.ModuleRegistry.register('UIModuleStatus', UIModuleStatus);
}

console.log('UIModuleStatus (Refactored) loaded');
