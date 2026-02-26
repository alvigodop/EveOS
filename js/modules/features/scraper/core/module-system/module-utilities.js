/**
 * Module Utilities
 * Core utility functions for module management, loading, initialization, and repair
 * Refactored to delegate to specialized modules
 */

const ModuleUtilities = {
    version: '1.1.0',
    _initialized: true,

    /**
     * Initialize the ModuleUtilities
     */
    init: function () {
        console.log('Initializing ModuleUtilities');

        // Setup event listeners for module-related events
        this.setupEventListeners();

        return this;
    },

    /**
     * Setup event listeners for module loading events
     */
    setupEventListeners: function () {
        // Listen for modules initialized event
        document.addEventListener('modulesInitialized', this.handleModulesInitialized.bind(this));

        // Listen for individual module loaded events
        window.addEventListener('moduleLoaded', this.handleModuleLoaded.bind(this));
    },

    /**
     * Handle the moduleLoaded event
     * @param {CustomEvent} event - The moduleLoaded event
     */
    handleModuleLoaded: function (event) {
        if (event.detail && event.detail.moduleName) {
            console.log(`Module loaded event received: ${event.detail.moduleName}`);

            // Add to ModuleRegistry if it's not already there
            if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
                if (!ModuleRegistry.isRegistered(event.detail.moduleName)) {
                    ModuleRegistry.register(event.detail.moduleName, event.detail.module);
                }
            }
        }
    },

    /**
     * Handle the modulesInitialized event
     * @param {CustomEvent} event - The modulesInitialized event
     */
    handleModulesInitialized: function (event) {
        console.log('Modules initialized event received');

        // Perform auto-repair after a short delay
        setTimeout(() => {
            this.performAutoRepair();
        }, 1000);
    },

    /**
     * Update loading status message
     * @param {string} message - The status message to display
     */
    updateLoadingStatus: function (message) {
        console.log(`Loading status: ${message}`);

        // Update loading message in UI
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.textContent = message;
        }

        // Also update any loading indicators
        const loadingIndicator = document.getElementById('initialLoading');
        if (loadingIndicator) {
            const statusText = loadingIndicator.querySelector('.status-text');
            if (statusText) {
                statusText.textContent = message;
            }
        }
    },

    /**
     * Forces all modules to be properly initialized
     */
    forceInitializeAllModules: function () {
        // Force initializing (silent)

        // Tier 1: Core modules must be initialized first
        const tier1 = ['StorageManager', 'CacheManager', 'EventBus'];

        // Tier 2: UI and supporting modules 
        const tier2 = ['UI', 'UIModuleStatus', 'UIResultDisplay', 'PopupManager', 'TabManager', 'WikiManager'];

        // Tier 3: Feature modules
        const tier3 = ['FandomSearch', 'Discovery', 'FandomDiscovery', 'WikipediaDiscovery', 'PopularWikis', 'SearchManager', 'DomainGenerator', 'DomainValidator'];

        // Tier 4: Event handling and other modules
        const tier4 = ['EventManager', 'ModuleHelper', 'ModuleLoader', 'GlobalFix', 'ModuleRegistry', 'ModuleRegistryFix', 'ModuleInitializer', 'ContentInferrer', 'EmergencyFallbacks', 'DOMUtils', 'DirectRenderer'];

        const allTiers = [tier1, tier2, tier3, tier4];

        // Process each tier in order
        allTiers.forEach((tier, tierIndex) => {
            // Processing tier (silent)

            tier.forEach(moduleName => {
                let moduleObj = null;
                try {
                    moduleObj = window[moduleName];
                } catch (e) {
                    // SecurityError or other access error
                    return;
                }

                // Check if it's a valid object and NOT a Window object (to avoid cross-origin frames)
                // Also check if it looks like our module (has _initialized or init)
                if (moduleObj &&
                    typeof moduleObj === 'object' &&
                    !moduleObj.self /* Simple check to exclude Window objects */ &&
                    (moduleObj._initialized || typeof moduleObj.init === 'function')) {

                    // Set initialization flag
                    moduleObj._initialized = true;

                    // Call init function if it exists
                    if (typeof moduleObj.init === 'function') {
                        try {
                            moduleObj.init();
                            // Module initialized
                        } catch (error) {
                            console.error(`Error initializing module ${moduleName}:`, error);
                        }
                    }

                    // Register with ModuleRegistry if needed
                    if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
                        // Check if module is registered
                        try {
                            if (!ModuleRegistry.isRegistered || !ModuleRegistry.isRegistered(moduleName)) {
                                ModuleRegistry.register(moduleName, moduleObj);
                            }
                        } catch (e) { /* ignore registry errors */ }
                    }

                    // Dispatch module loaded event
                    if (typeof window.dispatchModuleLoadedEvent === 'function') {
                        try {
                            window.dispatchModuleLoadedEvent(moduleName);
                        } catch (e) { }
                    }
                } else {
                    // Not checking for existence to reduce noise, as some modules might legitimately be missing
                }
            });
        });

        // Module init complete
    },

    // =========================================================================
    // DELEGATED METHODS - Backward Compatibility
    // =========================================================================

    ensureCriticalFunctionality: function () {
        if (window.EmergencyFallbacks) EmergencyFallbacks.ensureCriticalFunctionality();
    },

    performAutoRepair: function () {
        if (window.DirectRenderer) DirectRenderer.performAutoRepair();
    },

    ensureWikiListsRendered: function () {
        if (window.DirectRenderer) DirectRenderer.ensureWikiListsRendered();
    },

    renderListsDirect: function () {
        if (window.DirectRenderer) DirectRenderer.renderListsDirect();
    },

    renderWikiEntriesDirect: function () {
        if (window.DirectRenderer) DirectRenderer.renderWikiEntriesDirect();
    },

    renderFandomDomainsDirect: function () {
        if (window.DirectRenderer) DirectRenderer.renderFandomDomainsDirect();
    },

    verifyUIVisibility: function () {
        if (window.DirectRenderer) DirectRenderer.verifyUIVisibility();
    },

    setupDirectEventHandlers: function () {
        if (window.DirectRenderer) DirectRenderer.setupDirectEventHandlers();
    },

    setupDirectTabSwitching: function () {
        if (window.DirectRenderer) DirectRenderer.setupDirectTabSwitching();
    },

    inferContentTypeFromTitle: function (title, source) {
        return window.ContentInferrer ? ContentInferrer.inferContentTypeFromTitle(title, source) : 'article';
    },

    inferContentTypeFromCategories: function (categories, domain) {
        return window.ContentInferrer ? ContentInferrer.inferContentTypeFromCategories(categories, domain) : null;
    },

    inferCategoriesAndType: function (title, domain) {
        return window.ContentInferrer ? ContentInferrer.inferCategoriesAndType(title, domain) : { inferredContentType: 'other', inferredCategories: [] };
    },

    filterResults: function (results, isManga, isNovel) {
        return window.ContentInferrer ? ContentInferrer.filterResults(results, isManga, isNovel) : results;
    },

    safeId: function (str) {
        return window.DOMUtils ? DOMUtils.safeId(str) : (encodeURIComponent(str || '').replace(/%/g, '_'));
    },

    toggleSnippet: function (id) {
        if (window.DOMUtils) DOMUtils.toggleSnippet(id);
    },

    toggleCategories: function (id) {
        if (window.DOMUtils) DOMUtils.toggleCategories(id);
    },

    getContentTypeIcon: function (type) {
        return window.ContentInferrer ? ContentInferrer.getContentTypeIcon(type) : '📄';
    },

    createSnippet: function (text, query, len) {
        return window.ContentInferrer ? ContentInferrer.createSnippet(text, query, len) : (text || '').substring(0, len || 250);
    },

    checkOverflow: function (el) {
        return window.DOMUtils ? DOMUtils.checkOverflow(el) : false;
    },

    updateViewMoreButtons: function () {
        if (window.DOMUtils) DOMUtils.updateViewMoreButtons();
    },

    initViewMoreResizeListener: function () {
        if (window.DOMUtils) DOMUtils.initViewMoreResizeListener();
    }
};

// Register with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('ModuleUtilities', ModuleUtilities);
}

// Make globally available
window.ModuleUtilities = ModuleUtilities;