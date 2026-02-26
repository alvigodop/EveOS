/**
 * UI Core Module - Core UI functionality and utilities
 * Split from original ui.js for better modularity
 * 
 * @version 1.0.2
 * @updated 2026-01-14 - Modularized: extracted LoadingIndicator, DiscoveryRenderer, HtmlUtils
 */

// Create UI namespace to avoid global scope pollution
const UI = {};

// Add version and installation status flag
UI.version = '1.0.2';
UI.installed = true;
UI._isStub = false;  // Flag to distinguish from stub modules

/**
 * Initialize UI module
 */
UI.init = function () {
    console.log('Initializing UI Core module (Facade)');
    UI.installed = true;

    // LoadingIndicator auto-initializes, but we can double check
    if (window.LoadingIndicator && typeof LoadingIndicator.init === 'function') {
        LoadingIndicator.init();
    }

    // Set initialization flag
    this._initialized = true;
    return this;
};

/**
 * Show the results container
 * @returns {boolean} - True if successful
 */
UI.showResultsContainer = function () {
    console.log('UI.showResultsContainer called');
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.style.display = 'block';
        return true;
    }
    return false;
};

/**
 * Hide the results container
 * @returns {boolean} - True if successful
 */
UI.hideResultsContainer = function () {
    console.log('UI.hideResultsContainer called');
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.style.display = 'none';
        return true;
    }
    return false;
};

/**
 * Show an error message
 * @param {string} message - The error message to display
 * @returns {boolean} - True if successful
 */
UI.showError = function (message) {
    console.log('UI.showError called with: ' + message);
    const errorDisplay = document.getElementById('errorDisplay');
    if (errorDisplay) {
        errorDisplay.textContent = message || 'An error occurred';
        errorDisplay.style.display = 'block';

        // Hide after 5 seconds
        setTimeout(() => {
            errorDisplay.style.display = 'none';
        }, 5000);
        return true;
    }
    return false;
};

/**
 * Show the loading indicator
 * Delegates to LoadingIndicator module
 * @param {string} message - Optional message to display
 * @returns {boolean} - True if successful
 */
UI.showLoading = function (message) {
    if (window.LoadingIndicator) {
        return LoadingIndicator.show(message);
    }
    // Fallback if module not loaded
    console.warn('LoadingIndicator module not loaded, using fallback');
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'flex';
        const textElement = loading.querySelector('p');
        if (textElement && message) textElement.textContent = message;
        return true;
    }
    return false;
};

/**
 * Hide the loading indicator
 * Delegates to LoadingIndicator module
 * @returns {boolean} - True if successful
 */
UI.hideLoading = function () {
    if (window.LoadingIndicator) {
        return LoadingIndicator.hide();
    }
    // Fallback
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
        return true;
    }
    return false;
};

/**
 * Creates a loading indicator if it doesn't exist
 * Delegates to LoadingIndicator module
 */
UI.createLoadingIndicator = function () {
    if (window.LoadingIndicator) {
        LoadingIndicator.createLoadingIndicator();
    }
};

/**
 * Strips HTML tags from a string
 * Delegates to HtmlUtils
 * @param {string} html - The HTML string to strip
 * @returns {string} - The stripped string
 */
UI.stripHtml = function (html) {
    if (window.HtmlUtils) {
        return HtmlUtils.stripHtml(html);
    }
    if (!html) return '';
    return html.replace(/<\/?[^>]+(>|$)/g, '');
};

/**
 * Clean HTML snippets for safe display
 * Delegates to HtmlUtils
 * @param {string} html - The HTML string to clean
 * @returns {string} - The cleaned string
 */
UI.cleanHtmlSnippet = function (html) {
    if (window.HtmlUtils) {
        return HtmlUtils.cleanHtmlSnippet(html);
    }
    if (!html) return '';
    return html.replace(/<\/?[^>]+(>|$)/g, '');
};

/**
 * Shows a notification message
 * Redirects to ToastNotification if available, otherwise uses internal logic
 * @param {string} message - The message to show
 * @param {string} type - The type of notification (success, error, warning, info)
 * @param {number} duration - How long to show the notification in ms
 */
UI.showNotification = function (message, type = 'info', duration = 3000) {
    // Prefer ToastNotification if available
    if (window.ToastNotification && typeof ToastNotification.show === 'function') {
        ToastNotification.show(message, type, { duration: duration });
        return;
    }

    // Fallback implementation
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        document.body.removeChild(existingNotification);
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
};

/**
 * Updates the page title
 * @param {string} title - The title to set
 */
UI.updatePageTitle = function (title) {
    document.title = title;
};

/**
 * Close all open popups
 */
UI.closeAllPopups = function () {
    const popups = document.querySelectorAll('.popup');
    popups.forEach(popup => {
        popup.style.display = 'none';
    });
};

/**
 * State for the loading indicator compact mode
 * Delegates to LoadingIndicator module
 */
Object.defineProperty(UI, '_loadingIndicatorCompact', {
    get: function () {
        return window.LoadingIndicator ? LoadingIndicator._loadingIndicatorCompact : true;
    },
    set: function (val) {
        if (window.LoadingIndicator) LoadingIndicator._loadingIndicatorCompact = val;
    }
});

/**
 * Toggle the loading indicator between compact and expanded modes
 * Delegates to LoadingIndicator module
 */
UI.toggleLoadingIndicator = function () {
    if (window.LoadingIndicator) {
        LoadingIndicator.toggleCompactMode();
    }
};

/**
 * Updates the loading indicator with enhanced stats display
 * Delegates to LoadingIndicator module
 */
UI.updateLoadingIndicatorEnhanced = function (isSearching, message = 'Idle', stats = {}) {
    if (window.LoadingIndicator) {
        LoadingIndicator.updateEnhanced(isSearching, message, stats);
    }
};

/**
 * Displays an error message within the search monitor
 * Delegates to LoadingIndicator module
 */
UI.showErrorInMonitor = function (message) {
    if (window.LoadingIndicator) {
        LoadingIndicator.showErrorInMonitor(message);
    }
};

/**
 * Updates the loading indicator
 * Delegates to LoadingIndicator module
 */
UI.updateLoadingIndicator = function (show, elementId = 'loading', message = 'Loading...') {
    if (window.LoadingIndicator) {
        LoadingIndicator.update(show, message);
    }
};

/**
 * Displays Fandom discovery results
 * Delegates to DiscoveryRenderer module
 */
UI.displayDiscoveryResults = function (results, searchTerm, container) {
    if (window.DiscoveryRenderer) {
        DiscoveryRenderer.displayFandomResults(results, searchTerm, container);
    }
};

/**
 * Displays Wikipedia discovery results
 * Delegates to DiscoveryRenderer module
 */
UI.displayWikiDiscoveryResults = function (results, searchTerm, container, existingEntries = []) {
    if (window.DiscoveryRenderer) {
        DiscoveryRenderer.displayWikiResults(results, searchTerm, container, existingEntries);
    }
};

// Register UI with ModuleLoader if available
if (window.ModuleLoader) {
    ModuleLoader.registerModule('UI', UI);
    UI.init = ModuleLoader.createInitFunction('UI', UI.init);
} else {
    if (window.ModuleRegistry) {
        window.ModuleRegistry.register('UI', UI);
    }
    window.UI = UI;
    if (typeof window.dispatchModuleLoadedEvent === 'function') {
        window.dispatchModuleLoadedEvent('UI');
    }
}

// Global window aliases for backward compatibility
window.toggleLoadingIndicator = function () {
    if (window.UI) UI.toggleLoadingIndicator();
};

window.updateLoadingIndicator = function (isSearching, message, stats) {
    if (window.UI) UI.updateLoadingIndicatorEnhanced(isSearching, message, stats);
};

console.log('UI Core module loaded (Modularized)');