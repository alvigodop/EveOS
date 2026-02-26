/**
 * Module Registry Protection - Proxy Component
 * 
 * Defines the Proxy handler logic to intercept and protect property access.
 */
(function () {
    'use strict';

    const RPProxy = {
        /**
         * Create the proxy handler for the protected registry
         * @returns {object} - The Proxy handler object
         */
        createProxyHandler: function () {
            return {
                get: function (target, prop) {
                    // Handle common properties directly to avoid recursion
                    if (prop === '_registering' || prop === '_gettingModule' || prop === '_checkingExists') {
                        return target[prop];
                    }

                    // First check if the protected wrapper has the property
                    if (prop in target) {
                        return target[prop];
                    }

                    // Otherwise delegate to the inner registry
                    try {
                        if (target._inner && target._inner[prop] !== undefined) {
                            if (typeof target._inner[prop] === 'function') {
                                // Return a safe wrapper for functions
                                return function (...args) {
                                    try {
                                        // Check for recursive calls that might cause stack overflow
                                        if (window._registryMethodCalls && window._registryMethodCalls[String(prop)] > 3) {
                                            console.warn(`Detected potentially recursive call to ${String(prop)}, using direct implementation`);
                                            // Use a direct implementation for common methods
                                            if (String(prop) === 'register' && args.length >= 2) {
                                                const [name, moduleInstance] = args;
                                                if (!target._inner._modules) target._inner._modules = {};
                                                target._inner._modules[name] = {
                                                    name: name,
                                                    instance: moduleInstance,
                                                    version: moduleInstance.version || '1.0.0',
                                                    registered: new Date(),
                                                    initialized: moduleInstance._initialized === true
                                                };
                                                return moduleInstance;
                                            }
                                            return null;
                                        }

                                        // Track method call count
                                        if (!window._registryMethodCalls) window._registryMethodCalls = {};
                                        if (!window._registryMethodCalls[String(prop)]) window._registryMethodCalls[String(prop)] = 0;
                                        window._registryMethodCalls[String(prop)]++;

                                        // Call the method
                                        const result = target._inner[prop].apply(target._inner, args);

                                        // Reset call counter after success
                                        window._registryMethodCalls[String(prop)]--;
                                        return result;
                                    } catch (e) {
                                        console.error(`Protected ModuleRegistry: Error in proxied ${String(prop)} method`, e);

                                        // Reset call counter after error
                                        if (window._registryMethodCalls && window._registryMethodCalls[String(prop)]) {
                                            window._registryMethodCalls[String(prop)]--;
                                        }

                                        // Return null for most failure cases
                                        return null;
                                    }
                                };
                            } else {
                                return target._inner[prop];
                            }
                        }
                    } catch (e) {
                        console.error(`Protected ModuleRegistry: Error accessing property ${String(prop)}`, e);
                    }

                    return undefined;
                },

                set: function (target, prop, value) {
                    try {
                        // Handle special flag properties directly on the target
                        if (prop === '_registering' || prop === '_gettingModule' || prop === '_checkingExists') {
                            target[prop] = value;
                            return true;
                        }

                        // Set on the inner registry
                        if (target._inner) {
                            target._inner[prop] = value;
                        }
                        return true;
                    } catch (e) {
                        console.error(`Protected ModuleRegistry: Error setting property ${String(prop)}`, e);
                        return false;
                    }
                }
            };
        }
    };

    window.RPProxy = RPProxy;
})();
