/**
 * EventBus Module
 * Provides a centralized event system for pub/sub communication between modules
 */
const EventBus = {
    version: '1.0.0',
    _events: {},
    _initialized: false,
    
    /**
     * Initialize the EventBus
     * @returns {Object} - The EventBus object
     */
    init: function() {
        console.log('Initializing EventBus module');
        this._initialized = true;
        return this;
    },
    
    /**
     * Subscribe to an event
     * @param {string} event - The event name to subscribe to
     * @param {Function} callback - The callback function to execute when the event is published
     * @returns {Object} - The EventBus object for chaining
     */
    subscribe: function(event, callback) {
        if (!this._events[event]) {
            this._events[event] = [];
        }
        this._events[event].push(callback);
        return this;
    },
    
    /**
     * Publish an event with data
     * @param {string} event - The event name to publish
     * @param {any} data - The data to pass to subscribers
     * @returns {Object} - The EventBus object for chaining
     */
    publish: function(event, data) {
        console.log(`EventBus: Publishing '${event}'`, data);
        if (this._events[event]) {
            this._events[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Error in EventBus callback for ${event}:`, e);
                }
            });
        }
        return this;
    },
    
    /**
     * Unsubscribe from an event
     * @param {string} event - The event name to unsubscribe from
     * @param {Function} callback - The callback function to remove
     * @returns {Object} - The EventBus object for chaining
     */
    unsubscribe: function(event, callback) {
        if (this._events[event]) {
            this._events[event] = this._events[event].filter(cb => cb !== callback);
        }
        return this;
    }
};

// Register EventBus with ModuleRegistry if available
if (window.ModuleRegistry && typeof window.ModuleRegistry.register === 'function') {
    window.ModuleRegistry.register('EventBus', EventBus);
}

// Make sure it's available globally
window.EventBus = EventBus;

// If ModuleLoader is available, register with it too
if (window.ModuleLoader && typeof window.ModuleLoader.registerModule === 'function') {
    window.ModuleLoader.registerModule('EventBus', EventBus);
}

console.log('EventBus module loaded and registered');

// Auto-initialize the EventBus
(function() {
    console.log('Auto-initializing EventBus...');
    if (EventBus && typeof EventBus.init === 'function') {
        try {
            EventBus.init();
            console.log('EventBus initialized successfully');
        } catch (e) {
            console.error('Error initializing EventBus:', e);
        }
    }
})(); 