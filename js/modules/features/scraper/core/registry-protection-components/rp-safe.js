/**
 * Module Registry Protection - Safe Component
 * 
 * Implements the safe versions of ModuleRegistry methods (exists, register, get)
 * with recursion protection.
 */
(function () {
    'use strict';

    const RPSafe = {
        /**
         * Create the protected registry object implementation
         * @param {object} originalRegistry - The original global ModuleRegistry
         * @returns {object} - The protected registry object
         */
        createProtectedRegistry: function (originalRegistry) {
            return {
                // Original properties and internal state
                _inner: originalRegistry || { _modules: {} },
                _initialized: true,
                version: originalRegistry?.version || '1.0.3-protected',

                // Safe methods that won't throw errors
                exists: function (name) {
                    try {
                        // Prevent recursion
                        if (this._checkingExists === true) {
                            console.warn(`Prevented recursive exists check for module: ${name}`);
                            // Direct implementation to avoid recursion
                            return name && typeof name === 'string' &&
                                this._inner && this._inner._modules &&
                                !!this._inner._modules[name];
                        }

                        // Set recursion flag
                        this._checkingExists = true;

                        // Basic validation
                        if (!name || typeof name !== 'string') {
                            this._checkingExists = false;
                            return false;
                        }

                        // Direct implementation for emergency cases
                        if (!this._inner || !this._inner._modules) {
                            this._checkingExists = false;
                            return false;
                        }

                        // Use inner method only if it's not causing recursion
                        if (this._inner && typeof this._inner.exists === 'function' &&
                            !this._inner._checkingExists) {
                            try {
                                this._inner._checkingExists = true; // Prevent inner recursion
                                const result = this._inner.exists(name);
                                this._inner._checkingExists = false;
                                this._checkingExists = false;
                                return result;
                            } catch (innerError) {
                                console.error('Error calling inner exists:', innerError);
                                this._inner._checkingExists = false;
                                // Fall through to direct implementation
                            }
                        }

                        // Direct implementation as fallback
                        const result = name && typeof name === 'string' &&
                            this._inner && this._inner._modules &&
                            !!this._inner._modules[name];
                        this._checkingExists = false;
                        return result;
                    } catch (e) {
                        console.error('Protected ModuleRegistry: Error in exists method', e);
                        // Reset recursion flag
                        this._checkingExists = false;

                        // Fallback implementation
                        return name && typeof name === 'string' &&
                            this._inner && this._inner._modules &&
                            !!this._inner._modules[name];
                    }
                },

                register: function (name, moduleInstance, options) {
                    try {
                        // Simple way to prevent infinite recursion
                        if (this._registering === true) {
                            console.warn(`Prevented recursive registration for module: ${name}`);
                            return moduleInstance; // Return the module directly
                        }

                        // Set flag immediately
                        this._registering = true;

                        // Basic validation
                        if (!name || !moduleInstance) {
                            console.warn(`Invalid module registration attempt: ${name}`);
                            this._registering = false;
                            return null;
                        }

                        // Create module store if needed
                        if (!this._inner) this._inner = { _modules: {} };
                        if (!this._inner._modules) this._inner._modules = {};

                        // Direct implementation - always use this to avoid recursion
                        this._inner._modules[name] = {
                            name: name,
                            instance: moduleInstance,
                            version: moduleInstance.version || '1.0.0',
                            registered: new Date(),
                            initialized: moduleInstance._initialized === true
                        };

                        // Reset flag and return
                        this._registering = false;
                        return moduleInstance;
                    } catch (e) {
                        console.error('Protected ModuleRegistry: Error in register method', e);
                        this._registering = false;

                        // Emergency fallback
                        if (!name || !moduleInstance) return null;
                        if (!this._inner) this._inner = { _modules: {} };
                        if (!this._inner._modules) this._inner._modules = {};

                        // Direct implementation
                        this._inner._modules[name] = {
                            name: name,
                            instance: moduleInstance,
                            version: moduleInstance.version || '1.0.0',
                            registered: new Date(),
                            initialized: moduleInstance._initialized === true
                        };
                        return moduleInstance;
                    }
                },

                isRegistered: function (name) {
                    try {
                        if (this._inner && typeof this._inner.isRegistered === 'function') {
                            return this._inner.isRegistered(name);
                        }
                        return this.exists(name);
                    } catch (e) {
                        console.error('Protected ModuleRegistry: Error in isRegistered method', e);
                        return this.exists(name);
                    }
                },

                get: function (name) {
                    try {
                        // Enhanced recursion prevention
                        if (this._gettingModule === true) {
                            console.warn(`Prevented recursive get for module: ${name}`);
                            // Return directly from the module store without further processing
                            return this._inner && this._inner._modules && this._inner._modules[name] ?
                                this._inner._modules[name].instance : null;
                        }

                        // Set recursion flag
                        this._gettingModule = true;

                        // Basic validation
                        if (!name || typeof name !== 'string') {
                            this._gettingModule = false;
                            return null;
                        }

                        // Direct implementation for emergency cases
                        if (!this._inner || !this._inner._modules) {
                            this._gettingModule = false;
                            return null;
                        }

                        // Use inner method only if it's not causing recursion
                        if (this._inner && typeof this._inner.get === 'function' &&
                            !this._inner._gettingModule) {
                            try {
                                this._inner._gettingModule = true; // Prevent inner recursion
                                const result = this._inner.get(name);
                                this._inner._gettingModule = false;
                                this._gettingModule = false;
                                return result;
                            } catch (innerError) {
                                console.error('Error calling inner get:', innerError);
                                this._inner._gettingModule = false;
                                // Fall through to direct implementation
                            }
                        }

                        // Check if module exists using direct access
                        if (!this._inner._modules[name]) {
                            this._gettingModule = false;
                            return null;
                        }

                        // Direct implementation as fallback
                        const result = this._inner._modules[name].instance;
                        this._gettingModule = false;
                        return result;
                    } catch (e) {
                        console.error('Protected ModuleRegistry: Error in get method', e);
                        // Reset recursion flag
                        this._gettingModule = false;

                        // Emergency fallback implementation
                        if (!this._inner || !this._inner._modules || !this._inner._modules[name]) return null;
                        return this._inner._modules[name].instance;
                    }
                }
            };
        }
    };

    window.RPSafe = RPSafe;
})();
