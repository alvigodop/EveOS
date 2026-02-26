/**
 * Module Registry
 * 
 * Manages registration and access to all modules in the application
 * 
 * @version 1.0.0
 */

// Create namespace properly - ensuring it doesn't get overwritten
if (typeof window.ModuleRegistry === 'undefined') {
    window.ModuleRegistry = {};
}

// Add version and installation status flag
window.ModuleRegistry.version = '1.0.0';
window.ModuleRegistry.installed = true;

// Store registered modules
window.ModuleRegistry.modules = window.ModuleRegistry.modules || {};

// Store module dependencies
window.ModuleRegistry.dependencies = window.ModuleRegistry.dependencies || {};

/**
 * Initialize the module registry
 */
window.ModuleRegistry.init = function () {
    // ModuleRegistry init

    // Set up global module check function
    window.hasModule = this.hasModule.bind(this);

    this._initialized = true;
    return this;
};

/**
 * Register a module
 * @param {string} name - The name of the module
 * @param {Object} module - The module object
 * @param {Array} [dependencies] - Optional array of dependency module names
 * @returns {boolean} - Whether the registration was successful
 */
window.ModuleRegistry.register = function (name, module, dependencies = []) {
    if (!name || !module) {
        console.error('ModuleRegistry: Cannot register module without name or module object');
        return false;
    }

    if (this.modules[name]) {
        console.warn(`ModuleRegistry: Module "${name}" is already registered. Overwriting.`);
    }

    this.modules[name] = module;
    this.dependencies[name] = dependencies;

    // Registered module (silent)

    // Check if all dependencies are available
    const missingDependencies = this.checkDependencies(name);
    if (missingDependencies.length > 0) {
        console.warn(`ModuleRegistry: Module "${name}" is missing dependencies: ${missingDependencies.join(', ')}`);
    }

    return true;
};

/**
 * Unregister a module
 * @param {string} name - The name of the module to unregister
 * @returns {boolean} - Whether the unregistration was successful
 */
window.ModuleRegistry.unregister = function (name) {
    if (!name || !this.modules[name]) {
        console.error(`ModuleRegistry: Cannot unregister module "${name}" - not found`);
        return false;
    }

    // Check if other modules depend on this one
    const dependentModules = this.findDependentModules(name);
    if (dependentModules.length > 0) {
        console.warn(`ModuleRegistry: Module "${name}" is required by: ${dependentModules.join(', ')}`);
    }

    delete this.modules[name];
    delete this.dependencies[name];

    // Unregistered module
    return true;
};

/**
 * Get a module by name
 * @param {string} name - The name of the module
 * @returns {Object|null} - The module object or null if not found
 */
window.ModuleRegistry.getModule = function (name) {
    return this.modules[name] || null;
};

/**
 * Check if a module is registered
 * @param {string} name - The name of the module
 * @returns {boolean} - Whether the module is registered
 */
window.ModuleRegistry.hasModule = function (name) {
    return !!this.modules[name];
};

/**
 * Check if a module is registered (Alias for hasModule)
 * @param {string} name - The name of the module
 * @returns {boolean} - Whether the module is registered
 */
window.ModuleRegistry.isRegistered = function (name) {
    return this.hasModule(name);
};

/**
 * Get all registered modules
 * @returns {Object} - Object containing all registered modules
 */
window.ModuleRegistry.getAllModules = function () {
    return { ...this.modules };
};

/**
 * Check dependencies for a module
 * @param {string} moduleName - The name of the module
 * @returns {Array} - Array of missing dependencies
 */
window.ModuleRegistry.checkDependencies = function (moduleName) {
    if (!this.dependencies[moduleName]) {
        return [];
    }

    return this.dependencies[moduleName].filter(dep => !this.modules[dep]);
};

/**
 * Find modules that depend on a given module
 * @param {string} moduleName - The name of the module
 * @returns {Array} - Array of module names that depend on the given module
 */
window.ModuleRegistry.findDependentModules = function (moduleName) {
    const dependentModules = [];

    Object.keys(this.dependencies).forEach(module => {
        if (this.dependencies[module].includes(moduleName)) {
            dependentModules.push(module);
        }
    });

    return dependentModules;
};

/**
 * List all registered modules with their versions
 * @returns {Array} - Array of objects with module information
 */
window.ModuleRegistry.listModules = function () {
    return Object.keys(this.modules).map(name => {
        const module = this.modules[name];
        return {
            name: name,
            version: module.version || 'unknown',
            dependencies: this.dependencies[name] || [],
            initialized: !!module._initialized
        };
    });
};

/**
 * Initialize all registered modules in dependency order
 * @returns {Promise} - Promise that resolves when all modules are initialized
 */
window.ModuleRegistry.initializeAllModules = function () {
    // Initializing all modules

    // Build dependency graph
    const graph = this.buildDependencyGraph();

    // Get initialization order
    const initOrder = this.getInitializationOrder(graph);

    // Init order determined

    // Initialize modules in order
    return initOrder.reduce((promise, moduleName) => {
        return promise.then(() => {
            const module = this.modules[moduleName];

            if (!module || module._initialized) {
                return Promise.resolve();
            }

            // Initializing module

            try {
                if (typeof module.init === 'function') {
                    return Promise.resolve(module.init());
                }
                return Promise.resolve();
            } catch (error) {
                console.error(`ModuleRegistry: Error initializing "${moduleName}"`, error);
                return Promise.reject(error);
            }
        });
    }, Promise.resolve());
};

/**
 * Build a dependency graph of all modules
 * @returns {Object} - Dependency graph object
 */
window.ModuleRegistry.buildDependencyGraph = function () {
    const graph = {};

    // Initialize graph with all modules
    Object.keys(this.modules).forEach(moduleName => {
        graph[moduleName] = [];
    });

    // Add dependencies
    Object.keys(this.dependencies).forEach(moduleName => {
        this.dependencies[moduleName].forEach(dep => {
            if (graph[dep]) {
                graph[dep].push(moduleName);
            }
        });
    });

    return graph;
};

/**
 * Get the initialization order based on the dependency graph
 * @param {Object} graph - Dependency graph
 * @returns {Array} - Array of module names in initialization order
 */
window.ModuleRegistry.getInitializationOrder = function (graph) {
    const visited = {};
    const temp = {};
    const order = [];

    // Check for circular dependencies and build order
    const visit = (node) => {
        if (temp[node]) {
            console.error(`ModuleRegistry: Circular dependency detected with module "${node}"`);
            return;
        }

        if (!visited[node]) {
            temp[node] = true;

            // Visit dependencies (if they exist in graph)
            const dependencies = this.dependencies[node] || [];
            dependencies.forEach(dep => {
                if (graph[dep]) {
                    visit(dep);
                }
            });

            visited[node] = true;
            temp[node] = false;
            order.unshift(node);
        }
    };

    // Visit all nodes
    Object.keys(graph).forEach(node => {
        if (!visited[node]) {
            visit(node);
        }
    });

    return order;
};

// ModuleRegistry ready