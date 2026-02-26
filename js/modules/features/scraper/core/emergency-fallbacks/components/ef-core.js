/**
 * Emergency Fallbacks Core Component
 * Handles critical functionality checks for core systems (Storage, EventBus).
 */
const EmergencyFallbacksCore = {};

/**
 * Initialize the module
 */
EmergencyFallbacksCore.init = function () {
    console.log('EmergencyFallbacksCore initialized');
};

/**
 * Ensure StorageManager exists and is functional
 */
EmergencyFallbacksCore._ensureStorageManager = function () {
    if (!window.StorageManager) {
        console.warn('Creating emergency StorageManager');
        window.StorageManager = {
            _initialized: true,
            _isEmergencyImplementation: true,
            version: '0.0.1-emergency',

            init: function () {
                console.log('Initializing emergency StorageManager');
                return this;
            },

            get: function (key, defaultValue) {
                try {
                    const data = localStorage.getItem(key);
                    return data !== null ? JSON.parse(data) : defaultValue;
                } catch (e) {
                    console.error('Error in StorageManager.get:', e);
                    return defaultValue;
                }
            },

            set: function (key, value) {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                    return true;
                } catch (e) {
                    console.error('Error in StorageManager.set:', e);
                    return false;
                }
            },

            remove: function (key) {
                try {
                    localStorage.removeItem(key);
                    return true;
                } catch (e) {
                    console.error('Error in StorageManager.remove:', e);
                    return false;
                }
            }
        };

        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('StorageManager', window.StorageManager);
        }
    }
};

/**
 * Ensure EventBus exists and is functional
 */
EmergencyFallbacksCore._ensureEventBus = function () {
    if (!window.EventBus) {
        console.warn('Creating emergency EventBus');
        window.EventBus = {
            _initialized: true,
            _isEmergencyImplementation: true,
            version: '0.0.1-emergency',
            _events: {},

            init: function () {
                console.log('Initializing emergency EventBus');
                this._events = {};
                return this;
            },

            on: function (event, callback) {
                if (!this._events[event]) {
                    this._events[event] = [];
                }
                this._events[event].push(callback);
                return this;
            },

            off: function (event, callback) {
                if (!this._events[event]) return this;
                if (!callback) {
                    delete this._events[event];
                } else {
                    this._events[event] = this._events[event].filter(cb => cb !== callback);
                }
                return this;
            },

            emit: function (event, data) {
                if (!this._events[event]) return this;
                this._events[event].forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error(`Error in EventBus callback for ${event}:`, e);
                    }
                });
                return this;
            }
        };

        if (window.ModuleRegistry) {
            window.ModuleRegistry.register('EventBus', window.EventBus);
        }
    }
};

window.EmergencyFallbacksCore = EmergencyFallbacksCore;
