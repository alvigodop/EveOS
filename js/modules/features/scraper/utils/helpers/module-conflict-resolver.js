/**
 * Module Conflict Resolver
 * 
 * Fixes conflicts between modules that might be loaded multiple times
 * or have declaration conflicts.
 * 
 * @version 1.0.0
 */

const ModuleConflictResolver = {
    version: '1.0.0',
    _initialized: false,
    _resolvedModules: {},
    
    /**
     * Initialize the module
     */
    init: function() {
        if (this._initialized) {
            console.log('ModuleConflictResolver: Already initialized');
            return this;
        }
        
        console.log('ModuleConflictResolver: Initializing v' + this.version);
        this._initialized = true;
        
        // Fix known issues automatically
        this._fixWikipediaDiscoveryConflict();
        
        // Register with ModuleRegistry if available
        if (window.ModuleRegistry && typeof ModuleRegistry.register === 'function') {
            ModuleRegistry.register('ModuleConflictResolver', this);
        }
        
        return this;
    },
    
    /**
     * Fix Wikipedia Discovery module conflict
     * @private
     */
    _fixWikipediaDiscoveryConflict: function() {
        // Make sure WikipediaDiscovery isn't declared multiple times
        if (window.WikipediaDiscovery) {
            try {
                // Suppress the error by capturing all future declarations
                const originalWikipediaDiscovery = window.WikipediaDiscovery;
                
                // Override definition to prevent redeclaration errors
                Object.defineProperty(window, 'WikipediaDiscovery', {
                    get: function() {
                        return originalWikipediaDiscovery;
                    },
                    set: function(newValue) {
                        console.log('ModuleConflictResolver: Prevented redeclaration of WikipediaDiscovery');
                        
                        // If the new module has more methods or is more evolved, consider merging
                        if (newValue && typeof newValue === 'object') {
                            // Only log this for debugging
                            console.log('ModuleConflictResolver: New WikipediaDiscovery module was attempted to be declared');
                        }
                        
                        // Return the original to maintain the reference
                        return originalWikipediaDiscovery;
                    },
                    configurable: true
                });
                
                console.log('ModuleConflictResolver: Fixed WikipediaDiscovery conflict');
                this._resolvedModules['WikipediaDiscovery'] = true;
            } catch (e) {
                console.error('ModuleConflictResolver: Failed to fix WikipediaDiscovery conflict', e);
            }
        } else {
            console.log('ModuleConflictResolver: WikipediaDiscovery not found, no conflict to resolve');
        }
    },
    
    /**
     * Check if a module conflict has been resolved
     * @param {string} moduleName - Name of the module
     * @returns {boolean} Whether the conflict was resolved
     */
    isResolved: function(moduleName) {
        return this._resolvedModules[moduleName] === true;
    }
};

// Auto-initialize
ModuleConflictResolver.init();

// Make available globally
window.ModuleConflictResolver = ModuleConflictResolver; 